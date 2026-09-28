import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button, FileTypeIcon, IconFolderClose16, IconPlusOutline16, IconTrashOutline16,
  IconTriangleRightFill14, MarkdownText, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { KnowledgeEntrySummary, KnowledgeRootView } from '@deepseek-ai/dsh-knowledge-base/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KnowledgeBaseState } from './store.ts'
import css from './KnowledgeBaseSection.module.css'

/** Registration-side panel operations. */
export interface KnowledgeBaseSectionInjected {
  hooks: { knowledgeBase: SnapshotStore<KnowledgeBaseState> }
  load: () => Promise<void>
  select: (id: string) => Promise<void>
  edit: (content: string) => void
  save: () => Promise<void>
  create: (rootId: string, path: string, title: string) => Promise<void>
  remove: (id: string, revision: string) => Promise<void>
}

export type KnowledgeBaseSectionProps = PropsRuntime<'main'>
  & PropsLocale<'knowledgeBase'> & InjectFace<KnowledgeBaseSectionInjected>

type Scope = 'knowledge' | 'project'

interface FolderNode {
  readonly name: string
  readonly path: string
  readonly folders: Map<string, FolderNode>
  readonly files: KnowledgeEntrySummary[]
}

function rootTitle(root: KnowledgeRootView, t: KnowledgeBaseSectionProps['t']): string {
  return root.kind === 'project' ? t('projectNamed', { name: root.label }) : t(root.kind)
}

function folderTree(entries: readonly KnowledgeEntrySummary[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: new Map(), files: [] }
  for (const entry of entries) {
    const segments = entry.path.split('/')
    let folder = root
    for (const name of segments.slice(0, -1)) {
      const path = folder.path === '' ? name : `${folder.path}/${name}`
      let child = folder.folders.get(name)
      if (child === undefined) {
        child = { name, path, folders: new Map(), files: [] }
        folder.folders.set(name, child)
      }
      folder = child
    }
    folder.files.push(entry)
  }
  return root
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

function FolderChildren({ node, rootId, depth, collapsed, toggle, selectedId, selectEntry }: {
  node: FolderNode
  rootId: string
  depth: number
  collapsed: ReadonlySet<string>
  toggle: (key: string) => void
  selectedId: string | undefined
  selectEntry: (id: string) => void
}): ReactNode {
  const folders = [...node.folders.values()].sort((left, right) => left.name.localeCompare(right.name))
  const files = [...node.files].sort((left, right) => left.path.localeCompare(right.path))
  return <>
    {folders.map((folder) => {
      const key = `${rootId}:${folder.path}`
      const open = !collapsed.has(key)
      return <div className={css.treeBranch} key={key}>
        <button type="button" className={css.folderRow} style={{ paddingInlineStart: 10 + depth * 16 }}
          aria-expanded={open} onClick={() => { toggle(key) }}>
          <IconTriangleRightFill14 size={12} className={open ? css.disclosureOpen : css.disclosure} />
          <IconFolderClose16 size={15} />
          <span>{folder.name}</span>
        </button>
        {open && <FolderChildren node={folder} rootId={rootId} depth={depth + 1} collapsed={collapsed}
          toggle={toggle} selectedId={selectedId} selectEntry={selectEntry} />}
      </div>
    })}
    {files.map(entry => <button type="button" key={entry.id}
      className={entry.id === selectedId ? css.fileActive : css.fileRow}
      style={{ paddingInlineStart: 26 + depth * 16 }} title={entry.title}
      onClick={() => { selectEntry(entry.id) }}>
      <FileTypeIcon path={entry.path} size={16} />
      <span>{basename(entry.path)}</span>
    </button>)}
  </>
}

function KnowledgeTree({ roots, entries, selectedId, collapsed, toggle, selectEntry, t }: {
  roots: readonly KnowledgeRootView[]
  entries: readonly KnowledgeEntrySummary[]
  selectedId: string | undefined
  collapsed: ReadonlySet<string>
  toggle: (key: string) => void
  selectEntry: (id: string) => void
  t: KnowledgeBaseSectionProps['t']
}): ReactNode {
  return <nav className={css.tree} aria-label={t('tree')}>
    {roots.map((root) => {
      const rootEntries = entries.filter(entry => entry.rootId === root.id)
      const key = `${root.id}:`
      const open = !collapsed.has(key)
      return <div className={css.treeGroup} key={root.id}>
        <button type="button" className={css.rootRow} aria-expanded={open} onClick={() => { toggle(key) }}>
          <IconTriangleRightFill14 size={12} className={open ? css.disclosureOpen : css.disclosure} />
          <IconFolderClose16 size={16} />
          <span>{rootTitle(root, t)}</span><small>{rootEntries.length}</small>
        </button>
        {open && <FolderChildren node={folderTree(rootEntries)} rootId={root.id} depth={1}
          collapsed={collapsed} toggle={toggle} selectedId={selectedId} selectEntry={selectEntry} />}
      </div>
    })}
  </nav>
}

/** Render the full-size knowledge management panel. */
export function KnowledgeBaseSection(props: KnowledgeBaseSectionProps): ReactNode {
  const { t, useKnowledgeBase, load, select, edit, save, create, remove } = props
  const state = useKnowledgeBase(snapshot => snapshot)
  const [scope, setScope] = useState<Scope>('knowledge')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [createRootId, setCreateRootId] = useState('')
  const [createPath, setCreatePath] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [pendingRemove, setPendingRemove] = useState(false)
  const [detailMode, setDetailMode] = useState<'preview' | 'edit'>('preview')
  useEffect(() => { void load() }, [load])

  const knowledgeRoots = state.roots.filter(root => root.kind !== 'project')
  const projectRoots = state.roots.filter(root => root.kind === 'project')
  const writableRoots = knowledgeRoots.filter(root => root.writable)
  useEffect(() => {
    if (createRootId === '' && writableRoots[0] !== undefined) setCreateRootId(writableRoots[0].id)
  }, [createRootId, writableRoots])
  useEffect(() => {
    if (state.notice === 'created') {
      setShowCreate(false)
      setCreatePath('')
      setCreateTitle('')
      setDetailMode('edit')
    }
  }, [state.notice])

  const activeRoots = scope === 'knowledge' ? knowledgeRoots : projectRoots
  const activeRootIds = useMemo(() => new Set(activeRoots.map(root => root.id)), [activeRoots])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return state.entries.filter(entry => activeRootIds.has(entry.rootId)
      && (normalized === '' || entry.title.toLowerCase().includes(normalized)
        || entry.path.toLowerCase().includes(normalized)))
  }, [activeRootIds, query, state.entries])
  const selectedRoot = state.selected === null
    ? undefined
    : state.roots.find(root => root.id === state.selected?.rootId)
  const selected = selectedRoot !== undefined
    && (scope === 'project') === (selectedRoot.kind === 'project') ? state.selected : null
  const copyLabel = t('codeCopy')
  const copiedLabel = t('codeCopied')
  const footnotes = t('footnotes')
  const markdownLabels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel, copiedLabel }, footnotes,
  }), [copiedLabel, copyLabel, footnotes])

  if (state.status === 'loading' || state.status === 'idle') {
    return <div className={css.centerState}>{t('loading')}</div>
  }
  if (state.status === 'error') {
    return <div className={css.centerState}><p role="alert">{state.error ?? t('error')}</p>
      <Button onClick={() => { void load() }}>{t('retry')}</Button></div>
  }

  const submitCreate = (): void => {
    const path = createPath.trim()
    const title = createTitle.trim()
    if (createRootId === '' || path === '' || title === '') return
    const markdownPath = /\.md(?:own)?$/i.test(path) ? path : `${path}.md`
    void create(createRootId, markdownPath, title)
  }
  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const selectEntry = (id: string): void => {
    setDetailMode('preview')
    setPendingRemove(false)
    void select(id)
  }

  return <section className={css.page} aria-label={t('nav')}>
    <header className={css.pageHeader}>
      <div><h1>{t('nav')}</h1><p>{t('description')}</p></div>
      <div className={css.headerActions}>
        <input type="search" value={query} aria-label={t('search')} placeholder={t('searchPlaceholder')}
          onChange={(event) => { setQuery(event.currentTarget.value) }} />
        {scope === 'knowledge' && <Button variant="primary" icon={<IconPlusOutline16 size={16} />}
          disabled={writableRoots.length === 0} onClick={() => { setShowCreate(value => !value) }}>
          {t('add')}
        </Button>}
      </div>
    </header>

    <div className={css.scopeTabs} role="tablist">
      <button type="button" role="tab" aria-selected={scope === 'knowledge'}
        className={scope === 'knowledge' ? css.scopeActive : undefined}
        onClick={() => { setScope('knowledge'); setShowCreate(false); setPendingRemove(false) }}>
        {t('knowledgeTab')}
      </button>
      <button type="button" role="tab" aria-selected={scope === 'project'}
        className={scope === 'project' ? css.scopeActive : undefined}
        onClick={() => { setScope('project'); setShowCreate(false); setPendingRemove(false) }}>
        {t('projectTab')}
      </button>
    </div>

    {showCreate && scope === 'knowledge' && <form className={css.createBar}
      onSubmit={(event) => { event.preventDefault(); submitCreate() }}>
      <label>{t('createRoot')}
        <select value={createRootId} onChange={(event) => { setCreateRootId(event.currentTarget.value) }}>
          {writableRoots.map(root => <option value={root.id} key={root.id}>{rootTitle(root, t)}</option>)}
        </select>
      </label>
      <label>{t('createPath')}
        <input required value={createPath} placeholder={t('createPathPlaceholder')}
          onChange={(event) => { setCreatePath(event.currentTarget.value) }} />
      </label>
      <label>{t('createTitle')}
        <input required value={createTitle} placeholder={t('createTitlePlaceholder')}
          onChange={(event) => { setCreateTitle(event.currentTarget.value) }} />
      </label>
      <div className={css.createActions}>
        <Button type="button" onClick={() => { setShowCreate(false) }}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={state.creating}>
          {t(state.creating ? 'creating' : 'create')}
        </Button>
      </div>
    </form>}

    {state.error !== null && <p className={css.alert} role="alert">{state.error}</p>}
    {state.notice !== null && <p className={css.notice} role="status">{t(state.notice)}</p>}

    <div className={css.workspace}>
      <aside className={css.treePane}>
        <div className={css.treeTitle}><h2>{t('tree')}</h2><span>{visible.length}</span></div>
        <KnowledgeTree roots={activeRoots} entries={visible} selectedId={selected?.id} collapsed={collapsed}
          toggle={toggle} selectEntry={selectEntry} t={t} />
        {visible.length === 0 && <p className={css.empty}>{t('empty')}</p>}
      </aside>

      <article className={css.detailPane}>
        {selected === null ? <div className={css.detailEmpty}>
          <h2>{t('select')}</h2><p>{t('selectHint')}</p>
        </div> : <>
          <header className={css.detailHeader}>
            <div><h2>{selected.title}</h2><p>{selected.path}</p></div>
            <div className={css.detailHeaderActions}>
              <span className={selected.writable ? css.editableBadge : css.readOnlyBadge}>
                {t(selected.writable ? 'editable' : 'readOnly')}
              </span>
              {selected.writable && !pendingRemove && <button type="button" className={css.iconAction}
                aria-label={t('remove')} onClick={() => { setPendingRemove(true) }}>
                <IconTrashOutline16 size={16} />
              </button>}
              {selected.writable && pendingRemove && <div className={css.confirmActions}>
                <Button size="sm" onClick={() => { setPendingRemove(false) }}>{t('cancel')}</Button>
                <Button size="sm" className={css.danger} disabled={state.removingId === selected.id}
                  onClick={() => { void remove(selected.id, selected.revision); setPendingRemove(false) }}>
                  {t(state.removingId === selected.id ? 'removing' : 'confirmRemove')}
                </Button>
              </div>}
            </div>
          </header>
          <div className={css.detailTabs} role="tablist">
            <button type="button" role="tab" aria-selected={detailMode === 'preview'}
              className={detailMode === 'preview' ? css.tabActive : undefined}
              onClick={() => { setDetailMode('preview') }}>{t('preview')}</button>
            {selected.writable && <button type="button" role="tab" aria-selected={detailMode === 'edit'}
              className={detailMode === 'edit' ? css.tabActive : undefined}
              onClick={() => { setDetailMode('edit') }}>{t('edit')}</button>}
          </div>
          <div className={css.detailBody}>
            {detailMode === 'edit' && selected.writable
              ? <textarea aria-label={t('editor')} value={state.draft}
                onChange={(event) => { edit(event.currentTarget.value) }} />
              : /\.md(?:own)?$/i.test(selected.path)
                ? <div className={css.preview}><MarkdownText text={state.draft} labels={markdownLabels} /></div>
                : <pre className={css.preview}>{state.draft}</pre>}
          </div>
          {selected.writable && detailMode === 'edit' && <footer className={css.detailActions}>
            <Button variant="primary" disabled={state.saving || state.draft === selected.content}
              onClick={() => { void save() }}>{t(state.saving ? 'saving' : 'save')}</Button>
          </footer>}
        </>}
      </article>
    </div>
  </section>
}
