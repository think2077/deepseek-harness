/** Host HTTP bridge for browser-client RPC. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-credentials'
// Activates the webServer Context merge used below.
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PATH } from './api-path.ts'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.ts'
import { assertTrustedAuthority } from './api-request-trust.ts'
import { WebAccounts } from './accounts.ts'
import type { FeishuConfig } from './account-types.ts'
import { BrowserAuth } from './browser-auth.ts'
import { HostConnectionService } from './rpc-host.ts'
import { ConnectionRecoveryConfigSchema, resolveConnectionConfig, type ConnectionRecoveryConfig } from './recovery-config.ts'

export type {
  ConnectionFetchMethod,
  ConnectionFetchHandler,
  ConnectionFetchRoute,
  ConnectionIndexRequest,
  ConnectionIndexResponse,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcFailure,
  ConnectionRpcHandler,
  ConnectionRequestRejection,
  ConnectionRpcResult,
  ConnectionRequestBodyMode,
  ConnectionTrustRequest,
  ClientRequest,
  HostConnectionHandle,
  HostConnectionFetch,
  HostConnectionRpc,
  RpcMessage,
  ServerResponse,
} from './rpc.ts'
export { RpcId, transportError } from './rpc.ts'
export {
  clientRequestSchema,
  rpcErrorSchema,
  rpcIdSchema,
  rpcMessageSchema,
  rpcResultSchema,
  serverResponseSchema,
} from './rpc-schema.ts'
export type { FeishuConfig, WebUserId } from './account-types.ts'
export type { WebAccounts } from './accounts.ts'
export { HostConnectionService } from './rpc-host.ts'

export { API_PATH } from './api-path.ts'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024

function assertImageBodyCapacity(ctx: Context, maxRequestBodyBytes: number): void {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection. */
export const inject = ['credentials']

/** Browser authentication, request limits, and connection recovery configuration. */
export interface ConnectionConfig {
  /** Opt-in Feishu accounts with one fixed personal Workspace per user. */
  feishu?: FeishuConfig | undefined
  /** Browser recovery timing, injected into each served page. */
  recovery?: ConnectionRecoveryConfig
  /**
   * Authorities this deployment serves beyond loopback: exact `host:port`, or
   * port-less `host` matching any port. The /api trust fence refuses any
   * request whose Host is neither loopback nor listed here, so a
   * non-loopback (`0.0.0.0`) deployment must declare the names it is reached
   * by; the Web runtime derives LAN IP literals from an active all-interface
   * bind. An entry that is not a bare, canonical authority fails plugin load.
   */
  trustedHosts?: string[]
  /** Absolute browser-session lifetime in days. Default: 30. */
  cookieMaxAgeDays?: number
  /** Maximum buffered JSON body for every `/api` request. Default: 300 MiB. */
  maxRequestBodyBytes?: number
}

export const Config: z<ConnectionConfig> = z.object({
  feishu: z.union([z.object({
    publicOrigin: z.string().required(),
    appId: z.string().required(),
    appSecretEnv: z.string().default('FEISHU_APP_SECRET'),
    tenantKeys: z.array(String).default([]),
    workspaceRoot: z.string().required(),
    sessionMaxAgeDays: z.natural().min(1).max(24).default(7),
    stateMaxAgeSeconds: z.natural().min(1).default(300),
    maxPendingLogins: z.natural().min(1).default(1000),
    requestTimeoutMs: z.natural().min(1).max(2147483647).default(15000),
  }), z.const(undefined)]),
  recovery: ConnectionRecoveryConfigSchema.default({}),
  trustedHosts: z.array(String).default([]),
  cookieMaxAgeDays: z.natural().min(1).default(30),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
})

/**
 * Reject a Feishu deployment that cannot possibly sign anyone in, before
 * WebAccounts is constructed and leaves its dependants pending without a
 * readable reason.
 * @param ctx - Host context used for deployment warnings.
 * @param feishu - resolved Feishu deployment settings.
 * @param trustedHosts - authorities this deployment answers to.
 */
function assertFeishuDeployment(ctx: Context, feishu: FeishuConfig, trustedHosts: readonly string[]): void {
  let origin: URL
  try {
    origin = new URL(feishu.publicOrigin)
  } catch {
    throw new Error(`feishu.publicOrigin ${JSON.stringify(feishu.publicOrigin)} is not an absolute URL such as https://harness.example.com`)
  }
  if (!trustedHosts.includes(origin.host)) {
    throw new Error(`feishu.publicOrigin host "${origin.host}" is not in trustedHosts; add --trusted-host ${origin.host} or list it in the same patch`)
  }
  // `appSecretEnv` names a variable. Pasting the secret here is the common
  // mistake, and echoing the value would print the secret into the log.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(feishu.appSecretEnv)) {
    throw new Error('feishu.appSecretEnv must name an environment variable such as FEISHU_APP_SECRET; it must not contain the App Secret itself')
  }
  if (process.env[feishu.appSecretEnv] === undefined || process.env[feishu.appSecretEnv] === '') {
    throw new Error(`feishu.appSecretEnv names ${feishu.appSecretEnv}, but that environment variable is empty or unset; export ${feishu.appSecretEnv}=<App Secret> before starting`)
  }
  if ((feishu.tenantKeys ?? []).length === 0) {
    ctx.logger.warn('feishu.tenantKeys is empty: any tenant able to authorize this app may sign in; pin tenant_key for production')
  }
}

/**
 * Provides carrier-neutral RPC and Fetch registries. When `webServer` is
 * present, the plugin also mounts the `/api` browser transport with Host/Origin
 * checks and persistent browser authentication.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export async function apply(ctx: Context, config?: ConnectionConfig): Promise<void> {
  const recovery = resolveConnectionConfig(config?.recovery)
  // The Loader resolves schema defaults; hand-built test contexts may pass none.
  const trustedHosts = config?.trustedHosts ?? []
  const cookieMaxAgeDays = config?.cookieMaxAgeDays ?? 30
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  if (config?.feishu !== undefined) {
    const feishu = config.feishu
    assertFeishuDeployment(ctx, feishu, trustedHosts)
    await ctx.plugin(WebAccounts, feishu)
    const accounts = ctx.get('webAccounts')
    if (accounts === undefined) {
      throw new Error('feishu sign-in did not activate: WebAccounts needs storageDomain, workspaceRegistry, webServer, and sessions in the composition; read the error this entry reports first')
    }
    install(ctx, accounts)
  } else {
    install(ctx, await BrowserAuth.create(ctx.root, ctx.credentials, cookieMaxAgeDays))
  }

  function install(scope: Context, authentication: BrowserAuth | WebAccounts): void {
    const connection = new HostConnectionService(scope, trustedHosts, authentication)
    scope.inject(['webServer'], (webCtx) => {
      assertImageBodyCapacity(webCtx, maxRequestBodyBytes)
      webCtx.on('webserver/index-inject', (table) => {
        table.push({ kind: 'global', name: '__DSH_CONNECTION_RECOVERY__', value: recovery })
        if (authentication instanceof WebAccounts) {
          table.push({ kind: 'global', name: '__DSH_PERSONAL_WORKSPACE__', value: true })
          table.push({ kind: 'global', name: '__DSH_WEB_USER__', value: authentication.userId() })
          table.push({ kind: 'global', name: '__DSH_WEB_USER_NAME__', value: authentication.displayName() ?? '' })
        }
      })
      const fetchHandler = connection.createSharedFetchHandler(API_PATH)
      const route: WebRoute = {
        kind: 'prefix',
        path: API_PATH,
        handler: async (req, res) => {
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) {
            res.writeHead(rejection)
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
            return
          }
          await connection.runRequest(req, () => bridge(req, res, fetchHandler, maxRequestBodyBytes))
        },
      }
      webCtx.effect(() => webCtx.webServer.register(route), 'client-connection: /api route')
    })
    ctx.inject(['attachments'], (attachmentCtx) => {
      assertImageBodyCapacity(attachmentCtx, maxRequestBodyBytes)
    })
  }
}
