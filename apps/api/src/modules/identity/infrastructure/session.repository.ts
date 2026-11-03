import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, pool } from '../../../infrastructure/database/client'
import { authSessions, authTokens, userRoles, users } from '../../../infrastructure/database/schema'
import { hash } from '../../../shared/security/hash'
import { SESSION_SECONDS, WEB_ORIGIN } from '../../../shared/config'

export async function findUserForSessionToken(token: string | null) {
  if (!token) return null
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      csrfToken: authSessions.csrfToken,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.sessionTokenHash, hash(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, sql`now()`),
        eq(users.status, 'active'),
      ),
    )
    .limit(1)
  if (!row) return null
  const roles = await db
    .select({ role: userRoles.role, pharmacyId: userRoles.pharmacyId })
    .from(userRoles)
    .where(eq(userRoles.userId, row.id))
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    email_verified_at: row.emailVerifiedAt?.toISOString() ?? null,
    phone_verified_at: row.phoneVerifiedAt?.toISOString() ?? null,
    roles: roles.map((role) => ({ role: role.role, pharmacyId: role.pharmacyId })),
    csrfToken: row.csrfToken,
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const csrf = randomBytes(24).toString('base64url')
  await db.insert(authSessions).values({
    userId,
    sessionTokenHash: hash(token),
    csrfToken: csrf,
    expiresAt: sql`now() + make_interval(secs => ${SESSION_SECONDS}::int)`,
  })
  return { token, csrf }
}

export async function issueToken(
  userId: string,
  type: string,
  target: string | null,
  client: any = pool,
  options?: { returnUrlInProduction?: boolean },
) {
  const token = randomBytes(32).toString('base64url')
  if (client === pool) {
    await db.insert(authTokens).values({
      userId,
      type,
      targetContact: target,
      tokenHash: hash(token),
      expiresAt: sql`now() + interval '30 minutes'`,
    })
  } else {
    await client.query(
      `INSERT INTO auth_tokens(user_id,type,target_contact,token_hash,expires_at)
      VALUES ($1,$2,$3,$4,now()+interval '30 minutes')`,
      [userId, type, target, hash(token)],
    )
  }
  const parameter = type === 'password_reset' ? 'reset' : 'verify'
  const url = new URL('/', WEB_ORIGIN)
  url.searchParams.set(parameter, token)
  return process.env.NODE_ENV === 'production' && !options?.returnUrlInProduction
    ? null
    : url.toString()
}
