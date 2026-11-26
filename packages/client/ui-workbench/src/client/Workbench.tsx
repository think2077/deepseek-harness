import { useState } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchLocaleKey } from './locales.ts'
import css from './Workbench.module.css'

type Props = PropsRuntime<'main'> & PropsLocale<'workbench'> & {
  startAssistant: (workspaceId: WorkspaceId, presetId: string) => Promise<void>
}

type AssistantAction = 'launch' | 'preview' | 'disabled'

interface WorkbenchAssistant {
  readonly labelKey: WorkbenchLocaleKey
  readonly action: AssistantAction
  readonly presetId?: string
}

interface WorkbenchNode {
  readonly titleKey: WorkbenchLocaleKey
  readonly descriptionKey: WorkbenchLocaleKey
  readonly assistants: readonly WorkbenchAssistant[]
}

const NODES: readonly WorkbenchNode[] = Array.from({ length: 10 }, (_, index) => ({
  titleKey: `node${index}Title` as WorkbenchLocaleKey,
  descriptionKey: `node${index}Description` as WorkbenchLocaleKey,
  assistants: index === 1
    ? [
      { labelKey: 'node1Tool', action: 'disabled' },
      { labelKey: 'node1ReceptionTool', action: 'launch', presetId: 'business-expert' },
    ]
    : [{
      labelKey: `node${index}Tool` as WorkbenchLocaleKey,
      action: index === 2 ? 'launch' : index === 5 ? 'preview' : 'disabled',
      ...(index === 2 ? { presetId: 'solution-assistant' } : {}),
    }],
}))

/** Display the LTC map and start pre-visit conversations in a project workspace.
 * @param props - Main-panel runtime and localized labels.
 * @returns Workflow map with workspace selection and project preparation preview.
 */
export function Workbench({ t, useSessions, useWorkspaces, startAssistant }: Props) {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<WorkbenchLocaleKey | null>(null)
  const [choosingWorkspace, setChoosingWorkspace] = useState(false)
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useSessions(state => state.current)
  const workspaces = useWorkspaces(state => state)
  const start = async (workspaceId: WorkspaceId, presetId: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await startAssistant(workspaceId, presetId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('startError'))
    } finally {
      setBusy(false)
    }
  }
  const openAssistant = (presetId: string): void => {
    setError(null)
    const workspace = current === undefined ? undefined
      : workspaces.items.find(item => item.sessionIds.includes(current))
    if (workspace === undefined) {
      setPendingPresetId(presetId)
      setChoosingWorkspace(true)
    } else {
      void start(workspace.workspaceId, presetId)
    }
  }
  return <main className={css.page}>
    <header><span className={css.eyebrow}>{t('ltc')}</span><h1>{t('nav')}<span className={css.titleNote}>{t('navNote')}</span></h1><p>{t('description')}</p></header>
    <nav className={css.toolbar} aria-label={t('nav')}>
      {(['all', 'business', 'operations'] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key) }}>{t(key)}</button>)}
      <span className={css.legend}>{t('available')} · {t('soon')}</span>
    </nav>
    {(['business', 'operations'] as const).filter(stage => filter === 'all' || stage === filter).map(stage => <section key={stage}>
      <h2>{t(stage)}</h2>
      <ol className={css.grid} start={stage === 'business' ? 1 : 6}>
        {NODES.slice(stage === 'business' ? 0 : 5, stage === 'business' ? 5 : 10).map((node, offset) => {
          const i = offset + (stage === 'business' ? 0 : 5)
          return <li key={i} className={css.card}>
            <span className={css.number}>{String(i + 1).padStart(2, '0')} →</span>
            <h3>{t(node.titleKey)}</h3>
            <p>{t(node.descriptionKey)}</p>
            <div className={css.assistants}>
              {node.assistants.map((assistant) => {
                const available = assistant.action !== 'disabled'
                return <button key={assistant.labelKey} type="button"
                  className={available ? css.available : css.pending}
                  disabled={!available || busy}
                  onClick={() => {
                    if (assistant.action === 'launch' && assistant.presetId !== undefined) {
                      openAssistant(assistant.presetId)
                    }
                    if (assistant.action === 'preview') setSelected(assistant.labelKey)
                  }}>
                  <strong>{t(assistant.labelKey)}</strong>
                  <span>{t(available ? 'available' : 'soon')}{available ? ' ↗' : ''}</span>
                </button>
              })}
            </div>
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
              type="button" disabled={busy || pendingPresetId === null} onClick={() => {
                if (pendingPresetId !== null) void start(workspace.workspaceId, pendingPresetId)
              }}>
              <strong>{workspace.title}</strong><span>{workspace.path}</span>
            </button>)}</div>}
      <button type="button" disabled={busy} onClick={() => {
        setChoosingWorkspace(false); setPendingPresetId(null); setError(null)
      }}>{t('close')}</button>
    </section>}
    <section className={css.support}><h2>{t('support')}</h2>{(['sales', 'manager', 'knowledge'] as const).map(key => <span key={key}>{t(key)}</span>)}</section>
    {selected !== null && <section className={css.preview} role="dialog" aria-modal="false" aria-label={t('preview')}>
      <h2>{t(selected)}</h2><p>{t('mock')}</p>
      <button type="button" autoFocus onClick={() => { setSelected(null) }}>{t('close')}</button>
    </section>}
  </main>
}
