/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel (figma 501:29947, 1080x700) with the section nav rail. The shell is
 * a pure composition face — slot-owned text (trigger label, panel title,
 * close label, sections) arrives from registrants through slots; accessible
 * names resolve from localized content (trigger: shell locale; dialog:
 * aria-labelledby the title node; close: visually-hidden slot text). Modal
 * open state and the active section id are component-local viewing state;
 * the onboarding coordinator mounts exactly one ordered registrant while the
 * sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
 * to the step, so a mounted-but-deciding step paints nothing here.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import clsx from 'clsx'
import {
  ConnectionIndicator,
  IconAgentPresetOutline16, IconArchiveOutline20, IconCloseOutline16, IconDataOutline16,
  IconLogoutOutline16, IconPersonalizationOutline16, IconSettingsOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionIndicatorState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import css from './SettingsRoot.module.css'

const RECOVERY_CONFIRMATION_MS = 2_000

/** Minimum visible time for the connecting pill; shorter attempts read as flicker. */
const CONNECTING_MIN_VISIBLE_MS = 800

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'models') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  // 20-native glyph in the rail's 16px icon slot, as on the Session row menu.
  if (id === 'archived-sessions') return <IconArchiveOutline20 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * The modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Entering the dialog focuses the close button; the root restores its trigger on close.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <nav className={css.nav}>
          <div className={css.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={css.navList}>
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className={clsx(css.navCell, row.id === active && css.active)}
                aria-current={row.id === active ? 'true' : undefined}
                onClick={() => { onSelect(row.id) }}
              >
                {navIcon(row.id)}
                <span className={css.navLabel}>{row.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className={css.content}>
          <div className={css.header}>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
            <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
              <IconCloseOutline16 size={14} />
              <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
            </button>
          </div>
          <div className={css.options}>
            {active !== undefined && renderSlot('settings.section', { close: onClose }, { only: active })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Identity the multi-user host advertises for this browser session, if any. */
interface SignedInAccount { readonly name: string }

/**
 * Read the personal-workspace identity the host injects on the index page.
 * Single-user deployments carry no flag, so the row stays absent there.
 * @returns the employee name, or undefined outside Feishu (personal) mode.
 */
function signedInAccount(): SignedInAccount | undefined {
  if (Reflect.get(globalThis, '__DSH_PERSONAL_WORKSPACE__') !== true) return undefined
  const name: unknown = Reflect.get(globalThis, '__DSH_WEB_USER_NAME__')
  return { name: typeof name === 'string' ? name.trim() : '' }
}

/** Props of the sidebar-foot account row. */
type AccountRowProps = {
  account: SignedInAccount
  wide: boolean
  onOpenSettings: () => void
  /** Focus target restored once the settings dialog closes. */
  triggerRef: RefObject<HTMLButtonElement>
  t: SettingsRootComponentProps['t']
  /** Connection-recovery control rendered beside the name. */
  children: ReactNode
}

/**
 * Sidebar-foot identity row: the avatar + employee name, with Settings and
 * Sign-out standing as two icon buttons at its right edge. Settings raises
 * the very panel the gear below opens; Sign-out posts the host's logout
 * route. The collapsed rail holds one column — the avatar opens Settings
 * (its gear would repeat the avatar's own action), the sign-out glyph sits
 * underneath.
 */
function AccountRow({ account, wide, onOpenSettings, triggerRef, t, children }: AccountRowProps) {
  const name = account.name === '' ? t('account.anonymous') : account.name
  const initial = Array.from(name)[0] ?? '·'
  return (
    <div className={clsx(css.accountRow, !wide && css.accountRailRow)}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(css.trigger, !wide && css.rail)}
        aria-haspopup="dialog"
        aria-label={name}
        onClick={onOpenSettings}
      >
        <span className={css.accountAvatar} aria-hidden="true">{initial}</span>
        {wide && <span className={css.accountName}>{name}</span>}
      </button>
      {children}
      <div className={css.accountActions}>
        {/* The rail's avatar already opens Settings, so its gear would be a
            second control for one action; only the wide row carries it. */}
        {wide && (
          <button
            type="button"
            className={css.accountAction}
            aria-label={t('account.settings')}
            title={t('account.settings')}
            onClick={onOpenSettings}
          >
            <IconSettingsOutline16 size={16} />
          </button>
        )}
        <form method="post" action="/auth/logout" className={css.accountActionForm}>
          <button
            type="submit"
            className={css.accountAction}
            aria-label={t('account.signOut')}
            title={t('account.signOut')}
          >
            <IconLogoutOutline16 size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props: SettingsRootComponentProps) {
  const {
    wide, reconnect, useConnectionState, useSections, useOnboardingSteps, useSessions, renderSlot, t,
  } = props
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const [showRecovery, setShowRecovery] = useState(false)
  const [holdConnecting, setHoldConnecting] = useState(false)
  const connectingShownAt = useRef<number | undefined>(undefined)
  // Ref shape matters: the object is handed to the identity row as well.
  const triggerButton = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(open)
  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
  }, [])
  // Restore after the close commit, when the dialog can no longer own focus.
  useEffect(() => {
    if (wasOpen.current && !open) triggerButton.current?.focus()
    wasOpen.current = open
  }, [open])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])

  // The ledger tick keeps the nav rows fresh: registrants re-register with
  // freshly localized text on locale change, and the trigger/header/close
  // seats re-render through their own outlets' subscriptions.
  const rows = useSections(s => s)
  const connectionState = useConnectionState(state => state)
  const previousConnectionState = useRef(connectionState)
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  useLayoutEffect(() => {
    const previous = previousConnectionState.current
    previousConnectionState.current = connectionState
    if (connectionState !== 'connected') {
      setShowRecovery(false)
      return
    }
    if (previous !== 'disconnected' && previous !== 'connecting') return
    setShowRecovery(true)
  }, [connectionState])

  // The confirmation window starts when the recovered pill becomes visible,
  // which the connecting minimum-visible hold can delay past the transition.
  useLayoutEffect(() => {
    if (!showRecovery || holdConnecting) return
    const timeout = window.setTimeout(() => { setShowRecovery(false) }, RECOVERY_CONFIRMATION_MS)
    return () => { window.clearTimeout(timeout) }
  }, [showRecovery, holdConnecting])

  useLayoutEffect(() => {
    if (connectionState === 'connecting') {
      connectingShownAt.current = Date.now()
      return
    }
    const shownAt = connectingShownAt.current
    if (shownAt === undefined) return
    connectingShownAt.current = undefined
    const remaining = CONNECTING_MIN_VISIBLE_MS - (Date.now() - shownAt)
    if (remaining <= 0) return
    setHoldConnecting(true)
    const timeout = window.setTimeout(() => { setHoldConnecting(false) }, remaining)
    return () => {
      window.clearTimeout(timeout)
      setHoldConnecting(false)
    }
  }, [connectionState])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  let connectionIndicator: ConnectionIndicatorState | undefined
  if (connectionState === 'connecting' || holdConnecting) {
    connectionIndicator = 'connecting'
  } else if (connectionState === 'disconnected') {
    connectionIndicator = 'disconnected'
  } else if (showRecovery) {
    connectionIndicator = 'recovered'
  }

  const account = signedInAccount()
  const indicator = (
    <ConnectionIndicator
      state={wide ? connectionIndicator : undefined}
      disconnectedLabel={t('connection.error')}
      connectingLabel={t('connection.connecting')}
      recoveredLabel={t('connection.connected')}
      reconnectActionLabel={t('connection.reconnect')}
      restartActionLabel={t('connection.restart')}
      onReconnect={reconnect}
    />
  )

  return (
    <>
      {/* Personal deployments seat the identity row in the foot with Settings
          and Sign-out as its own trailing icons; single-user deployments keep
          the standalone gear seat below. */}
      {account !== undefined ? (
        <AccountRow
          account={account}
          wide={wide}
          onOpenSettings={() => { setOpen(true) }}
          triggerRef={triggerButton}
          t={t}
        >
          {indicator}
        </AccountRow>
      ) : (
        <div className={clsx(css.triggerRow, !wide && css.railRow)}>
          <button
            ref={triggerButton}
            type="button"
            className={clsx(css.trigger, !wide && css.rail)}
            aria-label={t('trigger')}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => { setOpen(true) }}
          >
            {renderSlot('settings.trigger', { wide })}
          </button>
          {indicator}
        </div>
      )}
      {open && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
        />
      )}
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}
