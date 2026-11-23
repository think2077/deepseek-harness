// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { Workbench } from '../src/client/Workbench.tsx'
import { en, zh, type WorkbenchLocaleKey } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'

afterEach(cleanup)
const workspace = { workspaceId: 'project-a', title: 'Project A', path: '/projects/a', sessionIds: ['existing'] }
function mount(options: { current?: string; items?: typeof workspace[]; start?: () => Promise<void> } = {}) {
  const startSolution = vi.fn(options.start ?? (async () => {}))
  render(<Workbench {...({
    t: (key: WorkbenchLocaleKey) => en[key], startSolution,
    useSessions: (select: (state: unknown) => unknown) => select({ current: options.current }),
    useWorkspaces: (select: (state: unknown) => unknown) => select({ items: options.items ?? [workspace], phase: 'ready', state: 'idle' }),
  } as unknown as ComponentProps<typeof Workbench>)} />)
  return startSolution
}

it('keeps future tools disabled, filters stages and previews project preparation', () => {
  mount()
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect(screen.getByRole('button', { name: /Market scanning/ }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /^Project preparation assistant/ }))
  expect(screen.getByRole('dialog').textContent).toContain(en.mock)
  fireEvent.click(screen.getByRole('button', { name: en.close }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.operations }))
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.queryByText(en.node0Title)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.business }))
  expect(screen.getByText(en.node0Title)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.all }))
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect(zh.node2Tool).toBe('行前方案')
  expect(zh.node5Tool).toBe('项目筹备助手')
})

it('asks for a workspace before starting when there is no current project', async () => {
  const start = mount()
  fireEvent.click(screen.getByRole('button', { name: /^Pre-visit plan/ }))
  expect(start).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: en.chooseWorkspace })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Project A/ }))
  await waitFor(() => { expect(start).toHaveBeenCalledWith('project-a') })
})

it('uses the current session workspace, without choosing the most recent project', async () => {
  const start = mount({ current: 'existing' })
  fireEvent.click(screen.getByRole('button', { name: /^Pre-visit plan/ }))
  await waitFor(() => { expect(start).toHaveBeenCalledWith('project-a') })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('lets users cancel choosing and explains when no workspace exists', () => {
  const start = mount({ current: 'ungrouped', items: [] })
  fireEvent.click(screen.getByRole('button', { name: /^Pre-visit plan/ }))
  expect(screen.getByText(en.noWorkspaces)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.close }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(start).not.toHaveBeenCalled()
})

it('disables repeated clicks while starting and allows retry after failure', async () => {
  let reject!: (reason: Error) => void
  const start = mount({ current: 'existing', start: () => new Promise<void>((_resolve, fail) => { reject = fail }) })
  const button = screen.getByRole('button', { name: /^Pre-visit plan/ })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(start).toHaveBeenCalledTimes(1)
  expect((button as HTMLButtonElement).disabled).toBe(true)
  reject(new Error('Preset is missing'))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('Preset is missing') })
  expect((button as HTMLButtonElement).disabled).toBe(false)
})
