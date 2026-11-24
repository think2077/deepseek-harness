/** Versioned account, browser-session, and Session ownership records. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WebUserId } from './account-types.ts'

const user = z.object({
  appId: z.string(), tenantKey: z.string(), openId: z.string(),
  displayName: z.string(), createdAt: z.number(),
})
const browserSession = z.object({ userId: z.string().transform(value => value as WebUserId), expiresAt: z.number() })
const owner = z.object({ userId: z.string().transform(value => value as WebUserId) })

/** Account domain; ownership is independent of Workspace membership and Session log generations. */
export const webAccountsSpec = defineDomain({
  name: 'web_accounts', version: 1,
  tables: {
    users: domainTable<WebUserId, z.infer<typeof user>>(user),
    web_sessions: domainTable<string, z.infer<typeof browserSession>>(browserSession),
    session_owners: domainTable<SessionId, z.infer<typeof owner>>(owner),
  },
})
