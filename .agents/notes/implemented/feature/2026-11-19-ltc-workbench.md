# Agent Note: LTC workbench conversations

Status: implemented

English | [中文](2026-11-19-ltc-workbench.zh.md)

## Problem

Project scenarios need a shared entry that starts a conversation with the intended workspace and preset without changing an existing conversation.

## Decision

The workbench is a separate browser plugin registered above knowledge reviews. Its ten illustrative process nodes cover business development and operations, and each node owns a list of assistants so one stage can present multiple capabilities. Reception assistant selects `business-expert`, while Pre-visit plan selects `solution-expert`. Each enabled assistant creates a fresh session in the current session's workspace; when no current project exists, the user chooses an existing workspace before creation. The selected assistant's preset is retained across that choice and applied before the conversation opens. Existing blank sessions are not reused, so launching a scenario never changes another conversation's preset. Project preparation assistant opens a local preview; remaining capabilities use disabled native buttons. Availability does not represent project completion. Stage filters affect presentation only, and all product labels belong to typed Chinese and English dictionaries.

Creation and preset selection reuse existing Host APIs. Preset ids belong to assistant configuration rather than plugin configuration. Missing or invalid presets fail visibly; selection failure may leave an unopened blank session. Opening the conversation does not submit a prompt. Later navigation supersedes pending launches, while an in-flight guard prevents repeated clicks from creating duplicate sessions.

## Alternatives considered

Reusing a blank workspace session could change a conversation prepared for another scenario. Automatically choosing the most recent workspace could place project files in an unrelated directory. Both are avoided by fresh creation and explicit workspace selection when no current project exists.

## Consequences

Component tests cover workspace selection and cancellation, current-project routing, empty workspace lists, failure and retry, stage filtering, and preview behavior. The Loader composition pins sidebar output, fresh-session creation, the preset selected before navigation, failed selection, superseded navigation, and registration disposal. No persistence types change.
