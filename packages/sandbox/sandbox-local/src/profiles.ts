/**
 * Internal platform-profile builders for the local sandbox provider.
 *
 * @module @deepseek-ai/dsh-sandbox-local/profiles
 */

import { existsSync } from 'node:fs'

import { grantArgs as landlockGrantArgs } from '@deepseek-ai/node-addon-system/landlock-run'
import { NO_GUARDS, writableRoots } from '@deepseek-ai/dsh-sandbox'
import type { GuardedPaths, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'

/**
 * Build the bwrap profile arguments for one file-effect policy.
 *
 * The guarded Harness-home entries (secrets and cross-session state) are
 * HIDDEN rather than filter-denied: bwrap has no deny primitive, so a guarded
 * directory (and its contents) is replaced by an empty `--tmpfs`, and a guarded
 * file by `read-only /dev/null`. Both spellings make the path unreadable AND
 * unwritable for the confined command. Absent entries are skipped — mounting
 * onto a path that does not exist would make bwrap create it.
 * @param policy - file-effect policy to express as bwrap mounts.
 * @param guards - the Harness-home entries to hide; omit for none.
 * @returns profile arguments before the trailing separator and command argv.
 */
export function bwrapProfileArgs(policy: SandboxPolicy, guards: GuardedPaths = NO_GUARDS): string[] {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent']
  if (policy.mode === 'workspace-write') {
    args.push('--tmpfs', '/tmp')
    args.push('--bind', policy.workspaceRoot, policy.workspaceRoot)
    // Deployment-designated extra roots (the preset directory) bind read-write
    // like the workspace; a missing root is skipped — bwrap would create it.
    for (const root of policy.extraWritableRoots ?? []) {
      if (existsSync(root)) args.push('--bind', root, root)
    }
  }
  for (const dir of guards.dirs) {
    if (existsSync(dir)) args.push('--tmpfs', dir)
  }
  for (const file of guards.files) {
    if (existsSync(file)) args.push('--ro-bind', '/dev/null', file)
  }
  return args
}

/**
 * Build the Landlock launcher grants for one file-effect policy.
 *
 * Landlock is an allow-list with no subtraction: a grant on `/` cannot be
 * narrowed for one subdirectory, so the guarded Harness-home entries cannot be
 * expressed here. They remain enforced on Linux by the in-process filesystem
 * fence (`@deepseek-ai/dsh-fs-sandbox`) for the fs tools, and by bwrap — the
 * preferred Linux rung — for confined commands.
 * @param policy - file-effect policy to express as Landlock allow-list grants.
 * @returns launcher grant arguments before the trailing separator and command argv.
 */
export function landlockProfileArgs(policy: SandboxPolicy): string[] {
  const readWrite = ['/dev/null']
  if (policy.mode === 'workspace-write') {
    readWrite.push('/tmp', policy.workspaceRoot, ...policy.extraWritableRoots ?? [])
  }
  return landlockGrantArgs({ readOnly: ['/'], readWrite })
}

/** Quote one path as an SBPL string literal. */
function sbplString(path: string): string {
  return `"${path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`
}

/**
 * Build the sandbox-exec arguments and SBPL profile for one policy. The
 * writable roots come from the shared {@link writableRoots} helper (canonical,
 * deduplicated) so the Seatbelt grant and the in-process fs fence
 * (`@deepseek-ai/dsh-fs-sandbox`) can never drift apart. The guarded
 * Harness-home entries are appended LAST as deny filters for both read and
 * write — SBPL resolves conflicts by last match, so these win over the
 * `(allow default)` and over any write grant they might sit inside.
 * @param policy - file-effect policy to express as an SBPL profile.
 * @param guards - the Harness-home entries to deny; omit for none.
 * @returns sandbox-exec arguments before the trailing separator and command argv.
 */
export function seatbeltProfileArgs(policy: SandboxPolicy, guards: GuardedPaths = NO_GUARDS): string[] {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`]
  const roots = writableRoots(policy)
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
  const denied = [
    ...guards.dirs.map(dir => `(subpath ${sbplString(dir)})`),
    ...guards.files.map(file => `(literal ${sbplString(file)})`),
  ]
  if (denied.length > 0) {
    const filters = denied.join(' ')
    forms.push(`(deny file-read* ${filters})`, `(deny file-write* ${filters})`)
  }
  return ['-p', forms.join(' ')]
}
