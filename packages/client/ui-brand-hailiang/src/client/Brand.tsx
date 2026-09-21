import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import mark from 'hailiang:mark'
import css from './Brand.module.css'

/** Render the compact Hailiang mark requested by the sidebar. */
export function HailiangBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <img className={css.mark} src={mark} width={size} height={size} alt="" />
}

/** Render the Hailiang mark before the empty-conversation headline. */
export function HailiangHeroBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <img className={`${css.mark} ${className}`} src={mark} width={size} height={size} alt="" />
}

/** Render the deployment product name beside the expanded sidebar mark. */
export function HailiangBrandName({ t }: PropsLocale<'brand.hailiang'>) {
  return <span className={css.productName}>{t('productName')}</span>
}
