/**
 * The writable-root derivation shared by every enforcement dialect that
 * expresses a mode as a canonical allow-list: `workspace-write` means "the
 * workspace root plus the platform temp areas", and this module is that
 * meaning's one home. The Seatbelt profile
 * (`@deepseek-ai/dsh-sandbox-local`) and the in-process filesystem fence
 * (`@deepseek-ai/dsh-fs-sandbox`) both derive their allow-list here, so "the
 * write tool cannot write /tmp but bash can" asymmetries cannot arise between
 * them. The bwrap and Landlock dialects keep their own grant spellings (an
 * ephemeral `/tmp` mount, launcher-owned flags) — the honest per-runner
 * differences recorded in the sandbox RFC — with parity pinned by test.
 *
 * @module dsh-sandbox/roots
 */

import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SandboxExecutionPolicy } from './index.ts'

/**
 * Resolve a granted root to the path the enforcement layer actually compares:
 * canonical (symlinks resolved), because both Seatbelt filters and the fs
 * fence's containment check match resolved paths — `/tmp` IS `/private/tmp`
 * on darwin, and an as-spelled grant would match nothing.
 * @param path - the root as configured or platform-reported.
 * @returns the canonical path, or the spelling as-is when resolution fails
 *   (a missing root matches nothing until it exists — the conservative
 *   outcome; inventing a fallback would grant a path the caller never named).
 */
export function canonicalPath(path: string): string {
  try {
    // Node's JavaScript realpath implementation lexically collapses `..`
    // before resolving a preceding symlink on some platforms. The native
    // implementation follows the filesystem's component-by-component lookup,
    // matching chdir/spawn and the enforcement layers this identity feeds.
    return realpathSync.native(path)
  } catch {
    // realpathSync.native failed: the path (or a prefix) is missing or unreadable.
    return path
  }
}

/**
 * The roots one confined execution may WRITE under — the mode's meaning as a
 * canonical, deduplicated allow-list. `read-only` allows nothing;
 * `workspace-write` allows the policy's workspace root, the host `/tmp`, and
 * the per-user platform temp dir (`os.tmpdir()` — the real temp area for
 * mkstemp-family tools; omitting it would deny what the mode promises).
 * @param policy - the file-effect policy to derive the allow-list from.
 * @returns the canonical writable roots; empty exactly under `read-only`.
 */
export function writableRoots(policy: SandboxExecutionPolicy): string[] {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}

/**
 * The host-data paths under the Harness home that a session may neither READ
 * nor WRITE, in either direction, under every mode. They are the deployment's
 * secrets and cross-session state: `sessions` (every other conversation's
 * transcript), `.agent-presets` (the configured digital employees),
 * `storages` (tool state), plus the credential files at the home's root.
 * Everything else under the home — `workspaces`, `projects`, `attachments`,
 * `skills`, `cache` — stays reachable, so the fence subtracts exactly the
 * paths that must never cross into a session.
 *
 * One definition feeds all three enforcement dialects: the in-process filesystem
 * fence (`@deepseek-ai/dsh-fs-sandbox`, which covers the `read`/`list` tools),
 * the Seatbelt profile (deny filters), and the bwrap profile (mount hiding),
 * so "read tool cannot see it but bash can" asymmetries cannot arise.
 */
export interface GuardedPaths {
  /** Home child directories denied for both reading and writing. */
  dirs: readonly string[]
  /** Home child files denied for both reading and writing. */
  files: readonly string[]
}

/** The Harness-home child directories denied to sessions (canonicalized by {@link guardedPaths}). */
export const GUARDED_HOME_DIRS = ['sessions', '.agent-presets', 'storages'] as const

/** The Harness-home child files denied to sessions (canonicalized by {@link guardedPaths}). */
export const GUARDED_HOME_FILES = ['settings.yaml', '.credentials.yaml', 'feishu.env'] as const

/** An empty guard set — the honest default for callers that were given no home (tests, probes). */
export const NO_GUARDS: GuardedPaths = { dirs: [], files: [] }

/**
 * Derive the guarded paths from an explicit Harness home. Canonical, like
 * {@link writableRoots}: Seatbelt filters and the fs fence both compare
 * resolved paths.
 * @param dshHome - absolute Harness home (see `resolveDshHome`).
 * @returns the guarded directories and files, canonicalized.
 */
export function guardedPaths(dshHome: string): GuardedPaths {
  return {
    dirs: GUARDED_HOME_DIRS.map(name => canonicalPath(join(dshHome, name))),
    files: GUARDED_HOME_FILES.map(name => canonicalPath(join(dshHome, name))),
  }
}
