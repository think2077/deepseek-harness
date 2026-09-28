import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { KnowledgeBaseSection } from '../src/client/KnowledgeBaseSection.tsx'
import { apply as hostApply } from '../src/index.ts'

describe('ui-knowledge-base browser plugin', () => {
  it('keeps the Host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers a localized sidebar row and matching main panel', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    locale.setLocale('zh')
    ctx.provide('locale', locale)
    const knowledgeBase = {}
    ctx.provide('remote', { knowledgeBase } as never)
    ctx.provide('remote.knowledgeBase', knowledgeBase as never)
    ctx.slots.register({
      name: 'root', children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    const panel = ctx.slots.entries('main')[0]!
    const row = ctx.slots.entries('sidebar.panellist')[0]!
    expect(panel.component).toBe(KnowledgeBaseSection)
    expect(panel.options).toMatchObject({ key: 'knowledge-base' })
    expect(row.options).toMatchObject({ id: 'knowledge-base', order: -100 })
    expect(resolveSlotLabel(row.options.label)).toBe('知识库')

    locale.setLocale('en')
    expect(resolveSlotLabel(ctx.slots.entries('sidebar.panellist')[0]!.options.label)).toBe('Knowledge base')
    await ctx.fiber.dispose()
  })
})
