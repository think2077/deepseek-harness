import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeBase } from '../src/index.ts'

const temporaryRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

async function fixture(subagents?: Context['subagents']) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-knowledge-base-'))
  temporaryRoots.add(base)
  const publicRoot = join(base, 'public')
  const candidateRoot = join(base, 'candidate')
  const workspaceRoot = join(base, 'workspace')
  const projectRoot = join(workspaceRoot, '知识库')
  await mkdir(join(publicRoot, 'company'), { recursive: true })
  await mkdir(join(candidateRoot, 'pending'), { recursive: true })
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(publicRoot, 'company', 'facts.md'), '# Company facts\n\nInitial.\n')
  await writeFile(join(candidateRoot, 'pending', 'suggestion.yml'), [
    'title: Suggestion', 'status: Pending', 'suggested_destination: Public/company/facts.md',
    'scope: Every plan', 'evidence:', '  session: session-one', '  files: []', '  urls: []',
    'rule: Always verify the source.', 'exceptions: ""', 'confidence: high', 'proposed_at: 2026-09-28', '',
  ].join('\n'))
  await writeFile(join(projectRoot, 'memo.md'), '# Project memo\n\nRead only.\n')
  const ctx = new Context()
  ctx.provide('workspaceRegistry', {
    list: () => [{ id: 'workspace-one', title: 'Project', path: workspaceRoot }],
  } as unknown as Context['workspaceRegistry'])
  if (subagents !== undefined) ctx.provide('subagents', subagents)
  const service = new KnowledgeBase(ctx, {
    roots: [
      { id: 'public', label: 'Public', path: publicRoot, kind: 'public', writable: true },
      { id: 'candidate', label: 'Candidate', path: candidateRoot, kind: 'candidate', writable: false },
    ],
    projectKnowledgeDirectory: '知识库',
    review: {
      candidateRootId: 'candidate', pendingDirectory: 'pending', acceptedDirectory: 'accepted',
      rejectedDirectory: 'rejected', ignoredFiles: [],
    },
  })
  return { service, publicRoot, candidateRoot }
}

describe('knowledge base', () => {
  it('lists and reads supported files without exposing host paths', async () => {
    const { service } = await fixture()
    const catalog = await service.list()
    expect(catalog.roots).toEqual([
      { id: 'public', label: 'Public', kind: 'public', writable: true },
      { id: 'candidate', label: 'Candidate', kind: 'candidate', writable: false },
      { id: 'project-workspace-one', label: 'Project', kind: 'project', writable: false },
    ])
    expect(catalog.entries.map(entry => [entry.id, entry.title, entry.writable])).toEqual([
      ['candidate:pending/suggestion.yml', 'suggestion', false],
      ['project-workspace-one:memo.md', 'Project memo', false],
      ['public:company/facts.md', 'Company facts', true],
    ])
    await expect(service.read('public:company/facts.md')).resolves.toMatchObject({
      content: '# Company facts\n\nInitial.\n',
    })
  })

  it('updates writable entries and refuses stale revisions', async () => {
    const { service, publicRoot } = await fixture()
    const opened = await service.read('public:company/facts.md')
    const updated = await service.update({ id: opened.id, revision: opened.revision, content: '# New facts\n' })
    expect(updated.title).toBe('New facts')
    expect(await readFile(join(publicRoot, 'company', 'facts.md'), 'utf8')).toBe('# New facts\n')
    await expect(service.update({ id: opened.id, revision: opened.revision, content: 'stale' }))
      .rejects.toThrow('changed after it was opened')
  })

  it('always treats project roots as read-only and rejects traversal', async () => {
    const { service } = await fixture()
    const project = await service.read('project-workspace-one:memo.md')
    await expect(service.update({ id: project.id, revision: project.revision, content: 'changed' }))
      .rejects.toThrow('read-only')
    await expect(service.read('public:../workspace/知识库/memo.md')).rejects.toThrow('invalid knowledge entry id')
  })

  it('shows configured candidate knowledge and respects its read-only setting', async () => {
    const { service } = await fixture()
    const candidate = await service.read('candidate:pending/suggestion.yml')
    expect(candidate).toMatchObject({ writable: false })
    await expect(service.update({ id: candidate.id, revision: candidate.revision, content: 'changed' }))
      .rejects.toThrow('read-only')
  })

  it('creates knowledge files exclusively and moves removed files to hidden trash', async () => {
    const { service, publicRoot } = await fixture()
    const created = await service.create({
      rootId: 'public', path: 'methods/new-rule.md', content: '# New rule\n',
    })
    expect(created).toMatchObject({
      id: 'public:methods/new-rule.md', title: 'New rule', writable: true,
    })
    await expect(service.create({
      rootId: 'public', path: 'methods/new-rule.md', content: '# Duplicate\n',
    })).rejects.toThrow('already exists')

    await expect(service.deleteEntry({ id: created.id, revision: 'stale' })).rejects.toThrow('changed after it was opened')
    await expect(service.deleteEntry({ id: created.id, revision: created.revision })).resolves.toEqual({ id: created.id })
    await expect(service.read(created.id)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(join(publicRoot, '.knowledge-base-trash'))).toHaveLength(1)
  })

  it('refuses project creation and unsafe create paths', async () => {
    const { service } = await fixture()
    await expect(service.create({
      rootId: 'project-workspace-one', path: 'new.md', content: '# New\n',
    })).rejects.toThrow('read-only')
    await expect(service.create({
      rootId: 'public', path: '../escape.md', content: '# Escape\n',
    })).rejects.toThrow('invalid knowledge entry path')
  })

  it('lists parsed review cards and resolves suggested destinations', async () => {
    const { service } = await fixture()
    const catalog = await service.listReviews()
    expect(catalog.cards).toHaveLength(1)
    expect(catalog.cards[0]).toMatchObject({
      title: 'Suggestion', status: 'pending', rule: 'Always verify the source.',
      suggestedRootId: 'public', suggestedPath: 'company/facts.md', parseError: null,
    })
    expect(catalog.destinationRoots.map(root => root.id)).toEqual(['public'])
    expect(catalog.destinationEntries.map(entry => entry.id)).toEqual(['public:company/facts.md'])
  })

  it('generates an inert structured merge suggestion from the latest destination', async () => {
    const dispose = vi.fn(async () => {})
    const start = vi.fn(async (_provider: string, _request: SubagentStartRequest) => ({
      result: Promise.resolve({
        stopReason: 'completed', output: [], structured: {
          action: 'insert', targetSection: 'Verification', summary: 'Add source verification.',
          reason: 'No equivalent rule exists.',
          changes: [{ type: 'add', before: '', after: 'Always verify the source.' }],
          mergedContent: '# Company facts\n\nInitial.\n\n## Verification\n\nAlways verify the source.\n',
        },
      }),
      dispose,
    }))
    const { service, publicRoot } = await fixture({ start } as never)
    const card = (await service.listReviews()).cards[0]!
    const destination = await service.read('public:company/facts.md')
    const result = await service.suggestMerge({} as Agent, {
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'company/facts.md',
    }, new AbortController().signal)
    expect(result).toMatchObject({ action: 'insert', destinationRevision: destination.revision })
    const [provider, request] = start.mock.calls[0]!
    expect(provider).toBe('spawn')
    expect(request.maxDepth).toBe(1)
    expect(request.parent).toEqual({})
    const prompt = request.prompt[0]
    expect(prompt?.type).toBe('text')
    if (prompt?.type !== 'text') throw new Error('expected text prompt')
    expect(prompt.text).toContain('$knowledge-merge')
    expect(prompt.text).toContain('# Company facts\n\nInitial.')
    const newDestination = await service.suggestMerge({} as Agent, {
      id: card.id, revision: card.revision, destinationRootId: 'public', destinationPath: 'new/rules.md',
    }, new AbortController().signal)
    expect(newDestination.destinationRevision).toBeNull()
    expect(await readdir(publicRoot)).not.toContain('new')
    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('accepts only confirmed destination revisions and archives the candidate', async () => {
    const { service, publicRoot, candidateRoot } = await fixture()
    const card = (await service.listReviews()).cards[0]!
    const destination = await service.read('public:company/facts.md')
    await expect(service.acceptCandidate({
      id: card.id, revision: card.revision, destinationRootId: 'public',
      destinationPath: 'company/facts.md', destinationRevision: 'stale',
      destinationContent: '# Company facts\n\nMerged.\n',
    })).rejects.toThrow('changed after it was opened')

    await expect(service.acceptCandidate({
      id: card.id, revision: card.revision, destinationRootId: 'public',
      destinationPath: 'company/facts.md', destinationRevision: destination.revision,
      destinationContent: '# Company facts\n\nMerged.\n',
    })).resolves.toEqual({
      id: card.id, status: 'accepted', destinationId: 'public:company/facts.md',
    })
    expect(await readFile(join(publicRoot, 'company', 'facts.md'), 'utf8')).toContain('Merged.')
    await expect(readFile(join(candidateRoot, 'pending', 'suggestion.yml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(candidateRoot, 'accepted', 'suggestion.yml'), 'utf8')).toContain('status: 已采纳')
  })

  it('updates and rejects pending candidates with revision checks', async () => {
    const { service, candidateRoot } = await fixture()
    const card = (await service.listReviews()).cards[0]!
    await expect(service.updateCandidate({ id: card.id, revision: 'stale', rule: card.rule }))
      .rejects.toThrow('changed after it was opened')
    const updated = await service.updateCandidate({
      id: card.id, revision: card.revision, rule: 'Edited business rule.',
    })
    expect(updated.rule).toBe('Edited business rule.')
    await expect(service.rejectCandidate({ id: updated.id, revision: updated.revision }))
      .resolves.toEqual({ id: updated.id, status: 'rejected' })
    expect(await readFile(join(candidateRoot, 'rejected', 'suggestion.yml'), 'utf8')).toContain('status: 已拒绝')
  })
})
