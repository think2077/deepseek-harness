// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCatalog, ProjectView } from '@deepseek-ai/dsh-api-project-controller/types'
// Type-only: registers the `projects` locale namespace used by the props type.
import type {} from '../src/client/index.ts'
import { Projects, type ProjectState, type ProjectsInjected, type ProjectsProps } from '../src/client/Projects.tsx'
import { en, type ProjectLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ProjectsProps['t'] = ((key: ProjectLocaleKey): string => en[key]) as ProjectsProps['t']

const project: ProjectView = {
  projectId: 'project-1' as ProjectView['projectId'],
  title: 'Shared education project',
  description: 'A shared government education project',
  stage: 'contracting',
  status: 'active',
  createdBy: 'user-hash-123' as ProjectView['createdBy'],
  createdByName: '张三',
  createdAt: '2026-11-22T00:41:00.000Z',
  updatedAt: '2026-11-22T00:41:00.000Z',
}

function renderCatalog(catalog: ProjectCatalog): void {
  const state: ProjectState = { catalog }
  const actions: ProjectsInjected = {
    hooks: { projects: { getSnapshot: () => state, subscribe: () => () => {} } as never },
    save: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    restore: vi.fn(async () => {}),
    enter: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  }
  render(<Projects {...({
    t,
    useProjects: (select: (value: ProjectState) => unknown) => select(state),
    ...actions,
  } as unknown as ProjectsProps)} />)
}

describe('project catalog list', () => {
  it('renders one list row per project with readable fields', () => {
    renderCatalog({ projects: [project], canManage: true })
    const row = screen.getByRole('listitem')
    expect(row.textContent).toContain('Shared education project')
    expect(row.textContent).toContain('Contract negotiation and signing')
    expect(row.textContent).toContain('张三')
    expect(row.textContent).not.toContain('user-hash-123')
    expect(screen.getByRole('button', { name: 'Enter workspace' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDefined()
  })

  it('falls back to localized copy when the creator name is absent', () => {
    const { createdByName: _absent, ...anonymous } = project
    renderCatalog({ projects: [anonymous], canManage: false })
    expect(screen.getByRole('listitem').textContent).toContain(en.unknownCreator)
    // Metadata actions stay visible so the permission reads at a glance; a
    // non-administrator sees them greyed out rather than missing.
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', true)
  })

  it('marks archived projects separately from the active pool', () => {
    renderCatalog({ projects: [{ ...project, status: 'archived' }], canManage: true })
    expect(screen.queryByRole('listitem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    expect(screen.getByRole('listitem').textContent).not.toContain('Enter workspace')
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDefined()
  })
})
