/** Digital employee discovery and preset launch through the shipped Web profile. */
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, readPersistedEvents, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/digital-employees/directory.expected.md', import.meta.url))

describe('web e2e: digital employee directory', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  })
  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('shows only authored employees and starts Creator mode from the create entry', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employees'))
    await expect.poll(() => scaffold.ctx.agents.list().length).toBeGreaterThan(0)
    const before = scaffold.ctx.agents.list().length
    const nav = page.getByRole('button', { name: 'Digital employees', exact: true })
    await nav.click()
    const main = page.locator('main').filter({ has: page.getByRole('heading', { name: 'Digital employees', exact: true }) })
    // The shipped presets are deployment machinery: this deployment authored
    // none of its own, so the directory lists nothing.
    await main.getByText('No digital employees have been created yet.', { exact: true }).waitFor()
    expect(await main.locator('article').count()).toBe(0)
    const navBox = await nav.boundingBox()
    const reviewBox = await page.getByRole('button', { name: 'My reviews', exact: true }).boundingBox()
    expect(navBox!.y).toBeLessThan(reviewBox!.y)
    const snapshot = await captureStableAria(page, 'main', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, webSnapshotMode())
    const artifactDir = fileURLToPath(new URL('../../../.artifacts/', import.meta.url))
    await mkdir(artifactDir, { recursive: true })
    await page.screenshot({ path: `${artifactDir}/digital-employees.png`, fullPage: true })
    await main.getByRole('button', { name: 'Create / edit digital employee' }).click()
    await expect.poll(() => scaffold.ctx.agents.list().length).toBe(before + 1)
    const created = scaffold.ctx.agents.list().at(-1)
    expect(created).toBeDefined()
    await expect.poll(async () => (await readPersistedEvents(scaffold, created!.session.id)).some(event => event.type === 'agent-preset/selected' && event.data.agentPreset === 'cordis')).toBe(true)
    expect((await readPersistedEvents(scaffold, created!.session.id)).some(event => event.type === 'user/message')).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  })
})
