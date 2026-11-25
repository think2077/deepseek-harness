---
description: "Browse digital employees backed by agent presets and start workspace conversations."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-digital-employees

English | [中文](README.zh.md)

## Summary

Browse digital employees, search their names and descriptions, and inspect their configured plugins. Start a fresh conversation with the selected employee in an existing workspace. The directory reads agent presets without creating a second employee registry. Browsing does not mount agents or submit prompts.

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

The Web composition mounts this plugin as a separate row. It contributes Digital employees between My workbench and My reviews. There are no configuration fields. It requires the layout, slots, locale, sessions, workspace navigation, agent-preset Remote, and plugin-inventory Remote services.

Cards display preset names, descriptions, source, default status, and configuration errors. View details shows plugin module names and enablement from the Host inventory; it does not expose plugin configuration values. Refresh reads the current roster and composition again.

Start conversation creates a fresh session in the current conversation’s workspace. Without a current project, users choose an existing workspace. Preset selection completes before navigation; no prompt is submitted. A later navigation or plugin unload prevents a pending launch from opening its session. Failures remain visible and can be retried.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser registers independent main-panel and sidebar entries. Component-local reads ignore completions after unmount; the preset roster and plugin inventory fail independently. No runtime invariant companion is published because the plugin derives its display from Host snapshots and owns no independently observable durable state.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent presets](../../preset/agent-presets/README.md) — discovery and per-session composition.
- [Web Client](../../../docs/subsystems/web-client.md) — plugin composition.
- [Slots](../../../docs/subsystems/slots.md) — registration lifetimes.

-----

<a id="model-experience"></a>
## Model Experience

### Preset conversations

#### What the model sees

Browsing contributes no model input. The selected `agentPreset` owns the composition of subsequent conversations.

#### Token effect

No prompt text or tool schemas are added by this plugin.

#### KV Cache effect

A new conversation establishes its prefix from the selected preset; browsing does not change existing conversations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The directory is read-only; editing, copying, deleting, and employee-specific ownership are outside this plugin.
- Plugin rows describe composition, not a guaranteed list of tools available in every conversation.
- Workspaces must already exist. A failed preset selection may leave an unopened blank session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
