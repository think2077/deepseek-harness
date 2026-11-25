/** Project catalog, metadata forms and workspace navigation. */
import { useState } from 'react'
import { Button, Input, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectCatalog, ProjectStage, ProjectView, WorkspaceId } from '@deepseek-ai/dsh-api-project-controller/types'
import css from './Projects.module.css'

/** Catalog state survives main-panel remounts and follows the Host. */
export interface ProjectState { readonly catalog?: ProjectCatalog; readonly error?: string }
/** Registration-owned operations and observable metadata. */
export interface ProjectsInjected {
  hooks: { projects: SnapshotStore<ProjectState> }
  save: (draft: { id?: WorkspaceId; name: string; description: string; stage: ProjectStage }) => Promise<void>
  archive: (id: WorkspaceId) => Promise<void>
  restore: (id: WorkspaceId) => Promise<void>
  enter: (id: WorkspaceId) => Promise<void>
  refresh: () => Promise<void>
}
const STAGES: readonly ProjectStage[] = ['engagement', 'discovery', 'proposal', 'approval', 'contracting', 'preparation', 'pilot', 'acceptance', 'operation']

/** Compact row timestamp; unparsable stored values fall back verbatim. */
function updatedLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}
/** Component props including bound hooks and Host actions. */
export type ProjectsProps = PropsRuntime<'main'> & PropsLocale<'projects'> & InjectFace<ProjectsInjected>
type Props = ProjectsProps
type Draft = { id?: WorkspaceId; name: string; description: string; stage: ProjectStage }

/**
 * Render the shared project list with administrator-owned metadata actions.
 * @param props - Localized runtime, catalog subscription and Host commands.
 * @returns project browsing and edit UI.
 */
export function Projects({ t, useProjects, save, archive, restore, enter, refresh }: Props) {
  const state = useProjects(value => value)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<ProjectStage | ''>('')
  const [archived, setArchived] = useState(false)
  const [draft, setDraft] = useState<Draft>()
  const [confirm, setConfirm] = useState<ProjectView>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = async (action: () => Promise<void>, close = false): Promise<void> => {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await action(); if (close) { setDraft(undefined); setConfirm(undefined) } }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('error')) }
    finally { setBusy(false) }
  }
  const rows = state.catalog?.projects.filter(project =>
    (project.status === 'archived') === archived && (stage === '' || stage === project.stage)
    && `${project.title} ${project.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  return <main className={css.page}>
    <header className={css.header}><div><h1>{t('nav')}</h1><p>{t('intro')}</p></div>
      <div className={css.actions}><Button variant="outline" disabled={busy} onClick={() => { void run(refresh) }}>{t('retry')}</Button>
        {state.catalog?.canManage && <Button variant="primary" onClick={() => { setError(undefined); setDraft({ name: '', description: '', stage: 'engagement' }) }}>{t('create')}</Button>}</div>
    </header>
    <div className={css.toolbar}><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
      <select aria-label={t('stage')} value={stage} onChange={(event) => { setStage(event.target.value as ProjectStage | '') }}><option value="">{t('allStages')}</option>{STAGES.map(value => <option value={value} key={value}>{t(value)}</option>)}</select>
      <Button variant="outline" aria-pressed={!archived} onClick={() => { setArchived(false) }}>{t('active')}</Button>
      <Button variant="outline" aria-pressed={archived} onClick={() => { setArchived(true) }}>{t('archived')}</Button>
    </div>
    {(error ?? state.error) !== undefined && <p role="alert">{error ?? state.error}</p>}
    {state.catalog === undefined ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <p>{t('empty')}</p> : <div className={css.list} role="list">{rows.map(project => <article key={project.projectId} className={css.row} role="listitem">
      <div className={css.rowMain}>
        <h2>{project.title}</h2>
        <p className={css.meta}>
          <span className={css.description}>{project.description.trim() === '' ? t('noDescription') : project.description}</span>
          <span aria-hidden> · </span>
          <span className={css.creator} title={t('creator')}>{project.createdByName ?? t('unknownCreator')}</span>
        </p>
      </div>
      <Tag>{t(project.stage)}</Tag>
      <div className={css.rowTime}><span>{t('updated')}</span><time dateTime={project.updatedAt}>{updatedLabel(project.updatedAt)}</time></div>
      <div className={css.rowActions}>
        {project.status === 'active' && <Button size="sm" variant="primary" disabled={busy} onClick={() => { void run(() => enter(project.projectId)) }}>{t('enter')}</Button>}
        {state.catalog?.canManage && <><Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(undefined); setDraft({ id: project.projectId, name: project.title, description: project.description, stage: project.stage }) }}>{t('edit')}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
            if (project.status === 'archived') void run(() => restore(project.projectId))
            else { setError(undefined); setConfirm(project) }
          }}>{t(project.status === 'archived' ? 'restore' : 'archive')}</Button></>}
      </div>
    </article>)}</div>}
    {draft !== undefined && <Modal open title={t(draft.id === undefined ? 'create' : 'edit')} closeLabel={t('close')} onClose={() => { if (!busy) setDraft(undefined) }}>
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); void run(() => save(draft), true) }}>
        <label>{t('name')}<Input autoFocus required value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} /></label>
        <label>{t('description')}<textarea value={draft.description} onChange={(event) => { setDraft({ ...draft, description: event.target.value }) }} /></label>
        <label>{t('stage')}<select value={draft.stage} onChange={(event) => { setDraft({ ...draft, stage: event.target.value as ProjectStage }) }}>{STAGES.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        {error !== undefined && <p role="alert">{error}</p>}
        <div className={css.actions}><Button type="submit" variant="primary" disabled={busy || draft.name.trim() === ''}>{t(busy ? 'saving' : 'save')}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setDraft(undefined) }}>{t('cancel')}</Button></div>
      </form>
    </Modal>}
    {confirm !== undefined && <Modal open title={t('archiveTitle')} description={t('archiveHint')} closeLabel={t('close')} onClose={() => { if (!busy) setConfirm(undefined) }}>
      <p>{confirm.title}</p>{error !== undefined && <p role="alert">{error}</p>}
      <Button variant="primary" disabled={busy} onClick={() => { void run(() => archive(confirm.projectId), true) }}>{t('archive')}</Button>
    </Modal>}
  </main>
}
