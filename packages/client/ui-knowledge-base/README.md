---
description: "Knowledge-base main panel for tree browsing, Markdown preview, and revision-fenced Host file updates."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge-base

English | [中文](README.zh.md)

## Summary

This browser plugin adds **Knowledge base** as a global sidebar row above **New Session** and opens a full-size main panel. The **Knowledge base** tab presents public, solution-specific, and candidate roots in one file tree; the separate **Project information** tab contains Workspace material. Selecting a file opens its preview or editor directly. Writable roots support Markdown creation, editing, and recoverable removal, while candidate and project files are read-only in the shipped Web composition. Mutations retain local state on revision conflicts instead of overwriting or removing a newer file.

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

Mount the package in a Web composition that provides the layout and sidebar shells, locale and slot services, the shared Remote client, and the Host `knowledgeBase` namespace. The plugin has no browser configuration. Choose **Knowledge base** in the sidebar, filter the tree, then select a file. Markdown entries render a formatted preview and writable entries expose an edit tab. **Add entry** creates a Markdown file; **Remove** requires inline confirmation and moves the file to recoverable Host trash.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`KnowledgeBaseController` owns the catalog, selected document, draft, mutation status, and conflict notice in a snapshot store. The panel loads on mount and invokes only injected operations. After a successful create or save, the controller refreshes the catalog and keeps the returned document selected with its new revision. Removal refreshes the catalog and clears the detail pane when it removed the selected file. A conflict keeps the draft or current selection unchanged.

The plugin registers a `sidebar.panellist` row and a matching `main` keyed panel under `knowledge-base`. Every visible string belongs to the Chinese and English dictionaries.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale, sidebar row, and main-panel registration |
| [`src/client/store.ts`](src/client/store.ts) | Catalog, selection, draft, and revision-fenced mutation controller |
| [`src/client/KnowledgeBaseSection.tsx`](src/client/KnowledgeBaseSection.tsx) | Scoped knowledge tree, creation form, preview, editor, and removal confirmation |
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

None, as the package is a browser-side management page that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits match the Host's first management phase.

- **Only new Markdown entries are created** — existing YAML and JSON files remain viewable and editable as plain text; structured forms and diff views are deferred.
- **Entries cannot be renamed or moved** — creation and recoverable removal are available, but path changes are deferred.
- **Trash cannot be restored in the UI** — recovery currently requires moving the file back from the Host root's hidden trash directory.
- **External changes require a manual reload** — the page has no filesystem invalidation subscription.
- **Conflict recovery is manual** — the page preserves the draft but does not merge it with the newer file.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The browser controller mirrors one Host response at a time and owns no durable state that can diverge after reload.
