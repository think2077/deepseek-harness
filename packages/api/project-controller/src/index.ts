/** Authenticated project management Remote namespace. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-project'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Project } from '@deepseek-ai/dsh-project'
import type { ProjectArchiveRequest, ProjectCreateRequest, ProjectUpdateRequest, ProjectView, ProjectCatalog } from './types.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { projectController: ProjectController }
}
function toView(project: Project): ProjectView {
  const { id, ...metadata } = project
  return { projectId: id, ...metadata }
}
/** Typed project operations over the project lifecycle service. */
export class ProjectController extends TypertRemoteService {
  static inject = ['typert', 'projects']
  constructor(ctx: Context) { super(ctx, 'projectController', { namespace: 'project' }) }

  /** @returns complete metadata and the caller's management permission. */
  @Remote
  async list(): Promise<ProjectCatalog> { return this.catalog() }

  /**
   * @param request - Project identity.
   * @returns project metadata; unknown ids reject with project/not-found.
   */
  @Remote
  async get(request: ProjectArchiveRequest): Promise<ProjectView> {
    const project = this.ctx.projects.get(request.projectId)
    if (project === undefined) throw new RemoteError('project/not-found', 'project not found', request)
    return toView(project)
  }

  /**
   * @param request - Name, description and initial stage.
   * @returns committed project metadata; non-administrators are refused by the service.
   */
  @Remote
  async create(request: ProjectCreateRequest): Promise<ProjectView> {
    return toView(await this.ctx.projects.create(request.name, request.description ?? '', request.stage))
  }

  /**
   * @param request - Fields to replace on the selected project.
   * @returns committed project metadata.
   */
  @Remote
  async update(request: ProjectUpdateRequest): Promise<ProjectView> {
    return toView(await this.ctx.projects.update(request.projectId, {
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.description === undefined ? {} : { description: request.description }),
      ...(request.stage === undefined ? {} : { stage: request.stage }),
    }))
  }

  /**
   * @param request - Project to archive.
   * @returns archived metadata, retaining files and Sessions.
   */
  @Remote
  async archive(request: ProjectArchiveRequest): Promise<ProjectView> { return toView(await this.ctx.projects.archive(request.projectId)) }

  /**
   * @param request - Project to restore.
   * @returns restored metadata with its original stage.
   */
  @Remote
  async restore(request: ProjectArchiveRequest): Promise<ProjectView> { return toView(await this.ctx.projects.restore(request.projectId)) }

  /**
   * @param signal - Caller cancellation.
   * @returns complete replacement snapshots after committed project mutations.
   */
  @Remote({ mode: 'stream' })
  async *follow(signal: AbortSignal): AsyncIterable<ProjectCatalog> {
    const canManage = this.ctx.get('webAccounts')?.admin() ?? true
    for await (const projects of this.ctx.projects.follow(signal)) yield { projects: projects.map(toView), canManage }
  }

  private catalog(): ProjectCatalog {
    return { projects: this.ctx.projects.list().map(toView), canManage: this.ctx.get('webAccounts')?.admin() ?? true }
  }
}
export default ProjectController
