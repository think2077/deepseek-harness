---
description: "Host knowledge-file service for configured shared roots and read-only knowledge directories under registered Workspaces."
kind: "package-reference"
---

# @deepseek-ai/dsh-knowledge-base

English | [中文](README.zh.md)

## Summary

`dsh-knowledge-base` exposes text knowledge files through the `knowledgeBase` Remote namespace. Deployment-configured roots can represent public, solution-specific, and candidate knowledge and may be writable. Every registered Workspace contributes its configured project knowledge subdirectory as a read-only root. File content remains authoritative on disk, and updates and removals carry the revision that the browser opened so a stale view cannot silently replace or remove a newer file.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Configure the editable roots and the relative directory used for project knowledge. Root ids are lowercase letters, numbers, and hyphens; ids beginning with `project-` are reserved for Workspace-derived roots.

```yaml
- id: knowledge-base
  name: '@deepseek-ai/dsh-knowledge-base'
  config:
    projectKnowledgeDirectory: 知识库
    roots:
      - id: public
        label: 公共知识库
        path: ~/.dsh/.agent-presets/solution-expert/公共知识库
        kind: public
        writable: true
      - id: solution
        label: 方案专属知识库
        path: ~/.dsh/.agent-presets/solution-expert/方案专属知识库
        kind: solution
        writable: true
      - id: candidate
        label: 候选知识库
        path: ~/.dsh/.agent-presets/solution-expert/候选知识库
        kind: candidate
        writable: false
```

The service discovers `.md`, `.markdown`, `.yml`, `.yaml`, and `.json` files recursively. The shipped Web composition exposes candidate knowledge for inspection but configures it read-only because candidate review is outside this phase. A missing configured directory appears as an empty root. Permission and other filesystem failures reject the catalog read so a broken deployment does not look empty.

### Remote operations

`list()` returns roots and entry metadata without exposing host paths. `read(id)` returns one document and its SHA-256 revision. `create({ rootId, path, content })` creates a new supported text file exclusively below a writable non-project root. `update({ id, revision, content })` compares the supplied revision with the current file and replaces it atomically when they match. `deleteEntry({ id, revision })` applies the same comparison and moves the file into the root's hidden `.knowledge-base-trash` directory. Existing targets return `knowledge-base/already-exists`, revision mismatches return `knowledge-base/conflict`, and project mutations return `knowledge-base/read-only`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Configured paths expand `~` on the Host. Workspace-derived roots are recalculated from the live Workspace registry for each request, use `project-<workspaceId>` identities, and never inherit write access. Directory scans omit dot entries, symbolic links, and unsupported files. Reads resolve both the root and target through `realpath`, then verify that the canonical target remains under the canonical root.

The SHA-256 digest is a content revision, not a durable database version. DSH writers take a per-target file lock; `writeFileAtomic` replaces an accepted file while preserving its mode, and creation uses exclusive file creation. Removal is recoverable because it renames the accepted target into hidden trash instead of unlinking it. The browser never receives an absolute root path.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host service, root discovery, path confinement, and revision-fenced create/update/remove operations |
| [`src/types.ts`](src/types.ts) | Browser-safe Remote values and knowledge-base error details |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workspace package](../../workspace/workspace/README.md) — the registry that contributes project directories.
- [Typert protocol](../../typert/protocol/README.md) — the typed Remote transport used by the service.
- [Knowledge-base management note](../../../.agents/notes/implemented/feature/2026-09-26-knowledge-base-management.md) — ownership and concurrency decisions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package exposes a Host management API and does not add knowledge to model requests.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the first management phase.

- **Entries cannot be renamed or moved** — creation, editing, and recoverable removal are supported, but path changes remain outside this phase.
- **Trash restoration is manual** — removed files remain under `.knowledge-base-trash`; the API does not list or restore them yet.
- **The catalog is read on demand** — external edits appear after a reload; the package does not watch roots or push invalidations.
- **The revision check cannot lock external editors** — it prevents saves based on an already stale revision, but a non-DSH process can still write between the final comparison and atomic replacement.
- **Binary project evidence is not displayed** — PDFs, Office files, images, and arbitrary text extensions remain in the Workspace but are outside this first text editor.
- **Automatic extraction and candidate review are absent** — conversation completion does not create knowledge candidates in this phase.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The service derives each response directly from configured roots and the Workspace registry and owns no independent durable index whose consistency could diverge.
