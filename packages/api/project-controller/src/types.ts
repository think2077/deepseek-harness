/** Browser-safe project requests, snapshots and progress vocabulary. */
import type { WorkspaceId, ProjectStage, ProjectStatus } from '@deepseek-ai/dsh-workspace/types'
import type { Branded } from '@deepseek-ai/dsh-brand'
export type { ProjectStage, ProjectStatus, WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Fields accepted when creating a shared project. */
export interface ProjectCreateRequest {
  readonly name: string
  readonly description?: string
  readonly stage?: ProjectStage
}
/** Project metadata patch; omitted fields remain unchanged. */
export interface ProjectUpdateRequest {
  readonly projectId: WorkspaceId
  readonly name?: string
  readonly description?: string
  readonly stage?: ProjectStage
}
/** Project identity for lookup and lifecycle operations. */
export interface ProjectArchiveRequest { readonly projectId: WorkspaceId }
/** Public project metadata; no other users' Session identities. */
export interface ProjectView {
  readonly projectId: WorkspaceId
  readonly title: string
  readonly description: string
  readonly stage: ProjectStage
  readonly status: ProjectStatus
  readonly createdBy: Branded<'WebUserId'>
  /** Readable creator name; absent when the account is gone or the project was host-created. */
  readonly createdByName?: string
  readonly createdAt: string
  readonly updatedAt: string
}
/** Complete project list and the caller's management permission. */
export interface ProjectCatalog {
  readonly projects: readonly ProjectView[]
  readonly canManage: boolean
}
