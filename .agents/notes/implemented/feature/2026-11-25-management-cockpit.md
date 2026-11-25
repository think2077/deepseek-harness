# Agent Note: Read-only management cockpit

Status: implemented

English | [中文](2026-11-25-management-cockpit.zh.md)

## Problem

Operators need one overview of project progress and digital-employee activity, but the current request does not justify another business entity, reporting store, approval engine, or workflow backend. Putting the overview inside project management would also couple two independently selectable product areas.

## Decision

The Web bundle mounts `@deepseek-ai/dsh-client-ui-management-cockpit` as an independent client plugin. It owns its project metadata subscription and joins that data with the standard Workspace, Session, and job snapshots at render time. The existing nine project-stage codes remain the only stage vocabulary.

The workflow dialog uses component-local state. Closing, cancelling, or saving closes the dialog and discards the draft; no Remote method, Session event, storage record, or browser persistence represents the draft.

## Alternatives considered

**Add the page to `ui-projects`.** This reused its subscription with less code, but made a presentation dashboard part of project metadata management and prevented independent composition.

**Add a reporting and workflow service.** This could provide durable aggregates and configuration, but it would add product behavior outside the requested presentation-only scope.

## Consequences

The plugin can be mounted, removed, and evolved without changing project management. Its values reflect existing client projections and inherit their visibility and update timing. “Results to review” stays zero, risk text is descriptive rather than model-generated, and workflow edits never survive a close.
