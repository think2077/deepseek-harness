import { useState } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Workbench.module.css'

type Props = PropsRuntime<'main'> & PropsLocale<'workbench'> & {
  startSolution: (workspaceId: WorkspaceId) => Promise<void>
}

/** Display the LTC map and start pre-visit conversations in a project workspace.
 * @param props - Main-panel runtime and localized labels.
 * @returns Workflow map with workspace selection and project preparation preview.
 */
export function Workbench({ t, useSessions, useWorkspaces, startSolution }: Props) {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<number | null>(null)
  const [choosingWorkspace, setChoosingWorkspace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useSessions(state => state.current)
  const workspaces = useWorkspaces(state => state)
  const start = async (workspaceId: WorkspaceId): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await startSolution(workspaceId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('startError'))
    } finally {
      setBusy(false)
    }
  }
  const openSolution = (): void => {
    setError(null)
    const workspace = current === undefined ? undefined
      : workspaces.items.find(item => item.sessionIds.includes(current))
    if (workspace === undefined) setChoosingWorkspace(true)
    else void start(workspace.workspaceId)
  }
  return <main className={css.page}>
    <header><span className={css.eyebrow}>{t('ltc')}</span><h1>{t('nav')}</h1><p>{t('description')}</p></header>
    <nav className={css.toolbar} aria-label={t('nav')}>
      {(['all', 'business', 'operations'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key) }}>{t(key)}</button>)}
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
            <button type="button" className={available ? css.available : css.pending} disabled={!available || busy} onClick={() => { if (i === 2) openSolution(); else setSelected(i) }}>
              <strong>{t(`node${i}Tool` as Parameters<typeof t>[0])}</strong>
              <span>{t(available ? 'available' : 'soon')}{available ? ' ↗' : ''}</span>
            </button>
          </li>
        })}
      </ol>
    </section>)}
    {busy && <p role="status">{t('starting')}</p>}
    {error !== null && <p role="alert">{error}</p>}
    {choosingWorkspace && <section className={css.preview} role="dialog" aria-modal="false" aria-label={t('chooseWorkspace')}>
      <h2>{t('chooseWorkspace')}</h2><p>{t('workspaceHint')}</p>
      {workspaces.state === 'error' ? <p role="alert">{t('workspaceError')}</p>
        : workspaces.phase !== 'ready' ? <p role="status">{t('workspaceLoading')}</p>
          : workspaces.items.length === 0 ? <p>{t('noWorkspaces')}</p>
            : <div className={css.workspaceList}>{workspaces.items.map(workspace => <button key={workspace.workspaceId}
              type="button" disabled={busy} onClick={() => { void start(workspace.workspaceId) }}>
              <strong>{workspace.title}</strong><span>{workspace.path}</span>
            </button>)}</div>}
      <button type="button" disabled={busy} onClick={() => { setChoosingWorkspace(false); setError(null) }}>{t('close')}</button>
    </section>}
    <section className={css.support}><h2>{t('support')}</h2>{(['sales', 'manager', 'knowledge'] as const).map(key => <span key={key}>{t(key)}</span>)}</section>
    {selected !== null && <section className={css.preview} role="dialog" aria-modal="false" aria-label={t('preview')}>
      <h2>{t(`node${selected}Tool` as Parameters<typeof t>[0])}</h2><p>{t('mock')}</p>
      <button type="button" autoFocus onClick={() => { setSelected(null) }}>{t('close')}</button>
    </section>}
  </main>
}
