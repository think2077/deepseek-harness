import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  KnowledgeCandidateAcceptRequest, KnowledgeCandidateCard, KnowledgeMergeSuggestion,
  KnowledgeMergeSuggestionRequest, KnowledgeReviewStatus,
} from '@deepseek-ai/dsh-knowledge-base/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KnowledgeReviewState } from './review-store.ts'
import css from './KnowledgeReviewSection.module.css'

/** Registration-side candidate-review operations. */
export interface KnowledgeReviewSectionInjected {
  hooks: { knowledgeReview: SnapshotStore<KnowledgeReviewState> }
  loadReviews: () => Promise<void>
  suggestMerge: (request: KnowledgeMergeSuggestionRequest) => Promise<KnowledgeMergeSuggestion>
  updateCandidate: (card: KnowledgeCandidateCard, content: string) => Promise<void>
  rejectCandidate: (card: KnowledgeCandidateCard) => Promise<void>
  acceptCandidate: (request: KnowledgeCandidateAcceptRequest) => Promise<void>
}

export type KnowledgeReviewSectionProps = PropsRuntime<'main'>
  & PropsLocale<'knowledgeBase'> & InjectFace<KnowledgeReviewSectionInjected>

type ReviewMode = 'edit' | 'accept'

interface AcceptDraft {
  readonly rootId: string
  readonly path: string
  readonly destinationRevision: string | null
  readonly content: string
  readonly preparedFor: string
  readonly suggestion: KnowledgeMergeSuggestion | null
}

function fallbackPath(card: KnowledgeCandidateCard, directory: string): string {
  const filename = card.path.split('/').at(-1)?.replace(/\.(?:yml|yaml|json)$/i, '') ?? '候选知识'
  return `${directory}/${filename}.md`
}

function statusKey(status: KnowledgeReviewStatus): 'statusPending' | 'statusAccepted' | 'statusRejected' {
  if (status === 'accepted') return 'statusAccepted'
  if (status === 'rejected') return 'statusRejected'
  return 'statusPending'
}

/** Render candidate cards and explicit review confirmation controls. */
export function KnowledgeReviewSection(props: KnowledgeReviewSectionProps): ReactNode {
  const {
    t, useKnowledgeReview, loadReviews, suggestMerge, updateCandidate, rejectCandidate, acceptCandidate,
  } = props
  const state = useKnowledgeReview(snapshot => snapshot)
  const [status, setStatus] = useState<KnowledgeReviewStatus>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ReviewMode>('edit')
  const [candidateDraft, setCandidateDraft] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [acceptDraft, setAcceptDraft] = useState<AcceptDraft | null>(null)
  const [loadingDestination, setLoadingDestination] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  useEffect(() => { void loadReviews() }, [loadReviews])

  const cards = useMemo(() => state.cards.filter(card => card.status === status), [state.cards, status])
  const selected = state.cards.find(card => card.id === selectedId) ?? null

  if (state.status === 'loading' || state.status === 'idle') {
    return <div className={css.centerState}>{t('loading')}</div>
  }
  if (state.status === 'error') {
    return <div className={css.centerState}><p role="alert">{state.error ?? t('error')}</p>
      <Button onClick={() => { void loadReviews() }}>{t('retry')}</Button></div>
  }

  const open = (card: KnowledgeCandidateCard, nextMode: ReviewMode): void => {
    setSelectedId(card.id)
    setMode(nextMode)
    setCandidateDraft(card.rule)
    setRejectingId(null)
    setAcceptDraft(nextMode === 'accept' ? {
      rootId: card.suggestedRootId ?? state.destinationRoots[0]?.id ?? '',
      path: card.suggestedPath ?? fallbackPath(card, t('fallbackDirectory')), destinationRevision: null,
      content: '', preparedFor: '', suggestion: null,
    } : null)
  }

  const prepareMerge = async (): Promise<void> => {
    if (selected === null || acceptDraft === null || acceptDraft.rootId === '' || acceptDraft.path.trim() === '') return
    setLoadingDestination(true)
    setMergeError(null)
    try {
      const path = acceptDraft.path.trim()
      const suggestion = await suggestMerge({
        id: selected.id, revision: selected.revision,
        destinationRootId: acceptDraft.rootId, destinationPath: path,
      })
      setAcceptDraft({
        ...acceptDraft, path, destinationRevision: suggestion.destinationRevision,
        content: suggestion.mergedContent, preparedFor: `${acceptDraft.rootId}:${path}`, suggestion,
      })
    } catch (error: unknown) {
      setMergeError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingDestination(false)
    }
  }

  const close = (): void => {
    setSelectedId(null); setAcceptDraft(null); setRejectingId(null); setMergeError(null)
  }

  return <section className={css.page} aria-label={t('reviewNav')}>
    <header className={css.pageHeader}><div><h1>{t('reviewNav')}</h1><p>{t('reviewDescription')}</p></div></header>
    <div className={css.tabs} role="tablist">
      {(['pending', 'accepted', 'rejected'] as const).map(value => <button key={value} type="button" role="tab"
        aria-selected={status === value} className={status === value ? css.tabActive : undefined}
        onClick={() => { setStatus(value); close() }}>
        {t(value === 'pending' ? 'pendingTab' : value === 'accepted' ? 'acceptedTab' : 'rejectedTab')}
        <span>{state.cards.filter(card => card.status === value).length}</span>
      </button>)}
    </div>
    {state.error !== null && <p className={css.alert} role="alert">{state.error}</p>}
    {state.notice !== null && <p className={css.notice} role="status">{t(state.notice)}</p>}
    <div className={css.list}>
      {cards.map(card => <article className={css.card} key={card.id}>
        <div className={css.cardHeading}>
          <div><h2>{card.title}</h2><p>{t('submittedAt')}：{card.proposedAt || card.updatedAt.slice(0, 10)}</p></div>
          <span data-status={card.status}>{t(statusKey(card.status))}</span>
        </div>
        <p className={css.proposal}>{card.rule || '—'}</p>
        {card.parseError !== null && <p className={css.invalid}>{t('invalidCandidate')}</p>}
        <div className={css.actions}>
          {card.status === 'pending' && <>
            <Button disabled={card.parseError !== null}
              onClick={() => { open(card, 'edit') }}>{t('modifyCandidate')}</Button>
            {rejectingId === card.id
              ? <Button className={css.danger} disabled={state.savingId !== null}
                onClick={() => { void rejectCandidate(card).then(close) }}>{t('confirmReject')}</Button>
              : <Button className={css.danger} onClick={() => { setRejectingId(card.id) }}>{t('rejectCandidate')}</Button>}
            <Button variant="primary" disabled={card.parseError !== null}
              onClick={() => { open(card, 'accept') }}>{t('acceptCandidate')}</Button>
          </>}
        </div>
      </article>)}
      {cards.length === 0 && <p className={css.empty}>{t('reviewEmpty')}</p>}
    </div>

    {selected !== null && <div className={css.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}><article className={css.panel} role="dialog" aria-modal="true" aria-label={selected.title}>
        <header><div><h2>{selected.title}</h2><p>{selected.path}</p></div>
          <Button onClick={close}>{t('close')}</Button></header>
        {mode === 'edit' && <div className={css.editorPane}>
          <p className={css.hint}>{t('candidateEditHint')}</p>
          <textarea aria-label={t('candidateEditor')} value={candidateDraft}
            onChange={(event) => { setCandidateDraft(event.currentTarget.value) }} />
          <footer><Button variant="primary" disabled={state.savingId !== null
            || candidateDraft.trim() === '' || candidateDraft === selected.rule}
          onClick={() => { void updateCandidate(selected, candidateDraft).then(close) }}>{t('saveCandidate')}</Button></footer>
        </div>}
        {mode === 'accept' && acceptDraft !== null && <div className={css.acceptPane}>
          <p className={css.hint}>{t('mergeHint')}</p>
          <div className={css.destinationFields}>
            <label>{t('destinationRoot')}<select value={acceptDraft.rootId} onChange={(event) => {
              setAcceptDraft({ ...acceptDraft, rootId: event.currentTarget.value, content: '', preparedFor: '', suggestion: null })
            }}>{state.destinationRoots.map(root => <option key={root.id} value={root.id}>{root.label}</option>)}</select></label>
            <label>{t('destinationPath')}<input value={acceptDraft.path} list="knowledge-destination-paths"
              onChange={(event) => { setAcceptDraft({ ...acceptDraft, path: event.currentTarget.value, content: '', preparedFor: '', suggestion: null }) }} /></label>
            <datalist id="knowledge-destination-paths">{state.destinationEntries
              .filter(entry => entry.rootId === acceptDraft.rootId)
              .map(entry => <option value={entry.path} key={entry.id} />)}</datalist>
            <Button disabled={loadingDestination} onClick={() => { void prepareMerge() }}>
              {t(loadingDestination ? 'loadingDestination' : 'prepareMerge')}
            </Button>
          </div>
          {mergeError !== null && <p className={css.invalid} role="alert">{mergeError}</p>}
          {acceptDraft.suggestion !== null && <section className={css.suggestion} aria-label={t('mergeSuggestion')}>
            <div><strong>{t('mergeAction')}：</strong>{t(`mergeAction_${acceptDraft.suggestion.action}`)}</div>
            <div><strong>{t('targetSection')}：</strong>{acceptDraft.suggestion.targetSection || t('wholeFile')}</div>
            <p>{acceptDraft.suggestion.summary}</p>
            <small>{acceptDraft.suggestion.reason}</small>
          </section>}
          <label className={css.mergeEditor}>{t('mergeContent')}<textarea value={acceptDraft.content}
            onChange={(event) => { setAcceptDraft({ ...acceptDraft, content: event.currentTarget.value }) }} /></label>
          <footer><Button variant="primary" disabled={state.savingId !== null || acceptDraft.content.trim() === ''
            || acceptDraft.preparedFor !== `${acceptDraft.rootId}:${acceptDraft.path.trim()}`}
          onClick={() => { void acceptCandidate({
            id: selected.id, revision: selected.revision, destinationRootId: acceptDraft.rootId,
            destinationPath: acceptDraft.path.trim(), destinationRevision: acceptDraft.destinationRevision,
            destinationContent: acceptDraft.content,
          }).then(close) }}>{t('confirmAccept')}</Button></footer>
        </div>}
      </article></div>}
  </section>
}
