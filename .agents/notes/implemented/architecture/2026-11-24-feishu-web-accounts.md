# Agent Note: Feishu accounts in one Web Harness

Status: implemented

English | [中文](2026-11-24-feishu-web-accounts.zh.md)

## Problem

A shared Web deployment needs user-owned Sessions and a fixed personal Workspace without provisioning a separate Harness process or database for each user. The local launch-token cookie identifies permission to use an instance, not an individual account.

## Decision

Connection’s opt-in Feishu provider owns browser login, an asynchronous request identity, and the versioned JSON account domain. Session ownership is separate from Session JSONL and Workspace membership, so hiding or archiving a Session cannot transfer it. Browser creation reserves ownership before Session publication; failed creation retains an invisible same-user reservation. Background children inherit the durable parent owner, while unowned historical Sessions cannot be adopted by an API caller.

The public origin is explicit deployment configuration. An optional enterprise allowlist restricts authorized application users; omission or an empty list adds no enterprise restriction. OAuth state is short-lived, one-use, and browser-bound; the application secret remains in the server environment. Browser credentials are random opaque tokens stored only as digests. Logout revokes the durable record and closes its sockets without cancelling Agents. HTTP dispatch and every WebSocket iterator operation carry independent request identity; event fan-out captures the recipient account rather than reading whichever request emitted an event.

Each account has one directory under the configured Workspace root. API commands force this Workspace and refuse management mutations; the Client removes the corresponding controls. Settings, credential management, knowledge-base management, and preset authoring remain operator-owned. Browser preferences use account-prefixed keys. Model-visible account inputs are absent: user identity is access metadata, not prompt content.

This decision partially supersedes the logout and TLS-proxy deferral in [browser token authentication](2026-08-24-browser-token-authentication.md) for explicit Feishu deployments. That note remains active for local launch-token mode, and [browser request trust](2026-07-28-api-browser-trust-boundary.md) remains active for Host/Origin checks. Neither note is fully superseded or archived.

## Alternatives considered

Separate Harness processes or containers per user provide stronger execution isolation but introduce a runtime allocator outside the requested single-instance deployment. A shared anonymous cookie plus Client-side list filtering cannot establish durable ownership or protect guessed Session ids. Adding ownership to Session headers would couple account rollout to released log generations; the account domain keeps that relationship outside the conversation format. Workspace membership alone cannot own authorization because archive and grouping operations change it independently.

## Consequences

The deployment uses one existing JSON backend and retains existing Session logs and attachments. Single-file rewriting is suitable for a small single-process deployment; a larger account or Session population can route the same domain to another backend. There is no legacy migration or implicit first-user ownership.

This mode separates application data delivery, not operating-system execution. Shell commands and tools share a Host identity and can access paths outside the personal directory; operators must account for that explicitly when choosing who may sign in. Filesystem and process isolation remain outside this deployment’s guarantee.
