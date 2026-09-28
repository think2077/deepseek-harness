import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { KnowledgeBaseController } from '../src/client/store.ts'

const entry = {
  id: 'public:company/facts.md', rootId: 'public', path: 'company/facts.md',
  title: 'Facts', writable: true, revision: 'rev-1', updatedAt: '2026-09-27T08:00:00.000Z',
  content: '# Facts\n',
} as const

function subject(overrides: Record<string, unknown> = {}) {
  const knowledgeBase = {
    list: vi.fn(async () => ({ ok: true, value: {
      roots: [{ id: 'public', label: 'Public', kind: 'public', writable: true }],
      entries: [{ ...entry, content: undefined }].map(({ content: _content, ...row }) => row),
    } })),
    read: vi.fn(async () => ({ ok: true, value: entry })),
    update: vi.fn(async () => ({ ok: true, value: { ...entry, revision: 'rev-2', content: '# New\n' } })),
    create: vi.fn(async () => ({ ok: true, value: {
      ...entry, id: 'public:team/new.md', path: 'team/new.md', title: 'New', content: '# New\n\n',
    } })),
    deleteEntry: vi.fn(async () => ({ ok: true, value: { id: entry.id } })),
    ...overrides,
  }
  return {
    knowledgeBase,
    controller: new KnowledgeBaseController({ remote: { knowledgeBase } } as unknown as ClientContext),
  }
}

describe('KnowledgeBaseController', () => {
  it('loads the catalog and selected content', async () => {
    const { controller } = subject()
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', entries: [{ id: entry.id }] })
    await controller.select(entry.id)
    expect(controller.store.getSnapshot()).toMatchObject({ selected: entry, draft: '# Facts\n' })
  })

  it('saves with the opened revision and adopts the returned revision', async () => {
    const { controller, knowledgeBase } = subject()
    await controller.load()
    await controller.select(entry.id)
    controller.edit('# New\n')
    await controller.save()
    expect(knowledgeBase.update).toHaveBeenCalledWith({ id: entry.id, revision: 'rev-1', content: '# New\n' })
    expect(controller.store.getSnapshot()).toMatchObject({ notice: 'saved', selected: { revision: 'rev-2' } })
  })

  it('keeps the draft and reports a revision conflict', async () => {
    const { controller } = subject({ update: vi.fn(async () => ({
      ok: false,
      error: { code: 'knowledge-base/conflict', message: 'changed', details: { id: entry.id } },
    })) })
    await controller.select(entry.id)
    controller.edit('local draft')
    await controller.save()
    expect(controller.store.getSnapshot()).toMatchObject({ draft: 'local draft', notice: 'changed' })
  })

  it('creates and selects a Markdown entry', async () => {
    const { controller, knowledgeBase } = subject()
    await controller.create('public', 'team/new.md', 'New')
    expect(knowledgeBase.create).toHaveBeenCalledWith({
      rootId: 'public', path: 'team/new.md', content: '# New\n\n',
    })
    expect(controller.store.getSnapshot()).toMatchObject({
      notice: 'created', selected: { id: 'public:team/new.md' }, draft: '# New\n\n',
    })
  })

  it('removes the selected entry with its listed revision', async () => {
    const { controller, knowledgeBase } = subject()
    await controller.select(entry.id)
    await controller.remove(entry.id, entry.revision)
    expect(knowledgeBase.deleteEntry).toHaveBeenCalledWith({ id: entry.id, revision: entry.revision })
    expect(controller.store.getSnapshot()).toMatchObject({ selected: null, draft: '', notice: 'removed' })
  })
})
