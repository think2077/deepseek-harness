/** Registers the independent management cockpit, its project feed, and the preset roster reader. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ProjectCatalog } from '@deepseek-ai/dsh-api-project-controller/types'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import { ManagementCockpit, type CockpitState } from './ManagementCockpit.tsx'
import { en, zh, type CockpitLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { managementCockpit: CockpitLocaleKey } }
export const inject = ['slots', 'locale', 'remote', 'remote.project', 'remote.agentPresets']
/** Register the page and reconnecting read-only project feed. */
export function apply(ctx: Context): void {
  const store = createSnapshotStore<CockpitState>({})
  const stream = ctx.remote.$stream<ProjectCatalog>({
    name: 'Management cockpit projects', open: signal => ctx.remote.project.follow(signal),
    ended: () => new Error('Management cockpit project stream ended'),
    carrierFailed: (error) => { store.set({ ...store.getSnapshot(), error: error.message }) },
  })
  const following = (async () => {
    try { for await (const item of stream) { store.set({ catalog: item.value }); item.accept() } }
    catch (error) { if (!stream.signal.aborted) store.set({ ...store.getSnapshot(), error: String(error) }) }
  })()
  ctx.effect(() => async () => { await stream.dispose(); await following }, 'management-cockpit.projects')
  ctx.effect(() => ctx.locale.register('managementCockpit', { en, zh }), 'management-cockpit.locale')
  const id = 'management-cockpit' as MainPanelId
  const t = ctx.locale.bind('managementCockpit')
  const readRoster = async (): Promise<AgentPresetRoster> => {
    const result = await ctx.remote.agentPresets.list()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'managementCockpit', inject: () => ({ hooks: { cockpit: store }, readRoster }) }, ManagementCockpit))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: -95, locale: 'managementCockpit', label: () => t('nav') }, ({ size }) => createElement(IconFolderOpenOutline16, { size })))
}
