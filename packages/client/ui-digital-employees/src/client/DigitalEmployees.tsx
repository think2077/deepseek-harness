/** Browse locally authored digital employees as a list and launch their presets. */
import { useEffect, useRef, useState } from 'react'
import { presetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
import { Button, IconAgentPresetOutline16, IconPlusOutline16, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import css from './DigitalEmployees.module.css'

/** Shipped preset the "create / edit" entry starts: authoring happens in Creator mode. */
const CREATOR_PRESET = 'cordis'

type Props = PropsRuntime<'main'> & PropsLocale<'digitalEmployees'> & {
  readRoster: () => Promise<AgentPresetRoster>
  readInventory: () => Promise<PluginInventorySnapshot>
  startAssistant: (workspaceId: WorkspaceId, presetId: string, initialDraft?: string) => Promise<void>
}

/** Render the authored roster as rows, read-only details, and a workspace conversation launcher.
 * @param props - Framework runtime, localized labels, and Host operations.
 * @returns The digital employee main panel.
 */
export function DigitalEmployees({ t, useSessions, useWorkspaces, readRoster, readInventory, startAssistant }: Props) {
  const [roster, setRoster] = useState<AgentPresetRoster>()
  const [inventory, setInventory] = useState<PluginInventorySnapshot>()
  const [loadError, setLoadError] = useState(false)
  const [inventoryError, setInventoryError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>()
  const detailRef = useRef<HTMLElement>(null)
  useEffect(() => { detailRef.current?.focus() }, [selected])
  const [pending, setPending] = useState<{ presetId: string; initialDraft?: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const current = useSessions(state => state.current)
  const workspaces = useWorkspaces(state => state)
  useEffect(() => {
    let active = true
    setRoster(undefined); setInventory(undefined); setLoadError(false); setInventoryError(false)
    void readRoster().then((value) => { if (active) setRoster(value) }, () => { if (active) setLoadError(true) })
    void readInventory().then((value) => { if (active) setInventory(value) }, () => { if (active) setInventoryError(true) })
    return () => { active = false }
  }, [readRoster, readInventory, revision])
  const start = async (workspaceId: WorkspaceId, presetId: string, initialDraft?: string): Promise<void> => {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await startAssistant(workspaceId, presetId, initialDraft) } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('startError'))
    } finally { setBusy(false) }
  }
  // The authoring entry opens the Creator session with the employee template
  // already in the composer: the fields are what the preset file has to answer.
  const launch = (presetId: string, initialDraft?: string): void => {
    setError(undefined)
    const workspace = current === undefined ? undefined : workspaces.items.find(item => item.sessionIds.includes(current))
    if (workspace === undefined) setPending({ presetId, ...initialDraft === undefined ? {} : { initialDraft } })
    else void start(workspace.workspaceId, presetId, initialDraft)
  }
  // Built-in presets are deployment machinery, not the organization's own
  // employees: the directory lists only what the deployment authored.
  const authored = roster?.presets
    .filter(row => row.trust === 'user')
    .map(row => ({ ...row, ...presetDisplayText(row, t) })) ?? []
  const detail = authored.find(row => row.id === selected)
  const composition = inventory?.agentPresets?.find(row => row.id === selected)
  const needle = query.trim().toLocaleLowerCase()
  const rows = authored.filter(row =>
    [row.id, row.name, row.description].some(value => value?.toLocaleLowerCase().includes(needle)))
  return <main className={css.page}>
    <header className={css.header}>
      <div><h1>{t('nav')}</h1><p>{t('description')}</p></div>
      <Button variant="primary" disabled={busy || roster === undefined} onClick={() => { launch(CREATOR_PRESET, t('createPrompt')) }}>
        <IconPlusOutline16 size={14} />{t('create')}
      </Button>
    </header>
    <div className={css.search}><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} /></div>
    {loadError ? <p role="alert">{t('error')} <Button variant="ghost" onClick={() => { setRevision(value => value + 1) }}>{t('retry')}</Button></p>
      : roster === undefined ? <p role="status">{t('loading')}</p>
        : rows.length === 0 ? <p>{authored.length === 0 ? t('empty') : t('noMatches')}</p> : <div className={css.list}>{rows.map(row => <article className={css.row} key={row.id}>
          <span className={css.icon}><IconAgentPresetOutline16 size={18} /></span>
          <div className={css.rowMain}>
            <button className={css.name} aria-label={`${t('details')}: ${row.name}`} onClick={() => { setSelected(row.id) }}>{row.name}</button>
            <p>{row.description ?? t('noDescription')}</p>
          </div>
          <div className={css.badges}>
            {row.isDefault && <Tag>{t('default')}</Tag>}
            {row.broken !== undefined ? <Tag tone="danger">{t('broken')}</Tag> : <Tag tone="success">{t('published')}</Tag>}
            <Tag tone="neutral">{t('publicVisible')}</Tag>
          </div>
          <div className={css.rowAction}>
            <Button variant="outline" disabled={busy || row.broken !== undefined} onClick={() => { launch(row.id) }}>{t('start')}</Button>
          </div>
        </article>)}</div>}
    {detail !== undefined && <section ref={detailRef} tabIndex={-1} className={css.detail} aria-label={t('details')}>
      <div className={css.header}><h2>{detail.name}</h2><Button variant="ghost" onClick={() => { setSelected(undefined) }}>{t('close')}</Button></div>
      <p>{detail.description ?? t('noDescription')}</p><code>{detail.id}</code>
      {detail.broken !== undefined && <p role="alert">{detail.broken}</p>}
      {inventoryError ? <p role="alert">{t('inventoryError')}</p> : inventory === undefined ? <p role="status">{t('loading')}</p>
        : composition === undefined ? <p role="alert">{t('inventoryError')}</p> : composition.broken !== undefined ? <p role="alert">{composition.broken}</p>
          : <>
            {composition.persona?.prefix !== undefined && <>
              <h3>{t('persona')}</h3>
              <p className={css.persona}>{composition.persona.prefix}</p>
            </>}
            <h3>{t('skills')}</h3>
            {composition.skills.length === 0 ? <p>{t('noSkills')}</p> : <ul className={css.skills}>{composition.skills.map((skill, index) => <li key={index}>
              <h4>{skill.name}</h4><p>{skill.description}</p>
            </li>)}</ul>}
          </>}
    </section>}
    {busy && <p role="status">{t('starting')}</p>}{error !== undefined && <p role="alert">{error}</p>}
    {pending !== undefined && <section className={css.detail} role="dialog" aria-label={t('chooseWorkspace')}>
      <h2>{t('chooseWorkspace')}</h2><p>{t('workspaceHint')}</p>
      {workspaces.state === 'error' ? <p role="alert">{t('workspaceError')}</p> : workspaces.phase !== 'ready' ? <p role="status">{t('workspaceLoading')}</p>
        : workspaces.items.length === 0 ? <p>{t('noWorkspaces')}</p> : <div className={css.badges}>{workspaces.items.map(workspace => <Button key={workspace.workspaceId} variant="outline" disabled={busy}
          onClick={() => { void start(workspace.workspaceId, pending.presetId, pending.initialDraft) }}>{workspace.title}</Button>)}</div>}
      <Button variant="ghost" disabled={busy} onClick={() => { setPending(undefined); setError(undefined) }}>{t('close')}</Button>
    </section>}
  </main>
}
