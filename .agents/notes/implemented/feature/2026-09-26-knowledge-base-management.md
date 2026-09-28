# Agent Note: Knowledge-base management page

Status: implemented

English | [中文](2026-09-26-knowledge-base-management.zh.md)

## Problem

Solution-specific knowledge lives in local files that experts can maintain directly, but DSH had no safe browser surface for discovering and editing those files. Project evidence also lives under each Workspace and must be visible without allowing a global management surface to mutate task source material.

## Decision

An independent Host plugin owns a `knowledgeBase` Remote namespace over deployment-configured knowledge roots and Workspace-derived project roots. Public and solution-specific roots may be writable. The shipped Web composition also exposes candidate knowledge as a read-only root so experts can inspect candidate material without turning the first phase into a review workflow. Every registered Workspace contributes its configured project knowledge subdirectory as a read-only root. The files remain the source of truth; DSH does not copy them into a database or build a durable index.

The Host lists supported text files, reads one document, and creates, replaces, or removes files only within writable non-project roots. Replacement and removal require the SHA-256 revision of the content the caller opened. DSH writers use per-target locks; accepted updates are atomic and preserve file mode, creation is exclusive, and removal renames the file into hidden recoverable trash. The Host hides absolute paths, rejects traversal and canonical paths outside the root, and forces every project root read-only.

An independent Client plugin contributes a localized Knowledge base row above New Session and a matching full-size main panel. The Knowledge base tab groups public, solution-specific, and candidate files in a tree, while Project information separates Workspace material. Selecting a file opens its Markdown preview or text editor directly. Writable roots support Markdown creation and confirmed recoverable removal; read-only roots hide every mutation action. The controller adopts returned revisions and preserves local state when the Host reports a conflict.

## Alternatives considered

**Store knowledge in a new database.** Rejected because the existing files are already consumed by skills and maintained with normal file tools. A second durable representation would require synchronization and migration without improving the first-phase workflow.

**Let the browser read local files directly.** Rejected because browser file access cannot enforce deployment roots consistently and would expose Host paths and permissions to UI code.

**Make project knowledge writable from the global panel.** Rejected because task evidence belongs to the Workspace workflow. The global management page may inspect it but must not become a second editor for project source material.

**Merge conflicting text automatically.** Rejected for the first phase because a generic three-way merge cannot validate Markdown, YAML, and JSON semantics. The page retains the draft and makes the conflict explicit.

## Consequences

Experts can maintain public and solution-specific knowledge and inspect candidate knowledge from a dedicated main panel while preserving file compatibility with existing skills. Tree filtering preserves the on-disk category hierarchy. Registering a Workspace automatically exposes its project knowledge directory on a separate tab without machine-specific configuration, and project entries remain read-only. Concurrent or external edits are detected when the browser's opened revision is already stale. Renaming, moving, in-product trash restoration, filesystem watching, conversation extraction, and candidate review remain outside this phase.
