// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectCatalog } from '@deepseek-ai/dsh-api-project-controller/types'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type {} from '../src/client/index.ts'
import { ManagementCockpit, type CockpitState, type ManagementCockpitProps } from '../src/client/ManagementCockpit.tsx'
import { en, type CockpitLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)
const t = ((key: CockpitLocaleKey): string => en[key]) as never
const catalog: ProjectCatalog = { canManage: true, projects: [{
  projectId: 'project-1' as ProjectCatalog['projects'][number]['projectId'], title: 'Education project', description: 'Verify resources',
  stage: 'discovery', status: 'active', createdBy: 'user-1' as ProjectCatalog['projects'][number]['createdBy'], createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T01:00:00Z',
}] }
const roster: AgentPresetRoster = {
  presets: [{ id: 'solution-expert', trust: 'user', isDefault: false, name: 'Regional specialist' }],
  authorable: true, modeSelectionEnabled: true,
}
const workspaces = { items: [
  { workspaceId: 'project-1', path: '/work/education', title: 'Education workspace', sessionIds: ['s-project'] },
  { workspaceId: 'workspace-2', path: '/work/misc', title: 'Scratch workspace', sessionIds: ['s-standalone'] },
], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null }
const sessions = {
  ids: ['s-project', 's-standalone', 's-blank', 's-child'],
  byId: {
    's-project': { id: 's-project', displayTitle: 'Project kickoff', running: false, blank: false, updatedAt: 1764000000000, cwd: '/work/education', projectionValues: { agentPreset: 'solution-expert' } },
    's-standalone': { id: 's-standalone', displayTitle: 'Loose research', running: true, blank: false, updatedAt: 1764000600000, cwd: '/work/misc' },
    's-blank': { id: 's-blank', displayTitle: 'Untitled draft', running: false, blank: true, updatedAt: 1764000900000, cwd: '/work/education' },
    's-child': { id: 's-child', displayTitle: 'Child agent', running: false, blank: false, origin: 'subagent', updatedAt: 1764001200000, cwd: '/work/education' },
  },
  current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
}

function mount(): void {
  const state: CockpitState = { catalog }
  const props = {
    t,
    readRoster: () => Promise.resolve(roster),
    useCockpit: (select: (value: CockpitState) => unknown) => select(state),
    useSessions: (select: (value: unknown) => unknown) => select(sessions),
    useWorkspaces: (select: (value: unknown) => unknown) => select(workspaces),
  } as unknown as ManagementCockpitProps
  render(<ManagementCockpit {...props} />)
}

describe('management cockpit', () => {
  it('summarizes current projects and opens a non-persistent workflow editor', () => {
    mount()
    expect(screen.getAllByText('Education project').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs research').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Configure workflow' }))
    expect(screen.getByRole('dialog', { name: 'Configure LTC-G stage workflow' })).toBeDefined()
    expect(screen.getAllByText('Activity 1').length).toBe(9)
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists existing Sessions newest first and skips drafts and sub-agents', async () => {
    mount()
    expect(screen.getByText('Loose research')).toBeDefined()
    expect(screen.getByText('Project kickoff')).toBeDefined()
    expect(screen.queryByText('Untitled draft')).toBeNull()
    expect(screen.queryByText('Child agent')).toBeNull()
    // A Session outside any project Workspace falls back to its Workspace title.
    expect(screen.getByText('Scratch workspace')).toBeDefined()
    // The employee column reads the Session preset projection through the roster.
    expect(await screen.findByText('Regional specialist')).toBeDefined()
    expect(screen.queryByText('No project')).toBeNull()
  })
})
