/** Hailiang browser-brand occupants for the generic sidebar slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { HailiangBrandMark, HailiangBrandName, HailiangHeroBrandMark } from './Brand.tsx'
import { en, zh, type HailiangBrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Hailiang deployment identity shown in the sidebar. */
    'brand.hailiang': HailiangBrandKey
  }
}

/** Dictionary namespace owned by this deployment-brand plugin. */
const NS = 'brand.hailiang'

/** Required service: the UI slot registry. */
export const inject = ['slots', 'locale']

/** Register the Hailiang identity wherever the sidebar declares its brand slots. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand-hailiang: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, HailiangBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, HailiangBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HailiangHeroBrandMark))
}
