/**
 * `SandboxedFileSystem`: the sandbox-enforcing implementation of the
 * `@deepseek-ai/dsh-fs` Service Definition. It extends `LocalFileSystem` so all
 * text-storage mechanics — resolve, stat, read/stream, list, the atomic
 * write and the read-match-write edit critical section — are the local
 * implementation's, verbatim; this package adds two fences: the per-call
 * POLICY fence on the two mutations, and the HOME GUARD on every read and
 * write.
 *
 * The home guard is mode-independent. A sandbox mode describes WRITE effects;
 * it says nothing about reading, so the paths that must never cross into a
 * session (other sessions' transcripts, the plugin composition, tool
 * storages, and the credential files — see `guardedPaths`) are refused on
 * every read (readText, streamText, readBytes, readByteRange, listDir, stat,
 * lstat) and every write, under every mode. Everything else stays readable:
 * the fence subtracts those paths, it does not whitelist the world.
 *
 * The fence is a policy check in TRUSTED code over a MODEL-CONTROLLED path,
 * NOT a kernel boundary — the operations are the seam's own (open, rename),
 * and only the target path is untrusted, so canonicalize-then-contain is the
 * complete answer to this surface. This is containment, not a security
 * boundary; kernel-grade isolation of untrusted CODE stays `ctx.shell`'s job
 * (`@deepseek-ai/dsh-bash-sandbox`). The residual
 * TOCTOU (an ancestor symlink swapped between the containment re-check and the
 * syscall) is narrowed by re-canonicalizing immediately before delegating and
 * is accepted for this threat model.
 *
 * Per-call policy: `read-only` denies every mutation; `workspace-write` allows
 * a mutation only when the target canonicalizes under the policy's workspace
 * root or a platform temp area from the shared `writableRoots` policy;
 * `danger-full-access` delegates unfenced. A denial throws the structured
 * `FS_SANDBOX_DENIED`.
 *
 * @module @deepseek-ai/dsh-fs-sandbox
 */

import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome } from '@deepseek-ai/dsh-fs'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { guardedPaths, writableRoots } from '@deepseek-ai/dsh-sandbox'
import type { GuardedPaths, SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { isPathUnder } from './containment.ts'

/**
 * Plugin config: the local backend's knobs verbatim (`cwd` resolution default
 * and `diffBasisMaxBytes` overwrite-presentation bound). The sandbox default
 * (mode + `workspace-write` fallback root) is NOT here — `ctx.sandboxPolicy`
 * resolves each calling session for every enforcing capability.
 */
export type Config = LocalConfig

/**
 * Sandbox-enforcing filesystem backend. Registers as `ctx.fs` (loading it
 * INSTEAD OF `dsh-fs-local`, together with a `ctx.sandboxPolicy`, is the whole
 * swap — the model-facing tools are untouched). Its configured default mode is
 * the capability fact exposed by {@link sandboxMode}; `dsh-tool-fs` resolves
 * each session's mode and cwd into a policy for every mutation, while an
 * approved escalation may stamp a strictly wider mode for one call.
 */
export class SandboxedFileSystem extends LocalFileSystem {
  static inject = ['sandboxPolicy']

  private readonly defaultMode: SandboxMode
  /**
   * The Harness-home paths this backend refuses in BOTH directions: they are
   * secrets and cross-session state, so they are fenced independently of the
   * per-call mode (a mode grants or narrows WRITES; it never re-grants these).
   */
  private readonly guards: GuardedPaths
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.defaultMode = ctx.sandboxPolicy.defaultMode
    this.guards = guardedPaths(resolveDshHome())
  }

  /** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
  override get sandboxMode(): SandboxMode {
    return this.defaultMode
  }

  /**
   * Fence the write by the per-call policy, then delegate to the inherited
   * atomic write. See {@link checkedTarget}.
   * @param target - the resolved target to write.
   * @param content - the full new file content.
   * @param expected - the write intent guarding the write; omit for unconditional.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the write outcome from the inherited backend.
   */
  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    return super.writeText(await this.checkedTarget(target, sandboxPolicy), content, expected, signal)
  }

  /**
   * Fence the edit by the per-call policy, then delegate to the inherited
   * atomic edit. See {@link checkedTarget}.
   * @param target - the resolved target to edit.
   * @param edit - the literal search/replace request.
   * @param expected - the version guard; omit for an unconditional edit.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the edit outcome from the inherited backend.
   */
  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    return super.editText(await this.checkedTarget(target, sandboxPolicy), edit, expected, signal)
  }

  /**
   * Fence a metadata read by the home guard, then delegate. See
   * {@link checkedRead}.
   * @param target - the resolved target to stat.
   * @param signal - cancellation signal.
   * @returns the target's metadata, or `undefined` when absent.
   */
  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return super.stat(await this.checkedRead(target), signal)
  }

  /**
   * Fence a no-follow metadata read by the home guard, then delegate. The
   * delegation uses the CHECKED canonical path, never the caller's spelling.
   * @param path - the path to lstat; relative paths resolve against `opts.cwd`.
   * @param opts - optional cwd override.
   * @param signal - cancellation signal.
   * @returns the path's metadata, or `undefined` when absent.
   */
  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const fresh = await this.resolve(path, opts)
    await this.assertNotGuarded(fresh, 'read')
    return super.lstat(this.processPath(fresh), undefined, signal)
  }

  /**
   * Fence a whole-text read by the home guard, then delegate. See
   * {@link checkedRead}.
   * @param target - the resolved target to read.
   * @param signal - cancellation signal.
   * @returns the file's text.
   */
  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return super.readText(await this.checkedRead(target), signal)
  }

  /**
   * Fence a streaming text read by the home guard, then delegate. See
   * {@link checkedRead}.
   * @param target - the resolved target to stream.
   * @param signal - cancellation signal.
   * @returns the chunk stream.
   */
  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return super.streamText(await this.checkedRead(target), signal)
  }

  /**
   * Fence a bounded byte read by the home guard, then delegate. See
   * {@link checkedRead}.
   * @param target - the resolved target to read.
   * @param signal - cancellation signal.
   * @param maxBytes - the size bound the caller accepts.
   * @returns the file's leading bytes.
   */
  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return super.readBytes(await this.checkedRead(target), signal, maxBytes)
  }

  /**
   * Fence a ranged byte read by the home guard, then delegate. See
   * {@link checkedRead}.
   * @param target - the resolved target to read.
   * @param range - the byte window to return.
   * @param signal - cancellation signal.
   * @returns the requested byte window.
   */
  override async readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array> {
    return super.readByteRange(await this.checkedRead(target), range, signal)
  }

  /**
   * Fence a directory listing by the home guard, then delegate. A guarded
   * directory cannot even be ENUMERATED, so its child names never reach the
   * model. See {@link checkedRead}.
   * @param target - the resolved directory to list.
   * @param signal - cancellation signal.
   * @returns the directory's entries.
   */
  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    return super.listDir(await this.checkedRead(target), signal)
  }

  /**
   * Enforce the LOCKED workspace-write fence against `target` and return the
   * EXACT target the mutation must use, so the checked identity is the mutated
   * one (no check-here-write-there TOCTOU). The requested mode is read only for
   * its workspace root and is never honoured as a widening: `read-only` does
   * not shut writes off and `danger-full-access` does not open them up — the
   * deployment is pinned to `workspace-write`. The target is re-canonicalized
   * NOW (`resolve` realpaths the deepest existing ancestor, reflecting a
   * concurrently swapped symlink), must be contained under a writable root, and
   * the mutation then delegates with THAT fresh target. Throws the structured
   * `FS_SANDBOX_DENIED` on refusal — the tool layer maps it to the
   * model-facing `[sandbox: …]` marker.
   */
  private async checkedTarget(target: FsTarget, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsTarget> {
    await this.assertNotGuarded(target, 'write')
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    // containment on the FRESH canonical path (catches a symlink ancestor
    // swapped since the tool resolved this target), and the mutation delegates
    // with THIS fresh target — never the stale one.
    const fresh = await this.resolve(target.displayPath)
    let contained = false
    for (const root of writableRoots({ ...policy, mode: 'workspace-write' })) {
      if (await isPathUnder(fresh.targetKey, root)) {
        contained = true
        break
      }
    }
    if (!contained) {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under workspace-write mode`, 'FS_SANDBOX_DENIED')
    }
    return fresh
  }

  /**
   * Fence a read against the HOME GUARD and return the EXACT target the read
   * must use. Reads are not mode-dependent — every mode permits reading — so
   * the only read fence is the fixed set of Harness-home paths
   * ({@link guardedPaths}: other sessions' transcripts, the plugin
   * composition, tool storages, and the credential files). Re-canonicalizing
   * here means a symlink into a guarded path is denied, not followed.
   * @param target - the caller's target.
   * @returns the fresh canonical target the read must use.
   */
  private async checkedRead(target: FsTarget): Promise<FsTarget> {
    const fresh = await this.resolve(target.displayPath)
    await this.assertNotGuarded(fresh, 'read')
    return fresh
  }

  /**
   * Refuse any path at or beneath a guarded Harness-home entry. Independent of
   * the sandbox mode: this fence subtracts secrets and cross-session state
   * from what even the widest mode would otherwise reach.
   * @param target - the canonical target under test.
   * @param verb - the operation named in the denial, for the model-facing message.
   */
  private async assertNotGuarded(target: FsTarget, verb: 'read' | 'write'): Promise<void> {
    for (const guard of [...this.guards.dirs, ...this.guards.files]) {
      if (await isPathUnder(target.targetKey, guard)) {
        throw new FsError(`cannot ${verb} "${target.displayPath}": harness home path is denied to sessions`, 'FS_SANDBOX_DENIED')
      }
    }
  }
}

export default SandboxedFileSystem
