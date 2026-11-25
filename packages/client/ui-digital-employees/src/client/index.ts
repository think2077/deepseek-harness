/** Digital employee navigation and Host-backed preset reads. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { IconAgentPresetOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { DigitalEmployees } from './DigitalEmployees.tsx'
import { en, zh, type DigitalEmployeesLocaleKey } from './locales.ts'

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { digitalEmployees: DigitalEmployeesLocaleKey }
}

/** Services needed to browse presets and start workspace conversations. */
export const inject = ['slots', 'locale', 'sessions', 'remote', 'remote.agentPresets', 'remote.pluginInventory', 'layout', 'uiWorkspace']

/** Register the digital employee directory above the review navigation row.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const id = 'digitalEmployees' as MainPanelId
  ctx.effect(() => ctx.locale.register('digitalEmployees', { en, zh }), 'ui-digitalEmployees: dictionaries')
  const t = ctx.locale.bind('digitalEmployees')
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'preset-launch: caller lifetime')
  const startAssistant = ctx.uiWorkspace.createPresetSessionLauncher(lifetime.signal)
  const readRoster = async () => {
    const result = await ctx.remote.agentPresets.list()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const readInventory = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: id, locale: 'digitalEmployees',
    inject: () => ({ startAssistant, readRoster, readInventory }),
  }, DigitalEmployees))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id, order: -115, locale: 'digitalEmployees', label: () => t('nav'),
  }, ({ size }) => createElement(IconAgentPresetOutline16, { size })))
}
