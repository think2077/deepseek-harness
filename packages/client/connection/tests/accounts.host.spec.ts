/** Feishu login through the real Loader, HTTP carrier, JSON storage, and Workspace registry. */
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import SessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Connection from '../src/index.ts'
import { WorkspaceCommands } from '../../../api/workspace-controller/src/commands.ts'
import { ApiSessionAgentController } from '../../../api/session-controller/src/agent.ts'
import { SessionCommandController } from '../../../api/session-controller/src/commands.ts'
import { ApiSessionList } from '../../../api/session-controller/src/list.ts'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { WorkspaceFeed } from '../../../api/workspace-controller/src/feed.ts'

const roots: Context[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
  vi.restoreAllMocks(); vi.unstubAllEnvs()
})

async function harness(existingRoot?: string, tenantKeys: readonly string[] | null = ['tenant_test']) {
  const root = existingRoot ?? await realpath(await mkdtemp(join(tmpdir(), 'dsh-feishu-')))
  if (existingRoot === undefined) directories.push(root)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    `  config: { root: ${JSON.stringify(join(root, 'storages'))} }`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config: { backend: json }',
    "- name: '@deepseek-ai/dsh-credentials-local'",
    `  config: { dshHome: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
    `  config: { root: ${JSON.stringify(join(root, 'sessions'))}, compression: none }`,
    "- name: '@deepseek-ai/dsh-workspace'",
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config: { host: 127.0.0.1, port: 0 }',
    "- name: '@deepseek-ai/dsh-client-connection'",
    '  inject: [webServer, storageDomain, workspaceRegistry, sessions]',
    '  config:',
    `    trustedHosts: !!js ${JSON.stringify("['127.0.0.1:' + ctx.webServer.port]")}`,
    '    feishu:',
    `      publicOrigin: !!js ${JSON.stringify("'http://127.0.0.1:' + ctx.webServer.port")}`,
    '      appId: cli_test',
    '      appSecretEnv: DSH_TEST_FEISHU_SECRET',
    ...(tenantKeys === null ? [] : [`      tenantKeys: ${JSON.stringify(tenantKeys)}`]),
    `      workspaceRoot: ${JSON.stringify(join(root, 'workspaces'))}`,
    '',
  ].join('\n'))
  vi.stubEnv('DSH_TEST_FEISHU_SECRET', 'test-only-secret')
  const ctx = new Context(); roots.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore], ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson], ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-credentials-local', CredentialsLocal], ['@deepseek-ai/dsh-session-persistence-jsonl', SessionPersistence],
    ['@deepseek-ai/dsh-workspace', WorkspaceRegistry], ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-client-connection', Connection],
  ])
  ctx.loader.internal = { version: 'v2', async import(specifier: string) {
    if (!modules.has(specifier)) throw new Error(`unexpected fixture module ${specifier}`)
    return modules.get(specifier)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  expect(ctx.get('connection')).toBeDefined()
  expect(ctx.get('webAccounts')).toBeDefined()
  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const originalFetch = globalThis.fetch
  const remoteCalls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://accounts.feishu.cn/oauth/v3/token') {
      const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      remoteCalls.push(body.get('code') ?? '')
      expect(body.get('client_secret')).toBe('test-only-secret')
      return Response.json({ access_token: body.get('code') })
    }
    if (url === 'https://open.feishu.cn/open-apis/authen/v1/user_info') {
      const token = new Headers(init?.headers).get('authorization')?.slice(7)
      return Response.json({ code: 0, data: { name: token === 'alice' ? '张三' : '李四',
        open_id: token, tenant_key: token === 'denied' ? 'other_tenant' : 'tenant_test' } })
    }
    return originalFetch(input, init)
  })
  const get = (path: string, cookie?: string, init?: RequestInit) => originalFetch(origin + path, {
    redirect: 'manual', ...init, headers: { ...cookie === undefined ? {} : { cookie }, ...Object.fromEntries(new Headers(init?.headers)) },
  })
  const login = async (code: string) => {
    const start = await get('/auth/feishu')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const binding = start.headers.get('set-cookie')!.split(';')[0]!
    const callback = `/auth/feishu/callback?code=${code}&state=${state}`
    const response = await get(callback, binding)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    return { response, cookie, callback, binding }
  }
  const request = (cookie: string) => ({ headers: { host: new URL(origin).host, cookie } })
  return { ctx, root, origin, get, login, request, remoteCalls }
}

describe('Feishu personal Workspaces', () => {
  it('provisions one directory per identity, isolates concurrent requests, and persists account ownership', async () => {
    const h = await harness()
    const [alice, bob] = await Promise.all([h.login('alice'), h.login('bob')])
    expect(alice.response.status).toBe(303); expect(bob.response.status).toBe(303)
    expect(alice.cookie).toBeDefined(); expect(bob.cookie).toBeDefined()
    const accounts = h.ctx.webAccounts
    const a = h.request(alice.cookie!); const b = h.request(bob.cookie!)
    const aliceId = accounts.run(a, () => accounts.userId())
    const bobId = accounts.run(b, () => accounts.userId())
    expect(aliceId).not.toBe(bobId)
    const sessionId = SessionId('alice-session')
    await accounts.run(a, () => accounts.reserveSession(sessionId))
    const session = h.ctx.sessions.create(sessionId)
    const results = await Promise.all([
      accounts.run(a, async () => { await Promise.resolve(); return accounts.ownsSession(session.id) }),
      accounts.run(b, async () => { await Promise.resolve(); return accounts.ownsSession(session.id) }),
    ])
    expect(results).toEqual([true, false])
    expect(() => { accounts.run(b, () => { accounts.assertSession(sessionId) }) }).toThrow('session not found')
    await expect(accounts.run(b, () => accounts.reserveSession(sessionId))).rejects.toThrow('session not found')
    const workspace = accounts.run(a, () => accounts.workspace())
    expect(workspace.path).toBe(join(h.root, 'workspaces', aliceId))
    expect(workspace.title).toBe('张三的工作空间')
    const again = await h.login('alice')
    expect(accounts.run(h.request(again.cookie!), () => accounts.workspace().id)).toBe(workspace.id)
    expect(h.ctx.workspaceRegistry.list()).toHaveLength(2)
    const file = await readFile(join(h.root, 'storages', 'web_accounts.json'), 'utf8')
    expect(file).toContain(aliceId); expect(file).toContain(sessionId)
    expect(file).not.toContain(alice.cookie!.split('=')[1]!)
    expect(file).not.toContain('test-only-secret')
    await h.ctx.fiber.dispose()
    // Reopening a real JSON domain validates the committed ownership without migrating Session logs.
    vi.restoreAllMocks()
    const restarted = await harness(h.root)
    expect(restarted.ctx.webAccounts.ownerOf(sessionId)).toBe(aliceId)
  })

  it('rejects foreign workspaces, filters archive state, and never adopts legacy Sessions', async () => {
    const h = await harness()
    const alice = await h.login('alice'); const bob = await h.login('bob')
    const a = h.request(alice.cookie!); const b = h.request(bob.cookie!)
    const accounts = h.ctx.webAccounts
    const legacy = h.ctx.sessions.create(SessionId('legacy'))
    await expect(accounts.run(a, () => accounts.reserveSession(legacy.id))).rejects.toThrow('session not found')
    const commands = new WorkspaceCommands(h.ctx)
    expect(() => accounts.run(a, () => commands.create({ path: h.root }))).toThrow('personal Workspace is fixed')
    expect(() => accounts.run(a, () => commands.delete({ workspaceId: accounts.workspace().id }))).toThrow()
    const feed = new WorkspaceFeed(h.ctx)
    expect(accounts.run(a, () => feed.baseline().items.map(value => value.title))).toEqual(['张三的工作空间'])
    expect(accounts.run(b, () => feed.baseline().items.map(value => value.title))).toEqual(['李四的工作空间'])
    const own = SessionId('owned'); await accounts.run(a, () => accounts.reserveSession(own))
    h.ctx.sessions.create(own)
    await expect(accounts.run(b, () => commands.archiveSession({ sessionId: own }))).rejects.toThrow('session not found')
    const result = await accounts.run(a, () => commands.archiveSession({ sessionId: own }))
    expect(result.archivedSessionIds).toEqual([own])
    expect(accounts.run(b, () => feed.baseline().archivedSessionIds)).toEqual([])
    h.ctx.connection.fetch.register({ path: '/api/test', methods: ['GET'], requestBody: 'buffered', fetch: async () => new Response('private') })
    expect((await h.get(`/api/test?sessionId=${own}`, bob.cookie)).status).toBe(404)
    expect((await h.get(`/api/test?sessionId=${own}`, alice.cookie)).status).toBe(200)
  })

  it('creates browser Sessions in the fixed personal directory and filters list baselines', async () => {
    const h = await harness(); const alice = await h.login('alice'); const bob = await h.login('bob')
    const a = h.request(alice.cookie!); const b = h.request(bob.cookie!)
    const accounts = h.ctx.webAccounts
    const driver = {
      ensureSession: async (id: ReturnType<typeof SessionId>, cwd: string) => ({
        session: h.ctx.sessions.get(id) ?? h.ctx.sessions.create(id, { meta: { cwd } }),
      }),
      presetForSession: () => undefined,
    } as unknown as ApiSessionAgentController
    const commands = new SessionCommandController(h.ctx, driver, h.root)
    const created = await accounts.run(a, () => commands.create({ sessionId: SessionId('browser-created') }))
    const workspace = accounts.run(a, () => accounts.workspace())
    expect(h.ctx.sessions.get(created.sessionId)?.header.cwd).toBe(workspace.path)
    expect(workspace.sessionIds).toEqual([created.sessionId])
    expect(accounts.ownerOf(created.sessionId)).toBe(accounts.run(a, () => accounts.userId()))
    await expect(accounts.run(a, () => commands.create({ cwd: h.root }))).rejects.toThrow('personal Workspace is fixed')
    await expect(accounts.run(b, () => commands.create({ sessionId: created.sessionId }))).rejects.toThrow('session not found')
    await expect(accounts.run(b, () => commands.rename({ sessionId: created.sessionId, title: 'foreign' }))).rejects.toThrow('session not found')
    expect(() => accounts.run(b, () => commands.cancel({ sessionId: created.sessionId }))).toThrow('session not found')
    await h.ctx.plugin(SessionProjections)
    h.ctx.provide('agents', { get: () => undefined } as never)
    h.ctx.provide('sessionQuery', { listSessions: async () => h.ctx.sessions.list().map(session => ({ header: session.header })) } as never)
    const listing = new ApiSessionList(h.ctx)
    expect((await accounts.run(a, () => listing.list())).map(value => value.sessionId)).toEqual([created.sessionId])
    expect(await accounts.run(b, () => listing.list())).toEqual([])
  })

  it.each([null, []] as const)('allows authorized application users when the enterprise allowlist is %j', async (tenantKeys) => {
    const h = await harness(undefined, tenantKeys)
    const login = await h.login('denied')
    expect(login.response.status).toBe(303)
    expect(login.cookie).toBeDefined()
    expect(h.ctx.webAccounts.isAuthenticated(h.request(login.cookie!))).toBe(true)
  })

  it('binds OAuth callbacks to the initiating browser, checks tenants, and rejects replay', async () => {
    const h = await harness()
    const login = await h.login('alice')
    expect(login.response.status).toBe(303)
    expect((await h.get(login.callback, login.binding)).status).toBe(400)
    expect((await h.login('denied')).response.status).toBe(403)
    const start = await h.get('/auth/feishu')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    expect((await h.get(`/auth/feishu/callback?code=bob&state=${state}`)).status).toBe(400)
    expect(h.remoteCalls).toEqual(['alice', 'denied'])
    expect(h.ctx.connection.authenticatedUrl(h.origin)).toBe(h.origin)
    expect(h.ctx.connection.requestRejection({ headers: { host: new URL(h.origin).host } })).toBe(401)
    // The account page is gone: the identity reaches the client as an index global.
    const request = h.request(login.cookie!)
    expect(h.ctx.webAccounts.run(request, () => h.ctx.webAccounts.displayName())).toBe('张三')
    expect(h.ctx.webAccounts.run(request, () => h.ctx.webAccounts.admin())).toBe(true)
  })

  it('grants the administrator role to the first account only', async () => {
    const h = await harness()
    const first = await h.login('alice')
    const second = await h.login('bob')
    expect(h.ctx.webAccounts.run(h.request(first.cookie!), () => h.ctx.webAccounts.admin())).toBe(true)
    expect(h.ctx.webAccounts.run(h.request(second.cookie!), () => h.ctx.webAccounts.admin())).toBe(false)
    // Re-login keeps the role instead of re-granting it.
    expect(h.ctx.webAccounts.run(h.request(second.cookie!), () => h.ctx.webAccounts.displayName())).toBe('李四')
    const again = await h.login('bob')
    expect(h.ctx.webAccounts.run(h.request(again.cookie!), () => h.ctx.webAccounts.admin())).toBe(false)
  })

  it('revokes login state and attached connections at logout and rejects cross-site logout', async () => {
    const h = await harness(); const login = await h.login('alice')
    const request = h.request(login.cookie!)
    const connected = Promise.withResolvers<AbortSignal>()
    const connection = h.ctx.webAccounts.connection(request, signal => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => { resolve() }, { once: true }); connected.resolve(signal)
    }))
    const signal = await connected.promise
    expect((await h.get('/auth/logout', login.cookie, { method: 'POST', headers: { origin: 'https://other.invalid' } })).status).toBe(403)
    expect(signal.aborted).toBe(false)
    const response = await h.get('/auth/logout', login.cookie, { method: 'POST', headers: { origin: h.origin } })
    expect(response.status).toBe(303); await connection; expect(signal.aborted).toBe(true)
    expect(h.ctx.webAccounts.isAuthenticated(request)).toBe(false)
    expect(() => h.ctx.webAccounts.run(request, () => true)).toThrow('authentication required')
    expect((await h.get('/api/test', login.cookie)).status).toBe(401)
  })
})
