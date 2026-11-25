// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { DigitalEmployees } from '../src/client/DigitalEmployees.tsx'
import { en, zh, type DigitalEmployeesLocaleKey } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'

afterEach(cleanup)
const presets = [
  { id: 'sales', name: 'Sales assistant', description: 'Customer research', trust: 'user', isDefault: true },
  { id: 'broken', name: 'Broken assistant', trust: 'system', isDefault: false, broken: 'Invalid composition' },
] as const
const workspace = { workspaceId: 'project-a', title: 'Project A', sessionIds: ['existing'] }
function mount(options: { current?: string; empty?: boolean; noWorkspace?: boolean; fail?: boolean; start?: () => Promise<void> } = {}) {
  const startAssistant = vi.fn(options.start ?? (async () => {}))
  const readRoster = vi.fn(async () => {
    if (options.fail) throw new Error('Offline')
    return { presets: options.empty ? [] : presets, authorable: true, modeSelectionEnabled: true }
  })
  const readInventory = vi.fn(async () => ({ entries: [], agentPresets: [{ id: 'sales', rows: [
    { moduleName: '@example/research', enabled: true }, { moduleName: '@example/shell', enabled: false },
    { moduleName: '@example/optional', enabled: 'conditional' },
  ] }] }))
  render(<DigitalEmployees {...({
    t: (key: DigitalEmployeesLocaleKey) => en[key], readRoster, readInventory, startAssistant,
    useSessions: (select: (state: unknown) => unknown) => select({ current: options.current }),
    useWorkspaces: (select: (state: unknown) => unknown) => select({ items: options.noWorkspace ? [] : [workspace], phase: 'ready', state: 'idle' }),
  } as unknown as ComponentProps<typeof DigitalEmployees>)} />)
  return { startAssistant, readRoster }
}

it('browses and searches the roster, and inspects plugin enablement without starting a session', async () => {
  const app = mount()
  await screen.findByText('Sales assistant')
  expect((screen.getAllByRole('button', { name: en.start })[1] as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getAllByRole('button', { name: en.details })[0]!)
  expect(await screen.findByText('@example/research')).toBeTruthy()
  expect(screen.getByText(en.enabled)).toBeTruthy()
  expect(screen.getByText(en.disabled)).toBeTruthy()
  expect(screen.getByText(en.conditional)).toBeTruthy()
  expect(app.startAssistant).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en.close }))
  fireEvent.change(screen.getByRole('textbox', { name: en.search }), { target: { value: 'customer' } })
  expect(screen.queryByText('Broken assistant')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.retry }))
  await waitFor(() => { expect(app.readRoster).toHaveBeenCalledTimes(2) })
  expect(zh.nav).toBe('数字员工')
})

it('creates a conversation in the current project', async () => {
  const app = mount({ current: 'existing' })
  await screen.findByText('Sales assistant')
  fireEvent.click(screen.getAllByRole('button', { name: en.start })[0]!)
  await waitFor(() => { expect(app.startAssistant).toHaveBeenCalledWith('project-a', 'sales') })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('requires workspace selection without a current project and reports start failures', async () => {
  const app = mount({ start: async () => { throw new Error('Preset unavailable') } })
  await screen.findByText('Sales assistant')
  fireEvent.click(screen.getAllByRole('button', { name: en.start })[0]!)
  expect(app.startAssistant).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Project A' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Preset unavailable')
  fireEvent.click(screen.getByRole('button', { name: en.close }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('explains missing workspaces, empty rosters and load failures', async () => {
  mount({ noWorkspace: true })
  await screen.findByText('Sales assistant')
  fireEvent.click(screen.getAllByRole('button', { name: en.start })[0]!)
  expect(screen.getByText(en.noWorkspaces)).toBeTruthy()
  cleanup()
  mount({ empty: true })
  expect(await screen.findByText(en.empty)).toBeTruthy()
  cleanup()
  mount({ fail: true })
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', en.error)
})
