// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { HailiangBrandMark, HailiangBrandName } from '../src/client/Brand.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => { cleanup() })

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  return { ctx, slots }
}

describe('Hailiang browser-brand plugin', () => {
  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('fills both sidebar brand slots and removes them on teardown', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
  })

  it('renders the supplied Hailiang artwork and product name', () => {
    const t: PropsLocale<'brand.hailiang'>['t'] = key => key === 'productName' ? '数字员工协同平台' : key
    const name = render(<HailiangBrandName t={t} />)
    expect(name.getByText('数字员工协同平台')).toBeTruthy()
    name.unmount()
    const mark = render(<HailiangBrandMark size={24} />)
    expect(mark.container.querySelector('img')?.getAttribute('width')).toBe('24')
  })
})
