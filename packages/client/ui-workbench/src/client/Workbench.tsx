import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Workbench.module.css'

type Props = PropsRuntime<'main'> & PropsLocale<'workbench'>

/** Display the illustrative LTC map with two local capability previews.
 * @param props - Main-panel runtime and localized labels.
 * @returns Workflow map without task execution or persistence.
 */
export function Workbench({ t }: Props) {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<number | null>(null)
  return <main className={css.page}>
    <header><span className={css.eyebrow}>{t('ltc')}</span><h1>{t('nav')}</h1><p>{t('description')}</p></header>
    <nav className={css.toolbar} aria-label={t('nav')}>
      {(['all', 'business', 'operations'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(key)}</button>)}
      <span className={css.legend}>{t('available')} · {t('soon')}</span>
    </nav>
    {(['business', 'operations'] as const).filter(stage => filter === 'all' || stage === filter).map(stage => <section key={stage}>
      <h2>{t(stage)}</h2>
      <ol className={css.grid} start={stage === 'business' ? 1 : 6}>
        {Array.from({ length: 5 }, (_, offset) => offset + (stage === 'business' ? 0 : 5)).map((i) => {
          const available = i === 2 || i === 5
          return <li key={i} className={css.card}>
            <span className={css.number}>{String(i + 1).padStart(2, '0')} →</span>
            <h3>{t(`node${i}Title` as Parameters<typeof t>[0])}</h3>
            <p>{t(`node${i}Description` as Parameters<typeof t>[0])}</p>
            <button type="button" className={available ? css.available : css.pending} disabled={!available} onClick={() => setSelected(i)}>
              <strong>{t(`node${i}Tool` as Parameters<typeof t>[0])}</strong>
              <span>{t(available ? 'available' : 'soon')}{available ? ' ↗' : ''}</span>
            </button>
          </li>
        })}
      </ol>
    </section>)}
    <section className={css.support}><h2>{t('support')}</h2>{(['sales', 'manager', 'knowledge'] as const).map(key => <span key={key}>{t(key)}</span>)}</section>
    {selected !== null && <section className={css.preview} role="dialog" aria-modal="false" aria-label={t('preview')}>
      <h2>{t(`node${selected}Tool` as Parameters<typeof t>[0])}</h2><p>{t('mock')}</p>
      <button type="button" autoFocus onClick={() => setSelected(null)}>{t('close')}</button>
    </section>}
  </main>
}
