/**
 * Tests for the sandbox-policy home: the deployment default (mode +
 * workspaceRoot) the service exposes, and the per-session `sandbox/mode`
 * override kit (fold + write path) every enforcing capability reads.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import SandboxPolicyService, { SANDBOX_MODES, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt, { renderContextSnapshot, renderPrompt } from '@deepseek-ai/dsh-system-prompt'

async function mounted(config: { mode?: 'read-only' | 'workspace-write' | 'danger-full-access'; workspaceRoot?: string } = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, config)
  return ctx
}

function session(id: string, cwd?: string): Session {
  const sessionId = SessionId(id)
  return Session.create(sessionId, undefined, {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt: 0,
    isSeeded: false,
    ...cwd === undefined ? {} : { cwd },
  })
}

function agentFor(activeSession: Session): Agent {
  return { session: activeSession } as unknown as Agent
}

async function policyContext(ctx: Context, activeSession: Session): Promise<string | undefined> {
  return (await ctx.systemPrompt.assemble({ agent: agentFor(activeSession) }))
    .contexts.find(context => context.name === 'sandbox:policy')?.text
}

describe('SandboxPolicyService', () => {
  it('locks the mode to workspace-write under the process cwd', async () => {
    const ctx = await mounted()
    expect(ctx.sandboxPolicy.defaultMode).toBe('workspace-write')
    expect(ctx.sandboxPolicy.workspaceRoot).toBe(resolve(process.cwd()))
  })

  it('preserves an absolute execution-world root without host path normalization', async () => {
    const ctx = await mounted({ mode: 'workspace-write', workspaceRoot: '/ws/../ws/./sub' })
    expect(ctx.sandboxPolicy.defaultMode).toBe('workspace-write')
    expect(ctx.sandboxPolicy.workspaceRoot).toBe('/ws/../ws/./sub')
  })

  it('rejects a relative deployment workspace root at load', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SessionProjectionRegistry)
      await expect(ctx.plugin(SandboxPolicyService, { workspaceRoot: 'relative/workspace' }))
        .rejects.toThrow('sandbox-policy: workspace root must be an absolute execution-world path')
      expect(ctx.get('sandboxPolicy')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('resolves the deployment policy for an agentless call', async () => {
    const ctx = await mounted({ mode: 'workspace-write', workspaceRoot: '/fallback' })
    expect(ctx.sandboxPolicy.resolve()).toEqual({
      mode: 'workspace-write',
      workspaceRoot: '/fallback',
      extraWritableRoots: [dshHomePath('.agent-presets')],
    })
  })

  it('keeps every session on the locked mode and cwd without changing the fallback', async () => {
    const ctx = await mounted({ workspaceRoot: '/fallback' })
    const first = session('sess-first', '/projects/first')
    const second = session('sess-second', '/projects/second')
    setSandboxMode(second, 'read-only')

    expect(ctx.sandboxPolicy.resolve({ session: first })).toEqual({
      mode: 'workspace-write',
      workspaceRoot: '/projects/first',
      extraWritableRoots: [dshHomePath('.agent-presets')],
      sessionId: 'sess-first',
    })
    // 覆盖事件仍会写入日志，但锁定模式下不生效。
    expect(ctx.sandboxPolicy.resolve({ session: second })).toEqual({
      mode: 'workspace-write',
      workspaceRoot: '/projects/second',
      extraWritableRoots: [dshHomePath('.agent-presets')],
      sessionId: 'sess-second',
    })
    expect(ctx.sandboxPolicy.overrideOf(first)).toBeUndefined()
    expect(ctx.sandboxPolicy.overrideOf(second)).toBeUndefined()
    expect(ctx.sandboxPolicy.resolve()).toEqual({
      mode: 'workspace-write',
      workspaceRoot: '/fallback',
      extraWritableRoots: [dshHomePath('.agent-presets')],
    })
  })

  it.skipIf(process.platform === 'win32')('preserves symlink-sensitive session cwd for its enforcing provider', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-policy-cwd-'))
    try {
      const lexical = join(root, 'lexical')
      const physical = join(root, 'physical')
      const child = join(physical, 'child')
      mkdirSync(lexical)
      mkdirSync(child, { recursive: true })
      const link = join(lexical, 'link')
      symlinkSync(child, link, 'dir')
      const cwd = `${link}${sep}..`
      const ctx = await mounted({ mode: 'workspace-write', workspaceRoot: '/fallback' })

      expect(ctx.sandboxPolicy.resolve({ session: session('sess-symlink-parent', cwd) })).toEqual({
        mode: 'workspace-write',
        workspaceRoot: cwd,
        extraWritableRoots: [dshHomePath('.agent-presets')],
        sessionId: 'sess-symlink-parent',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores an approved mode while retaining its root', async () => {
    const ctx = await mounted({ workspaceRoot: '/fallback' })
    const active = session('sess-approved', '/projects/approved')
    setSandboxMode(active, 'read-only')
    expect(ctx.sandboxPolicy.resolve({ session: active, mode: 'danger-full-access' })).toEqual({
      mode: 'workspace-write',
      workspaceRoot: '/projects/approved',
      extraWritableRoots: [dshHomePath('.agent-presets')],
      sessionId: 'sess-approved',
    })
  })

  it('uses the configured root when a session has no cwd', async () => {
    const ctx = await mounted({ workspaceRoot: '/fallback' })
    expect(ctx.sandboxPolicy.resolve({ session: session('sess-no-cwd') }).workspaceRoot).toBe('/fallback')
  })

  it('rejects a mode outside the closed vocabulary at load', async () => {
    const ctx = new Context()
    // Config validation runs when the fiber activates, and the policy seam
    // requires the projection registry (mandatory injection) to activate.
    await ctx.plugin(SessionProjectionRegistry)
    // schemastery rejects the union violation when the plugin loads.
    await expect(ctx.plugin(SandboxPolicyService, { mode: 'yolo' as never })).rejects.toThrow()
  })

  it('disposes the service and context contribution from a child fiber (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(SessionProjectionRegistry)
    const fiber = await ctx.plugin(SandboxPolicyService, {})
    expect(ctx.sandboxPolicy).toBeDefined()
    expect(await policyContext(ctx, session('sess-hmr'))).toContain('workspace-write')
    await fiber.dispose()
    expect(ctx.get('sandboxPolicy')).toBeUndefined()
    expect((await ctx.systemPrompt.assemble()).contexts.find(context => context.name === 'sandbox:policy')).toBeUndefined()
  })
})

describe('sandbox:policy request context', () => {
  async function promptMounted(config: { mode?: 'read-only' | 'workspace-write' | 'danger-full-access'; workspaceRoot?: string } = {}): Promise<Context> {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, config)
    return ctx
  }

  it('renders the locked workspace-write policy whatever the configured mode', async () => {
    for (const mode of ['read-only', 'workspace-write', 'danger-full-access'] as const) {
      const ctx = await promptMounted({ mode, workspaceRoot: '/fallback' })
      const workspaceRoot = '/projects/../projects/current'
      expect(await policyContext(ctx, session(`sess-${mode}`, workspaceRoot))).toBe(
        `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(workspaceRoot)}. Some platform temporary areas may also be writable.`,
      )
    }
  })

  it('keeps the complete rendered prompt byte-stable across TMPDIR changes', async () => {
    const ctx = await promptMounted({ mode: 'workspace-write' })
    const active = session('sess-tmpdir-stability', '/projects/current')
    const previous = process.env.TMPDIR
    try {
      process.env.TMPDIR = '/tmp/first-host-temp'
      const firstAssembly = await ctx.systemPrompt.assemble({ agent: agentFor(active) })
      const firstPrompt = renderPrompt(firstAssembly)
      const firstContext = renderContextSnapshot(firstAssembly)
      process.env.TMPDIR = '/tmp/second-host-temp'
      const secondAssembly = await ctx.systemPrompt.assemble({ agent: agentFor(active) })
      expect(renderPrompt(secondAssembly)).toBe(firstPrompt)
      expect(renderContextSnapshot(secondAssembly)).toBe(firstContext)
      expect(firstContext).not.toContain('host-temp')
    } finally {
      if (previous === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previous
    }
  })

  it('stays on the locked mode across durable switches and is byte-stable otherwise', async () => {
    const ctx = await promptMounted()
    const active = session('sess-switch', '/projects/current')
    const locked = `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify('/projects/current')}. Some platform temporary areas may also be writable.`
    const first = await policyContext(ctx, active)
    expect(first).toBe(locked)
    expect(await policyContext(ctx, active)).toBe(first)

    setSandboxMode(active, 'danger-full-access')
    expect(await policyContext(ctx, active)).toBe(first)

    setSandboxMode(active, 'workspace-write')
    expect(await policyContext(ctx, active)).toBe(first)
  })

  it('ignores resumed overrides and omits diagnostics without an agent', async () => {
    const active = session('sess-resume', '/projects/current')
    setSandboxMode(active, 'read-only')
    const resumed = Session.create(active.id, active.snapshotEvents(), active.header)
    const ctx = await promptMounted({ mode: 'workspace-write' })

    expect(await policyContext(ctx, resumed)).toContain('workspace-write')
    expect((await ctx.systemPrompt.assemble()).contexts.find(context => context.name === 'sandbox:policy')?.text).toBe('')
  })
})

describe('the sandbox/mode session kit', () => {
  it('SANDBOX_MODES lists every mode for advertisement and validation', () => {
    expect(SANDBOX_MODES).toEqual(['read-only', 'workspace-write', 'danger-full-access'])
  })

  it('the sandboxMode projection stays null under the locked mode', async () => {
    const ctx = await mounted()
    const active = Session.create(SessionId('sess-fold'))
    expect(ctx.sessionProjections.stateOf(active, 'sandboxMode')).toBeNull()
    setSandboxMode(active, 'workspace-write')
    setSandboxMode(active, 'read-only')
    expect(ctx.sessionProjections.stateOf(active, 'sandboxMode')).toBeNull()
  })

  it('setSandboxMode appends exactly one sandbox/mode event per switch', () => {
    const session = Session.create(SessionId('sess-write'))
    setSandboxMode(session, 'danger-full-access')
    const modeEvents = session.snapshotEvents().filter(e => e.type === 'sandbox/mode')
    expect(modeEvents).toHaveLength(1)
    expect(modeEvents[0]?.data).toEqual({ mode: 'danger-full-access' })
  })
})
