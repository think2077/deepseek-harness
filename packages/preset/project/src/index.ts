/** Shared project lifecycle over the durable Workspace registry. */
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, readdir, rmdir, unlink, open } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Workspace, ProjectStage, ProjectStatus } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type { Branded } from '@deepseek-ai/dsh-brand'

export type { ProjectMetadata, ProjectStage, ProjectStatus } from '@deepseek-ai/dsh-workspace/types'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'project/not-found': { readonly projectId: WorkspaceId }
    'project/name-conflict': { readonly name: string }
    'project/forbidden': Record<string, never>
    'project/archived': { readonly projectId: WorkspaceId }
    'project/busy': { readonly projectId: WorkspaceId }
  }
}
declare module '@deepseek-ai/cordis' {
  interface Context { projects: ProjectService }
}

/** Server configuration for project directories and text bounds. */
export interface Config {
  /** Absolute directory containing managed project directories. */
  root: string
  /** Maximum trimmed project-title length. */
  maxTitleLength: number
  /** Maximum project-description length. */
  maxDescriptionLength: number
}

/** A project projection; its id is the Workspace id. */
export interface Project {
  readonly id: WorkspaceId
  readonly title: string
  readonly description: string
  readonly stage: ProjectStage
  readonly status: ProjectStatus
  readonly createdBy: Branded<'WebUserId'>
  readonly createdAt: string
  readonly updatedAt: string
}

function projectOf(workspace: Workspace): Project {
  const metadata = workspace.project
  if (metadata === undefined) throw new Error('project metadata is absent')
  return { id: workspace.id, title: workspace.title, ...metadata,
    createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }
}

/** Manages shared projects; all writes require the authenticated administrator. */
export class ProjectService extends Service {
  static inject = ['workspaceRegistry']
  static Config: z<Config> = z.object({
    root: z.string().required(),
    maxTitleLength: z.natural().min(1).default(200),
    maxDescriptionLength: z.natural().min(1).default(10000),
  })
  private root = ''
  private tail: Promise<unknown> = Promise.resolve()
  private readonly followers = new Set<() => void>()
  private readonly lifetime = new AbortController()

  constructor(ctx: Context, readonly config: Config) {
    super(ctx, 'projects')
    if (!isAbsolute(config.root)) throw new Error('projects.root must be an absolute directory')
  }

  protected async [Service.init](): Promise<void> {
    await mkdir(this.config.root, { recursive: true, mode: 0o700 })
    this.root = await realpath(this.config.root)
    for (const name of await readdir(this.root)) {
      const match = /^\.create-([0-9a-f-]{36})\.json$/.exec(name)
      if (match === null) continue
      const matched = match[1]
      if (matched === undefined) continue
      const id = WorkspaceId(matched)
      if (this.ctx.workspaceRegistry.get(id) === undefined) await this.removeEmpty(join(this.root, id))
      await unlink(join(this.root, name))
    }
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      if (workspace.project === undefined) continue
      if (relative(this.root, workspace.path) !== workspace.id) {
        throw new Error(`project '${workspace.id}' is outside projects.root; explicit migration is required`)
      }
    }
    this.ctx.on('agent/pre-step', async ({ agent }, next) => this.archived(agent.session.header.cwd) ? { kind: 'reject' } : next())
    this.ctx.on('tools/pre-execute', async (execution, next) => this.archived(execution.agent?.session.header.cwd)
      ? { kind: 'deny', reason: 'This project is archived. Restore it before starting new work.' } : next())
    this.ctx.effect(() => async () => {
      this.lifetime.abort()
      for (const wake of this.followers) wake()
      await this.tail.catch(() => undefined)
    }, 'project.shutdown')
  }

  /**
   * List every project, including archived projects, in registry order.
   * @returns detached project records.
   */
  list(): readonly Project[] {
    return this.ctx.workspaceRegistry.list().filter(workspace => workspace.project !== undefined).map(projectOf)
  }

  /**
   * Look up a project without exposing ordinary or personal Workspaces.
   * @param id - Workspace identity.
   * @returns the project, or undefined when absent.
   */
  get(id: WorkspaceId): Project | undefined {
    const workspace = this.ctx.workspaceRegistry.get(id)
    return workspace?.project === undefined ? undefined : projectOf(workspace)
  }

  /**
   * Create a project directory and complete Workspace record.
   * @param name - Display name, unique among projects.
   * @param description - Project description.
   * @param stage - Initial progress stage.
   * @returns the committed project.
   */
  create(name: string, description: string, stage: ProjectStage = 'engagement'): Promise<Project> {
    return this.enqueue(async () => {
      this.assertManager()
      const title = this.title(name)
      this.description(description)
      this.assertUnique(title)
      const id = WorkspaceId(randomUUID())
      const directory = join(this.root, id)
      const intent = join(this.root, `.create-${id}.json`)
      await writeFileAtomic(intent, JSON.stringify({ id }), { mode: 0o600, dirMode: 0o700 })
      const handle = await open(intent, 'r')
      try { await handle.sync() } finally { await handle.close() }
      try {
        await mkdir(directory, { mode: 0o700 })
        const accounts = this.ctx.get('webAccounts')
        const createdBy = (accounts?.userId() ?? 'host') as Branded<'WebUserId'>
        const workspace = await this.ctx.workspaceRegistry.create(directory, title, {
          id, metadata: { description, stage, status: 'active', createdBy },
        })
        // The durable registry is authoritative even if marker cleanup fails.
        try { await unlink(intent) } catch (error) { this.ctx.logger.warn(`project '${id}' marker cleanup: ${String(error)}`) }
        this.changed()
        return projectOf(workspace)
      } catch (error) {
        if (this.ctx.workspaceRegistry.get(id) === undefined) {
          await this.removeEmpty(directory)
          await unlink(intent)
        }
        throw error
      }
    })
  }

  /**
   * Replace only supplied project fields, preserving concurrent Session membership.
   * @param id - Project identity.
   * @param patch - Name, description and stage fields to change.
   * @returns the committed project.
   */
  update(id: WorkspaceId, patch: { name?: string; description?: string; stage?: ProjectStage }): Promise<Project> {
    return this.enqueue(async () => {
      this.assertManager()
      const workspace = this.requireProject(id)
      const title = patch.name === undefined ? undefined : this.title(patch.name)
      if (title !== undefined) this.assertUnique(title, id)
      if (patch.description !== undefined) this.description(patch.description)
      await workspace.updateProject({
        ...(patch.description === undefined ? {} : { description: patch.description }),
        ...(patch.stage === undefined ? {} : { stage: patch.stage }),
      }, title)
      this.changed()
      return projectOf(workspace)
    })
  }

  /**
   * Archive without deleting files or history; running project Agents must be stopped first.
   * @param id - Project identity.
   * @returns the committed project.
   */
  archive(id: WorkspaceId): Promise<Project> { return this.setStatus(id, 'archived') }

  /**
   * Restore a project while retaining its stage.
   * @param id - Project identity.
   * @returns the committed project.
   */
  restore(id: WorkspaceId): Promise<Project> { return this.setStatus(id, 'active') }

  /**
   * Read a baseline and complete replacement snapshots after committed mutations.
   * @param signal - Subscriber cancellation.
   * @returns latest project snapshots; slow subscribers coalesce intermediate changes.
   */
  async *follow(signal: AbortSignal): AsyncIterable<readonly Project[]> {
    const cancel = AbortSignal.any([signal, this.lifetime.signal])
    let dirty = true
    let resume: (() => void) | undefined
    const wake = (): void => { dirty = true; resume?.() }
    this.followers.add(wake)
    cancel.addEventListener('abort', wake, { once: true })
    try {
      while (!cancel.aborted) {
        if (dirty) { dirty = false; yield this.list(); continue }
        await new Promise<void>((resolve) => { resume = resolve; if (dirty || cancel.aborted) resolve() })
        resume = undefined
      }
    } finally { this.followers.delete(wake); cancel.removeEventListener('abort', wake) }
  }

  private archived(cwd: string | undefined): boolean {
    return cwd !== undefined && this.ctx.workspaceRegistry.list().some(workspace =>
      workspace.path === cwd && workspace.project?.status === 'archived')
  }

  private setStatus(id: WorkspaceId, status: ProjectStatus): Promise<Project> {
    return this.enqueue(async () => {
      this.assertManager()
      const workspace = this.requireProject(id)
      if (status === 'archived' && this.ctx.get('agents')?.list().some(agent =>
        agent.session.header.cwd === workspace.path && agent.status === 'running')) {
        throw new RemoteError('project/busy', 'Stop project work before archiving it.', { projectId: id })
      }
      await workspace.updateProject({ status })
      this.changed()
      return projectOf(workspace)
    })
  }

  private requireProject(id: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(id)
    if (workspace?.project === undefined) throw new RemoteError('project/not-found', 'project not found', { projectId: id })
    return workspace
  }

  private assertManager(): void {
    if (this.ctx.get('webAccounts')?.admin() === false) throw new RemoteError('project/forbidden', 'Administrator access required.', {})
  }

  private title(value: string): string {
    const title = value.trim()
    if (title.length === 0 || title.length > this.config.maxTitleLength) throw new RemoteError('gateway/bad-request', 'invalid project title', {})
    return title
  }

  private description(value: string): void {
    if (value.length > this.config.maxDescriptionLength) throw new RemoteError('gateway/bad-request', 'project description is too long', {})
  }

  private assertUnique(title: string, except?: WorkspaceId): void {
    if (this.list().some(project => project.id !== except && project.title === title)) {
      throw new RemoteError('project/name-conflict', 'Project name is already in use.', { name: title })
    }
  }

  private async removeEmpty(directory: string): Promise<void> {
    try { await rmdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private changed(): void { for (const wake of this.followers) wake() }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.lifetime.signal.aborted) return Promise.reject(new Error('project service is closed'))
    const result = this.tail.then(operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

export default ProjectService
