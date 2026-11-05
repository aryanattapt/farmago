import { afterEach, describe, expect, test } from 'bun:test'
import { ApplicationError } from '../../../shared/application-error'
import { hash } from '../../../shared/security/hash'
import type { IdentityMailer, IdentityRepository, LoginAccount } from './auth.service'
import {
  loginIdentity,
  registerIdentity,
  resetIdentityPassword,
  verifyIdentityContact,
} from './auth.service'

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

function repository(overrides: Partial<IdentityRepository> = {}) {
  const calls: Record<string, unknown[]> = {}
  const base: IdentityRepository = {
    register: async (...args) => {
      calls.register = args
      return { verificationUrl: 'https://farmago.example/verify?token=secret' }
    },
    findUnverifiedEmailAccount: async () => null,
    verifyContact: async (tokenHash) => {
      calls.verifyContact = [tokenHash]
      return true
    },
    resetPassword: async (...args) => {
      calls.resetPassword = args
      return true
    },
    findPasswordResetAccount: async (contact) => {
      calls.findPasswordResetAccount = [contact]
      return { id: 'user-1', email: 'arya@example.com' }
    },
    findLoginAccount: async () => null,
    consumeRecoveryCode: async (...args) => {
      calls.consumeRecoveryCode = args
      return false
    },
    revokeSession: async () => undefined,
    createSession: async (userId) => {
      calls.createSession = [userId]
      return { token: 'session-token', csrf: 'csrf-token' }
    },
    issueToken: async (...args) => {
      calls.issueToken = args
      return 'https://farmago.example/reset?token=secret'
    },
    findUserForSessionToken: async () => null,
  }
  return { value: { ...base, ...overrides }, calls }
}

function mailer(configured = true) {
  const sent: { verification: unknown[][]; reset: unknown[][] } = { verification: [], reset: [] }
  const value: IdentityMailer = {
    isConfigured: () => configured,
    sendContactVerificationEmail: async (...args) => { sent.verification.push(args) },
    sendPasswordResetEmail: async (...args) => { sent.reset.push(args) },
  }
  return { value, sent }
}

function account(overrides: Partial<LoginAccount> = {}): LoginAccount {
  return {
    id: 'user-1',
    name: 'Arya',
    email: 'arya@example.com',
    phone: null,
    email_verified_at: new Date('2026-11-01T00:00:00.000Z'),
    phone_verified_at: null,
    password_hash: '',
    status: 'active',
    mfa_enabled: true,
    mfa_secret_encrypted: 'encrypted-secret',
    ...overrides,
  }
}

describe('identity application requirements', () => {
  test('sends production verification email without returning the secret URL', async () => {
    process.env.NODE_ENV = 'production'
    const repo = repository()
    const email = mailer()

    const result = await registerIdentity(repo.value, email.value, {
      name: ' Arya ',
      email: ' Arya@Example.com ',
      password: 'Strong-Password-123',
    })

    expect(repo.calls.register?.[0]).toBe('Arya')
    expect(repo.calls.register?.[1]).toBe('arya@example.com')
    expect(repo.calls.register?.[4]).toEqual({ returnUrlInProduction: true })
    expect(email.sent.verification).toEqual([[
      'arya@example.com',
      'https://farmago.example/verify?token=secret',
    ]])
    expect(result).toMatchObject({ verificationUrl: null, canResendVerification: true })
  })

  test('blocks phone-only production registration while SMS is unavailable', async () => {
    process.env.NODE_ENV = 'production'
    const repo = repository()
    const email = mailer()

    await expect(registerIdentity(repo.value, email.value, {
      name: 'Arya',
      phone: '+628123456789',
      password: 'Strong-Password-123',
    })).rejects.toMatchObject({ status: 503, code: 'SMS_PROVIDER_NOT_CONFIGURED' })
    expect(repo.calls.register).toBeUndefined()
  })

  test('hashes a contact-verification token before repository lookup', async () => {
    const repo = repository()
    await verifyIdentityContact(repo.value, { token: 'one-time-token' })
    expect(repo.calls.verifyContact).toEqual([hash('one-time-token')])
  })

  test('sends production reset email with a generic response and no leaked URL', async () => {
    process.env.NODE_ENV = 'production'
    const repo = repository()
    const email = mailer()

    const result = await resetIdentityPassword(repo.value, email.value, { contact: ' ARYA@example.com ' })

    expect(repo.calls.findPasswordResetAccount).toEqual(['arya@example.com'])
    expect(repo.calls.issueToken?.slice(0, 3)).toEqual([
      'user-1',
      'password_reset',
      'arya@example.com',
    ])
    expect(email.sent.reset).toEqual([[
      'arya@example.com',
      'https://farmago.example/reset?token=secret',
    ]])
    expect(result.resetUrl).toBeNull()
    expect(result.message).toBe('Jika akun cocok, petunjuk pemulihan akan dikirim.')
  })

  test('requires MFA for internal accounts before creating a session', async () => {
    const passwordHash = await Bun.password.hash('Strong-Password-123')
    const repo = repository({
      findLoginAccount: async () => ({
        account: account({ password_hash: passwordHash }),
        roles: [{ role: 'pharmacist', pharmacy_id: 'pharmacy-1' }],
      }),
    })

    await expect(loginIdentity(repo.value, { verify: () => false }, {
      contact: 'arya@example.com',
      password: 'Strong-Password-123',
      mfaCode: '123456',
    })).rejects.toMatchObject({ status: 401, code: 'MFA_REQUIRED' })
    expect(repo.calls.createSession).toBeUndefined()
  })

  test('rejects invalid one-time password-reset tokens', async () => {
    let resetArgs: unknown[] | undefined
    const repo = repository({ resetPassword: async (...args) => {
      resetArgs = args
      return false
    } })

    await expect(resetIdentityPassword(repo.value, mailer().value, {
      token: 'expired-token',
      newPassword: 'New-Strong-Password-123',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_TOKEN' })
    expect(resetArgs?.[0]).toBe(hash('expired-token'))
  })
})
