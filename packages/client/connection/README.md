---
description: "Browser-host wire layer for the web GUI: Remote RPC, event-stream delivery with reconnect, exact Fetch routes, the /api HTTP bridge, and the browser-trust fence."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection

English | [中文](README.zh.md)

## Summary

The package carries browser-to-Host Remote calls, exact Fetch responses, and connection generations. The Client plugin mounts `ctx.connection` with current-page loopback state, generic RPC, the active generation and its Host facts, observable recovery state, an immediate reconnect command, and the registration point for one generation source. A generation becomes visible when its source reports ready; source completion, failure, withdrawal, or an explicit stop clears it before `ConnectionController` applies its retry policy.

## Table of Contents

- [Use this package](#use-this-package)
- [Browser authentication and request trust](#browser-authentication-and-request-trust)
- [Feishu personal Workspaces](#feishu-personal-workspaces)
- [Connection generation](#connection-generation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The browser uses HTTP POST for Remote unary calls. API Gateway owns the `/api/remote.mux` WebSocket and its logical streams; shell-owned compositions provide equivalent Remote streams through `connection.rpc.open` without opening a WebSocket. The browser plugin reads the page transport, recovery settings, and location, then delegates to `installConnection(ctx, options)`. A composition that owns its carrier may call the same installer directly; the whole-client test tier does so. Each invocation creates one Context-owned service, so several Client trees can use different carriers in one realm. The Host half always provides the carrier-neutral RPC and exact `GET`/`HEAD`/`POST` route registries. When a Web carrier is present it also owns the sole `/api` route, Fetch bridge, browser authentication, and Host/Origin checks; a shell-owned carrier dispatches the shared Fetch handler directly. Each exact route declares buffered or streaming request-body handling before the bridge reads any bytes. Typert Gateway claims generated Remote endpoints, feature packages register non-JSON responses such as Session-log downloads and raw file uploads, and unclaimed requests return 404. Loopback hostname classification remains package-internal to the browser-facing Client state. Browser raw-body transfer is provided by [`dsh-client-file-upload`](../file-upload/README.md).

-----

<a id="browser-authentication-and-request-trust"></a>
## Browser authentication and request trust

Every Host RPC method and WebSocket stream requires one browser session; there is no method-specific loopback tier. Each process mints a random launch token. `dsh-web-app` prints and opens the ordinary root URL with `?token=...`; `frontend-static` delegates root and index requests to `ctx.connection.authorizeIndex`, which accepts that token only on `GET /`, writes an authority-bound signed cookie, and redirects to clean `/`. A missing, expired, malformed, or wrong-authority cookie returns 401 before RPC dispatch. Static assets remain public. The HTTP carrier accepts no query token outside the root exchange and no Authorization-header token.

The cookie signing secret is the owner-scoped `client-connection/browser-session` grant record in `ctx.credentials`. The local provider persists it in `$DSH_HOME/.credentials.yaml`; `BrowserAuth` loads or creates the record during Connection activation and retains the secret in memory, so request authentication is synchronous. Deleting or replacing the record takes effect on the next Connection activation. Cookies carry an absolute issue/expiry interval, defaulting to 30 days through `cookieMaxAgeDays`, and bind the normalized hostname plus port in both their deterministic name and signed payload. They are host-only, `Path=/`, `HttpOnly`, and `SameSite=Strict`; they deliberately omit `Secure` because the shipped server uses loopback HTTP.

Before authentication, every request still passes `src/api-request-trust.ts`. Its `Host` must be loopback or match a `trustedHosts` entry: exact on `host:port`, any port on port-less entries, both sides WHATWG-normalized. An attached `Origin` must equal that Host and `sec-fetch-site: cross-site` is refused. Malformed configured authorities fail plugin load. These checks defend DNS rebinding and cross-site browser requests; they never establish identity. A failed Host/Origin check returns 403, while a trusted but unauthenticated request returns 401. `dsh web --host 0.0.0.0` remains unsupported. Decision records: [browser request trust](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.md) and [browser token authentication](../../../.agents/notes/implemented/architecture/2026-08-24-browser-token-authentication.md).


<a id="feishu-personal-workspaces"></a>
## Feishu personal Workspaces

Set `connection.config.feishu` in an explicit Web profile overlay to replace local launch-token authentication with Feishu login. This mode requires the profile's storage domain, Session persistence, Workspace registry, and Web server. A single Harness serves all users; API ownership and browser presentation are isolated, while tools and shell commands still share the Host operating-system identity. Existing Sessions without ownership records remain invisible and cannot be adopted through the API.

Create a Feishu application, enable its web login capability, allow the intended members, and register `https://harness.example.com/auth/feishu/callback` as its redirect URL. Supply the application secret through `FEISHU_APP_SECRET` in the server environment. The server uses the [Feishu OAuth token API](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token-v3) and discards the Feishu token after reading identity; it requests no offline access.

Save this overlay as `/absolute/feishu.patch.yml`, replacing the example origin, application id, and directory:

```yaml
- id: connection
  config:
    trustedHosts: [harness.example.com]
    feishu:
      publicOrigin: https://harness.example.com
      appId: cli_your_application
      appSecretEnv: FEISHU_APP_SECRET
      workspaceRoot: /var/lib/dsh/workspaces
```

Start with `pnpm dsh --profile web --patch /absolute/feishu.patch.yml`. Terminate HTTPS at a reverse proxy forwarding HTTP and WebSocket requests to the loopback server, preserving the original `Host` and `Origin` headers. `publicOrigin` must be a canonical origin and its exact authority must occur in `trustedHosts`. No forwarding headers establish identity. The printed URL carries no launch token in this mode.

`GET /auth/login` offers Feishu login. The callback checks a short-lived, one-use state bound to an HttpOnly browser cookie, checks the enterprise allowlist when configured, and creates or reuses a stable internal account and its fixed directory. The internal id derives from the application, tenant, and Feishu open id; display-name changes update the Workspace title without moving files. The sidebar shows only that user's Workspace and Sessions, removes Workspace creation and management, and puts the employee name in the foot with a Settings / Sign-out menu. Models, plugin inventory, knowledge-base management, and preset authoring remain operator-owned; theme and language preferences stay browser-local.

| Setting | Default | Meaning |
|---|---|---|
| `tenantKeys` | `[]` | Optional enterprise allowlist; omitted or empty allows users authorized by the Feishu application |
| `sessionMaxAgeDays` | 7 | Absolute browser login lifetime, 1–24 days |
| `stateMaxAgeSeconds` | 300 | OAuth attempt lifetime |
| `maxPendingLogins` | 1000 | Concurrent pending attempts before HTTP 429 |
| `requestTimeoutMs` | 15000 | Deadline for each Feishu HTTP request |

The default JSON backend stores the `web_accounts` domain in `$DSH_HOME/storages/web_accounts.json`: `users` stores Feishu identity and display name, `web_sessions` stores login-token digests and expiry, and `session_owners` maps Session ids to internal user ids. The Workspace domain retains directory records and membership; Session JSONL and attachment storage keep their existing locations. Raw browser login tokens, application secrets, and Feishu tokens are absent from the account domain. Expired browser records are removed at startup and successful login; OAuth attempts exist only in memory and restarting abandons them.

Ownership is reserved durably before a browser Session is created. Failed creation can leave an invisible reservation for a same-user retry; another user cannot adopt it. Forks reserve the new id for the source's authenticated user, and background children inherit their durable parent's owner. HTTP reads, commands, files, exports, search results, control baselines, and selected Remote events are filtered or authorized before delivery. Logout deletes the browser record and terminates its WebSocket connections; it does not cancel running Agents. Browser store keys include the internal user id. This is application-level separation, not filesystem or process confinement.

<a id="connection-generation"></a>
## Connection generation

API Gateway Client registers the internal `$events` logical stream as the sole generation source, independently of whether any `$on` listener exists. The Host attaches all incremental listeners in the API Remotes source factory, then sends one `{ type: 'ready', clientId, host: { home } }` item before events. `ConnectionController` publishes that generation and calls `onConnected` only after the ready item arrives, so baseline acquisition cannot race ahead of incremental observation.

An ended `$events` stream, a Remote stream error, a non-ready opening item, or a malformed event item invalidates the current generation. A pending handshake logs a slow-Host warning after 3 seconds and logs the readiness timeout and aborts after 15 seconds by default, including time spent waiting for the physical socket. The source must stop delivery, release resources, and settle after cancellation before a replacement starts; late readiness from a cancelled source cannot publish a generation. While the browser reports network availability, the controller publishes `connecting` and retries with 50%–100% jitter under caps of 500ms, 1s, 2s, 4s, 8s, and 10s, continuing at the final cap until recovery. Every retry asks Gateway to replace the physical WebSocket once and reopens `$events`. The [continuous recovery decision](../../../.agents/notes/implemented/bug-fix/2026-09-05-continuous-client-recovery.md) owns the deadlines and retry policy.

`ctx.connection.reconnect()` interrupts active work, resets the sequence, and starts retry 1 immediately. Browser `offline` aborts active work, publishes `disconnected`, and suspends automatic attempts; the next `online` transition resets the sequence and starts at the 500ms tier. Only a ready item publishes `connected`. Gateway mux owns no independent retry schedule.

Set the Host Connection row's `config.recovery` to override retry caps, the growth factor, or handshake warning and cancellation times; the [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-connection) lists accepted fields. The Host validates these values and injects them into each served page. The Client validates the bootstrap data before providing Connection and uses those defaults when Gateway starts its loop; explicit `start()` timing overrides take precedence. The growth factor must be finite and at least one. Readiness, failure, cancellation, or a hard deadline that occurs before the warning cancels that warning. Reload the page after changing Host recovery configuration.


<a id="model-experience"></a>
## Model Experience

None, as the wire consumer layer moves already-composed messages between browser and host; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Buffered `/api` routes retain each request body in memory** — `maxRequestBodyBytes` (default 300 MiB, sized for the default 200 MiB aggregate image limit after base64 expansion plus envelope headroom) bounds ordinary image and RPC envelopes. Opt-in streaming routes receive backpressured chunks and bypass the aggregate cap; route implementations own persistence, cancellation, and any storage quota.
- **The local-mode browser cookie is not marked `Secure`** — loopback HTTP is the shipped transport, so exposing the same authority over plaintext networking can expose the bearer cookie in transit.
- **Local token mode has no logout operation** — clearing the browser cookie ends one browser session; deleting the owner credential record and restarting `dsh` revokes every session.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Browser-session verification reads the credential record asynchronously at the request that authorizes work, while the credentials companion owns record commit-event lifetime. Stream/reconnect sequencing and rpcId round-trip discipline are exercised directly by behavior specs, and route register/dispose symmetry is audited by the webserver companion.
