---
description: "The read-only management cockpit for current project stages, Session activity, failed jobs, and a disposable workflow preview."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-management-cockpit

English | [中文](README.zh.md)

## Summary

The management cockpit summarizes the project, Workspace, Session, and job data already available in the Web client. Users can inspect project-stage counts, current project cards, digital-employee activity, and recent work without creating another reporting store. Its workflow dialog is a disposable preview: closing, cancelling, or saving discards every edit.

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

Mount the plugin beside the project Remote and the standard Web Session and Workspace client services.

### When to choose it

Choose this package for a presentation-only overview of existing runtime data. Use a separate reporting backend when the product needs durable aggregates, business approvals, or saved workflow configuration.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-client-ui-management-cockpit'
```

The plugin has no configuration fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin follows the project metadata Remote in its own snapshot store. The component joins those rows with the standard Workspace and Session snapshots during render. Workflow drafts stay in component-local React state and never cross the browser transport.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Feed ownership, localization, and slot registration |
| [`src/client/ManagementCockpit.tsx`](src/client/ManagementCockpit.tsx) | Cockpit derivation and disposable workflow editor |
| [`src/client/ManagementCockpit.module.css`](src/client/ManagementCockpit.module.css) | Responsive cockpit and dialog layout |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Project management decision](../../../.agents/notes/proposed/feature/2026-11-25-project-management.md) — project metadata and Workspace ownership.
- [Web Client subsystem](../../../docs/subsystems/web-client.md) — standard reactive data and plugin loading.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package renders browser state and registers no tools, prompt content, commands, or Session events.

#### KV Cache effect

None; the package does not assemble or send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Workflow edits are intentionally discarded when the dialog closes.
- Results-to-review remains zero because no existing projection represents business-result review.
- Recent work lists durable Sessions newest first; blank drafts and sub-agent Sessions are excluded. The employee column reads each Session's persisted `agentPreset` projection and falls back to a general-assistant label when no cached value exists. The project column resolves the Session `cwd` against Workspace records, so a Session outside a project Workspace shows its Workspace title.
- Project risk text uses existing project descriptions and a fixed next-step label; it does not run a risk model.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
