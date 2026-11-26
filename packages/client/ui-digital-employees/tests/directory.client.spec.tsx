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
  { id: 'novel', name: 'Novel writer', description: 'Long-form fiction', trust: 'user', isDefault: false },
  { id: 'broken', name: 'Broken assistant', trust: 'user', isDefault: false, broken: 'Invalid composition' },
  { id: 'standard', name: 'Standard mode', description: 'Built in', trust: 'system', isDefault: false },
  { id: 'cordis', name: 'Creator mode', description: 'Built in', trust: 'system', isDefault: false },
] as const
const workspace = { workspaceId: 'project-a', title: 'Project A', sessionIds: ['existing'] }
function mount(options: { current?: string; empty?: boolean; noWorkspace?: boolean; fail?: boolean; start?: () => Promise<void> } = {}) {
  const startAssistant = vi.fn(options.start ?? (async () => {}))
  const readRoster = vi.fn(async () => {
    if (options.fail) throw new Error('Offline')
    return { presets: options.empty ? [] : presets, authorable: true, modeSelectionEnabled: true }
  })
  const readInventory = vi.fn(async () => ({ entries: [], agentPresets: [{ id: 'sales',
    persona: { prefix: 'You are a sales assistant.\nFollow the checklist.' },
    skills: [{ name: 'research', description: 'Research customer background.' }],
    rows: [],
  }] }))
  render(<DigitalEmployees {...({
    t: (key: DigitalEmployeesLocaleKey) => en[key], readRoster, readInventory, startAssistant,
    useSessions: (select: (state: unknown) => unknown) => select({ current: options.current }),
    useWorkspaces: (select: (state: unknown) => unknown) => select({ items: options.noWorkspace ? [] : [workspace], phase: 'ready', state: 'idle' }),
  } as unknown as ComponentProps<typeof DigitalEmployees>)} />)
  return { startAssistant, readRoster }
}

it('lists only authored employees, searches them, and inspects details without starting a session', async () => {
  const app = mount()
  await screen.findByText('Sales assistant')
  expect(screen.queryByText('Standard mode')).toBeNull()
  expect(screen.queryByText('Creator mode')).toBeNull()
  expect((screen.getAllByRole('button', { name: en.start })[0] as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getAllByRole('button', { name: en.start })[2] as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: `${en.details}: Sales assistant` }))
  expect(await screen.findByText(en.persona)).toBeTruthy()
  expect(screen.getByText(/You are a sales assistant/)).toBeTruthy()
  expect(screen.getByText(en.skills)).toBeTruthy()
  expect(screen.getByText('research')).toBeTruthy()
  expect(screen.getByText('Research customer background.')).toBeTruthy()
  expect(app.startAssistant).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en.close }))
  fireEvent.change(screen.getByRole('textbox', { name: en.search }), { target: { value: 'fiction' } })
  expect(screen.queryByText('Sales assistant')).toBeNull()
  expect(screen.getByText('Novel writer')).toBeTruthy()
  expect(zh.nav).toBe('数字员工')
})

it('starts the authoring entry inside Creator mode, with the employee template as its first draft', async () => {
  const app = mount({ current: 'existing' })
  await screen.findByText('Sales assistant')
  fireEvent.click(screen.getByRole('button', { name: en.create }))
  await waitFor(() => {
    expect(app.startAssistant).toHaveBeenCalledWith('project-a', 'cordis', en.createPrompt)
  })
  expect(zh.createPrompt.split('\n').slice(0, 1)).toEqual(['请帮我创建一个数字员工。'])
  expect(zh.createPrompt).toContain('工作边界与需人工确认的事项：')
})

it('creates a conversation in the current project', async () => {
  const app = mount({ current: 'existing' })
  await screen.findByText('Sales assistant')
  fireEvent.click(screen.getAllByRole('button', { name: en.start })[0]!)
  await waitFor(() => { expect(app.startAssistant).toHaveBeenCalledWith('project-a', 'sales', undefined) })
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
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', `${en.error} ${en.retry}`)
})
