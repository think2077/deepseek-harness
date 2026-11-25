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

  it('browses configured employees without creating agents, then starts the selected preset', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employees'))
    await expect.poll(() => scaffold.ctx.agents.list().length).toBeGreaterThan(0)
    const before = scaffold.ctx.agents.list().length
    const nav = page.getByRole('button', { name: 'Digital employees', exact: true })
    await nav.click()
    const main = page.locator('main').filter({ has: page.getByRole('heading', { name: 'Digital employees', exact: true }) })
    await main.locator('article').first().waitFor()
    const navBox = await nav.boundingBox()
    const reviewBox = await page.getByRole('button', { name: 'My reviews', exact: true }).boundingBox()
    expect(navBox!.y).toBeLessThan(reviewBox!.y)
    const snapshot = await captureStableAria(page, 'main', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, webSnapshotMode())
    const artifactDir = fileURLToPath(new URL('../../../.artifacts/', import.meta.url))
    await mkdir(artifactDir, { recursive: true })
    await page.screenshot({ path: `${artifactDir}/digital-employees.png`, fullPage: true })
    const search = main.getByRole('textbox', { name: 'Search digital employees' })
    await search.fill('minimal')
    const card = main.locator('article')
    await expect.poll(() => card.count()).toBe(1)
    await card.getByRole('button', { name: 'View details' }).click()
    await main.getByText('@deepseek-ai/dsh-persona', { exact: true }).waitFor()
    expect(scaffold.ctx.agents.list()).toHaveLength(before)
    await main.getByRole('button', { name: 'Start conversation' }).click()
    await expect.poll(() => scaffold.ctx.agents.list().length).toBe(before + 1)
    const created = scaffold.ctx.agents.list().at(-1)
    expect(created).toBeDefined()
    await expect.poll(async () => (await readPersistedEvents(scaffold, created!.session.id)).some(event => event.type === 'agent-preset/selected' && event.data.agentPreset === 'minimal')).toBe(true)
    expect((await readPersistedEvents(scaffold, created!.session.id)).some(event => event.type === 'user/message')).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  })
})
