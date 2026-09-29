import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { KnowledgeCandidateCard } from '@deepseek-ai/dsh-knowledge-base/types'
import { KnowledgeReviewController } from '../src/client/review-store.ts'

const card = {
  id: 'candidate:待审核/rule.yml', rootId: 'candidate', path: '待审核/rule.yml',
  title: 'Rule', writable: false, revision: 'candidate-revision', updatedAt: '2026-09-28T00:00:00.000Z',
  content: 'title: Rule\nrule: Verify.\n', status: 'pending', scope: 'Plans',
  evidence: { session: 'session-one', files: [], urls: [] }, rule: 'Verify.', exceptions: '',
  confidence: 'high', proposedAt: '2026-09-28', suggestedDestination: 'Public/rules.md',
  suggestedRootId: 'public', suggestedPath: 'rules.md', parseError: null,
} as const satisfies KnowledgeCandidateCard

function subject(overrides: Record<string, unknown> = {}) {
  const catalog = {
    cards: [card], destinationRoots: [{ id: 'public', label: 'Public', kind: 'public', writable: true }],
    destinationEntries: [],
  }
  const knowledgeBase = {
    listReviews: vi.fn(async () => ({ ok: true, value: catalog })),
    read: vi.fn(async () => ({ ok: true, value: null })),
    suggestMerge: vi.fn(async () => ({ ok: true, value: {
      action: 'insert', targetSection: 'Checks', summary: 'Add rule.', reason: 'Not covered.', changes: [],
      mergedContent: '# Rules\n\nVerify.\n', destinationRevision: null,
    } })),
    updateCandidate: vi.fn(async () => ({ ok: true, value: card })),
    rejectCandidate: vi.fn(async () => ({ ok: true, value: { id: card.id, status: 'rejected' } })),
    acceptCandidate: vi.fn(async () => ({ ok: true, value: { id: card.id, status: 'accepted' } })),
    ...overrides,
  }
  return {
    knowledgeBase,
    controller: new KnowledgeReviewController({ remote: { knowledgeBase } } as unknown as ClientContext),
  }
}

describe('KnowledgeReviewController', () => {
  it('loads review cards and submits the complete confirmed merge', async () => {
    const { controller, knowledgeBase } = subject()
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', cards: [{ id: card.id }] })
    await controller.accept({
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'rules.md',
      destinationRevision: null, destinationContent: '# Rules\n',
    })
    expect(knowledgeBase.acceptCandidate).toHaveBeenCalledWith({
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'rules.md',
      destinationRevision: null, destinationContent: '# Rules\n',
    })
    expect(controller.store.getSnapshot().notice).toBe('accepted')
  })

  it('preserves the card and reports a revision conflict', async () => {
    const { controller } = subject({ rejectCandidate: vi.fn(async () => ({
      ok: false, error: { code: 'knowledge-base/conflict', message: 'changed', details: { id: card.id } },
    })) })
    await controller.load()
    await controller.reject(card)
    expect(controller.store.getSnapshot()).toMatchObject({ notice: 'changed', cards: [{ id: card.id }] })
  })

  it('requests a logged semantic merge for the selected session', async () => {
    const { controller, knowledgeBase } = subject()
    const suggestion = await controller.suggestMerge('session-one' as never, {
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'rules.md',
    })
    expect(suggestion.action).toBe('insert')
    expect(knowledgeBase.suggestMerge).toHaveBeenCalledWith('session-one', {
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'rules.md',
    })
  })
})
