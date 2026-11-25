/** Browse preset identities and composition rows without mounting an agent. */
import { useEffect, useRef, useState } from 'react'
import { presetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import css from './DigitalEmployees.module.css'

type Props = PropsRuntime<'main'> & PropsLocale<'digitalEmployees'> & {
  readRoster: () => Promise<AgentPresetRoster>
  readInventory: () => Promise<PluginInventorySnapshot>
  startAssistant: (workspaceId: WorkspaceId, presetId: string) => Promise<void>
}

/** Render the roster, read-only details, and workspace conversation launcher.
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
  const [pending, setPending] = useState<string>()
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
  const start = async (workspaceId: WorkspaceId, presetId: string): Promise<void> => {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await startAssistant(workspaceId, presetId) } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('startError'))
    } finally { setBusy(false) }
  }
  const launch = (presetId: string): void => {
    setError(undefined)
    const workspace = current === undefined ? undefined : workspaces.items.find(item => item.sessionIds.includes(current))
    if (workspace === undefined) setPending(presetId)
    else void start(workspace.workspaceId, presetId)
  }
  const displayed = roster?.presets.map(row => ({ ...row, ...presetDisplayText(row, t) }))
  const detail = displayed?.find(row => row.id === selected)
  const composition = inventory?.agentPresets?.find(row => row.id === selected)
  const needle = query.trim().toLocaleLowerCase()
  const rows = displayed?.filter(row =>
    [row.id, row.name, row.description].some(value => value?.toLocaleLowerCase().includes(needle))) ?? []
  return <main className={css.page}>
    <header className={css.header}><div><h1>{t('nav')}</h1><p>{t('description')}</p></div>
      <Button variant="outline" disabled={busy} onClick={() => { setRevision(value => value + 1) }}>{t('retry')}</Button>
    </header>
    <div className={css.search}><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} /></div>
    {loadError ? <p role="alert">{t('error')}</p> : roster === undefined ? <p role="status">{t('loading')}</p>
      : rows.length === 0 ? <p>{t('empty')}</p> : <div className={css.grid}>{rows.map(row => <article className={css.card} key={row.id}>
        <div className={css.badges}><Tag>{t(row.trust === 'system' ? 'builtIn' : 'custom')}</Tag>{row.isDefault && <Tag>{t('default')}</Tag>}{row.broken !== undefined && <Tag>{t('broken')}</Tag>}</div>
        <h2>{row.name}</h2><p>{row.description ?? t('noDescription')}</p>
        <div className={css.actions}><Button variant="outline" onClick={() => { setSelected(row.id) }}>{t('details')}</Button>
          <Button variant="primary" disabled={busy || row.broken !== undefined} onClick={() => { launch(row.id) }}>{t('start')}</Button></div>
      </article>)}</div>}
    {detail !== undefined && <section ref={detailRef} tabIndex={-1} className={css.detail} aria-label={t('details')}>
      <div className={css.header}><h2>{detail.name}</h2><Button variant="ghost" onClick={() => { setSelected(undefined) }}>{t('close')}</Button></div>
      <p>{detail.description ?? t('noDescription')}</p><code>{detail.id}</code>
      {detail.broken !== undefined && <p role="alert">{detail.broken}</p>}
      <h3>{t('capabilities')}</h3><p>{t('capabilityHint')}</p>
      {inventoryError ? <p role="alert">{t('inventoryError')}</p> : inventory === undefined ? <p role="status">{t('loading')}</p>
        : composition === undefined ? <p role="alert">{t('inventoryError')}</p> : composition.broken !== undefined ? <p role="alert">{composition.broken}</p>
          : composition.rows.length === 0 ? <p>{t('noCapabilities')}</p> : <ul className={css.plugins}>{composition.rows.map((row, index) => <li key={index}>
            <code>{row.moduleName}</code><Tag>{t(row.enabled === true ? 'enabled' : row.enabled === false ? 'disabled' : 'conditional')}</Tag>
          </li>)}</ul>}
    </section>}
    {busy && <p role="status">{t('starting')}</p>}{error !== undefined && <p role="alert">{error}</p>}
    {pending !== undefined && <section className={css.detail} role="dialog" aria-label={t('chooseWorkspace')}>
      <h2>{t('chooseWorkspace')}</h2><p>{t('workspaceHint')}</p>
      {workspaces.state === 'error' ? <p role="alert">{t('workspaceError')}</p> : workspaces.phase !== 'ready' ? <p role="status">{t('workspaceLoading')}</p>
        : workspaces.items.length === 0 ? <p>{t('noWorkspaces')}</p> : <div className={css.actions}>{workspaces.items.map(workspace => <Button key={workspace.workspaceId} variant="outline" disabled={busy}
          onClick={() => { void start(workspace.workspaceId, pending) }}>{workspace.title}</Button>)}</div>}
      <Button variant="ghost" disabled={busy} onClick={() => { setPending(undefined); setError(undefined) }}>{t('close')}</Button>
    </section>}
  </main>
}
