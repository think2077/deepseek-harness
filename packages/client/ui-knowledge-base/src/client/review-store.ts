import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  KnowledgeCandidateAcceptRequest, KnowledgeCandidateCard, KnowledgeEntryDocument,
  KnowledgeMergeSuggestion, KnowledgeMergeSuggestionRequest, KnowledgeReviewCatalog,
} from '@deepseek-ai/dsh-knowledge-base/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Candidate-review panel state. */
export interface KnowledgeReviewState extends KnowledgeReviewCatalog {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly savingId: string | null
  readonly notice: 'updated' | 'accepted' | 'rejected' | 'changed' | null
  readonly error: string | null
}

const INITIAL: KnowledgeReviewState = {
  status: 'idle', cards: [], destinationRoots: [], destinationEntries: [],
  savingId: null, notice: null, error: null,
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Drives candidate listing, revision-fenced edits, and confirmed review transitions. */
export class KnowledgeReviewController {
  /** Observable review state consumed by the main panel. */
  readonly store: SnapshotStore<KnowledgeReviewState> = createSnapshotStore(INITIAL)

  constructor(private readonly ctx: ClientContext) {}

  private set(patch: Partial<KnowledgeReviewState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private async catalog(): Promise<KnowledgeReviewCatalog> {
    const result = await this.ctx.remote.knowledgeBase.listReviews()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  /** Load candidate cards and writable destinations. */
  async load(): Promise<void> {
    this.set({ status: 'loading', error: null })
    try {
      this.set({ status: 'ready', ...await this.catalog() })
    } catch (error: unknown) {
      this.set({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Read an existing destination, or return null when the selected path is new.
   * @param rootId - Writable destination root.
   * @param path - Relative destination path.
   */
  async readDestination(rootId: string, path: string): Promise<KnowledgeEntryDocument | null> {
    const id = `${rootId}:${path}`
    if (!this.store.getSnapshot().destinationEntries.some(entry => entry.id === id)) return null
    const result = await this.ctx.remote.knowledgeBase.read(id)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  /** Generate a semantic merge suggestion in a logged child of the selected session. */
  async suggestMerge(
    sessionId: SessionId,
    request: KnowledgeMergeSuggestionRequest,
  ): Promise<KnowledgeMergeSuggestion> {
    const result = await this.ctx.remote.knowledgeBase.suggestMerge(sessionId, request)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  /** Save one reviewer-edited business rule with its opened revision. */
  async update(card: KnowledgeCandidateCard, rule: string): Promise<void> {
    await this.run(card.id, 'updated', async () => {
      const result = await this.ctx.remote.knowledgeBase.updateCandidate({
        id: card.id, revision: card.revision, rule,
      })
      if (!result.ok) return this.remoteFailure(result.error.code, result.error.message)
    })
  }

  /** Archive a pending candidate as rejected. */
  async reject(card: KnowledgeCandidateCard): Promise<void> {
    await this.run(card.id, 'rejected', async () => {
      const result = await this.ctx.remote.knowledgeBase.rejectCandidate({ id: card.id, revision: card.revision })
      if (!result.ok) return this.remoteFailure(result.error.code, result.error.message)
    })
  }

  /** Apply a reviewer-confirmed merge and archive the candidate as accepted. */
  async accept(request: KnowledgeCandidateAcceptRequest): Promise<void> {
    await this.run(request.id, 'accepted', async () => {
      const result = await this.ctx.remote.knowledgeBase.acceptCandidate(request)
      if (!result.ok) return this.remoteFailure(result.error.code, result.error.message)
    })
  }

  private remoteFailure(code: string, message: string): never {
    if (code === 'knowledge-base/conflict') {
      this.set({ notice: 'changed' })
      throw new Error('')
    }
    throw new Error(message)
  }

  private async run(
    id: string,
    notice: 'updated' | 'accepted' | 'rejected',
    operation: () => Promise<void>,
  ): Promise<void> {
    if (this.store.getSnapshot().savingId !== null) return
    this.set({ savingId: id, error: null, notice: null })
    try {
      await operation()
      this.set({ status: 'ready', ...await this.catalog(), notice })
    } catch (error: unknown) {
      if (messageOf(error) !== '') this.set({ error: messageOf(error) })
    } finally {
      this.set({ savingId: null })
    }
  }
}
