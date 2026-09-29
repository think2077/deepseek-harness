/** Browser-safe knowledge-base wire values. */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested knowledge entry belongs to a read-only root. */
    'knowledge-base/read-only': { readonly id: string }
    /** The entry content no longer matches the caller's opened revision. */
    'knowledge-base/conflict': { readonly id: string }
    /** A create request targeted an entry that already exists. */
    'knowledge-base/already-exists': { readonly id: string }
    /** Candidate review is unavailable or the requested card is not pending. */
    'knowledge-base/review-state': { readonly id: string }
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

/** Candidate directory state. */
export type KnowledgeReviewStatus = 'pending' | 'accepted' | 'rejected'

/** Parsed evidence attached to one candidate card. */
export interface KnowledgeCandidateEvidence {
  readonly session: string
  readonly files: readonly string[]
  readonly urls: readonly string[]
}

/** One candidate knowledge card shown to a reviewer. */
export interface KnowledgeCandidateCard extends KnowledgeEntryDocument {
  readonly status: KnowledgeReviewStatus
  readonly scope: string
  readonly evidence: KnowledgeCandidateEvidence
  readonly rule: string
  readonly exceptions: string
  readonly confidence: string
  readonly proposedAt: string
  readonly suggestedDestination: string
  readonly suggestedRootId: string | null
  readonly suggestedPath: string | null
  readonly parseError: string | null
}

/** Candidate cards plus the writable destinations available to reviewers. */
export interface KnowledgeReviewCatalog {
  readonly cards: readonly KnowledgeCandidateCard[]
  readonly destinationRoots: readonly KnowledgeRootView[]
  readonly destinationEntries: readonly KnowledgeEntrySummary[]
}

/** Revision-fenced business-rule edit request. */
export interface KnowledgeCandidateUpdateRequest {
  readonly id: string
  readonly revision: string
  readonly rule: string
}

/** Requested destination for an AI-generated candidate merge suggestion. */
export interface KnowledgeMergeSuggestionRequest {
  readonly id: string
  readonly revision: string
  readonly destinationRootId: string
  readonly destinationPath: string
}

/** Semantic operation proposed for the destination knowledge file. */
export type KnowledgeMergeAction = 'insert' | 'append' | 'replace' | 'skip'

/** One reviewer-readable change in an AI-generated merge suggestion. */
export interface KnowledgeMergeChange {
  readonly type: 'add' | 'replace' | 'remove'
  readonly before: string
  readonly after: string
}

/** AI-generated merge suggestion that remains inert until reviewer confirmation. */
export interface KnowledgeMergeSuggestion {
  readonly action: KnowledgeMergeAction
  readonly targetSection: string
  readonly summary: string
  readonly reason: string
  readonly changes: readonly KnowledgeMergeChange[]
  readonly mergedContent: string
  /** Latest destination revision used by the suggestion; null means the file did not exist. */
  readonly destinationRevision: string | null
}

/** Confirmed candidate acceptance and complete destination content. */
export interface KnowledgeCandidateAcceptRequest {
  readonly id: string
  readonly revision: string
  readonly destinationRootId: string
  readonly destinationPath: string
  /** Null requires a new destination; a revision requires the current destination to match. */
  readonly destinationRevision: string | null
  readonly destinationContent: string
}

/** Revision-fenced candidate rejection request. */
export interface KnowledgeCandidateRejectRequest {
  readonly id: string
  readonly revision: string
}

/** Result after moving a candidate card to its reviewed directory. */
export interface KnowledgeCandidateReviewResult {
  readonly id: string
  readonly status: 'accepted' | 'rejected'
  readonly destinationId?: string
}
