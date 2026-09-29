# Agent Note: Knowledge-base management page

Status: implemented

English | [中文](2026-09-26-knowledge-base-management.zh.md)

## Problem

Solution-specific knowledge lives in local files that experts can maintain directly, but DSH had no safe browser surface for discovering and editing those files. Project evidence also lives under each Workspace and must be visible without allowing a global management surface to mutate task source material.

## Decision

An independent Host plugin owns a `knowledgeBase` Remote namespace over deployment-configured knowledge roots and Workspace-derived project roots. Public and solution-specific roots may be writable. The shipped Web composition exposes candidate knowledge as a generally read-only root and configures pending, accepted, and rejected directories for the dedicated review workflow. Every registered Workspace contributes its configured project knowledge subdirectory as a read-only root. The files remain the source of truth; DSH does not copy them into a database or build a durable index.

The Host lists supported text files, reads one document, and creates, replaces, or removes files only within writable non-project roots. Replacement and removal require the SHA-256 revision of the content the caller opened. Review operations separately permit pending candidate edits and directory transitions without making the candidate root generally writable. Before acceptance, the reviewer may request a structured merge suggestion from a logged one-shot child of the current session. That child explicitly invokes the configured merge skill over the candidate and latest selected destination, then returns insert, append, replace, or skip plus a complete draft. It cannot commit the result. Acceptance requires both the candidate revision and the destination revision analyzed by the suggestion. The client sends the complete reviewer-confirmed destination content; the Host writes that exact text without performing semantic inference during the mutation. DSH writers lock both files and roll back the destination if candidate archival fails. The Host hides absolute paths, rejects traversal and canonical paths outside the root, and forces every project root read-only.

An independent Client plugin contributes localized My reviews and Knowledge base rows above New Session with matching full-size main panels. My reviews presents candidate cards in pending, accepted, and rejected tabs. A card shows one readable knowledge suggestion while technical evidence remains hidden. A pending card supports editing that suggestion, confirmed rejection, and confirmed acceptance. The acceptance form maps a valid `suggested_destination` to a configured root and path, lets the reviewer change either value, displays the smart operation, target section, explanation, and complete editable Markdown, and keeps the final action disabled until the suggestion completes. Knowledge base retains the public, solution-specific, candidate, and project file views. Both controllers preserve local state when the Host reports a conflict.

## Alternatives considered

**Store knowledge in a new database.** Rejected because the existing files are already consumed by skills and maintained with normal file tools. A second durable representation would require synchronization and migration without improving the first-phase workflow.

**Let the browser read local files directly.** Rejected because browser file access cannot enforce deployment roots consistently and would expose Host paths and permissions to UI code.

**Make project knowledge writable from the global panel.** Rejected because task evidence belongs to the Workspace workflow. The global management page may inspect it but must not become a second editor for project source material.

**Apply model-generated text automatically.** Rejected because semantic classification can be wrong and shared guidance affects future tasks. The model produces an inert draft, the reviewer confirms it, and revision checks reject a destination that changed after analysis.

**Let an extraction skill approve and write knowledge directly.** Rejected because classification is probabilistic and a merge can change shared guidance for every later task. Extraction may propose `suggested_destination`, but only the review page can submit a user-confirmed target and resulting file.

## Consequences

Experts can maintain public and solution-specific knowledge and process candidate knowledge from dedicated main panels while preserving file compatibility with existing skills. Tree filtering preserves the on-disk category hierarchy. Candidate files visibly move through the same pending, accepted, and rejected directories that experts can inspect outside DSH. Extraction and merge skills can improve proposals without acquiring final write authority. Merge suggestions consume a model request and require a compatible live session, but their prompt and structured result are preserved in the child session log. Registering a Workspace automatically exposes its project knowledge directory on a separate tab, and project entries remain read-only. Concurrent or external edits are detected when the browser's opened revision is stale. Renaming, general file moves, in-product trash restoration, filesystem watching, and automatic conversation extraction remain outside this capability.
