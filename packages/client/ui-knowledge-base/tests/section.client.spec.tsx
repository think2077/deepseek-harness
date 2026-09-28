// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeBaseSection } from '../src/client/KnowledgeBaseSection.tsx'
import type { KnowledgeBaseSectionProps } from '../src/client/KnowledgeBaseSection.tsx'
import type { KnowledgeBaseState } from '../src/client/store.ts'
import { en, type KnowledgeBaseLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: KnowledgeBaseLocaleKey, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    en[key],
  )) as KnowledgeBaseSectionProps['t']

function renderState(state: KnowledgeBaseState, overrides: Partial<KnowledgeBaseSectionProps> = {}): void {
  render(<KnowledgeBaseSection {...({
    t,
    useKnowledgeBase: (select: (value: KnowledgeBaseState) => unknown) => select(state),
    load: vi.fn(async () => {}),
    select: vi.fn(async () => {}),
    edit: vi.fn(),
    save: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...overrides,
  } as unknown as KnowledgeBaseSectionProps)} />)
}

const selected = {
  id: 'public:company/facts.md', rootId: 'public', path: 'company/facts.md',
  title: 'Company facts', writable: true, revision: 'revision-one',
  updatedAt: '2026-09-27T08:00:00.000Z', content: '# Company facts\n',
} as const

function state(overrides: Partial<KnowledgeBaseState> = {}): KnowledgeBaseState {
  return {
    status: 'ready',
    roots: [
      { id: 'public', label: 'Public', kind: 'public', writable: true },
      { id: 'candidate', label: 'Candidate', kind: 'candidate', writable: false },
      { id: 'project', label: 'Project', kind: 'project', writable: false },
    ],
    entries: [
      { ...selected },
      {
        id: 'candidate:pending/suggestion.yml', rootId: 'candidate', path: 'pending/suggestion.yml',
        title: 'Suggestion', writable: false, revision: 'revision-candidate',
        updatedAt: '2026-09-27T08:30:00.000Z',
      },
      {
        id: 'project:brief.md', rootId: 'project', path: 'brief.md', title: 'Project brief',
        writable: false, revision: 'revision-two', updatedAt: '2026-09-27T09:00:00.000Z',
      },
    ],
    selected: null, draft: '', saving: false, creating: false, removingId: null,
    notice: null, error: null,
    ...overrides,
  }
}

describe('KnowledgeBaseSection', () => {
  it('separates reusable knowledge and project files into tabs', () => {
    renderState(state())
    expect(screen.getByRole('tab', { name: en.knowledgeTab }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'facts.md' })).toBeTruthy()
    expect(screen.getByText(en.candidate)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'suggestion.yml' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'brief.md' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: en.projectTab }))
    expect(screen.getByText('Project knowledge · Project')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'brief.md' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'facts.md' })).toBeNull()
    expect(screen.queryByRole('button', { name: en.add })).toBeNull()
  })

  it('opens a file directly from the tree and filters file nodes', () => {
    const select = vi.fn(async () => {})
    renderState(state(), { select })

    fireEvent.click(screen.getByRole('button', { name: 'facts.md' }))
    expect(select).toHaveBeenCalledWith(selected.id)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(screen.queryByRole('button', { name: 'facts.md' })).toBeNull()
    expect(screen.getByText(en.empty)).toBeTruthy()
  })

  it('edits and saves a writable entry', () => {
    const edit = vi.fn()
    const save = vi.fn(async () => {})
    renderState(state({ selected, draft: '# Changed\n' }), { edit, save })

    fireEvent.click(screen.getByRole('tab', { name: en.edit }))
    fireEvent.change(screen.getByRole('textbox', { name: en.editor }), { target: { value: '# Local\n' } })
    expect(edit).toHaveBeenCalledWith('# Local\n')
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(save).toHaveBeenCalledOnce()
  })

  it('keeps project knowledge read-only', () => {
    const project = {
      id: 'project:brief.md', rootId: 'project', path: 'brief.md', title: 'Project brief',
      writable: false, revision: 'revision-two', updatedAt: '2026-09-27T09:00:00.000Z',
      content: '# Brief\n',
    } as const
    renderState(state({ selected: project, draft: project.content }))
    fireEvent.click(screen.getByRole('tab', { name: en.projectTab }))

    expect(screen.queryByRole('tab', { name: en.edit })).toBeNull()
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
    expect(screen.getAllByText(en.readOnly).length).toBeGreaterThan(0)
  })

  it('creates a Markdown entry in a writable knowledge base', () => {
    const create = vi.fn(async () => {})
    renderState(state(), { create })

    fireEvent.click(screen.getByRole('button', { name: en.add }))
    fireEvent.change(screen.getByLabelText(en.createPath), { target: { value: 'team/new-rule' } })
    fireEvent.change(screen.getByLabelText(en.createTitle), { target: { value: 'New rule' } })
    fireEvent.click(screen.getByRole('button', { name: en.create }))
    expect(create).toHaveBeenCalledWith('public', 'team/new-rule.md', 'New rule')
  })

  it('requires confirmation before removing the selected writable file', () => {
    const remove = vi.fn(async () => {})
    renderState(state({ selected, draft: selected.content }), { remove })

    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.confirmRemove }))
    expect(remove).toHaveBeenCalledWith(selected.id, selected.revision)
  })
})
