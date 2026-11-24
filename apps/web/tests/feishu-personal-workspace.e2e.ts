/** Recorded history in a single Harness with two Feishu-authenticated browser users. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const ROOT = fileURLToPath(new URL('../../../snapshots/web/feishu-personal-workspace', import.meta.url))
const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))

describe('web e2e: Feishu personal Workspace', () => {
  let directory: string
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let alice: Page
  let bob: Page
  let aliceCookie: string
  let bobCookie: string
  const originalFetch = globalThis.fetch
  async function login(baseUrl: string, identity: string): Promise<string> {
    const start = await originalFetch(`${baseUrl}/auth/feishu`, { redirect: 'manual' })
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const binding = start.headers.get('set-cookie')!.split(';')[0]!
    const response = await originalFetch(`${baseUrl}/auth/feishu/callback?code=${identity}&state=${state}`, {
      headers: { cookie: binding }, redirect: 'manual',
    })
    expect(response.status).toBe(303)
    return response.headers.get('set-cookie')!.split(';')[0]!
  }

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dsh-feishu-web-'))
    const overlay = join(directory, 'cordis.patch.yml')
    await writeFile(overlay, [
      '- id: connection',
      '  inject: [webRuntime, webServer, storageDomain, workspaceRegistry, sessions]',
      '  config:',
      `    trustedHosts: !!js ${JSON.stringify("['127.0.0.1:' + ctx.webServer.port]")}`,
      '    feishu:',
      `      publicOrigin: !!js ${JSON.stringify("'http://127.0.0.1:' + ctx.webServer.port")}`,
      '      appId: cli_web_test',
      '      appSecretEnv: DSH_TEST_FEISHU_SECRET',
      '      tenantKeys: [tenant_test]',
      `      workspaceRoot: ${JSON.stringify(join(directory, 'workspaces'))}`, '',
    ].join('\n'))
    vi.stubEnv('DSH_TEST_FEISHU_SECRET', 'test-only-secret')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === 'https://accounts.feishu.cn/oauth/v3/token') {
        return Response.json({ access_token: new URLSearchParams(typeof init?.body === 'string' ? init.body : '').get('code') })
      }
      if (url === 'https://open.feishu.cn/open-apis/authen/v1/user_info') {
        const id = new Headers(init?.headers).get('authorization')!.slice(7)
        return Response.json({ code: 0, data: { open_id: id, tenant_key: 'tenant_test', name: id === 'alice' ? '张三' : '李四' } })
      }
      return originalFetch(input, init)
    })
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay, browserLogin: async (url) => {
      aliceCookie = await login(url, 'alice'); return aliceCookie
    } })
    bobCookie = await login(scaffold.baseUrl, 'bob')
    const accounts = scaffold.ctx.webAccounts
    const aliceRequest = { headers: { host: new URL(scaffold.baseUrl).host, cookie: aliceCookie } }
    const userId = accounts.run(aliceRequest, () => accounts.userId())
    const workspace = accounts.run(aliceRequest, () => accounts.workspace())
    const id = SessionId('feishu-recorded-history')
    await accounts.claimSession(id, userId)
    await seedSession({ ...scaffold, workspaceCwd: workspace.path }, await readFile(SEED, 'utf8'), id)
    await workspace.attachSession(id)
    browser = await chromium.launch()
    alice = await newEnglishPage(browser); bob = await newEnglishPage(browser)
    for (const [page, cookie] of [[alice, aliceCookie], [bob, bobCookie]] as const) {
      await page.context().addCookies([{ name: 'dsh-user', value: cookie.slice('dsh-user='.length), url: scaffold.baseUrl }])
      await page.goto(scaffold.baseUrl)
    }
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  })

  it('renders only personal history and rejects foreign Session reads through the real wire', async () => {
    await alice.getByText('张三的工作空间', { exact: true }).waitFor()
    await bob.getByText('李四的工作空间', { exact: true }).waitFor()
    await expect.poll(async () => alice.getByRole('treeitem').count()).toBeGreaterThan(1)
    expect(await bob.getByRole('treeitem').count()).toBe(1)
    expect(await alice.getByRole('button', { name: 'Add workspace', exact: true }).count()).toBe(0)
    expect(await bob.getByText('张三的工作空间', { exact: true }).count()).toBe(0)
    const visibility = {
      alice: await alice.getByRole('treeitem').allTextContents(),
      bob: await bob.getByRole('treeitem').allTextContents(),
      addWorkspace: await alice.getByRole('button', { name: 'Add workspace', exact: true }).count(),
    }
    await compareOrRefreshGolden(join(ROOT, 'visibility.expected.json'), JSON.stringify(visibility, null, 2) + '\n', webSnapshotMode())
    const rows = await originalFetch(scaffold!.baseUrl + '/api/session/list', {
      method: 'POST', headers: { cookie: bobCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'bob-list', method: 'session/list', payload: { args: { request: {} } } }),
    })
    expect(await rows.json()).toMatchObject({ result: { ok: true, value: { items: [] } } })
    const forbidden = await originalFetch(scaffold!.baseUrl + '/api/session.export?sessionId=feishu-recorded-history', { headers: { cookie: bobCookie } })
    expect(forbidden.status).toBe(404)
  })
})
