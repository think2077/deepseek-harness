/** Project lifecycle through the Loader and durable JSON Workspace domain. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as Json from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry, { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join, basename } from 'node:path'
import ProjectService from '../src/index.ts'
import { WorkspaceFeed } from '../../../api/workspace-controller/src/feed.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function boot(existing?: string) {
  const root = existing ?? await mkdtemp(join(tmpdir(), 'dsh-project-'))
  if (existing === undefined) roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  const services = { apply(scope: Context) {
    scope.provide('sessionPersistence', { list: async () => [] } as never)
  } }
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-services', services], ['storage', Storage], ['json', Json], ['domain', Domain],
    ['workspace', WorkspaceRegistry], ['projects', ProjectService],
  ])
  // This fixture exercises only module import; Node's cache and job APIs are unused.
  ctx.loader.internal = { version: 'v2', import: async (name: string) => {
    if (!modules.has(name)) throw new Error(`Unexpected fixture module: ${name}`)
    return modules.get(name)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    '- name: test-services', '- name: storage', '- name: json', '  config:', `    root: ${JSON.stringify(join(root, 'data'))}`,
    '- name: domain', '  config:', '    backend: json', '- name: workspace', '- name: projects', '  config:',
    `    root: ${JSON.stringify(join(root, 'projects'))}`, '',
  ].join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  expect(ctx.get('projects')).toBeDefined()
  return { ctx, root, projects: ctx.projects }
}

it('creates complete records, uses the Workspace id for the directory and preserves metadata across restart', async () => {
  const app = await boot()
  const feed = new WorkspaceFeed(app.ctx)
  const cancel = new AbortController()
  const stream = feed.follow(cancel.signal)[Symbol.asyncIterator]()
  expect((await stream.next()).value).toMatchObject({ type: 'baseline', value: { items: [] } })
  const created = await app.projects.create(' Shared project ', 'Keep this description')
  const workspace = app.ctx.workspaceRegistry.get(created.id)!
  expect(basename(workspace.path)).toBe(created.id)
  expect(workspace.project).toMatchObject({ description: 'Keep this description', stage: 'engagement' })
  expect((await stream.next()).value).toMatchObject({ type: 'upsert', workspace: { project: { stage: 'engagement' } } })
  cancel.abort(); await stream.return?.()
  await app.projects.update(created.id, { stage: 'pilot' })
  expect(app.projects.get(created.id)).toMatchObject({ description: 'Keep this description', stage: 'pilot' })
  await app.projects.update(created.id, { name: 'Renamed' })
  expect(app.ctx.workspaceRegistry.get(created.id)!.path).toBe(workspace.path)
  await writeFile(join(workspace.path, 'report.txt'), 'retained')
  await app.projects.archive(created.id)
  await app.ctx.fiber.dispose()
  const restarted = await boot(app.root)
  expect(restarted.projects.get(created.id)).toMatchObject({ title: 'Renamed', stage: 'pilot', status: 'archived', description: 'Keep this description' })
  expect(await readFile(join(workspace.path, 'report.txt'), 'utf8')).toBe('retained')
  await restarted.projects.restore(created.id)
  expect(restarted.projects.get(created.id)?.stage).toBe('pilot')
})

it('serializes duplicate names, rejects unknown ids, and emits updates only after successful writes', async () => {
  const app = await boot()
  const results = await Promise.allSettled([app.projects.create('Same', 'One'), app.projects.create('Same', 'Two')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(app.projects.list()).toHaveLength(1)
  expect(app.projects.get(WorkspaceId('missing'))).toBeUndefined()
  await expect(app.projects.update(WorkspaceId('missing'), { name: 'No' })).rejects.toMatchObject({ code: 'project/not-found' })
  const project = app.projects.list()[0]!
  const abort = new AbortController()
  const stream = app.projects.follow(abort.signal)[Symbol.asyncIterator]()
  expect((await stream.next()).value).toHaveLength(1)
  await app.projects.update(project.id, { description: '' })
  expect((await stream.next()).value?.[0]?.description).toBe('')
  abort.abort(); await stream.return?.()
  expect((await readdir(join(app.root, 'projects'))).filter(name => name.startsWith('.create-'))).toEqual([])
})

it('enforces management permission inside the service and refuses archiving running project Agents', async () => {
  const app = await boot()
  const project = await app.projects.create('Shared', '')
  let manager = false
  app.ctx.provide('webAccounts', { admin: () => manager } as never)
  await expect(app.projects.create('Denied', '')).rejects.toMatchObject({ code: 'project/forbidden' })
  await expect(app.projects.update(project.id, { stage: 'operation' })).rejects.toMatchObject({ code: 'project/forbidden' })
  await expect(app.projects.archive(project.id)).rejects.toMatchObject({ code: 'project/forbidden' })
  manager = true
  app.ctx.provide('agents', { list: () => [{ status: 'running', session: { header: { cwd: app.ctx.workspaceRegistry.get(project.id)!.path } } }] } as never)
  await expect(app.projects.archive(project.id)).rejects.toMatchObject({ code: 'project/busy' })
})

it('recovers only empty directories named by creation intents and preserves nonempty orphan files', async () => {
  const app = await boot()
  await app.ctx.fiber.dispose()
  const id = '11111111-1111-4111-8111-111111111111'
  const directory = join(app.root, 'projects', id)
  await mkdir(directory)
  await writeFile(join(app.root, 'projects', `.create-${id}.json`), JSON.stringify({ id }))
  const recovered = await boot(app.root)
  expect(await readdir(join(app.root, 'projects'))).toEqual([])
  await recovered.ctx.fiber.dispose()
  await mkdir(directory)
  await writeFile(join(directory, 'keep.txt'), 'do not delete')
  await writeFile(join(app.root, 'projects', `.create-${id}.json`), JSON.stringify({ id }))
  await expect(boot(app.root)).rejects.toThrow()
  expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('do not delete')
})
