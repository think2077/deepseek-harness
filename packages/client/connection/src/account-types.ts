/** Browser-safe account identifiers and deployment configuration. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable internal account identifier, independent of display names. */
export type WebUserId = Branded<'WebUserId'>

/** Feishu login and fixed personal workspace deployment settings. */
export interface FeishuConfig {
  /** Canonical public HTTPS origin; loopback HTTP is accepted for development. */
  publicOrigin: string
  /** Feishu application identifier. */
  appId: string
  /** Environment variable containing the server-side application secret. */
  appSecretEnv: string
  /** Optional enterprise allowlist; omitted or empty permits every user authorized by this Feishu application. */
  tenantKeys?: string[]
  /** Absolute parent directory for internally named user directories. */
  workspaceRoot: string
  /** Absolute login lifetime in days. */
  sessionMaxAgeDays: number
  /** OAuth attempt lifetime in seconds. */
  stateMaxAgeSeconds: number
  /** Maximum simultaneous pending login attempts. */
  maxPendingLogins: number
  /** Deadline for each Feishu HTTP request in milliseconds. */
  requestTimeoutMs: number
}
