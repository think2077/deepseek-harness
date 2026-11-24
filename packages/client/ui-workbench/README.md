---
description: "Project-scoped pre-visit conversations and an LTC scenario map."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

My workbench maps business and operations scenarios across ten LTC nodes. Each node can list multiple assistants. Reception assistant starts a new project conversation with Business expert, while Pre-visit plan starts one with Solutions expert. Users without a current project choose a workspace first. Project preparation assistant remains a preview.

## Use this package

Browser plugin contributing My workbench above My reviews. The main panel presents ten illustrative business and operations nodes with stage filters. Each enabled assistant creates a fresh conversation in the current session's project workspace; without a current project it asks the user to choose an existing workspace. It applies that assistant's preset before opening the conversation. No prompt is submitted automatically. The Host must supply the preset; creation and selection failures remain visible on the workbench. A failed preset selection may leave an unopened blank session. A newer navigation prevents a pending launch from reopening the conversation.

Project preparation assistant opens a local preview; all other tools are disabled. Labels support English and Chinese. There is no plugin configuration. Client services for sessions, workspaces, presets, and workspace navigation are required.

## Model Experience

### Preset selection

#### What the model sees

The assistant's selected preset owns the model-facing composition. Opening the conversation submits no prompt.

#### Token effect

This plugin adds no prompt text or tool schemas; subsequent requests use the selected preset's token costs.

#### KV Cache effect

Each fresh conversation establishes its prefix from the selected preset. Existing conversations keep their composition and cache.

## Known Limitations and Deferred Work

Reception assistant and Pre-visit plan start real conversations. Workspaces must already exist, and the Host must supply `business-expert` and `solution-expert`, respectively. Other scenarios remain previews or disabled.
