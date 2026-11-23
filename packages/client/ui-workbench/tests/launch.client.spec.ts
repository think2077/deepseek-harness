/** The real Loader composition starts fresh sessions and selects the preset before navigation. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { afterEach, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import * as plugin from '../src/client/index.ts'

let context: Context | undefined
afterEach(async () => { await context?.fiber.dispose(); context = undefined })

async function boot() {
  const ctx = context = new Context()
  let created = 0
  const create = vi.fn(async (_options: { workspaceId: WorkspaceId }) => `new-${++created}`)
  const select = vi.fn(async (_sessionId: string, _preset: string): Promise<
    { ok: true; value: string } | { ok: false; error: { message: string } }
  > => ({ ok: true, value: 'solution-expert' }))
  const open = vi.fn()
  let navigation = new AbortController()
  const services = { apply: async () => {
    const scope = ctx
    await scope.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(scope)
    locale.setLocale('zh')
    scope.provide('locale', locale)
    scope.provide('sessions', { create } as never)
    scope.provide('remote', { agentPresets: { select } } as never)
    scope.provide('remote.agentPresets', { select } as never)
    scope.provide('uiWorkspace', { openSession: open } as never)
    scope.provide('layout', { beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal } } as never)
    scope.slots.register({ name: 'root', children: {
      main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' },
    } } as never, () => null)
  } }
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['workbench-test-services', services], ['@deepseek-ai/dsh-client-ui-workbench/client', plugin],
  ])
  ctx.loader.internal = { version: 'v2', async import(specifier: string) {
    if (!modules.has(specifier)) throw new Error(`Unexpected import: ${specifier}`)
    return modules.get(specifier)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href } })
  await ctx.loader.await()
  const entry = ctx.slots.entries('main').find(item => item.options.key === 'workbench')!
  const injected = entry.inject!() as { startSolution: (id: WorkspaceId) => Promise<void> }
  return { ctx, create, select, open, start: () => injected.startSolution('project-a' as WorkspaceId), cancel: () => { navigation.abort() } }
}

it('registers localized navigation and creates a new session for every launch', async () => {
  const app = await boot()
  expect(app.ctx.slots.entries('sidebar.panellist').map(entry => [entry.options.order, resolveSlotLabel(entry.options.label)]))
    .toMatchInlineSnapshot(`
      [
        [
          -120,
          "我的工作台",
        ],
      ]
    `)
  await app.start()
  await app.start()
  expect(app.create.mock.calls).toEqual([[{ workspaceId: 'project-a' }], [{ workspaceId: 'project-a' }]])
  expect(app.select.mock.calls).toEqual([['new-1', 'solution-expert'], ['new-2', 'solution-expert']])
  expect(app.open.mock.calls).toEqual([['new-1'], ['new-2']])
  expect(app.select.mock.invocationCallOrder[0]).toBeLessThan(app.open.mock.invocationCallOrder[0]!)
  const slots = app.ctx.slots
  await app.ctx.fiber.dispose()
  expect(slots.entries('main')).toHaveLength(0)
  expect(slots.entries('sidebar.panellist')).toHaveLength(0)
})

it('does not navigate when preset selection fails', async () => {
  const app = await boot()
  app.select.mockRejectedValueOnce(new Error('Preset not found'))
  await expect(app.start()).rejects.toThrow('Preset not found')
  expect(app.open).not.toHaveBeenCalled()
  await app.start()
  expect(app.open).toHaveBeenCalledWith('new-2')
})

it('does not reopen a session after a newer navigation, and ignores repeated starts', async () => {
  const app = await boot()
  let finish!: () => void
  app.select.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { finish = resolve })
    return { ok: true, value: 'solution-expert' }
  })
  const first = app.start()
  await vi.waitFor(() => { expect(app.select).toHaveBeenCalled() })
  await app.start()
  expect(app.create).toHaveBeenCalledTimes(1)
  app.cancel()
  finish()
  await first
  expect(app.open).not.toHaveBeenCalled()
})

it('reports a Host refusal without opening the default preset', async () => {
  const app = await boot()
  app.select.mockResolvedValueOnce({ ok: false, error: { message: 'Invalid preset' } })
  await expect(app.start()).rejects.toThrow('Invalid preset')
  expect(app.open).not.toHaveBeenCalled()
})

it('does not select a preset when session creation fails', async () => {
  const app = await boot()
  app.create.mockRejectedValueOnce(new Error('Workspace is missing'))
  await expect(app.start()).rejects.toThrow('Workspace is missing')
  expect(app.select).not.toHaveBeenCalled()
  expect(app.open).not.toHaveBeenCalled()
})
