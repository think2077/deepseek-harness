/** Browser-safe knowledge-base wire values. */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested knowledge entry belongs to a read-only root. */
    'knowledge-base/read-only': { readonly id: string }
    /** The entry content no longer matches the caller's opened revision. */
    'knowledge-base/conflict': { readonly id: string }
    /** A create request targeted an entry that already exists. */
    'knowledge-base/already-exists': { readonly id: string }
  }
}

/** One configured knowledge collection. */
export interface KnowledgeRootView {
  readonly id: string
  readonly label: string
  readonly kind: 'public' | 'solution' | 'candidate' | 'project'
  readonly writable: boolean
}

/** One text knowledge entry discovered below a configured root. */
export interface KnowledgeEntrySummary {
  readonly id: string
  readonly rootId: string
  readonly path: string
  readonly title: string
  readonly writable: boolean
  readonly revision: string
  /** Last filesystem modification time as an ISO timestamp. */
  readonly updatedAt: string
}

/** Complete knowledge entry returned for viewing or editing. */
export interface KnowledgeEntryDocument extends KnowledgeEntrySummary {
  readonly content: string
}

/** Complete management-page catalog. */
export interface KnowledgeCatalog {
  readonly roots: readonly KnowledgeRootView[]
  readonly entries: readonly KnowledgeEntrySummary[]
}

/** Compare-and-set update request. */
export interface KnowledgeUpdateRequest {
  readonly id: string
  readonly revision: string
  readonly content: string
}

/** Request to create one new knowledge file below a writable root. */
export interface KnowledgeCreateRequest {
  readonly rootId: string
  readonly path: string
  readonly content: string
}

/** Revision-fenced request to remove one writable knowledge file. */
export interface KnowledgeDeleteRequest {
  readonly id: string
  readonly revision: string
}

/** Confirmation returned after an entry moves to the root's hidden trash. */
export interface KnowledgeDeleteResult {
  readonly id: string
}
