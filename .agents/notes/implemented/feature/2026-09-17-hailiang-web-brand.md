# Agent Note: Hailiang Web brand

Status: implemented

English | [中文](2026-09-17-hailiang-web-brand.zh.md)

## Problem

The generic local Web build labels the sidebar as DSH and exposes build metadata that does not identify the Digital Employee Collaboration Platform.

## Decision

`dsh-client-ui-brand-hailiang` occupies the existing root-scoped sidebar and empty-conversation brand slots with the supplied Hailiang artwork and the localized product name `数字员工协同平台`. The Web bundle composes this package in place of the official DSH brand occupant. `DSH_CLIENT_TITLE` controls the independent browser document title.

## Alternatives considered

**Edit the sidebar fallback.** Rejected because the shell owns generic fallback behavior for unbranded deployments, while a deployment identity belongs in a replaceable slot occupant.

**Reuse the official-brand package.** Rejected because its build-profile gate and DSH artwork make it an incorrect owner for the Hailiang deployment.

## Consequences

The expanded and collapsed sidebar, plus the empty conversation, share the Hailiang identity without changing sidebar navigation or layout ownership. The supplied horizontal artwork is split into a compact mark and an expanded wordmark asset. Deployments that require another identity can replace this package through the same slots.
