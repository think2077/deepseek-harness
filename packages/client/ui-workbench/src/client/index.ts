import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { Workbench } from './Workbench.tsx'
import { en, zh, type WorkbenchLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { workbench: WorkbenchLocaleKey }
}

export const inject = ['slots', 'locale']

/** Register the LTC map above the review navigation row.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const id = 'workbench' as MainPanelId
  ctx.effect(() => ctx.locale.register('workbench', { en, zh }), 'ui-workbench: dictionaries')
  const t = ctx.locale.bind('workbench')
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'workbench' }, Workbench))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id, order: -120, locale: 'workbench', label: () => t('nav'),
  }, () => createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true }, createElement('path', { d: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z', fill: 'none', stroke: 'currentColor' }))))
}
