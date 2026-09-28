import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  KnowledgeCatalog, KnowledgeEntryDocument, KnowledgeEntrySummary, KnowledgeRootView,
} from '@deepseek-ai/dsh-knowledge-base/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Knowledge management panel state. */
export interface KnowledgeBaseState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly roots: readonly KnowledgeRootView[]
  readonly entries: readonly KnowledgeEntrySummary[]
  readonly selected: KnowledgeEntryDocument | null
  readonly draft: string
  readonly saving: boolean
  readonly creating: boolean
  readonly removingId: string | null
  readonly notice: 'saved' | 'created' | 'removed' | 'changed' | null
  readonly error: string | null
}

const INITIAL: KnowledgeBaseState = {
  status: 'idle', roots: [], entries: [], selected: null, draft: '',
  saving: false, creating: false, removingId: null, notice: null, error: null,
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Drives catalog reads, entry selection, drafts, and revision-fenced saves. */
export class KnowledgeBaseController {
  /** Observable state consumed by the main panel. */
  readonly store: SnapshotStore<KnowledgeBaseState> = createSnapshotStore(INITIAL)

  constructor(private readonly ctx: ClientContext) {}

  private set(patch: Partial<KnowledgeBaseState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private async catalog(): Promise<KnowledgeCatalog> {
    const result = await this.ctx.remote.knowledgeBase.list()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  /**
   * Load the current root and entry catalog.
   * @returns resolution after the state settles.
   */
  async load(): Promise<void> {
    this.set({ status: 'loading', error: null })
    try {
      const catalog = await this.catalog()
      this.set({ status: 'ready', roots: catalog.roots, entries: catalog.entries })
    } catch (error: unknown) {
      this.set({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Read one entry and replace the current draft.
   * @param id - Root-qualified entry id.
   * @returns resolution after the state settles.
   */
  async select(id: string): Promise<void> {
    this.set({ error: null, notice: null })
    try {
      const result = await this.ctx.remote.knowledgeBase.read(id)
      if (!result.ok) throw new Error(result.error.message)
      this.set({ selected: result.value, draft: result.value.content })
    } catch (error: unknown) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Replace the local draft.
   * @param content - Complete edited content.
   */
  edit(content: string): void {
    this.set({ draft: content, notice: null })
  }

  /**
   * Save the current writable draft with its opened revision.
   * @returns resolution after the state settles.
   */
  async save(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.selected === null || !state.selected.writable || state.saving) return
    this.set({ saving: true, error: null, notice: null })
    try {
      const result = await this.ctx.remote.knowledgeBase.update({
        id: state.selected.id, revision: state.selected.revision, content: state.draft,
      })
      if (!result.ok) {
        if (result.error.code === 'knowledge-base/conflict') {
          this.set({ notice: 'changed' })
          return
        }
        throw new Error(result.error.message)
      }
      const catalog = await this.catalog()
      this.set({
        status: 'ready', roots: catalog.roots, entries: catalog.entries,
        selected: result.value, draft: result.value.content, notice: 'saved',
      })
    } catch (error: unknown) {
      this.set({ error: messageOf(error) })
    } finally {
      this.set({ saving: false })
    }
  }

  /**
   * Create one Markdown knowledge file and select it for editing.
   * @param rootId - Writable knowledge root.
   * @param path - Relative Markdown path.
   * @param title - Initial document heading.
   * @returns resolution after the state settles.
   */
  async create(rootId: string, path: string, title: string): Promise<void> {
    if (this.store.getSnapshot().creating) return
    this.set({ creating: true, error: null, notice: null })
    try {
      const result = await this.ctx.remote.knowledgeBase.create({
        rootId, path, content: `# ${title.trim()}\n\n`,
      })
      if (!result.ok) throw new Error(result.error.message)
      const catalog = await this.catalog()
      this.set({
        status: 'ready', roots: catalog.roots, entries: catalog.entries,
        selected: result.value, draft: result.value.content, notice: 'created',
      })
    } catch (error: unknown) {
      this.set({ error: messageOf(error) })
    } finally {
      this.set({ creating: false })
    }
  }

  /**
   * Move one writable entry to hidden trash when its listed revision still matches.
   * @param id - Root-qualified entry id.
   * @param revision - Revision shown in the table.
   * @returns resolution after the state settles.
   */
  async remove(id: string, revision: string): Promise<void> {
    if (this.store.getSnapshot().removingId !== null) return
    this.set({ removingId: id, error: null, notice: null })
    try {
      const result = await this.ctx.remote.knowledgeBase.deleteEntry({ id, revision })
      if (!result.ok) {
        if (result.error.code === 'knowledge-base/conflict') {
          this.set({ notice: 'changed' })
          return
        }
        throw new Error(result.error.message)
      }
      const catalog = await this.catalog()
      const selected = this.store.getSnapshot().selected
      this.set({
        status: 'ready', roots: catalog.roots, entries: catalog.entries,
        ...(selected?.id === id ? { selected: null, draft: '' } : {}),
        notice: 'removed',
      })
    } catch (error: unknown) {
      this.set({ error: messageOf(error) })
    } finally {
      this.set({ removingId: null })
    }
  }
}
