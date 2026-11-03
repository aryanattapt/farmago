import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { db, transaction } from '../../../infrastructure/database/client'
import {
  authSessions,
  mfaRecoveryCodes,
  userRoles,
  users,
} from '../../../infrastructure/database/schema'
import { hash } from '../../../shared/security/hash'
import { recordAudit } from '../../platform'
import { createSession, findUserForSessionToken, issueToken } from './session.repository'
import type { IdentityRepository, LoginAccount, LoginRole } from '../application/auth.service'

export class PostgresIdentityRepository implements IdentityRepository {
  async register(
    name: string,
    email: string | null,
    phone: string | null,
    passwordHash: string,
    options?: { returnUrlInProduction?: boolean },
  ) {
    const target = email ?? phone
    return transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4)
        RETURNING id`,
        [name, email, phone, passwordHash],
      )
      const id = result.rows[0].id
      await client.query("INSERT INTO user_roles(user_id,role) VALUES($1,'customer')", [id])
      const verificationUrl = await issueToken(
        id,
        email ? 'verify_email' : 'verify_phone',
        target,
        client,
        options,
      )
      return { verificationUrl }
    })
  }

  async findUnverifiedEmailAccount(email: string) {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(sql`lower(${users.email}) = lower(${email})`, isNull(users.emailVerifiedAt)))
      .limit(1)
    return user?.email ? { id: user.id, email: user.email } : null
  }

  async verifyContact(tokenHash: string) {
    return transaction(async (client) => {
      const result = await client.query(
        `UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND type IN ('verify_email','verify_phone')
        AND used_at IS NULL AND expires_at>now() RETURNING user_id,type,target_contact`,
        [tokenHash],
      )
      if (!result.rowCount) return false
      const row = result.rows[0]
      const column = row.type === 'verify_email' ? 'email_verified_at' : 'phone_verified_at'
      const contactColumn = row.type === 'verify_email' ? 'email' : 'phone'
      const updated = await client.query(
        `UPDATE users SET ${column}=now(), updated_at=now() WHERE id=$1 AND ${contactColumn}=$2`,
        [row.user_id, row.target_contact],
      )
      if (!updated.rowCount) return false
      await recordAudit(client, row.user_id, 'auth.contact_verified', 'user', row.user_id, {
        contactType: row.type,
      })
      return true
    })
  }

  async resetPassword(tokenHash: string, passwordHash: string) {
    return transaction(async (client) => {
      const token = await client.query(
        `UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND type='password_reset' AND used_at IS NULL AND expires_at>now() RETURNING user_id`,
        [tokenHash],
      )
      if (!token.rowCount) return false
      const userId = token.rows[0].user_id
      await client.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [
        userId,
        passwordHash,
      ])
      await client.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [userId],
      )
      await recordAudit(client, userId, 'auth.password_reset', 'user', userId, {})
      return true
    })
  }

  async findPasswordResetAccount(contact: string) {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(or(sql`lower(${users.email}) = lower(${contact})`, eq(users.phone, contact)))
      .limit(1)
    return user ?? null
  }

  async findLoginAccount(contact: string) {
    const [account] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        email_verified_at: users.emailVerifiedAt,
        phone_verified_at: users.phoneVerifiedAt,
        password_hash: users.passwordHash,
        status: users.status,
        mfa_enabled: users.mfaEnabled,
        mfa_secret_encrypted: users.mfaSecretEncrypted,
      })
      .from(users)
      .where(or(sql`lower(${users.email}) = lower(${contact})`, eq(users.phone, contact)))
      .limit(1)
    if (!account) return null
    const roles = await db
      .select({ role: userRoles.role, pharmacy_id: userRoles.pharmacyId })
      .from(userRoles)
      .where(eq(userRoles.userId, account.id))
    return { account: account as LoginAccount, roles: roles as LoginRole[] }
  }

  async consumeRecoveryCode(userId: string, codeHash: string) {
    const recovery = await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          eq(mfaRecoveryCodes.codeHash, codeHash),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id })
    return Boolean(recovery.length)
  }

  async revokeSession(tokenHash: string) {
    await db
      .update(authSessions)
      .set({ revokedAt: sql`now()` })
      .where(eq(authSessions.sessionTokenHash, tokenHash))
  }

  createSession(userId: string) {
    return createSession(userId)
  }

  issueToken(
    userId: string,
    type: string,
    target: string | null,
    options?: { returnUrlInProduction?: boolean },
  ) {
    return issueToken(userId, type, target, undefined, options)
  }

  findUserForSessionToken(token: string | null) {
    return findUserForSessionToken(token)
  }
}
