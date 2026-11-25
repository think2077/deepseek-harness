/**
 * Structured composition reads for plugin-listing surfaces: the plugin rows
 * each preset names, with each row's effective enablement. A preset with a
 * live standing mount answers from that mount's Loader entries — evaluated
 * `disabled`, real root-fiber states; a preset no session has composed since
 * boot answers from its composition file, with `!!js` disabled expressions
 * evaluated through the caller-supplied Loader evaluator so the file answer
 * matches the decision a mount on this host would make. A row whose
 * expression the evaluator refuses stays `'conditional'`.
 * @module @deepseek-ai/dsh-agent-presets/composition-inventory
 */

import { readFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import { load } from 'js-yaml'
import type { FiberState } from '@deepseek-ai/cordis'
import { isJsExpr, type EntryTree } from '@deepseek-ai/cordis-plugin-loader'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { entryListProblem } from './discovery.ts'
import type { PresetTrust } from './preset.ts'

/**
 * Effective enablement of one composition row: a literal or evaluated
 * boolean, or `'conditional'` when a `!!js` disabled expression could not be
 * evaluated outside a mount.
 */
export type CompositionRowEnablement = boolean | 'conditional'

/**
 * Evaluate one `!!js` disabled expression the way the Loader would at a mount
 * decision. Throwing refuses the answer: the row is reported `'conditional'`
 * rather than guessed.
 */
export type DisabledExpressionEvaluator = (expression: string) => unknown

/** One plugin row a preset composition names. */
export interface AgentPresetCompositionRow {
  /**
   * The Loader-tree entry id when read from a live mount, else the id the
   * composition file declares; null when the file row declares none.
   */
  readonly entryId: string | null
  /** Module specifier the row names. */
  readonly moduleName: string
  /** Effective enablement, including disabled ancestor groups. */
  readonly enabled: CompositionRowEnablement
  /** The row's own `!!js` disabled expression, when it carries one. */
  readonly condition?: string
  /** Root-fiber state, present only when read from a live mount. */
  readonly fiberState?: FiberState
}

/** The persona prose a preset publishes, for a human-readable summary. */
export interface AgentPresetPersona {
  /** Persona prefix: the role definition and working rules this preset states. */
  readonly prefix: string
}

/** One skill bundled with the preset, summarized from its `SKILL.md` frontmatter. */
export interface AgentPresetSkillSummary {
  /** Skill name from the frontmatter `name` field. */
  readonly name: string
  /** Skill description from the frontmatter `description` field. */
  readonly description: string
}

/** One preset's roster identity beside its composition rows. */
export interface AgentPresetComposition {
  /** Stable preset id. */
  readonly id: string
  /** Whether the deployment ships the preset or the user owns it. */
  readonly trust: PresetTrust
  /** Display name the preset published. */
  readonly name?: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Why this preset's rows cannot be read; absent when {@link rows} answers. */
  readonly broken?: string
  /** Plugin rows in composition order; empty when the preset is broken. */
  readonly rows: readonly AgentPresetCompositionRow[]
  /** Human-readable persona extracted from the preset's persona row; absent when none declares one. */
  readonly persona?: AgentPresetPersona
  /** Skills bundled in the preset directory, summarized for display; empty when it ships none. */
  readonly skills: readonly AgentPresetSkillSummary[]
}

/**
 * One `disabled` node's contribution to effective enablement, mirroring the
 * Loader's own reading: a `!!js` expression is asked of the evaluator — a
 * refusal (throw) leaves the decision to a mount — and anything else disables
 * exactly when `Boolean(value)` does.
 * @param value - the raw `disabled` node of one composition row.
 * @param evaluateExpression - the Loader-context evaluator for `!!js` nodes.
 * @returns true (disabled), false (enabled), or `'conditional'`.
 */
function disabledContribution(
  value: unknown,
  evaluateExpression: DisabledExpressionEvaluator,
): boolean | 'conditional' {
  if (isJsExpr(value)) {
    try {
      return Boolean(evaluateExpression(value.__jsExpr))
    } catch {
      // The evaluator refused (a malformed or context-dependent expression);
      // only a real mount decision can answer, so the row stays conditional.
      return 'conditional'
    }
  }
  return Boolean(value)
}

/**
 * Combine an ancestor group's disabled state with a row's own, the way the
 * Loader walks owning groups: any literal true disables, otherwise any
 * expression leaves the decision to a mount.
 * @param outer - the combined ancestor contribution.
 * @param own - this row's contribution.
 * @returns the row's effective disabled state.
 */
function combineDisabled(
  outer: boolean | 'conditional',
  own: boolean | 'conditional',
): boolean | 'conditional' {
  if (outer === true || own === true) return true
  if (outer === 'conditional' || own === 'conditional') return 'conditional'
  return false
}

/** A parsed composition row after {@link entryListProblem} accepted the list. */
interface RawRow {
  readonly id?: unknown
  readonly name: string
  readonly group?: unknown
  readonly config?: unknown
  readonly disabled?: unknown
}

/** Loader module that contributes a preset's persona section. */
const PERSONA_MODULE = '@deepseek-ai/dsh-persona'

/** Directory holding a preset's bundled skills, beside its composition file. */
const PRESET_SKILLS_DIR = 'skills'

/** Skill bundle file a directory skill carries at its root. */
const SKILL_FILE = 'SKILL.md'

/**
 * Read the persona prefix out of a parsed row list, recursing through groups.
 * Only the prefix is surfaced: the suffix holds runtime context variables the
 * host fills in, so it reads as a template rather than role prose off the file.
 * @param rows - the parsed composition document, shape-checked by the caller.
 * @returns the trimmed persona prefix, or undefined when no row declares one.
 */
function findPersonaPrefix(rows: readonly unknown[]): string | undefined {
  for (const value of rows) {
    const row = value as RawRow
    if (row.group === true) {
      const nested = findPersonaPrefix(asRowList(row.config))
      if (nested !== undefined) return nested
      continue
    }
    if (row.name !== PERSONA_MODULE) continue
    const config = row.config as Record<string, unknown> | undefined
    const prefix = typeof config?.prefix === 'string' ? config.prefix.trim() : ''
    if (prefix !== '') return prefix
  }
  return undefined
}

/** Narrow an unknown group config to a row list, tolerating a malformed group. */
function asRowList(config: unknown): readonly unknown[] {
  return Array.isArray(config) ? config : []
}

/** One non-empty trimmed string field from parsed frontmatter. */
function frontmatterString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Parse the YAML frontmatter at the top of a Markdown skill file.
 * Mirrors the skill-filesystem provider's own shape: a `---` fenced block whose
 * body parses to a mapping. Returns undefined when the file carries no valid block.
 * @param raw - the skill file's full text.
 * @returns the frontmatter mapping, or undefined.
 */
function parseMarkdownFrontmatter(raw: string): Record<string, unknown> | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const closing = findClosingFrontmatter(raw, firstLineEnd + 1)
  if (closing === undefined) return undefined
  let parsed: unknown
  try {
    parsed = load(raw.slice(firstLineEnd + 1, closing))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

/** Locate the `---` line closing the frontmatter, returning its slice start. */
function findClosingFrontmatter(raw: string, start: number): number | undefined {
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') return lineStart
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/**
 * Read one skill file's frontmatter into a summary, or undefined when the file
 * is missing, unparsable, or lacks a required `name`/`description`.
 * @param path - absolute path of the skill Markdown file.
 * @returns the summarized skill, or undefined to skip this entry.
 */
async function readSkillSummary(path: string): Promise<AgentPresetSkillSummary | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const data = parseMarkdownFrontmatter(raw)
  if (data === undefined) return undefined
  const name = frontmatterString(data, 'name')
  const description = frontmatterString(data, 'description')
  if (name === undefined || description === undefined) return undefined
  return { name, description }
}

/**
 * List a preset's bundled skills from its `skills/` directory. Directory
 * bundles carry a `SKILL.md`; a flat `*.md` file is accepted too, matching the
 * filesystem skill provider. A missing or unreadable directory answers an
 * empty list rather than failing the whole profile read.
 * @param presetDir - the preset directory holding the composition file.
 * @returns summarized skills in stable directory order.
 */
async function readPresetSkills(presetDir: string): Promise<AgentPresetSkillSummary[]> {
  const root = join(presetDir, PRESET_SKILLS_DIR)
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: AgentPresetSkillSummary[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const locator = entry.isDirectory()
      ? join(root, entry.name, SKILL_FILE)
      : entry.isFile() && entry.name.endsWith('.md')
        ? join(root, entry.name)
        : undefined
    if (locator === undefined) continue
    const summary = await readSkillSummary(locator)
    if (summary !== undefined) skills.push(summary)
  }
  return skills
}

/**
 * Best-effort human-readable profile for one preset: its persona prose and
 * bundled skills. Unlike {@link fileComposition} this never reports broken —
 * a profile read failing degrades to an empty persona/skills rather than
 * failing the inventory, because display metadata is not a mount capability.
 * @param compositionPath - absolute path of the preset's composition file.
 * @returns the resolved persona (when declared) and bundled skills.
 */
export async function readPresetProfile(
  compositionPath: string,
): Promise<{ persona?: AgentPresetPersona; skills: readonly AgentPresetSkillSummary[] }> {
  let rows: unknown
  try {
    rows = load(await readFile(compositionPath, 'utf8'), { schema: entryListSchema })
  } catch {
    return { skills: [] }
  }
  const skills = await readPresetSkills(dirname(compositionPath))
  if (!Array.isArray(rows)) return { skills }
  const prefix = findPersonaPrefix(rows)
  return {
    ...prefix === undefined ? {} : { persona: { prefix } },
    skills,
  }
}

/**
 * Flatten one parsed row list into plugin rows. Group rows are structural —
 * the Loader reports a group entry as always enabled and lets children
 * inherit its `disabled` — so only their children are emitted.
 * @param rows - the parsed rows, shape-checked by the caller.
 * @param outerDisabled - the combined ancestor-group disabled state.
 * @param evaluateExpression - the Loader-context evaluator for `!!js` nodes.
 * @param found - the accumulator receiving flattened rows.
 */
function flattenRows(
  rows: readonly unknown[],
  outerDisabled: boolean | 'conditional',
  evaluateExpression: DisabledExpressionEvaluator,
  found: AgentPresetCompositionRow[],
): void {
  for (const value of rows) {
    const row = value as RawRow
    const disabled = combineDisabled(outerDisabled, disabledContribution(row.disabled, evaluateExpression))
    if (row.group === true) {
      flattenRows(row.config as readonly unknown[], disabled, evaluateExpression, found)
      continue
    }
    found.push({
      entryId: typeof row.id === 'string' && row.id !== '' ? row.id : null,
      moduleName: row.name,
      enabled: disabled === true ? false : disabled === 'conditional' ? 'conditional' : true,
      ...isJsExpr(row.disabled) ? { condition: row.disabled.__jsExpr } : {},
    })
  }
}

/**
 * Plugin rows of one composition file, for a preset with no live mount.
 *
 * Parsed with the Loader's own dialect ({@link entryListSchema}), so the rows
 * reported are the rows a mount would start from. A file that stopped reading
 * as a composition — discovery judged the preset healthy moments earlier, so
 * only an edit racing this read gets here — answers as broken with the raced
 * reason rather than dropping the rows silently. The returned profile also
 * carries the preset's persona prose and bundled skills for the readable
 * detail view.
 * @param path - absolute path of the composition file.
 * @param evaluateExpression - the Loader-context evaluator for `!!js` nodes.
 * @returns flattened rows in composition order with the readable profile, or why they cannot be read.
 */
export async function fileComposition(
  path: string,
  evaluateExpression: DisabledExpressionEvaluator,
): Promise<{
  rows: AgentPresetCompositionRow[]
  persona?: AgentPresetPersona
  skills: readonly AgentPresetSkillSummary[]
} | { broken: string }> {
  let rows: unknown
  try {
    rows = load(await readFile(path, 'utf8'), { schema: entryListSchema })
  } catch (error) {
    /* v8 ignore next -- fs and js-yaml throw Errors for every failure here; the fallback keeps a hostile value readable */
    return { broken: error instanceof Error ? error.message : String(error) }
  }
  const problem = entryListProblem(rows)
  if (problem !== undefined) return { broken: problem }
  const rowList = rows as readonly unknown[]
  const found: AgentPresetCompositionRow[] = []
  flattenRows(rowList, false, evaluateExpression, found)
  const prefix = findPersonaPrefix(rowList)
  const skills = await readPresetSkills(dirname(path))
  return {
    rows: found,
    ...prefix === undefined ? {} : { persona: { prefix } },
    skills,
  }
}

/**
 * Plugin rows of one live standing composition, in Loader-entry order.
 * @param tree - the standing mount's entry tree.
 * @returns rows with the Loader's evaluated enablement and root-fiber states.
 */
export function mountedCompositionRows(tree: EntryTree): AgentPresetCompositionRow[] {
  const found: AgentPresetCompositionRow[] = []
  for (const entry of tree.entries()) {
    if (entry.options.group) continue
    found.push({
      entryId: entry.id,
      moduleName: entry.options.name,
      enabled: !entry.disabled,
      ...isJsExpr(entry.options.disabled) ? { condition: entry.options.disabled.__jsExpr } : {},
      ...entry.fiber === undefined ? {} : { fiberState: entry.fiber.state },
    })
  }
  return found
}
