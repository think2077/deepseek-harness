/** Registers project management and a reconnecting Host metadata subscription. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ProjectCatalog } from '@deepseek-ai/dsh-api-project-controller/types'
import { Projects, type ProjectState, type ProjectsInjected } from './Projects.tsx'
import { en, zh, type ProjectLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { projects: ProjectLocaleKey }
}
/** Required services and the remote project capability. */
export const inject = ['slots', 'locale', 'remote', 'remote.project', 'uiWorkspace']
/**
 * Register the page and synchronize metadata across users and reconnects.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const store = createSnapshotStore<ProjectState>({})
  const stream = ctx.remote.$stream<ProjectCatalog>({
    name: 'Project metadata', open: signal => ctx.remote.project.follow(signal),
    ended: () => new Error('Project metadata stream ended'),
    carrierFailed: (error) => { store.set({ ...store.getSnapshot(), error: error.message }) },
  })
  const following = (async () => {
    try {
      for await (const item of stream) { store.set({ catalog: item.value }); item.accept() }
    } catch (error) {
      if (!stream.signal.aborted) store.set({ ...store.getSnapshot(), error: String(error) })
    }
  })()
  ctx.effect(() => async () => { await stream.dispose(); await following }, 'projects.metadata')
  ctx.effect(() => ctx.locale.register('projects', { en, zh }), 'projects.locale')
  const refresh = async (): Promise<void> => {
    const result = await ctx.remote.project.list()
    if (!result.ok) throw new Error(result.error.message)
    store.set({ catalog: result.value })
    stream.restart()
  }
  const actions: ProjectsInjected = {
    hooks: { projects: store }, refresh,
    enter: id => ctx.uiWorkspace.openWorkspace(id),
    save: async (draft) => {
      const result = draft.id === undefined
        ? await ctx.remote.project.create({ name: draft.name, description: draft.description, stage: draft.stage })
        : await ctx.remote.project.update({ projectId: draft.id, name: draft.name, description: draft.description, stage: draft.stage })
      if (!result.ok) throw new Error(result.error.message)
      await refresh()
    },
    archive: async (projectId) => {
      const result = await ctx.remote.project.archive({ projectId })
      if (!result.ok) throw new Error(result.error.message)
      await refresh()
    },
    restore: async (projectId) => {
      const result = await ctx.remote.project.restore({ projectId })
      if (!result.ok) throw new Error(result.error.message)
      await refresh()
    },
  }
  const id = 'projects' as MainPanelId
  const t = ctx.locale.bind('projects')
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'projects', inject: () => actions }, Projects))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: -117, locale: 'projects', label: () => t('nav') },
    ({ size }) => createElement(IconFolderOpenOutline16, { size })))
}
