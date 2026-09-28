/** Host-managed text knowledge roots exposed through the `knowledgeBase` Remote namespace. */

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type {
  KnowledgeCatalog, KnowledgeCreateRequest, KnowledgeEntryDocument, KnowledgeEntrySummary,
  KnowledgeDeleteRequest, KnowledgeDeleteResult, KnowledgeRootView, KnowledgeUpdateRequest,
} from './types.ts'

export type * from './types.ts'

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.yml', '.yaml', '.json'])
const ROOT_ID = /^[a-z0-9][a-z0-9-]*$/

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/** One deployment-configured knowledge root. */
export interface KnowledgeRootConfig {
  /** Stable root id used in entry ids. The `project-` prefix is reserved. */
  readonly id: string
  /** User-visible collection label. */
  readonly label: string
  /** Host directory; a leading `~` resolves through the harness home-path helper. */
  readonly path: string
  /** Knowledge ownership category. */
  readonly kind: 'public' | 'solution' | 'candidate' | 'project'
  /** Whether existing files may be replaced; project roots always resolve to false. */
  readonly writable: boolean
}

/** Knowledge-base roots. */
export interface Config {
  /** Deployment-owned public, solution-specific, candidate, or fixed project roots. */
  readonly roots: readonly KnowledgeRootConfig[]
  /** Directory below each registered Workspace exposed as read-only project knowledge. */
  readonly projectKnowledgeDirectory: string
}

interface ResolvedRoot extends KnowledgeRootView {
  readonly path: string
}

function revisionOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function titleOf(path: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading === undefined || heading === '' ? basename(path, extname(path)) : heading
}

function entryId(rootId: string, path: string): string {
  return `${rootId}:${path.split(sep).join('/')}`
}

function safeRelativePath(path: string): string | undefined {
  if (path === '' || isAbsolute(path) || path.includes('\\')) return undefined
  const parts = path.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..' || part.startsWith('.'))) return undefined
  const normalized = parts.join('/')
  return TEXT_EXTENSIONS.has(extname(normalized).toLowerCase()) ? normalized : undefined
}

async function scan(root: ResolvedRoot, dir = root.path): Promise<KnowledgeEntrySummary[]> {
  const rows: KnowledgeEntrySummary[] = []
  for (const child of await readdir(dir, { withFileTypes: true })) {
    if (child.name.startsWith('.') || child.isSymbolicLink()) continue
    const target = resolve(dir, child.name)
    if (child.isDirectory()) {
      rows.push(...await scan(root, target))
      continue
    }
    if (!child.isFile() || !TEXT_EXTENSIONS.has(extname(child.name).toLowerCase())) continue
    const [content, metadata] = await Promise.all([readFile(target, 'utf8'), stat(target)])
    const path = relative(root.path, target).split(sep).join('/')
    rows.push({
      id: entryId(root.id, path), rootId: root.id, path,
      title: titleOf(path, content), writable: root.writable, revision: revisionOf(content),
      updatedAt: metadata.mtime.toISOString(),
    })
  }
  return rows
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of configured knowledge roots. */
    knowledgeBase: KnowledgeBase
  }
}

/** Lists, reads, and compare-and-set updates configured knowledge files. */
export class KnowledgeBase extends TypertRemoteService {
  static inject = ['workspaceRegistry']

  static Config: z<Config> = z.object({
    roots: z.array(z.object({
      id: z.string().required(),
      label: z.string().required(),
      path: z.string().required(),
      kind: z.union(['public', 'solution', 'candidate', 'project'] as const).required(),
      writable: z.boolean().default(false),
    })).default([]),
    projectKnowledgeDirectory: z.string().default('知识库'),
  }) as z<Config>

  private readonly configuredRoots: readonly ResolvedRoot[]
  private readonly projectKnowledgeDirectory: string

  /** @param ctx - Host context. @param config - configured knowledge roots. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'knowledgeBase')
    const ids = new Set<string>()
    this.configuredRoots = config.roots.map((root) => {
      if (!ROOT_ID.test(root.id)) throw new Error(`knowledge-base: invalid root id ${JSON.stringify(root.id)}`)
      if (root.id.startsWith('project-')) {
        throw new Error(`knowledge-base: root id uses reserved prefix ${JSON.stringify(root.id)}`)
      }
      if (ids.has(root.id)) throw new Error(`knowledge-base: duplicate root id ${JSON.stringify(root.id)}`)
      ids.add(root.id)
      return {
        ...root,
        writable: root.kind === 'project' ? false : root.writable,
        path: resolve(expandHomePath(root.path)),
      }
    })
    const directory = config.projectKnowledgeDirectory.trim()
    if (directory === '' || isAbsolute(directory) || directory.split(/[\\/]/u).includes('..')) {
      throw new Error('knowledge-base: projectKnowledgeDirectory must be a relative child path')
    }
    this.projectKnowledgeDirectory = directory
  }

  /**
   * List every configured root and supported text file.
   * @returns the current catalog without Host paths.
   */
  @Remote
  async list(): Promise<KnowledgeCatalog> {
    const roots = this.roots()
    const entries: KnowledgeEntrySummary[] = []
    for (const root of roots) {
      try {
        if ((await stat(root.path)).isDirectory()) entries.push(...await scan(root))
      } catch (error: unknown) {
        if (!isMissing(error)) throw error
        // A missing configured root is an empty collection; it may be created outside this first-phase editor.
      }
    }
    return {
      roots: roots.map(({ path: _path, ...root }) => root),
      entries: entries.sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  /**
   * Read one discovered entry.
   * @param id - Root-qualified entry id.
   * @returns the current document and content revision.
   */
  @Remote
  async read(id: string): Promise<KnowledgeEntryDocument> {
    const resolved = await this.resolveEntry(id)
    const [content, metadata] = await Promise.all([readFile(resolved.target, 'utf8'), stat(resolved.target)])
    return {
      id, rootId: resolved.root.id, path: resolved.relativePath,
      title: titleOf(resolved.relativePath, content), writable: resolved.root.writable,
      revision: revisionOf(content), updatedAt: metadata.mtime.toISOString(), content,
    }
  }

  /**
   * Replace one writable entry when its revision still matches.
   * @param request - Entry id, opened revision, and complete replacement content.
   * @returns the updated document and new revision.
   */
  @Remote
  async update(request: KnowledgeUpdateRequest): Promise<KnowledgeEntryDocument> {
    const resolved = await this.resolveEntry(request.id)
    this.assertWritable(resolved.root, request.id)
    return await withFileLock(resolved.target, async () => {
      const current = await readFile(resolved.target, 'utf8')
      this.assertRevision(request.id, request.revision, current)
      const mode = (await stat(resolved.target)).mode & 0o777
      await writeFileAtomic(resolved.target, request.content, { mode })
      const metadata = await stat(resolved.target)
      return {
        id: request.id, rootId: resolved.root.id, path: resolved.relativePath,
        title: titleOf(resolved.relativePath, request.content), writable: true,
        revision: revisionOf(request.content), updatedAt: metadata.mtime.toISOString(), content: request.content,
      }
    })
  }

  /**
   * Create one supported text file below a writable root.
   * @param request - Writable root, relative file path, and complete initial content.
   * @returns the created document.
   */
  @Remote
  async create(request: KnowledgeCreateRequest): Promise<KnowledgeEntryDocument> {
    const root = this.roots().find(candidate => candidate.id === request.rootId)
    const relativePath = safeRelativePath(request.path)
    const id = entryId(request.rootId, request.path)
    if (root === undefined || relativePath === undefined) {
      throw new RemoteError('gateway/bad-request', `invalid knowledge entry path ${JSON.stringify(request.path)}`, {})
    }
    this.assertWritable(root, id)
    const target = await this.prepareCreateTarget(root, relativePath)
    return await withFileLock(target, async () => {
      try {
        await writeFile(target, request.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        throw new RemoteError(
          'knowledge-base/already-exists',
          `knowledge entry "${id}" already exists`,
          { id },
        )
      }
      const metadata = await stat(target)
      return {
        id, rootId: root.id, path: relativePath,
        title: titleOf(relativePath, request.content), writable: true,
        revision: revisionOf(request.content), updatedAt: metadata.mtime.toISOString(), content: request.content,
      }
    })
  }

  /**
   * Move one writable entry to its root's hidden trash when the revision matches.
   * @param request - Entry id and opened revision.
   * @returns the removed entry id.
   */
  @Remote
  async deleteEntry(request: KnowledgeDeleteRequest): Promise<KnowledgeDeleteResult> {
    const resolved = await this.resolveEntry(request.id)
    this.assertWritable(resolved.root, request.id)
    return await withFileLock(resolved.target, async () => {
      const current = await readFile(resolved.target, 'utf8')
      this.assertRevision(request.id, request.revision, current)
      const trash = resolve(await realpath(resolved.root.path), '.knowledge-base-trash')
      await mkdir(trash, { recursive: true, mode: 0o700 })
      const trashed = resolve(trash, `${Date.now()}-${randomUUID()}-${basename(resolved.relativePath)}`)
      await rename(resolved.target, trashed)
      return { id: request.id }
    })
  }

  private async resolveEntry(id: string): Promise<{ root: ResolvedRoot; relativePath: string; target: string }> {
    const separator = id.indexOf(':')
    const root = this.roots().find(candidate => candidate.id === id.slice(0, separator))
    const relativePath = separator < 1 ? undefined : safeRelativePath(id.slice(separator + 1))
    if (root === undefined || relativePath === undefined) {
      throw new RemoteError('gateway/bad-request', `invalid knowledge entry id ${JSON.stringify(id)}`, {})
    }
    const target = resolve(root.path, relativePath)
    if (target === root.path || !target.startsWith(`${root.path}${sep}`)) {
      throw new RemoteError('gateway/bad-request', `knowledge entry escapes its root: ${JSON.stringify(id)}`, {})
    }
    const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(root.path), realpath(target)])
    if (canonicalTarget === canonicalRoot || !canonicalTarget.startsWith(`${canonicalRoot}${sep}`)) {
      throw new RemoteError('gateway/bad-request', `knowledge entry escapes its root: ${JSON.stringify(id)}`, {})
    }
    return { root, relativePath, target: canonicalTarget }
  }

  private assertWritable(root: ResolvedRoot, id: string): void {
    if (root.writable && root.kind !== 'project') return
    throw new RemoteError(
      'knowledge-base/read-only',
      `knowledge entry "${id}" is read-only`,
      { id },
    )
  }

  private assertRevision(id: string, revision: string, content: string): void {
    if (revisionOf(content) === revision) return
    throw new RemoteError(
      'knowledge-base/conflict',
      `knowledge entry "${id}" changed after it was opened`,
      { id },
    )
  }

  private async prepareCreateTarget(root: ResolvedRoot, relativePath: string): Promise<string> {
    await mkdir(root.path, { recursive: true, mode: 0o700 })
    const canonicalRoot = await realpath(root.path)
    let parent = canonicalRoot
    for (const segment of dirname(relativePath).split('/')) {
      if (segment === '.') continue
      const next = resolve(parent, segment)
      try {
        const metadata = await lstat(next)
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new RemoteError('gateway/bad-request', `knowledge directory is not a real directory: ${JSON.stringify(relativePath)}`, {})
        }
      } catch (error: unknown) {
        if (!isMissing(error)) throw error
        await mkdir(next, { mode: 0o700 })
      }
      parent = next
    }
    const canonicalParent = await realpath(parent)
    if (canonicalParent !== canonicalRoot && !canonicalParent.startsWith(`${canonicalRoot}${sep}`)) {
      throw new RemoteError('gateway/bad-request', `knowledge entry escapes its root: ${JSON.stringify(relativePath)}`, {})
    }
    return resolve(canonicalParent, basename(relativePath))
  }

  private roots(): readonly ResolvedRoot[] {
    const projects = this.ctx.workspaceRegistry.list().map(workspace => ({
      id: `project-${workspace.id}`,
      label: workspace.title,
      kind: 'project' as const,
      writable: false,
      path: resolve(workspace.path, this.projectKnowledgeDirectory),
    }))
    return [...this.configuredRoots, ...projects]
  }
}

export default KnowledgeBase
