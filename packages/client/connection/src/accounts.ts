/** Feishu browser authentication and durable personal resource ownership. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { webAccountsSpec } from './account-store.ts'
import type { FeishuConfig, WebUserId } from './account-types.ts'
import { loginPage } from './feishu-login-page.ts'
import type { ConnectionIndexRequest, ConnectionIndexResponse, ConnectionTrustRequest } from './rpc.ts'

interface LoginContext { readonly digest: string; readonly userId: WebUserId }
interface LoginAttempt { readonly binding: string; readonly expiresAt: number }

const feishuToken = z.object({ access_token: z.string().min(1) })
const feishuUser = z.object({ code: z.literal(0), data: z.object({
  open_id: z.string().min(1), tenant_key: z.string().min(1), name: z.string().min(1),
}) })
const DAY = 86_400_000
const COOKIE = 'dsh-user'
const STATE_COOKIE = 'dsh-oauth'

function secret(): string { return randomBytes(32).toString('base64url') }
function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }
function header(request: ConnectionTrustRequest, name: string): string | undefined {
  if (request.headers instanceof Headers) return request.headers.get(name) ?? undefined
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}
function cookie(request: ConnectionTrustRequest, name: string): string | undefined {
  const values = (header(request, 'cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${name}=`))
  return values.length === 1 ? values[0]?.slice(name.length + 1) : undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional Feishu account policy installed by Connection's feishu configuration. */
    webAccounts: WebAccounts
  }
}

/** Owns per-request identity, login routes, and durable Session ownership. */
export class WebAccounts extends Service {
  static inject = ['storageDomain', 'workspaceRegistry', 'webServer', 'sessions']
  private domain!: Domain<typeof webAccountsSpec>
  private readonly current = new AsyncLocalStorage<LoginContext>()
  private readonly attempts = new Map<string, LoginAttempt>()
  private readonly connections = new Map<string, Set<AbortController>>()
  private operations: Promise<unknown> = Promise.resolve()
  private readonly lifetime = new AbortController()
  private readonly requests = new Set<Promise<void>>()
  private workspaceRoot: string
  private readonly allowedTenants: readonly string[]
  private readonly appSecret: string
  private readonly origin: URL

  /**
   * @param ctx - account plugin context with JSON domain and Workspace services.
   * @param config - validated deployment settings.
   */
  constructor(ctx: Context, readonly config: FeishuConfig) {
    super(ctx, 'webAccounts')
    this.origin = new URL(config.publicOrigin)
    this.workspaceRoot = config.workspaceRoot
    if (this.origin.origin !== config.publicOrigin || this.origin.username || this.origin.password
      || (this.origin.protocol !== 'https:' && !(this.origin.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(this.origin.hostname)))) {
      throw new Error('feishu.publicOrigin must be a canonical HTTPS origin (loopback HTTP is allowed)')
    }
    if (!isAbsolute(config.workspaceRoot)) throw new Error('feishu.workspaceRoot must be absolute')
    this.allowedTenants = config.tenantKeys ?? []
    const appSecret = process.env[config.appSecretEnv]
    if (!appSecret) throw new Error(`missing Feishu secret environment variable ${config.appSecretEnv}`)
    this.appSecret = appSecret
  }

  protected async [Service.init](): Promise<void> {
    this.domain = await this.ctx.storageDomain.open(webAccountsSpec)
    this.ctx.effect(() => async () => {
      this.lifetime.abort()
      for (const controllers of this.connections.values()) for (const controller of controllers) controller.abort()
      this.attempts.clear()
      await Promise.allSettled(this.requests)
      await this.operations.catch(() => undefined)
      await this.domain.close()
    }, 'web-accounts: storage and login lifetimes')
    await mkdir(this.config.workspaceRoot, { recursive: true, mode: 0o700 })
    this.workspaceRoot = await realpath(this.config.workspaceRoot)
    for (const [id, user] of this.domain.table('users').entries()) {
      if (digest(JSON.stringify([user.appId, user.tenantKey, user.openId])) !== id) throw new Error('invalid stored Web account identifier')
    }
    // A removed account leaves its logins and Session ownership behind. Those
    // references grant nothing without a user row, so drop them instead of
    // refusing to start: the store is repairable without hand editing JSON.
    const orphanLogins = [...this.domain.table('web_sessions').entries()]
      .filter(([, record]) => this.domain.table('users').get(record.userId) === undefined)
    if (orphanLogins.length > 0) {
      this.ctx.logger.warn(`dropped ${String(orphanLogins.length)} browser login session(s) of removed accounts`)
      for (const [key] of orphanLogins) await this.domain.table('web_sessions').delete(key)
    }
    const orphanOwners = [...this.domain.table('session_owners').entries()]
      .filter(([, record]) => this.domain.table('users').get(record.userId) === undefined)
    if (orphanOwners.length > 0) {
      this.ctx.logger.warn(`dropped ${String(orphanOwners.length)} Session ownership record(s) of removed accounts`)
      for (const [key] of orphanOwners) await this.domain.table('session_owners').delete(key)
    }
    await this.expireSessions()
    this.ctx.effect(() => this.ctx.webServer.register({ kind: 'prefix', path: '/auth', handler: async (req, res) => {
      const operation = this.handleAuth(req, res)
      this.requests.add(operation)
      try { await operation } catch (error) {
        this.ctx.logger.warn(`Feishu login failed: ${error instanceof Error ? error.name : 'Error'}`)
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('Feishu sign-in failed. Please try again. / 飞书登录失败，请重试。')
      } finally { this.requests.delete(operation) }
    } }), 'web-accounts: auth routes')
    this.ctx.on('session/created', (session) => {
      const parent = session.header.parentSession
      if (parent === undefined) return
      const owner = this.domain.table('session_owners').get(parent)
      if (owner === undefined) return
      // Visibility starts only after the ownership record is durable.
      void this.claimSession(session.id, owner.userId).catch((error: unknown) => {
        this.ctx.logger.error(`Session ownership write failed: ${String(error)}`)
      })
    })
  }

  /**
   * Run an HTTP or iterator operation under the browser's authenticated account.
   * @param request - original browser headers.
   * @param operation - operation whose asynchronous descendants inherit identity.
   * @returns the operation result; rejects missing or revoked login state.
   */
  run<T>(request: ConnectionTrustRequest, operation: () => T): T {
    const login = this.login(request)
    if (login === undefined) throw new RemoteError('gateway/bad-request', 'authentication required', {})
    return this.current.run(login, operation)
  }

  /**
   * Require a non-expired, non-revoked account in the current request.
   * @returns the internally assigned user identifier.
   */
  userId(): WebUserId {
    const login = this.current.getStore()
    const stored = login === undefined ? undefined : this.domain.table('web_sessions').get(login.digest)
    if (stored === undefined || stored.expiresAt <= Date.now() || login === undefined) {
      throw new RemoteError('gateway/bad-request', 'authentication required', {})
    }
    return login.userId
  }

  /**
   * Feishu display name of the authenticated account.
   * Client surfaces greet the signed-in employee, so the index injects it
   * alongside the user id instead of leaving them a second round trip.
   * @returns the employee name, or undefined when the row is gone.
   */
  displayName(): string | undefined {
    return this.domain.table('users').get(this.userId())?.displayName
  }

  /**
   * Whether the authenticated account administers this deployment.
   * The flag is deployment state (it gates the shared model and plugin
   * configuration), so it is granted once — to the first account — and
   * afterwards only by editing the stored record.
   * @returns true for the administrator; unknown accounts read as false.
   */
  admin(): boolean {
    return this.domain.table('users').get(this.userId())?.admin === true
  }

  /**
   * Test request authentication without changing asynchronous identity.
   * @param request - browser request headers.
   * @returns whether a live browser login exists for the configured public host.
   */
  isAuthenticated(request: ConnectionTrustRequest): boolean { return this.login(request) !== undefined }

  /**
   * Authenticate an index response or redirect to the sign-in page.
   * @param request - index request.
   * @param response - response owned on a redirect or rejection.
   * @returns whether the application index may be served.
   */
  authorizeIndex(request: ConnectionIndexRequest, response: ConnectionIndexResponse): boolean {
    if (header(request, 'host') !== this.origin.host) {
      response.writeHead(403); response.end(); return false
    }
    if (this.isAuthenticated(request)) return true
    response.writeHead(303, { location: '/auth/login', 'cache-control': 'no-store' }); response.end(); return false
  }

  /**
   * Attach an upgrade connection to logout, expiry, and plugin teardown.
   * @param request - browser upgrade headers.
   * @param operation - callback using a signal cancelled when authentication ends.
   * @returns callback result; callback owns removal by settling its returned promise.
   */
  async connection<T>(request: ConnectionTrustRequest, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const login = this.login(request)
    if (login === undefined) throw new Error('authentication required')
    const record = this.domain.table('web_sessions').get(login.digest)
    if (record === undefined) throw new Error('authentication required')
    const controller = new AbortController()
    const controllers = this.connections.get(login.digest) ?? new Set<AbortController>()
    controllers.add(controller); this.connections.set(login.digest, controllers)
    const timer = setTimeout(() => { controller.abort() }, Math.min(record.expiresAt - Date.now(), 2_147_483_647))
    timer.unref()
    try { return await operation(controller.signal) } finally {
      clearTimeout(timer); controllers.delete(controller)
      if (controllers.size === 0) this.connections.delete(login.digest)
    }
  }

  /**
   * Check a Session against the current account; unknown and foreign identifiers fail identically.
   * @param sessionId - Session selected by an API caller.
   */
  assertSession(sessionId: SessionId): void {
    if (!this.ownsSession(sessionId)) throw new RemoteError('session/not-found', 'session not found', { sessionId })
  }

  /**
   * Test a Session against the current account, including background-created children after commit.
   * @param sessionId - Session identifier.
   * @returns whether the current account owns the durable record.
   */
  ownsSession(sessionId: SessionId): boolean { return this.ownerOf(sessionId) === this.userId() }

  /**
   * Read durable ownership without requiring a browser request.
   * @param sessionId - Session identifier.
   * @returns its account, or undefined for legacy/uncommitted Sessions.
   */
  ownerOf(sessionId: SessionId): WebUserId | undefined { return this.domain.table('session_owners').get(sessionId)?.userId }

  /**
   * Commit ownership before returning or publishing a new Session.
   * @param sessionId - newly created or idempotently retried Session.
   * @param userId - authenticated creator or durable parent owner.
   * @returns resolution after durable ownership publication.
   */
  claimSession(sessionId: SessionId, userId: WebUserId): Promise<void> {
    return this.enqueue(async () => {
      const table = this.domain.table('session_owners')
      const existing = table.get(sessionId)
      if (existing !== undefined && existing.userId !== userId) throw new Error('Session already has another owner')
      if (existing === undefined) await table.put(sessionId, { userId })
    })
  }

  /**
   * Reserve a new browser Session identifier without adopting legacy or foreign data.
   * @param sessionId - requested fresh identifier or same-account retry.
   * @returns resolution after durable reservation.
   */
  reserveSession(sessionId: SessionId): Promise<void> {
    const userId = this.userId()
    return this.enqueue(async () => {
      const table = this.domain.table('session_owners')
      const owner = table.get(sessionId)
      if (owner !== undefined) { this.assertSession(sessionId); return }
      if (this.ctx.sessions.get(sessionId) !== undefined
        || await this.ctx.get('sessionPersistence')?.stat(sessionId) !== undefined) {
        throw new RemoteError('session/not-found', 'session not found', { sessionId })
      }
      await table.put(sessionId, { userId })
    })
  }

  /**
   * Resolve the current account's sole Workspace.
   * @returns the previously provisioned fixed-directory Workspace.
   */
  workspace(): Workspace {
    const userId = this.userId()
    const path = join(this.workspaceRoot, userId)
    const workspace = this.ctx.workspaceRegistry.list().find(value => value.path === path)
    if (workspace === undefined) throw new Error('personal Workspace is unavailable')
    return workspace
  }

  /**
   * Reject Workspace mutations that the personal-space deployment does not offer.
   * @returns never; every call throws the fixed-Workspace rejection.
   */
  rejectWorkspaceMutation(): never { throw new RemoteError('gateway/bad-request', 'personal Workspace is fixed', {}) }

  /**
   * Restrict a canonical filesystem path to the personal Workspace for browser file routes.
   * @param path - canonical path returned by the owning filesystem provider.
   * @returns whether the path is inside the fixed personal directory.
   */
  ownsPath(path: string): boolean {
    const delta = relative(this.workspace().path, path)
    return delta === '' || (delta !== '..' && !delta.startsWith('..' + sep) && !isAbsolute(delta))
  }

  private login(request: ConnectionTrustRequest): LoginContext | undefined {
    if (header(request, 'host') !== this.origin.host) return undefined
    const token = cookie(request, COOKIE)
    if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined
    const key = digest(token)
    const record = this.domain.table('web_sessions').get(key)
    const expected = header(request, 'x-dsh-web-user')
    return record === undefined || record.expiresAt <= Date.now()
      || (expected !== undefined && expected !== record.userId) ? undefined : { digest: key, userId: record.userId }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.then(operation)
    this.operations = next.catch(() => undefined)
    return next
  }

  private cookie(name: string, value: string, maxAge: number): string {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${this.origin.protocol === 'https:' ? '; Secure' : ''}`
  }

  private async expireSessions(): Promise<void> {
    for (const [key, record] of this.domain.table('web_sessions').entries()) {
      if (record.expiresAt <= Date.now()) await this.domain.table('web_sessions').delete(key)
    }
  }

  private async handleAuth(request: ConnectionIndexRequest, response: ConnectionIndexResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.origin)
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    if (header(request, 'host') !== this.origin.host) { response.writeHead(403, headers); response.end(); return }
    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      if (header(request, 'origin') !== this.origin.origin || header(request, 'sec-fetch-site') === 'cross-site') {
        response.writeHead(403, headers); response.end(); return
      }
      const login = this.login(request)
      if (login !== undefined) {
        await this.domain.table('web_sessions').delete(login.digest)
        for (const controller of this.connections.get(login.digest) ?? []) controller.abort()
      }
      response.writeHead(303, { ...headers, location: '/auth/login', 'set-cookie': this.cookie(COOKIE, '', 0) }); response.end(); return
    }
    if (request.method !== 'GET') { response.writeHead(405, headers); response.end(); return }
    if (url.pathname === '/auth/login') {
      response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" })
      response.end(loginPage()); return
    }
    if (url.pathname === '/auth/feishu') {
      for (const [key, attempt] of this.attempts) if (attempt.expiresAt <= Date.now()) this.attempts.delete(key)
      if (this.attempts.size >= this.config.maxPendingLogins) { response.writeHead(429, headers); response.end(); return }
      const state = secret(); const binding = secret()
      this.attempts.set(state, { binding, expiresAt: Date.now() + this.config.stateMaxAgeSeconds * 1000 })
      const target = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize')
      target.search = new URLSearchParams({ client_id: this.config.appId, redirect_uri: `${this.origin.origin}/auth/feishu/callback`, response_type: 'code', state }).toString()
      response.writeHead(303, { ...headers, location: target.href, 'set-cookie': this.cookie(STATE_COOKIE, binding, this.config.stateMaxAgeSeconds) }); response.end(); return
    }
    if (url.pathname === '/auth/feishu/callback') {
      const state = url.searchParams.get('state') ?? ''
      const attempt = this.attempts.get(state)
      this.attempts.delete(state)
      const code = url.searchParams.get('code')
      if (attempt === undefined || attempt.expiresAt <= Date.now() || attempt.binding !== cookie(request, STATE_COOKIE) || !code) {
        response.writeHead(400, headers); response.end('Invalid or expired login attempt. / 登录已失效，请重试。'); return
      }
      const tokenResponse = await fetch('https://accounts.feishu.cn/oauth/v3/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.config.appId,
          client_secret: this.appSecret, code, redirect_uri: `${this.origin.origin}/auth/feishu/callback` }).toString(),
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      })
      if (!tokenResponse.ok) throw new Error('Feishu token request failed')
      const token = feishuToken.parse(await tokenResponse.json())
      const userResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      })
      if (!userResponse.ok) throw new Error('Feishu user request failed')
      const profile = feishuUser.parse(await userResponse.json()).data
      if (this.allowedTenants.length > 0 && !this.allowedTenants.includes(profile.tenant_key)) { response.writeHead(403, headers); response.end('Tenant access denied. / 当前企业无权访问。'); return }
      const userId = digest(JSON.stringify([this.config.appId, profile.tenant_key, profile.open_id])) as WebUserId
      const path = join(this.workspaceRoot, userId)
      await this.enqueue(async () => {
        await mkdir(path, { recursive: true, mode: 0o700 })
        if (await realpath(path) !== path) throw new Error('personal Workspace must be a canonical directory')
        const workspace = await this.ctx.workspaceRegistry.create(path, `${profile.name}的工作空间`)
        if (workspace.title !== `${profile.name}的工作空间`) await workspace.setTitle(`${profile.name}的工作空间`)
        const previous = this.domain.table('users').get(userId)
        // The first account this deployment ever admits administers the shared
        // model and plugin configuration; every later account is an employee.
        // Re-login must keep what the record already carries.
        const admin = previous?.admin ?? this.domain.table('users').size === 0
        await this.domain.table('users').put(userId, { appId: this.config.appId, tenantKey: profile.tenant_key,
          openId: profile.open_id, displayName: profile.name, createdAt: previous?.createdAt ?? Date.now(), admin })
      })
      const browserToken = secret()
      const old = this.login(request)
      if (old !== undefined) {
        await this.domain.table('web_sessions').delete(old.digest)
        for (const controller of this.connections.get(old.digest) ?? []) controller.abort()
      }
      await this.expireSessions()
      await this.domain.table('web_sessions').put(digest(browserToken), { userId, expiresAt: Date.now() + this.config.sessionMaxAgeDays * DAY })
      response.writeHead(303, { ...headers, location: '/', 'set-cookie': this.cookie(COOKIE, browserToken, this.config.sessionMaxAgeDays * 86400) }); response.end(); return
    }
    response.writeHead(404, headers); response.end()
  }
}
