import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconCheckOutline16, IconDatabaseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { KnowledgeBaseSection, type KnowledgeBaseSectionInjected } from './KnowledgeBaseSection.tsx'
import { KnowledgeReviewSection, type KnowledgeReviewSectionInjected } from './KnowledgeReviewSection.tsx'
import { KnowledgeBaseController } from './store.ts'
import { KnowledgeReviewController } from './review-store.ts'
import { en, zh, type KnowledgeBaseLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { knowledgeBase: KnowledgeBaseLocaleKey }
}

const NS = 'knowledgeBase'
const PANEL_ID = 'knowledge-base' as MainPanelId
const REVIEW_PANEL_ID = 'knowledge-review' as MainPanelId
export const inject = ['slots', 'locale', 'remote', 'remote.knowledgeBase', 'sessions']

function KnowledgeBaseIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return createElement(IconDatabaseOutline16, { size })
}

function KnowledgeReviewIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return createElement(IconCheckOutline16, { size })
}

/** Register the knowledge-base sidebar row and main panel. */
export function apply(ctx: ClientContext): void {
  const controller = new KnowledgeBaseController(ctx)
  const reviewController = new KnowledgeReviewController(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge-base: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): KnowledgeBaseSectionInjected => ({
    hooks: { knowledgeBase: controller.store },
    load: () => controller.load(), select: id => controller.select(id),
    edit: (content) => { controller.edit(content) }, save: () => controller.save(),
    create: (rootId, path, title) => controller.create(rootId, path, title),
    remove: (id, revision) => controller.remove(id, revision),
  })
  const reviewInjected = (): KnowledgeReviewSectionInjected => ({
    hooks: { knowledgeReview: reviewController.store },
    loadReviews: () => reviewController.load(),
    suggestMerge: (request) => {
      const sessionId = ctx.sessions.list.getSnapshot().current
      if (sessionId === undefined) throw new Error(t('openSessionForMerge'))
      return reviewController.suggestMerge(sessionId, request)
    },
    updateCandidate: (card, content) => reviewController.update(card, content),
    rejectCandidate: card => reviewController.reject(card),
    acceptCandidate: request => reviewController.accept(request),
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: REVIEW_PANEL_ID, locale: NS, inject: reviewInjected,
  }, KnowledgeReviewSection))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: REVIEW_PANEL_ID, order: -110, label: () => t('reviewNav'), locale: NS,
  }, KnowledgeReviewIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: injected,
  }, KnowledgeBaseSection))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: -100, label: () => t('nav'), locale: NS,
  }, KnowledgeBaseIcon))
}
