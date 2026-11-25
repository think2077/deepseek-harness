import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ProjectCatalog, ProjectStage } from '@deepseek-ai/dsh-api-project-controller/types'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { CockpitLocaleKey } from './locales.ts'
import css from './ManagementCockpit.module.css'

/** Project metadata received by this plugin's independent feed. */
export interface CockpitState { readonly catalog?: ProjectCatalog; readonly error?: string }
interface CockpitInjected {
  hooks: { cockpit: SnapshotStore<CockpitState> }
  readRoster: () => Promise<AgentPresetRoster>
}
/** Standard main-panel props plus this plugin's project snapshot hook and preset roster reader. */
export type ManagementCockpitProps = PropsRuntime<'main'> & PropsLocale<'managementCockpit'> & InjectFace<CockpitInjected>
const STAGES: readonly ProjectStage[] = ['engagement', 'discovery', 'proposal', 'approval', 'contracting', 'preparation', 'pilot', 'acceptance', 'operation']
const EMPLOYEES: readonly CockpitLocaleKey[] = ['employeeProject', 'employeeResearch', 'employeeProposal', 'employeeContract', 'employeeDelivery', 'employeeOperation', 'employeeQuality', 'employeeKnowledge']
const RECENT_WORK_LIMIT = 8
type Activity = { name: string; owner: string; employees: CockpitLocaleKey[] }
type Workflow = Record<ProjectStage, Activity[]>

function initialWorkflow(t: ManagementCockpitProps['t']): Workflow {
  return Object.fromEntries(STAGES.map((stage, index) => [stage, [
    { name: `${t(stage)}${t('draft')}`, owner: '', employees: [EMPLOYEES[index % EMPLOYEES.length] as CockpitLocaleKey] },
    { name: `${t(stage)}${t('quality')}`, owner: '', employees: ['employeeQuality'] },
  ]])) as Workflow
}

/** Existing durable Sessions, newest first: empty drafts and sub-agent rows are not work. */
function recentWork(sessions: SessionListState): readonly SessionSummary[] {
  return sessions.ids
    .map(id => sessions.byId[id])
    .filter((session): session is SessionSummary => session !== undefined && !session.blank && session.origin !== 'subagent')
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_WORK_LIMIT)
}

/** Compact row time; an unknown update instant falls back to an em dash. */
function timeLabel(value: number): string {
  if (value === 0) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

/** Display existing project, Workspace, Session and job projections. */
export function ManagementCockpit({ t, useCockpit, useSessions, useWorkspaces, readRoster }: ManagementCockpitProps) {
  const catalog = useCockpit(value => value.catalog)
  const sessions = useSessions(value => value)
  const workspaces = useWorkspaces(value => value)
  const [roster, setRoster] = useState<AgentPresetRoster>()
  const [tab, setTab] = useState<'projects' | 'employees'>('projects')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Workflow>(() => initialWorkflow(t))
  useEffect(() => {
    let active = true
    void readRoster().then((value) => { if (active) setRoster(value) }, () => {})
    return () => { active = false }
  }, [readRoster])
  const projects = catalog?.projects ?? []
  const active = projects.filter(project => project.status === 'active')
  const rows = recentWork(sessions)
  const reruns = Object.values(sessions.jobsBySession).flat().filter(job => job.status === 'failed').length
  const counts = new Map(STAGES.map(stage => [stage, active.filter(project => project.stage === stage).length]))
  const max = Math.max(1, ...counts.values())
  // A Session belongs to the Workspace holding its cwd; a shared project Workspace
  // keeps its project title, standalone Workspaces keep their own title.
  const projectOf = (session: SessionSummary): string => {
    const workspace = workspaces.items.find(item => item.path === session.cwd)
    if (workspace === undefined) return t('standalone')
    return projects.find(project => project.projectId === workspace.workspaceId)?.title ?? workspace.title
  }
  // The preset a Session actually runs is a durable projection, so the employee
  // column comes from the Session itself rather than from list position.
  const employeeOf = (session: SessionSummary): string => {
    const preset = session.projectionValues?.agentPreset
    if (preset === null || preset === undefined) return t('generalWork')
    return roster?.presets.find(row => row.id === preset)?.name ?? preset
  }
  const update = (stage: ProjectStage, index: number, patch: Partial<Activity>): void => {
    setDraft(current => ({ ...current, [stage]: current[stage].map((item, at) => at === index ? { ...item, ...patch } : item) }))
  }
  return <main className={css.page}>
    <header className={css.header}><div><h1>{t('title')}</h1><p>{t('intro')}</p></div><Button variant="outline" onClick={() => { setDraft(initialWorkflow(t)); setEditing(true) }}>{t('configure')}</Button></header>
    <nav className={css.tabs} aria-label={t('title')}><button type="button" aria-pressed={tab === 'projects'} onClick={() => { setTab('projects') }}>{t('projectTab')}</button><button type="button" aria-pressed={tab === 'employees'} onClick={() => { setTab('employees') }}>{t('employeeTab')}</button></nav>
    <section className={css.metrics}>{([[t('total'), projects.length], [t('active'), active.length], [t('review'), 0], [t('rerun'), reruns]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    {tab === 'projects' ? <div className={css.overview}>
      <section><h2>{t('distribution')}</h2><div className={css.stageList}>{STAGES.map((stage) => { const count = counts.get(stage) ?? 0; return <div className={css.stageRow} key={stage}><span>{t(stage)}</span><i><b style={{ width: `${count === 0 ? 0 : Math.max(4, count / max * 100)}%` }} /></i><strong>{count}</strong></div> })}</div></section>
      <section><h2>{t('risks')}</h2><div className={css.cards}>{active.slice(0, 4).map(project => <article className={css.riskCard} key={project.projectId}>
        <div className={css.riskHead}><h3>{project.title}</h3><span className={css.chip}>{t(project.stage)}</span></div>
        <p className={css.riskDesc}>{project.description.trim() || t('fallback')}</p>
        <p className={css.riskNext}>{t('next')}</p>
      </article>)}</div></section>
    </div> : <section className={css.cards}><h2>{t('employeeTab')}</h2>{EMPLOYEES.map((employee, index) => <article key={employee}><div><strong>{t(employee)}</strong><p>{active[index % Math.max(active.length, 1)]?.title ?? t('empty')}</p></div><span className={css.chip}>{rows.some(row => row.running) && index === 0 ? t('running') : t('completed')}</span></article>)}</section>}
    <section className={css.recent}><h2>{t('recent')}</h2><div className={css.table}><div className={css.tableHead}><span>{t('task')}</span><span>{t('project')}</span><span>{t('employee')}</span><span>{t('status')}</span><span>{t('time')}</span></div>{rows.length === 0 ? <p>{t('empty')}</p> : rows.map((session) => {
      const project = projectOf(session)
      const employee = employeeOf(session)
      return <div className={css.tableRow} key={session.id}>
        <span title={session.displayTitle}>{session.displayTitle}</span>
        <span title={project}>{project}</span>
        <span title={employee}>{employee}</span>
        <span>{t(session.running ? 'running' : 'completed')}</span>
        <time dateTime={session.updatedAt === 0 ? undefined : new Date(session.updatedAt).toISOString()}>
          {timeLabel(session.updatedAt)}
        </time>
      </div>
    })}</div></section>
    <Modal open={editing} title={t('workflowTitle')} description={t('workflowHint')} closeLabel={t('close')} onClose={() => { setEditing(false) }} className={css.workflowDialog ?? ''} contentClassName={css.workflowContent ?? ''} footer={<><Button variant="ghost" onClick={() => { setEditing(false) }}>{t('cancel')}</Button><Button variant="primary" onClick={() => { setEditing(false) }}>{t('save')}</Button></>}>
      <div className={css.workflow}>{STAGES.map(stage => <section key={stage}><h3>{t(stage)}</h3>{draft[stage].map((activity, index) => <article key={index}><h4>{t('activity')} {index + 1}</h4><div className={css.fields}><label>{t('activityName')}<Input value={activity.name} onChange={(event) => { update(stage, index, { name: event.target.value }) }} /></label><label>{t('owner')}<Input value={activity.owner} placeholder={t('ownerPlaceholder')} onChange={(event) => { update(stage, index, { owner: event.target.value }) }} /></label><label>{t('execution')}<select aria-label={t('execution')}><option>{t('ai')}</option></select></label></div><p>{t('employeeChoice')}</p><div className={css.choices}>{EMPLOYEES.map(employee => <label key={employee}><input type="checkbox" checked={activity.employees.includes(employee)} onChange={(event) => { update(stage, index, { employees: event.target.checked ? [...activity.employees, employee] : activity.employees.filter(value => value !== employee) }) }} />{t(employee)}</label>)}</div></article>)}<Button variant="outline" onClick={() => { setDraft(current => ({ ...current, [stage]: [...current[stage], { name: '', owner: '', employees: [] }] })) }}>＋ {t('add')}</Button></section>)}</div>
    </Modal>
  </main>
}
