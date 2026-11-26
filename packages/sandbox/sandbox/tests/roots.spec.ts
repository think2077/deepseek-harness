/**
 * Tests for the writable-root derivation: the mode's meaning as a canonical
 * allow-list. Pinned here so the fs fence and the Seatbelt profile — both
 * deriving from `writableRoots` — cannot drift.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalPath, writableRoots, guardedPaths, GUARDED_HOME_DIRS, GUARDED_HOME_FILES, NO_GUARDS } from '@deepseek-ai/dsh-sandbox'

/** Every temp root created by this file, removed after each test. */
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('canonicalPath', () => {
  it('resolves symlinks (an existing path realpaths)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-roots-'))
    roots.push(dir)
    expect(canonicalPath(dir)).toBe(realpathSync.native(dir))
  })

  it('returns the spelling as-is when the path cannot be resolved (conservative — matches nothing until it exists)', () => {
    expect(canonicalPath('/does/not/exist/anywhere-xyz')).toBe('/does/not/exist/anywhere-xyz')
  })
})

describe('writableRoots', () => {
  it('read-only grants nothing', () => {
    expect(writableRoots({ mode: 'read-only', workspaceRoot: process.cwd() })).toEqual([])
  })

  it('workspace-write grants the workspace root plus the platform temp areas, canonical and deduplicated', () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-ws-'))
    roots.push(ws)
    const writable = writableRoots({ mode: 'workspace-write', workspaceRoot: ws })
    expect(writable).toContain(realpathSync.native(ws))
    expect(writable).toContain(canonicalPath('/tmp'))
    expect(writable).toContain(realpathSync.native(tmpdir()))
    // Deduplicated after canonicalization (/tmp and os.tmpdir() may coincide).
    expect(new Set(writable).size).toBe(writable.length)
  })
})

describe('guardedPaths', () => {
  it('names the cross-session state and the credentials, canonicalized under the home', () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-home-')))
    roots.push(home)
    const guards = guardedPaths(home)
    expect(guards.dirs).toEqual(GUARDED_HOME_DIRS.map(name => join(home, name)))
    expect(guards.files).toEqual(GUARDED_HOME_FILES.map(name => join(home, name)))
    // The workspace/attachment/skill children stay reachable: the guard
    // subtracts paths, it never whitelists the home.
    expect(guards.dirs).not.toContain(join(home, 'workspaces'))
    expect(guards.dirs).not.toContain(join(home, 'attachments'))
  })

  it('the empty guard set guards nothing (the explicit default for probes and tests)', () => {
    expect(NO_GUARDS.dirs).toEqual([])
    expect(NO_GUARDS.files).toEqual([])
  })
})
