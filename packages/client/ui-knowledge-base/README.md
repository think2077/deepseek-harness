---
description: "Knowledge-base main panel for tree browsing, Markdown preview, and revision-fenced Host file updates."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge-base

English | [中文](README.zh.md)

## Summary

This browser plugin adds **My reviews** and **Knowledge base** as global sidebar rows above **New Session**, each with a full-size main panel. **My reviews** shows extracted candidate cards by pending, accepted, and rejected state. Each card presents one readable knowledge suggestion; technical evidence remains stored but hidden. A reviewer can edit that suggestion, reject it with confirmation, or select a destination and request a smart insert, append, replace, or skip proposal before acceptance. **Knowledge base** keeps public, solution-specific, candidate, and Workspace files in separate tree views. Revision conflicts preserve local state instead of overwriting changed files.

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

Mount the package in a Web composition that provides the layout and sidebar shells, locale and slot services, session controller, shared Remote client, and Host `knowledgeBase` namespace. The plugin has no browser configuration. Choose **My reviews** to process candidate cards. Acceptance prefills a root and path from `suggested_destination`; **Generate smart merge suggestion** uses the current live session to compare the candidate with the latest destination, then displays the proposed operation, target section, explanation, and complete resulting Markdown. The final action stays disabled until that preparation completes, and the reviewer may edit the result before confirmation. Choose **Knowledge base** to browse or maintain files directly.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`KnowledgeBaseController` owns the catalog, selected document, draft, mutation status, and conflict notice in a snapshot store. The panel loads on mount and invokes only injected operations. After a successful create or save, the controller refreshes the catalog and keeps the returned document selected with its new revision. Removal refreshes the catalog and clears the detail pane when it removed the selected file. A conflict keeps the draft or current selection unchanged.

The plugin registers `sidebar.panellist` rows and matching `main` keyed panels under `knowledge-review` and `knowledge-base`. `KnowledgeReviewController` carries candidate and destination revisions to the Host and reloads all three card states after a mutation. Every visible string belongs to the Chinese and English dictionaries.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale, sidebar row, and main-panel registration |
| [`src/client/store.ts`](src/client/store.ts) | Catalog, selection, draft, and revision-fenced mutation controller |
| [`src/client/review-store.ts`](src/client/review-store.ts) | Candidate review state and revision-fenced transitions |
| [`src/client/KnowledgeBaseSection.tsx`](src/client/KnowledgeBaseSection.tsx) | Scoped knowledge tree, creation form, preview, editor, and removal confirmation |
| [`src/client/KnowledgeReviewSection.tsx`](src/client/KnowledgeReviewSection.tsx) | Candidate cards, edit and rejection controls, and acceptance merge confirmation |
| [`src/client/locales.ts`](src/client/locales.ts) | Chinese and English UI copy |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Knowledge-base Host package](../../preset/knowledge-base/README.md) — roots, path safety, and Remote operations.
- [UI Sidebar](../ui-sidebar/README.md) — the global panel row extension point this package fills.
- [UI Layout](../ui-layout/README.md) — the keyed main panel selected by the sidebar row.
- [Knowledge-base management note](../../../.agents/notes/implemented/feature/2026-09-26-knowledge-base-management.md) — the first-phase scope.

-----

<a id="model-experience"></a>
## Model Experience

The browser itself registers no model-visible content. Requesting a smart merge calls the Host operation documented by `dsh-knowledge-base`; that operation creates the logged child model request.

#### KV Cache effect

The browser adds no prompt prefix. See the Host package for the per-request child-session cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits match the Host's first management phase.

- **Only new Markdown entries are created** — existing YAML and JSON files remain viewable and editable as plain text; structured forms and diff views are deferred.
- **Entries cannot be renamed or moved** — creation and recoverable removal are available, but path changes are deferred.
- **Trash cannot be restored in the UI** — recovery currently requires moving the file back from the Host root's hidden trash directory.
- **External changes require a manual reload** — the page has no filesystem invalidation subscription.
- **Conflict recovery is manual** — the page preserves the draft but does not merge it with the newer file.
- **Smart merge requires a live compatible session** — a reviewer must open a session carrying the configured merge skill before requesting a suggestion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The browser controller mirrors one Host response at a time and owns no durable state that can diverge after reload.
