import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import hero from 'hailiang:hero'
import mark from 'hailiang:mark'
import css from './Brand.module.css'

/** Render the compact Hailiang mark requested by the sidebar. */
export function HailiangBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <img className={css.mark} src={mark} width={size} height={size} alt="" />
}

/** Render the full Hailiang lockup above the empty-conversation headline. */
export function HailiangHeroBrandMark() {
  return <img className={`${css.mark} ${css.heroLockup}`} src={hero} alt="" />
}

/** Render the deployment product name beside the expanded sidebar mark. */
export function HailiangBrandName({ t }: PropsLocale<'brand.hailiang'>) {
  return <span className={css.productName}>{t('productName')}</span>
}
