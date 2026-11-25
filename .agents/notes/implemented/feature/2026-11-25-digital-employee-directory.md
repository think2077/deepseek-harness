# Agent Note: Digital employee directory over presets

Status: implemented

English | [中文](2026-11-25-digital-employee-directory.zh.md)

## Problem

Users need to discover assistants and inspect their capabilities before starting a project conversation. Preset selection in settings does not provide a dedicated browsing entry.

## Decision

A separate `ui-digital-employees` browser plugin registers Digital employees immediately above My reviews. The preset roster remains the identity source. Cards expose metadata and availability; details read the existing Host plugin inventory without mounting agents or returning configuration values. Composition rows show enablement rather than promising a fixed tool inventory.

The workspace navigation package owns `createPresetSessionLauncher`, shared by the directory and workbench. Launching creates a fresh workspace conversation and selects the chosen preset before opening it. Without a current project, the user chooses an existing workspace. Later navigation supersedes a pending launch, and unloading the plugin cancels its navigation authority. The [workbench decision](2026-11-19-ltc-workbench.md) retains its scenario-specific ownership; the directory offers the complete discovered roster.

## Alternatives considered

**A separate employee table** duplicates preset identities without a current requirement for independent ownership or status. Stable employee identities can be introduced when multiple employees must share a preset.

**Mounting every preset to inspect tools** activates plugins during browsing. The existing inventory can describe configured rows without creating sessions or activating unmounted compositions.

## Consequences

The feature adds no persistence types or Host APIs. Existing preset management remains separate. Composition inspection does not expose persona text, knowledge contents, or a per-session effective tool list. Failed selection can leave an unopened blank session. Loader-composition tests cover localized navigation, launch ordering, failures, supersession, and disposal; component tests cover browsing, search, details, workspace selection, and empty/error states.
