import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconDatabaseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { KnowledgeBaseSection, type KnowledgeBaseSectionInjected } from './KnowledgeBaseSection.tsx'
import { KnowledgeBaseController } from './store.ts'
import { en, zh, type KnowledgeBaseLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { knowledgeBase: KnowledgeBaseLocaleKey }
}

const NS = 'knowledgeBase'
const PANEL_ID = 'knowledge-base' as MainPanelId
export const inject = ['slots', 'locale', 'remote', 'remote.knowledgeBase']

function KnowledgeBaseIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return createElement(IconDatabaseOutline16, { size })
}

/** Register the knowledge-base sidebar row and main panel. */
export function apply(ctx: ClientContext): void {
  const controller = new KnowledgeBaseController(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge-base: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): KnowledgeBaseSectionInjected => ({
    hooks: { knowledgeBase: controller.store },
    load: () => controller.load(), select: id => controller.select(id),
    edit: (content) => { controller.edit(content) }, save: () => controller.save(),
    create: (rootId, path, title) => controller.create(rootId, path, title),
    remove: (id, revision) => controller.remove(id, revision),
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: injected,
  }, KnowledgeBaseSection))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: -100, label: () => t('nav'), locale: NS,
  }, KnowledgeBaseIcon))
}
