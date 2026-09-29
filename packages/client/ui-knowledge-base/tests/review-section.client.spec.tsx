// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeCandidateCard } from '@deepseek-ai/dsh-knowledge-base/types'
import { KnowledgeReviewSection, type KnowledgeReviewSectionProps } from '../src/client/KnowledgeReviewSection.tsx'
import type { KnowledgeReviewState } from '../src/client/review-store.ts'
import { en, type KnowledgeBaseLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: KnowledgeBaseLocaleKey): string => en[key]) as KnowledgeReviewSectionProps['t']
const card = {
  id: 'candidate:pending/rule.yml', rootId: 'candidate', path: 'pending/rule.yml', title: 'Verify sources',
  writable: false, revision: 'candidate-revision', updatedAt: '2026-09-28T00:00:00.000Z',
  content: 'title: Verify sources\nrule: Verify.\n', status: 'pending', scope: 'Plans',
  evidence: { session: 'session-one', files: ['source.md'], urls: [] }, rule: 'Verify every source.',
  exceptions: 'None.', confidence: 'high', proposedAt: '2026-09-28',
  suggestedDestination: 'Public/rules.md', suggestedRootId: 'public', suggestedPath: 'rules.md', parseError: null,
} as const satisfies KnowledgeCandidateCard

const state: KnowledgeReviewState = {
  status: 'ready', cards: [card],
  destinationRoots: [{ id: 'public', label: 'Public', kind: 'public', writable: true }],
  destinationEntries: [{
    id: 'public:rules.md', rootId: 'public', path: 'rules.md', title: 'Rules', writable: true,
    revision: 'destination-revision', updatedAt: '2026-09-28T00:00:00.000Z',
  }],
  savingId: null, notice: null, error: null,
}

function renderReview(overrides: Partial<KnowledgeReviewSectionProps> = {}): void {
  render(<KnowledgeReviewSection {...({
    t, useKnowledgeReview: (select: (value: KnowledgeReviewState) => unknown) => select(state),
    loadReviews: vi.fn(async () => {}), suggestMerge: vi.fn(async () => ({
      action: 'insert', targetSection: 'Source checks', summary: 'Add the source-verification rule.',
      reason: 'The target has no equivalent rule.', changes: [{ type: 'add', before: '', after: 'Verify every source.' }],
      mergedContent: '# Rules\n\n## Source checks\n\nVerify every source.\n',
      destinationRevision: 'destination-revision',
    })), updateCandidate: vi.fn(async () => {}), rejectCandidate: vi.fn(async () => {}),
    acceptCandidate: vi.fn(async () => {}), ...overrides,
  } as unknown as KnowledgeReviewSectionProps)} />)
}

describe('KnowledgeReviewSection', () => {
  it('shows candidate cards in status tabs and requires a confirmed merge', async () => {
    const acceptCandidate = vi.fn(async () => {})
    renderReview({ acceptCandidate })
    expect(screen.getByRole('heading', { name: card.title })).toBeTruthy()
    expect(screen.getByText(card.rule)).toBeTruthy()
    expect(screen.queryByText(card.evidence.session)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.acceptCandidate }))
    expect(screen.getByRole('button', { name: en.confirmAccept }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.prepareMerge }))
    await waitFor(() => { expect(screen.getByLabelText<HTMLTextAreaElement>(en.mergeContent).value).toContain('# Rules') })
    expect(screen.getByText('Add the source-verification rule.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.confirmAccept }))
    expect(acceptCandidate).toHaveBeenCalledWith(expect.objectContaining({
      id: card.id, destinationRootId: 'public', destinationPath: 'rules.md',
      destinationRevision: 'destination-revision',
    }))
  })

  it('edits only the readable knowledge suggestion', () => {
    const updateCandidate = vi.fn(async () => {})
    renderReview({ updateCandidate })
    fireEvent.click(screen.getByRole('button', { name: en.modifyCandidate }))
    const editor = screen.getByLabelText<HTMLTextAreaElement>(en.candidateEditor)
    expect(editor.value).toBe(card.rule)
    fireEvent.change(editor, { target: { value: 'Use the confirmed business wording.' } })
    fireEvent.click(screen.getByRole('button', { name: en.saveCandidate }))
    expect(updateCandidate).toHaveBeenCalledWith(card, 'Use the confirmed business wording.')
  })

  it('requires a second action before rejecting a candidate', () => {
    const rejectCandidate = vi.fn(async () => {})
    renderReview({ rejectCandidate })
    fireEvent.click(screen.getByRole('button', { name: en.rejectCandidate }))
    expect(rejectCandidate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.confirmReject }))
    expect(rejectCandidate).toHaveBeenCalledWith(card)
  })
})
