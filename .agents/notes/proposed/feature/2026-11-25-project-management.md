# Agent Note: Project management plugin development specification

Status: proposed

English | [中文](2026-11-25-project-management.zh.md)

## Problem

The Hailiang quality education shared platform needs a project directory covering government engagement, contracting, delivery, and operation. The current personal deployment exposes one fixed Workspace per account and cannot create shared project Workspaces. Developers need one specification for metadata, directory provisioning, shared visibility, and the affected session and file operations.

## Proposal

### 1. Scope and decision status

This is an unimplemented development proposal. Package names, service names, API signatures, and configuration rows below are proposed interfaces, not existing callable features. Implement only after reviewing the explicitly marked product recommendations.

| Confirmed requirement | Implementation obligation |
|---|---|
| One project corresponds to one Workspace | Reuse WorkspaceId and session membership; do not add another project identity registry. |
| An independent project management plugin | Provide a dedicated page and independently mountable plugin entries. |
| Users do not enter directory paths | Provision under the configured absolute project root. |
| Absolute project root | `/Users/think/.dsh/projects`, configured in `feishu.patch.yml`. |
| All projects are initially visible to everyone | All admitted users of this deployment see project metadata; no organization or project-membership tables. |
| No metadata revision field | Do not add revision, expectedRevision, or ETag-based edit locking. |
| A project stage is required | Persist one of the nine stable stage codes in section 4. |

The following complete the proposal but are recommendations, not separately confirmed requirements: administrators create/edit/archive/restore projects; ordinary users browse projects and work in them; project files are shared while conversations remain owned by their creators; archive retains data and restricts new activity; project titles are unique among projects. The UI menu is proposed above Digital employees.

Out of scope: project-level membership, cross-organization sharing, metadata revision tracking, contract document workflows, payment/invoice management, approval engines, automatic stage transitions, arbitrary directory import, permanent data deletion, and multi-Host concurrent writers.

### 2. Existing implementation and required changes

| Existing owner | Current behavior and required change |
|---|---|
| [Workspace spec](../../../../packages/workspace/workspace/src/spec.ts) and [registry](../../../../packages/workspace/workspace/src/index.ts) | Persist title/path/sessionIds and registry order. Add optional project metadata and registry-owned atomic record updates. |
| [Account service](../../../../packages/client/connection/src/accounts.ts) | workspace() selects one personal directory; rejectWorkspaceMutation() refuses workspace changes; ownsPath() allows only personal paths. Replace the blanket restriction with operation-specific access decisions. |
| [Workspace feed](../../../../packages/api/workspace-controller/src/feed.ts) | Account baseline and followers currently select one fixed workspace. Include all visible projects and filter each row’s session membership. |
| [Session creation](../../../../packages/api/session-controller/src/commands.ts) | Personal-account requests are rewritten to the fixed workspace. Accept an authorized project WorkspaceId without accepting arbitrary cwd paths. |
| [Workspace client navigation](../../../../packages/client/ui-workspace/src/client/navigation.ts) | Reuse navigation and fresh preset-session launch behavior; make selection work for shared project rows. |

### 3. Package ownership

| Proposed package | Responsibility |
|---|---|
| `packages/workspace/project` → `@deepseek-ai/dsh-project` | Host project service / Host 项目业务服务，`ctx.projects`。 |
| `packages/api/project-controller` → `@deepseek-ai/dsh-api-project-controller` | Typed Remote commands and project feed / 类型化 Remote 命令与项目订阅，`ctx.remote.project`。 |
| `packages/client/ui-projects` → `@deepseek-ai/dsh-client-ui-projects` | Project list, details and forms / 项目列表、详情与表单。 |

WorkspaceRegistry owns all durable Workspace rows, project fields, registry order, and session membership. The project service owns title/stage validation, project lifecycle and directory provisioning, and calls explicit registry methods. It must not open the workspace domain a second time, write through diagnostic handles, or persist a second project list. A create must publish the complete project row; do not create an ordinary Workspace, emit it, and add project metadata in a later write.

The shared creator-ID type must live in an identity/types module that both workspace and account packages can reference. Move/re-export the existing WebUserId declaration if needed; do not make the workspace core depend on client-connection, which already depends on workspace. Keep schema definitions and branded IDs usable by the Host and generated client types without importing server runtime code.

Project streams and workspace feeds must publish after the complete registry operation commits, including registry order and recovery state. Do not translate each low-level domain/changed notification into a public create success: the current backend has no multi-record transaction, and compensation writes can occur. Introduce a registry-owned committed notification if existing feeds cannot observe that commit safely.

Centralize authenticated workspace decisions in one access service or an explicit extension of the existing account service. It must support personal ownership, project metadata management, project use, and path access, and be called by every controller. Keep account identity and Session ownership in webAccounts; never use the last browser request’s identity for another subscriber.

### 4. Metadata and stages

Use the existing workspace storage domain. The record key remains WorkspaceId, and the record retains path, title, sessionIds, createdAt and updatedAt. Add the optional project object below. Absence means a pre-existing ordinary/personal Workspace, not a public project.

```json
{
  "description": "项目背景、建设目标和服务范围",
  "createdBy": "<WebUserId>",
  "status": "active",
  "stage": "engagement"
}
```

description is a string that can be empty; createdBy is a branded WebUserId obtained from server authentication and immutable after creation; status is active or archived; stage is a required enum. Title is stored only in Workspace.title, never duplicated as project.name. Do not add projectId, organization, members, revision or a per-user projectIds array.

Store ISO-8601 timestamps on the Workspace. Metadata changes update updatedAt; membership changes can also update it, so it is not a dedicated stage timestamp or audit trail. Account removal must not cascade-delete projects or invalidate their historical creator IDs. Display the creator ID when its current account name is unavailable.

| Code | Chinese label | Work and transition reference |
|---|---|---|
| engagement | 项目接洽 | Establish contacts and cooperation intent; identify the counterpart and arrange research. |
| discovery | 需求调研 | Clarify local education needs, schools, users, resources, scope and constraints. |
| proposal | 方案论证 | Develop the construction and operation proposal and align on scope and outcomes. |
| approval | 立项与采购推进 | Coordinate project decisions, funding arrangements and applicable procurement steps. |
| contracting | 合同洽谈与签署 | Agree on responsibilities, service scope, delivery standards and commercial terms. |
| preparation | 建设筹备 | Prepare premises, curricula, instructors, equipment, platform and operating team. |
| pilot | 试点运行 | Deliver a limited service, evaluate results and resolve operational issues. |
| acceptance | 验收交付 | Check agreed deliverables and complete acceptance and handover materials. |
| operation | 正式运营 | Deliver ongoing services, monitor quality and results, and support follow-up cooperation. |

New projects default to engagement. Managers may skip or move back between stages; stage changes do not execute government procedures or imply legal completion. Archive is independent of stage and restore preserves the previous stage. An existing Workspace converted to a project requires an explicit stage instead of inventing its progress.

All durable values must pass Zod validation at read/input boundaries. Single-record mutation reads the latest record inside the registry queue, replaces only explicitly supplied project fields, preserves sessionIds and unrelated values, persists first, and emits changes afterward. No revision checks: the last committed edit to a field wins.

### 5. Configuration and filesystem

The following is a proposed overlay fragment to add to feishu.patch.yml after implementation. Existing connection configuration remains intact; patch rows that replace config must retain the required original fields.

```yaml
- id: projects
  name: '@deepseek-ai/dsh-project'
  config:
    root: /Users/think/.dsh/projects
- id: project-controller
  name: '@deepseek-ai/dsh-api-project-controller'
- id: ui-projects
  name: '@deepseek-ai/dsh-client-ui-projects'
```

root is required and must be an absolute path; do not expand ~, use cwd as a fallback, or hardcode this machine’s path in source. Validate at activation, create missing ancestors with owner-only permissions on supported systems, canonicalize the resulting root, and fail clearly when it is unusable. The deployment value is /Users/think/.dsh/projects.

```text
/Users/think/.dsh/projects/
  <WorkspaceId>/
```

The server generates the branded WorkspaceId. Names are display metadata, never path segments. Canonical project paths must remain under root; do not adopt an existing non-empty directory or follow an unexpected symlink. Renaming never moves a directory. Changing root is an explicit migration operation: existing stored paths do not silently move or become remapped. Report out-of-root projects until their paths/configuration are reconciled.

Project files live in these directories. Workspace/project metadata stays in storage-domain, and Session logs stay in Session persistence. Do not put the authoritative registry, login credentials, or other users’ Session logs in shared project directories. A missing project directory is an unavailable project with visible diagnostics, not a reason to discard metadata or recreate an empty directory silently.

### 6. Creation and crash recovery

Create sequence: authorize the caller; trim and validate title/description/stage; serialize the project-name uniqueness check; generate an ID; persist a narrow creation-intent record; create the owned directory; commit the complete Workspace with project metadata and registry order; finalize the intent; publish committed state and return. The intent is internal operation recovery data, not a product revision or a second project registry. Extend or integrate the existing registry pending-mutation mechanism rather than adding unrelated lifecycle flags.

Recommended naming rule: trimmed project titles are non-empty and unique across both active and archived projects, independent of personal workspace titles. Use a documented deterministic comparison, shared by create and update. Keep text length limits as validated plugin configuration when deployment-varying. UI validation supplements server validation.

If directory creation fails, do not publish a Workspace. If metadata commit fails, clean up only the directory created by this attempt and only if still empty; otherwise retain it with an error. On restart, reconcile persisted intent with the committed registry and directory before exposing new projects. Never recursively delete an unrecognized directory. A crash after commit must recover the committed project without creating a second one.

The UI disables repeat submission. The first release must not automatically retry create after an ambiguous transport failure; refresh the project list and explain that creation may have succeeded. Title uniqueness prevents ordinary repeated identical submissions, but is not an exactly-once guarantee. If automatic retries are added, design a durable per-caller request-id receipt explicitly rather than using an in-memory cache.

### 7. Remote interfaces

Use typed request/response definitions, branded IDs, generated Remote clients and stable error codes. Every mutation obtains the current identity and administrator status from the server. Reject client-supplied path, createdBy, organization, revision and arbitrary status values.

| Proposed method | Request | Result and behavior |
|---|---|---|
| project.list | status: active / archived / all, optional query/stage | Complete filtered metadata snapshot; no Session IDs or per-user absolute paths. |
| project.get | workspaceId | One project’s metadata or project/not-found. |
| project.create | title, description; optional stage | Persist a new project; omitted stage defaults to engagement. Return the committed project. |
| project.update | workspaceId plus supplied title/description/stage | Update only supplied fields; empty description clears it. No status or path mutation. |
| project.archive | workspaceId | Archive idempotently; retain directory, stage and sessions. |
| project.restore | workspaceId | Restore idempotently and preserve stage. |
| project.follow | stream cancellation | One complete baseline followed by committed upsert/remove changes; reconnect replaces the snapshot. |

Use a narrow ProjectView with workspaceId, title, description, createdBy, status, stage, createdAt and updatedAt. Directory diagnostics are a separate manager-facing detail if needed. First release has no delete endpoint. Unauthenticated calls are refused; metadata mutation without administrator permission is project/forbidden. Distinguish invalid input, name-conflict, not-found, archived, busy, directory-unavailable and storage failure. Failed writes must not emit successful changes.

### 8. Visibility, sessions and file access

Compute visible Workspaces from the current user’s personal Workspace plus all active project Workspaces. Project visibility applies to every admitted account in this deployment; there is no organization field or membership list. Archived projects appear through an explicit archived view. Do not include arbitrary legacy or other users’ personal Workspaces.

Recommended access matrix:

| Operation | Ordinary user | Administrator |
|---|---|---|
| Browse project metadata and shared files | Yes | Yes |
| Create/edit/archive/restore project metadata | No | Yes |
| Create a conversation in an active project | Yes, owned by self | Yes, owned by self |
| Read another user’s conversation | No | No implicit administrator exception |
| Read another user’s personal directory | No | No implicit administrator exception |

For each visible project Workspace row, filter sessionIds, counts, summaries, search results, archive lists and child-session catalogs using durable Session ownership. Apply the same policy to baseline, upsert/order increments and direct ID requests; never send all users’ Session IDs and hide them in React. Capture subscriber identity per stream and recompute visibility on project lifecycle changes.

Session creation accepts an accessible active project WorkspaceId; without an explicit Workspace, retain the personal default. Resolve cwd on the server from that Workspace. Reserve/commit Session ownership before making it visible. Forks and background children preserve the existing ownership rules. Digital employees and the workbench must create in the chosen project without silently falling back to the personal directory.

File authorization covers the caller’s personal directory and accessible project directories, with canonical-path checks for existing targets and canonical-parent checks for creation. Review file browsing, uploads/downloads, previews, media references, file watches, search, terminals, tools and background jobs. HTTP checks alone do not constrain shell/PTY tools: the execution filesystem/sandbox policy must exclude credentials, registry data and other users’ private files. The owning operations must refuse moving, renaming or deleting the project root itself while allowing ordinary child-file operations. Check archive status against the actual target project path, including a tool running from another Workspace. Shared project files may be modified concurrently; metadata serialization does not provide file locking or version control.

### 9. Archive and removal semantics

Recommended first-release archive: remove from the default active list, refuse new Sessions, and expose retained history read-only to its owner. Refuse new model turns, queued/background continuations and mutating file/tool operations for that archived project. Preserve directories, logs, IDs and stage; restore re-enables ordinary use. Allow administrators to correct archived metadata.

Admission checks and archive must be serialized: if a project has running turns, jobs, live terminals or admitted mutating operations that cannot be quiesced, return project/busy rather than promise read-only while work continues. Recheck eligibility at actual execution, not only at UI submission. The implementation must document its handling of external OS processes; application archive is not an OS-level filesystem write lock.

Generic workspace.delete and rename/update paths must not bypass project lifecycle or metadata rules. Route project edits to their owner or explicitly reject the generic operation. Personal workspaces remain fixed. Project archive and Session archive are independent: archiving a project never adds all its Sessions to the global archived-session set. Permanent directory/log deletion and managed removal are deferred.

### 10. UI and live state

The independent Projects menu opens a full main panel. List cards/rows display title, description, stage, active/archive status, creator and timestamps; support title/description search, stage filtering and active/archived views. Detail shows the same metadata and an Enter workspace action. Administrator-only actions are Create, Edit, Archive and Restore. Ordinary users receive no mutation controls, and server authorization remains mandatory.

Creation/edit forms contain title, description and stage only. Never expose a path picker, revision, organization or member selector. Show loading, empty, disconnected, validation, conflict and storage-error states. Retain drafts after a failed save; wait for committed responses before closing forms. Archive uses a confirmation describing retained files and conversations.

The sidebar keeps the personal Workspace and adds visible projects, including projects with no conversations. Prefer a separate Projects group; use a stable title/ID order initially rather than another durable order list. Search and grouping options must not drop empty project Workspaces. Do not reuse global registry ordering APIs for personal preferences.

Register UI through slots with reversible effects and locale-owned Chinese/English text. Keep shared/remount-surviving data in declared stores. Project management subscribes to project metadata; workspace navigation subscribes to the Workspace projection. Both derive from the same committed registry, and reconnect replaces each baseline. No optimistic authoritative project registry in localStorage.

### 11. Compatibility and delivery order

Add project as optional on legacy Workspace records. Do not change existing IDs, personal paths, Session membership or released Session log generations. Because the workspace domain currently uses single layout and rejects mismatched versions, do not merely bump its version and make existing data unreadable. Either retain its version for a reviewed additive schema with compatibility tests, or implement an explicit supported migration before switching versions. Follow the repository persistence-type acknowledgement rules.

Existing workspaces are not automatically shared. A future administrator conversion must explicitly verify path/root rules, assign stage and creator policy, and audit historical Session owners. Conversion/import is not part of the first release. A service mount must not scan arbitrary directories and infer that they are projects.

Suggested implementation order: workspace metadata and atomic registry operations; project directory provisioning and recovery; centralized access rules and Session/file integration; typed project controller and stream; workspace feed updates; UI plugin; profile/overlay wiring; migration evidence and end-to-end verification. Ship no partially shared personal-account mode that only changes the sidebar.

Removing the project UI or unloading the project service must not reinterpret persisted project rows as ordinary workspaces or bypass their access rules. Preserve project classification, refuse unavailable project operations explicitly, and keep personal Workspace behavior usable.

Register new package aliases, project references, resolver dependencies and client manifests. Keep Host and Client programs separate: Host-booting browser e2e specs belong in tsconfig.host.json and must be excluded from apps/web/tsconfig.json. Refresh affected generated catalogs and bilingual records from their owners.

### 12. Source reading map

- [Architecture](../../../../docs/architecture.md), [package rules](../../../../packages/AGENTS.md), and [client rules](../../../../packages/client/AGENTS.md).
- [Storage subsystem](../../../../docs/subsystems/storage.md), [workspace subsystem](../../../../docs/subsystems/workspace.md), and [defensive patterns](../../../../docs/defensive-patterns.md).
- [Feishu account design](../../implemented/architecture/2026-11-24-feishu-web-accounts.md) and [Session format status](../../../../docs/session-format-status.md).
- [Persistence type review](../../../../docs/cookbook/reviewing-persistence-type-changes.md), [testing policy](../../../../docs/testing.md), and [Slots](../../../../docs/subsystems/slots.md).

## Acceptance criteria

Each item needs observable evidence through the real composed application, with focused unit tests for failure paths. A two-account browser scenario must use distinct authenticated browser contexts, not mocked visibility filters.

1. Loading the overlay uses /Users/think/.dsh/projects. Missing/relative/unusable root fails clearly; neither forms nor APIs accept arbitrary project paths.
2. An administrator creates a named project; exactly one full project Workspace and its directory appear. Both users see the empty project without reload, while personal Workspaces remain private.
3. Name, description and all nine stages survive restart. Rename leaves directory and ID unchanged. Stage changes can skip/backtrack; archive/restore preserves stage.
4. Non-administrator direct RPC mutation is rejected under the recommended role policy. Duplicate names, invalid stages, unsupported fields and out-of-root paths are rejected by owning operations.
5. Simultaneous project edits and Session attachments preserve unrelated fields and membership. Failed writes change neither authoritative memory nor success notifications.
6. Directory failures, metadata failures and process interruption at intent/directory/commit points recover without phantom visible projects, accidental directory deletion or duplicate committed projects.
7. Both users can work on shared project files. Each sees only their own project conversations and cannot query another user’s IDs, summaries, streams, files in personal directories or child catalogs through alternate endpoints.
8. Project Session creation, Digital employee launch and workbench launch use the chosen project cwd. Ordinary creation without a Workspace still uses the personal default.
9. Baseline, increments, reconnect and logout/login preserve identical access rules. Project rename/archive/restore updates both management and workspace navigation, including currently selected projects.
10. Archive rejects busy projects under the proposed policy, blocks new activity after commit, and retains files/logs. Session archive does not archive the project, and generic Workspace APIs cannot bypass project rules.
11. Old workspace data loads without forced public sharing or Session log rewrites. Missing directories remain diagnosable. Configuration root changes are not treated as automatic migration.
12. UI has localized loading/empty/error states and filters. Plugin unload removes slots, subscriptions and effects; an in-flight navigation cannot reopen a removed page.
13. Full client build and Host typecheck pass with the new browser spec registered in the correct compiler program. Run focused backend/Loader tests, GUI tests, keyless browser snapshots and required persistence/documentation checks; record commands and distinguish baseline failures.

Required handoff includes the three packages, all affected consumers, fixture/expected-output updates, README pairs, an updated decision note, configuration wiring, persistence compatibility evidence and a two-user demo. A management-page-only implementation does not satisfy this specification.

## Alternatives considered

**A separate Project table and identity** duplicate the one-project/one-Workspace relation and introduce cross-record synchronization for names, paths and deletion. Extend the existing Workspace record instead.

**Per-user copies of the project roster** require fan-out writes for every create/archive and stale-list recovery. Derive each user’s visible Workspaces from the shared registry instead.

**Project identity from directory names or project-local JSON** makes renaming, missing directories and shared-file edits alter management identity. Keep stable IDs and authoritative metadata in storage-domain.

**Revision-based editing and organization/member tables** are excluded by the agreed first-release scope. Serialized field updates and deployment-wide project visibility are sufficient for this version.

The account design remains authoritative for login and Session ownership; this proposal changes only its sole-personal-Workspace restriction when the project feature is mounted. The storage/workspace design remains authoritative for persistence ownership. These existing notes retain independent scope and are not superseded or archived by this proposal.

## Risks

- The create/edit administrator rule, private conversation rule, archive restrictions and menu position need product confirmation before implementation. Do not treat globally visible project metadata as approval to expose every Session.
- Shared directories make file changes visible to other users; metadata ordering does not solve concurrent file edits. User-facing copy must explain this, and execution permissions must match the advertised scope.
- Without revisions, simultaneous edits to the same field can overwrite earlier values. This is accepted for the first release; no hidden audit/history system is implied.
- Filesystem provisioning and metadata are not one transaction. Durable recovery intent and failure-injection tests are required; a happy-path mkdir plus put is insufficient.
- The proposed archive policy spans controllers, jobs, tools and terminals. If reliable admission/quiescence cannot be provided in the first release, explicitly narrow archive semantics with product approval instead of silently claiming read-only protection.

### Verification status

This handoff is based on inspection of the linked source files. The proposed project packages and configuration do not exist yet; feature commands, migration behavior and acceptance scenarios have not been executed. Documentation validation checks structure and pairing only and cannot establish implementation correctness.
