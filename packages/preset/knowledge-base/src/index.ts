/** Host-managed text knowledge roots exposed through the `knowledgeBase` Remote namespace. */

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import { parse, parseDocument } from 'yaml'
import { z as zod } from 'zod'
import type {
  KnowledgeCandidateAcceptRequest, KnowledgeCandidateCard, KnowledgeCandidateRejectRequest,
  KnowledgeCandidateReviewResult, KnowledgeCandidateUpdateRequest, KnowledgeCatalog,
  KnowledgeCreateRequest, KnowledgeDeleteRequest, KnowledgeDeleteResult, KnowledgeEntryDocument,
  KnowledgeEntrySummary, KnowledgeMergeSuggestion, KnowledgeMergeSuggestionRequest,
  KnowledgeReviewCatalog, KnowledgeReviewStatus, KnowledgeRootView, KnowledgeUpdateRequest,
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
  /** Candidate-review directories below one configured candidate root. */
  readonly review?: KnowledgeReviewConfig
}

/** Candidate-review storage layout. */
export interface KnowledgeReviewConfig {
  /** Configured candidate root that owns every review directory. */
  readonly candidateRootId: string
  /** Child directory containing cards available for review. */
  readonly pendingDirectory: string
  /** Child directory receiving cards after confirmed acceptance. */
  readonly acceptedDirectory: string
  /** Child directory receiving cards after confirmed rejection. */
  readonly rejectedDirectory: string
  /** Plain filenames under the review directories that are not candidate cards. */
  readonly ignoredFiles: readonly string[]
  /** One-shot subagent provider used to generate review suggestions. */
  readonly mergeProvider?: string
  /** Skill explicitly invoked by the merge-suggestion child. */
  readonly mergeSkill?: string
}

interface ResolvedKnowledgeReviewConfig extends KnowledgeReviewConfig {
  readonly mergeProvider: string
  readonly mergeSkill: string
}

const DEFAULT_REVIEW: ResolvedKnowledgeReviewConfig = {
  candidateRootId: 'candidate', pendingDirectory: '待审核', acceptedDirectory: '已采纳',
  rejectedDirectory: '已拒绝', ignoredFiles: ['候选知识卡模板.yml'],
  mergeProvider: 'spawn', mergeSkill: 'knowledge-merge',
}

const mergeSuggestionSchema = zod.object({
  action: zod.enum(['insert', 'append', 'replace', 'skip']),
  targetSection: zod.string(),
  summary: zod.string().min(1),
  reason: zod.string().min(1),
  changes: zod.array(zod.object({
    type: zod.enum(['add', 'replace', 'remove']),
    before: zod.string(),
    after: zod.string(),
  })),
  mergedContent: zod.string().min(1),
})

const MERGE_OUTPUT_SCHEMA: ObjectJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['insert', 'append', 'replace', 'skip'] },
    targetSection: { type: 'string' },
    summary: { type: 'string' },
    reason: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['add', 'replace', 'remove'] },
          before: { type: 'string' },
          after: { type: 'string' },
        },
        required: ['type', 'before', 'after'],
      },
    },
    mergedContent: { type: 'string' },
  },
  required: ['action', 'targetSection', 'summary', 'reason', 'changes', 'mergedContent'],
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

const candidateSchema = zod.object({
  title: zod.string().catch(''),
  scope: zod.string().catch(''),
  evidence: zod.object({
    session: zod.string().catch(''),
    files: zod.array(zod.string()).catch([]),
    urls: zod.array(zod.string()).catch([]),
  }).catch({ session: '', files: [], urls: [] }),
  rule: zod.string().catch(''),
  exceptions: zod.string().catch(''),
  confidence: zod.string().catch(''),
  proposed_at: zod.union([zod.string(), zod.date()]).catch(''),
  suggested_destination: zod.string().catch(''),
})

function parseCandidateYaml(content: string):
  | { readonly success: true; readonly data: zod.infer<typeof candidateSchema> }
  | { readonly success: false; readonly message: string } {
  try {
    const result = candidateSchema.safeParse(parse(content))
    return result.success ? result : { success: false, message: result.error.issues[0]?.message ?? 'Invalid candidate YAML' }
  } catch (error: unknown) {
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function safeDirectoryName(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed !== '' && !isAbsolute(trimmed) && !trimmed.includes('/') && !trimmed.includes('\\')
    && trimmed !== '.' && trimmed !== '..' && !trimmed.startsWith('.') ? trimmed : undefined
}

function candidateStatus(path: string, config: KnowledgeReviewConfig): KnowledgeReviewStatus | undefined {
  const directory = path.split('/')[0]
  if (directory === config.pendingDirectory) return 'pending'
  if (directory === config.acceptedDirectory) return 'accepted'
  if (directory === config.rejectedDirectory) return 'rejected'
  return undefined
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
  static inject = ['workspaceRegistry', 'subagents']

  static Config: z<Config> = z.object({
    roots: z.array(z.object({
      id: z.string().required(),
      label: z.string().required(),
      path: z.string().required(),
      kind: z.union(['public', 'solution', 'candidate', 'project'] as const).required(),
      writable: z.boolean().default(false),
    })).default([]),
    projectKnowledgeDirectory: z.string().default('知识库'),
    review: z.object({
      candidateRootId: z.string().default('candidate'),
      pendingDirectory: z.string().default('待审核'),
      acceptedDirectory: z.string().default('已采纳'),
      rejectedDirectory: z.string().default('已拒绝'),
      ignoredFiles: z.array(z.string()).default(['候选知识卡模板.yml']),
      mergeProvider: z.string().default('spawn'),
      mergeSkill: z.string().default('knowledge-merge'),
    }),
  }) as z<Config>

  private readonly configuredRoots: readonly ResolvedRoot[]
  private readonly projectKnowledgeDirectory: string
  private readonly reviewConfig: ResolvedKnowledgeReviewConfig

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
    const review: ResolvedKnowledgeReviewConfig = {
      ...DEFAULT_REVIEW,
      ...config.review,
      mergeProvider: config.review?.mergeProvider ?? DEFAULT_REVIEW.mergeProvider,
      mergeSkill: config.review?.mergeSkill ?? DEFAULT_REVIEW.mergeSkill,
    }
    const reviewDirectories = [
      review.pendingDirectory, review.acceptedDirectory, review.rejectedDirectory,
    ].map(safeDirectoryName)
    if (reviewDirectories.some(value => value === undefined) || new Set(reviewDirectories).size !== 3) {
      throw new Error('knowledge-base: review directories must be three distinct child directory names')
    }
    const candidateRoot = this.configuredRoots.find(root => root.id === review.candidateRootId)
    if (config.review !== undefined && (candidateRoot === undefined || candidateRoot.kind !== 'candidate')) {
      throw new Error('knowledge-base: review candidateRootId must name a configured candidate root')
    }
    if (review.ignoredFiles.some(name => basename(name) !== name || name.startsWith('.'))) {
      throw new Error('knowledge-base: review ignoredFiles must contain plain visible filenames')
    }
    if (review.mergeProvider.trim() === '' || review.mergeSkill.trim() === '') {
      throw new Error('knowledge-base: review mergeProvider and mergeSkill must not be empty')
    }
    this.reviewConfig = review
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

  /**
   * List candidate cards and writable knowledge destinations for the review panel.
   * @returns the current review catalog without Host paths.
   */
  @Remote
  async listReviews(): Promise<KnowledgeReviewCatalog> {
    const candidateRoot = this.candidateRoot()
    let summaries: readonly KnowledgeEntrySummary[] = []
    try {
      if ((await stat(candidateRoot.path)).isDirectory()) summaries = await scan(candidateRoot)
    } catch (error: unknown) {
      if (!isMissing(error)) throw error
    }
    const cards: KnowledgeCandidateCard[] = []
    for (const summary of summaries) {
      const status = candidateStatus(summary.path, this.reviewConfig)
      if (status === undefined || this.reviewConfig.ignoredFiles.includes(basename(summary.path))) continue
      const content = await readFile(resolve(candidateRoot.path, summary.path), 'utf8')
      cards.push(this.parseCandidate(summary, content, status))
    }
    const destinations = this.configuredRoots.filter(root => root.writable
      && (root.kind === 'public' || root.kind === 'solution'))
    const destinationEntries: KnowledgeEntrySummary[] = []
    for (const root of destinations) {
      try {
        if ((await stat(root.path)).isDirectory()) destinationEntries.push(...await scan(root))
      } catch (error: unknown) {
        if (!isMissing(error)) throw error
      }
    }
    return {
      cards: cards.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      destinationRoots: destinations.map(({ path: _path, ...root }) => root),
      destinationEntries: destinationEntries.sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  /**
   * Replace the readable rule in a pending candidate when its revision still matches.
   * @param request - Candidate id, opened revision, and reviewer-edited rule.
   * @returns the updated parsed card.
   */
  @Remote
  async updateCandidate(request: KnowledgeCandidateUpdateRequest): Promise<KnowledgeCandidateCard> {
    const resolved = await this.resolvePendingCandidate(request.id)
    return await withFileLock(resolved.target, async () => {
      const current = await readFile(resolved.target, 'utf8')
      this.assertRevision(request.id, request.revision, current)
      if (request.rule.trim() === '') {
        throw new RemoteError('gateway/bad-request', 'candidate rule must not be empty', {})
      }
      const document = parseDocument(current, { prettyErrors: true, uniqueKeys: true })
      if (document.errors.length > 0 || document.toJS() === null || typeof document.toJS() !== 'object') {
        throw new RemoteError('gateway/bad-request', 'candidate content must be a valid YAML object', {})
      }
      document.set('rule', request.rule.trim())
      const content = String(document)
      const mode = (await stat(resolved.target)).mode & 0o777
      await writeFileAtomic(resolved.target, content, { mode })
      const metadata = await stat(resolved.target)
      const summary = this.summaryOf(resolved.root, resolved.relativePath, content, metadata.mtime.toISOString())
      return this.parseCandidate(summary, content, 'pending')
    })
  }

  /**
   * Generate an inert semantic merge suggestion from the latest candidate and destination content.
   * @param agent - Live parent Agent whose preset supplies the configured merge skill.
   * @param request - Candidate revision and reviewer-selected destination.
   * @param signal - Caller cancellation for the one-shot child.
   * @returns a structured proposal plus the destination revision it analyzed.
   */
  @Remote
  async suggestMerge(
    agent: Agent,
    request: KnowledgeMergeSuggestionRequest,
    signal: AbortSignal,
  ): Promise<KnowledgeMergeSuggestion> {
    signal.throwIfAborted()
    const candidate = await this.resolvePendingCandidate(request.id)
    const candidateContent = await readFile(candidate.target, 'utf8')
    this.assertRevision(request.id, request.revision, candidateContent)
    const parsed = parseCandidateYaml(candidateContent)
    if (!parsed.success || parsed.data.title.trim() === '' || parsed.data.rule.trim() === '') {
      throw new RemoteError('gateway/bad-request', 'candidate title and rule are required for a merge suggestion', {})
    }
    const destination = await this.readMergeDestination(request.destinationRootId, request.destinationPath)
    const skill = this.reviewConfig.mergeSkill.trim()
    const prompt = [
      `$${skill}`,
      '',
      '请为下面这条候选知识生成可供审核人确认的入库合并建议。',
      '只能使用本提示中提供的内容；不要调用工具，不要读取或写入文件。',
      '保留目标文件中与本候选无关的内容。业务规则使用简洁、可审核的语言，不写技术实现依据。',
      '',
      '## 候选知识',
      `标题：${parsed.data.title.trim()}`,
      `规则：${parsed.data.rule.trim()}`,
      `适用范围：${parsed.data.scope.trim() || '未注明'}`,
      `例外：${parsed.data.exceptions.trim() || '无'}`,
      '',
      '## 审核人选择的目标',
      `知识库：${destination.root.label}`,
      `文件：${destination.relativePath}`,
      '',
      '## 目标文件最新全文',
      destination.content === '' ? '（文件尚不存在）' : destination.content,
    ].join('\n')
    const run = await this.ctx.subagents.start(this.reviewConfig.mergeProvider.trim(), {
      label: '知识入库合并建议',
      prompt: [{ type: 'text', text: prompt }],
      parent: agent,
      signal,
      maxDepth: 1,
      toolFilter: { allow: [] },
      outputSchema: MERGE_OUTPUT_SCHEMA,
      persona: '你是知识库审核助手。只分析用户消息中提供的候选知识与目标文件，不调用任何工具，不修改任何文件。完成后只提交结构化结果。',
    })
    try {
      const result = await run.result
      if (result.stopReason !== 'completed' || result.structured === undefined) {
        throw new RemoteError('gateway/internal', `knowledge merge suggestion failed: ${result.stopReason}`, {})
      }
      const suggestion = mergeSuggestionSchema.safeParse(result.structured)
      if (!suggestion.success) {
        throw new RemoteError('gateway/internal', 'knowledge merge suggestion returned invalid structured output', {})
      }
      if (suggestion.data.action === 'skip' && suggestion.data.mergedContent !== destination.content) {
        throw new RemoteError('gateway/internal', 'a skipped knowledge merge must leave the destination unchanged', {})
      }
      return { ...suggestion.data, destinationRevision: destination.revision }
    } finally {
      await run.dispose()
    }
  }

  /**
   * Write reviewer-confirmed destination content and archive the pending candidate as accepted.
   * @param request - Candidate revision, destination revision, and complete confirmed destination content.
   * @returns the accepted card id and destination id.
   */
  @Remote
  async acceptCandidate(request: KnowledgeCandidateAcceptRequest): Promise<KnowledgeCandidateReviewResult> {
    if (request.destinationContent.trim() === '') {
      throw new RemoteError('gateway/bad-request', 'accepted knowledge content must not be empty', {})
    }
    const candidate = await this.resolvePendingCandidate(request.id)
    const destinationRoot = this.configuredRoots.find(root => root.id === request.destinationRootId)
    const destinationPath = safeRelativePath(request.destinationPath)
    const destinationId = entryId(request.destinationRootId, request.destinationPath)
    if (destinationRoot === undefined || destinationPath === undefined
      || !destinationRoot.writable || (destinationRoot.kind !== 'public' && destinationRoot.kind !== 'solution')) {
      throw new RemoteError('gateway/bad-request', 'candidate destination must be a writable knowledge root', {})
    }
    const destination = await this.prepareCreateTarget(destinationRoot, destinationPath)
    return await withFileLock(candidate.target, async () => await withFileLock(destination, async () => {
      const currentCandidate = await readFile(candidate.target, 'utf8')
      this.assertRevision(request.id, request.revision, currentCandidate)
      const parsed = parseCandidateYaml(currentCandidate)
      if (!parsed.success || parsed.data.title.trim() === '' || parsed.data.rule.trim() === '') {
        throw new RemoteError('gateway/bad-request', 'candidate title and rule are required before acceptance', {})
      }

      let previousDestination: { readonly content: string; readonly mode: number } | null = null
      try {
        const content = await readFile(destination, 'utf8')
        if (request.destinationRevision === null) {
          throw new RemoteError('knowledge-base/already-exists', `knowledge entry "${destinationId}" already exists`, { id: destinationId })
        }
        this.assertRevision(destinationId, request.destinationRevision, content)
        previousDestination = { content, mode: (await stat(destination)).mode & 0o777 }
      } catch (error: unknown) {
        if (!isMissing(error)) throw error
        if (request.destinationRevision !== null) {
          throw new RemoteError('knowledge-base/conflict', `knowledge entry "${destinationId}" no longer exists`, { id: destinationId })
        }
      }

      if (previousDestination === null) {
        await writeFile(destination, request.destinationContent, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      } else {
        await writeFileAtomic(destination, request.destinationContent, { mode: previousDestination.mode })
      }
      try {
        await this.moveReviewedCandidate(candidate.target, currentCandidate, 'accepted', destinationId)
      } catch (error: unknown) {
        if (previousDestination === null) await rm(destination, { force: true })
        else await writeFileAtomic(destination, previousDestination.content, { mode: previousDestination.mode })
        throw error
      }
      return { id: request.id, status: 'accepted', destinationId }
    }))
  }

  /**
   * Archive a pending candidate as rejected when its revision still matches.
   * @param request - Candidate id and opened revision.
   * @returns the rejected card id.
   */
  @Remote
  async rejectCandidate(request: KnowledgeCandidateRejectRequest): Promise<KnowledgeCandidateReviewResult> {
    const candidate = await this.resolvePendingCandidate(request.id)
    return await withFileLock(candidate.target, async () => {
      const current = await readFile(candidate.target, 'utf8')
      this.assertRevision(request.id, request.revision, current)
      await this.moveReviewedCandidate(candidate.target, current, 'rejected')
      return { id: request.id, status: 'rejected' }
    })
  }

  private candidateRoot(): ResolvedRoot {
    const root = this.configuredRoots.find(candidate => candidate.id === this.reviewConfig.candidateRootId)
    if (root === undefined || root.kind !== 'candidate') {
      throw new Error('knowledge-base: configured candidate review root is unavailable')
    }
    return root
  }

  private summaryOf(root: ResolvedRoot, path: string, content: string, updatedAt: string): KnowledgeEntrySummary {
    return {
      id: entryId(root.id, path), rootId: root.id, path, title: titleOf(path, content),
      writable: false, revision: revisionOf(content), updatedAt,
    }
  }

  private parseCandidate(
    summary: KnowledgeEntrySummary,
    content: string,
    status: KnowledgeReviewStatus,
  ): KnowledgeCandidateCard {
    const parsed = parseCandidateYaml(content)
    const empty = {
      title: summary.title, scope: '', evidence: { session: '', files: [], urls: [] }, rule: '',
      exceptions: '', confidence: '', proposed_at: '', suggested_destination: '',
    }
    const value = parsed.success ? parsed.data : empty
    const suggestion = this.resolveSuggestion(value.suggested_destination)
    return {
      ...summary, content, status, title: value.title.trim() || summary.title,
      scope: value.scope, evidence: value.evidence, rule: value.rule, exceptions: value.exceptions,
      confidence: value.confidence,
      proposedAt: value.proposed_at instanceof Date ? value.proposed_at.toISOString().slice(0, 10) : value.proposed_at,
      suggestedDestination: value.suggested_destination,
      suggestedRootId: suggestion?.rootId ?? null, suggestedPath: suggestion?.path ?? null,
      parseError: parsed.success ? null : parsed.message,
    }
  }

  private resolveSuggestion(value: string): { readonly rootId: string; readonly path: string } | undefined {
    const primary = value.split(/[；;]/u, 1)[0]?.trim() ?? ''
    for (const root of this.configuredRoots) {
      if (root.kind !== 'public' && root.kind !== 'solution') continue
      const prefix = `${root.label}/`
      if (!primary.startsWith(prefix)) continue
      const path = primary.slice(prefix.length).split(/[（(]/u, 1)[0]?.trim() ?? ''
      const safe = safeRelativePath(path)
      if (safe !== undefined) return { rootId: root.id, path: safe }
    }
    return undefined
  }

  private async resolvePendingCandidate(id: string): Promise<{ root: ResolvedRoot; relativePath: string; target: string }> {
    const resolved = await this.resolveEntry(id)
    if (resolved.root.id !== this.reviewConfig.candidateRootId
      || candidateStatus(resolved.relativePath, this.reviewConfig) !== 'pending') {
      throw new RemoteError('knowledge-base/review-state', `knowledge candidate "${id}" is not pending`, { id })
    }
    return resolved
  }

  private async readMergeDestination(rootId: string, path: string): Promise<{
    readonly root: ResolvedRoot
    readonly relativePath: string
    readonly content: string
    readonly revision: string | null
  }> {
    const root = this.configuredRoots.find(candidate => candidate.id === rootId)
    const relativePath = safeRelativePath(path)
    if (root === undefined || relativePath === undefined || !root.writable
      || (root.kind !== 'public' && root.kind !== 'solution')) {
      throw new RemoteError('gateway/bad-request', 'merge destination must be a writable knowledge root', {})
    }
    try {
      const resolved = await this.resolveEntry(entryId(rootId, relativePath))
      const content = await readFile(resolved.target, 'utf8')
      return { root, relativePath, content, revision: revisionOf(content) }
    } catch (error: unknown) {
      if (!isMissing(error)) throw error
      return { root, relativePath, content: '', revision: null }
    }
  }

  private async moveReviewedCandidate(
    source: string,
    content: string,
    status: 'accepted' | 'rejected',
    destinationId?: string,
  ): Promise<void> {
    const root = this.candidateRoot()
    const directory = status === 'accepted' ? this.reviewConfig.acceptedDirectory : this.reviewConfig.rejectedDirectory
    const targetDirectory = resolve(await realpath(root.path), directory)
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
    const target = resolve(targetDirectory, basename(source))
    try {
      await lstat(target)
      throw new RemoteError('knowledge-base/already-exists', `reviewed candidate "${basename(source)}" already exists`, { id: entryId(root.id, `${directory}/${basename(source)}`) })
    } catch (error: unknown) {
      if (!isMissing(error)) throw error
    }
    const document = parseDocument(content, { prettyErrors: true, uniqueKeys: true })
    if (document.errors.length > 0) {
      throw new RemoteError('gateway/bad-request', 'candidate content must be valid YAML before review', {})
    }
    document.set('status', status === 'accepted' ? '已采纳' : '已拒绝')
    document.set('reviewed_at', new Date().toISOString())
    if (destinationId !== undefined) document.set('accepted_destination', destinationId)
    await rename(source, target)
    try {
      const mode = (await stat(target)).mode & 0o777
      await writeFileAtomic(target, document.toString(), { mode })
    } catch (error: unknown) {
      await rename(target, source)
      throw error
    }
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
