import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeBase } from '../src/index.ts'

const temporaryRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

async function fixture() {
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
  await writeFile(join(candidateRoot, 'pending', 'suggestion.yml'), 'title: Suggestion\n')
  await writeFile(join(projectRoot, 'memo.md'), '# Project memo\n\nRead only.\n')
  const ctx = new Context()
  ctx.provide('workspaceRegistry', {
    list: () => [{ id: 'workspace-one', title: 'Project', path: workspaceRoot }],
  } as unknown as Context['workspaceRegistry'])
  const service = new KnowledgeBase(ctx, {
    roots: [
      { id: 'public', label: 'Public', path: publicRoot, kind: 'public', writable: true },
      { id: 'candidate', label: 'Candidate', path: candidateRoot, kind: 'candidate', writable: false },
    ],
    projectKnowledgeDirectory: '知识库',
  })
  return { service, publicRoot }
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
    expect(candidate).toMatchObject({ content: 'title: Suggestion\n', writable: false })
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
})
