import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { KnowledgeBaseSection } from '../src/client/KnowledgeBaseSection.tsx'
import { KnowledgeReviewSection } from '../src/client/KnowledgeReviewSection.tsx'
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
    ctx.provide('sessions', { list: { getSnapshot: () => ({ current: undefined }) } } as never)
    ctx.slots.register({
      name: 'root', children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)

    await ctx.plugin({ inject: [...inject], apply }).await()
    const panels = ctx.slots.entries('main')
    const rows = ctx.slots.entries('sidebar.panellist')
    expect(panels.map(panel => panel.component)).toEqual([KnowledgeReviewSection, KnowledgeBaseSection])
    expect(panels.map(panel => panel.options.key)).toEqual(['knowledge-review', 'knowledge-base'])
    expect(rows.map(row => [row.options.id, row.options.order])).toEqual([
      ['knowledge-review', -110], ['knowledge-base', -100],
    ])
    expect(rows.map(row => resolveSlotLabel(row.options.label))).toEqual(['我的审核', '知识库'])

    locale.setLocale('en')
    expect(ctx.slots.entries('sidebar.panellist').map(row => resolveSlotLabel(row.options.label)))
      .toEqual(['My reviews', 'Knowledge base'])
    await ctx.fiber.dispose()
  })
})
