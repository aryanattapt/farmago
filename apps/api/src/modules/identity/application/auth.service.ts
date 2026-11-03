import type { Role, User } from '../../../shared/api'
import { ApplicationError } from '../../../shared/application-error'
import { hash } from '../../../shared/security/hash'
import type {
  ContactVerificationRequestDto,
  LoginRequestDto,
  PasswordResetRequestDto,
  RegisterRequestDto,
} from './auth.dto'

export type LoginAccount = {
  id: string
  name: string
  email: string | null
  phone: string | null
  email_verified_at: Date | null
  phone_verified_at: Date | null
  password_hash: string
  status: string
  mfa_enabled: boolean
  mfa_secret_encrypted: string | null
}

export type LoginRole = { role: Role['role']; pharmacy_id: string | null }

export interface IdentityRepository {
  register(
    name: string,
    email: string | null,
    phone: string | null,
    passwordHash: string,
  ): Promise<{ verificationUrl: string | null }>
  verifyContact(tokenHash: string): Promise<boolean>
  resetPassword(tokenHash: string, passwordHash: string): Promise<boolean>
  findPasswordResetAccount(contact: string): Promise<{ id: string; email: string | null } | null>
  findLoginAccount(contact: string): Promise<{ account: LoginAccount; roles: LoginRole[] } | null>
  consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>
  revokeSession(tokenHash: string): Promise<void>
  createSession(userId: string): Promise<{ token: string; csrf: string }>
  issueToken(
    userId: string,
    type: string,
    target: string | null,
    options?: { returnUrlInProduction?: boolean },
  ): Promise<string | null>
  findUserForSessionToken(token: string | null): Promise<User | null>
}

export interface PasswordResetMailer {
  isConfigured(): boolean
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>
}

export interface MfaVerifier {
  verify(encryptedSecret: string, code: string): boolean
}

export async function registerIdentity(repository: IdentityRepository, input: RegisterRequestDto) {
  const name = String(input.name ?? '').trim()
  const email = input.email ? String(input.email).trim().toLowerCase() : null
  const phone = input.phone ? String(input.phone).trim() : null
  const password = String(input.password ?? '')
  if (
    name.length < 2 ||
    name.length > 100 ||
    (!email && !phone) ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (phone && !/^\+?[0-9\s()-]{8,20}$/.test(phone))
  )
    throw new ApplicationError(
      400,
      'INVALID_PROFILE',
      'Nama dan email atau nomor telepon yang valid diperlukan.',
    )
  if (password.length < 12 || password.length > 128)
    throw new ApplicationError(400, 'WEAK_PASSWORD', 'Kata sandi harus berisi 12–128 karakter.')
  return repository.register(name, email, phone, await Bun.password.hash(password))
}

export async function verifyIdentityContact(
  repository: IdentityRepository,
  input: ContactVerificationRequestDto,
) {
  const token = String(input.token ?? '')
  if (!token)
    throw new ApplicationError(
      400,
      'TOKEN_REQUIRED',
      'Tautan verifikasi tidak valid atau kedaluwarsa.',
    )
  if (!(await repository.verifyContact(hash(token))))
    throw new ApplicationError(
      400,
      'INVALID_TOKEN',
      'Tautan verifikasi tidak valid atau kedaluwarsa.',
    )
}

export async function resetIdentityPassword(
  repository: IdentityRepository,
  mailer: PasswordResetMailer,
  input: PasswordResetRequestDto,
) {
  if (input.token && input.newPassword) {
    const newPassword = String(input.newPassword)
    if (newPassword.length < 12 || newPassword.length > 128)
      throw new ApplicationError(400, 'WEAK_PASSWORD', 'Kata sandi harus berisi 12–128 karakter.')
    if (
      !(await repository.resetPassword(
        hash(String(input.token)),
        await Bun.password.hash(newPassword),
      ))
    )
      throw new ApplicationError(400, 'INVALID_TOKEN', 'Tautan reset tidak valid atau kedaluwarsa.')
    return { message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.' }
  }
  const contact = String(input.contact ?? '')
    .trim()
    .toLowerCase()
  const account = await repository.findPasswordResetAccount(contact)
  const isProduction = process.env.NODE_ENV === 'production'
  let resetUrl: string | null = null

  if (account && isProduction) {
    if (account.email && mailer.isConfigured()) {
      const deliveryUrl = await repository.issueToken(
        account.id,
        'password_reset',
        account.email,
        { returnUrlInProduction: true },
      )
      if (deliveryUrl) {
        try {
          await mailer.sendPasswordResetEmail(account.email, deliveryUrl)
        } catch (error) {
          console.error(
            JSON.stringify({
              event: 'auth.password_reset_email_failed',
              error: error instanceof Error ? error.message : 'unknown',
            }),
          )
        }
      }
    } else if (account.email) {
      console.error(JSON.stringify({ event: 'auth.password_reset_email_not_configured' }))
    }
  } else if (account) {
    resetUrl = await repository.issueToken(account.id, 'password_reset', contact)
  }

  return { message: 'Jika akun cocok, petunjuk pemulihan akan dikirim.', resetUrl }
}

export async function loginIdentity(
  repository: IdentityRepository,
  mfa: MfaVerifier,
  input: LoginRequestDto,
) {
  const password = String(input.password ?? '')
  if (password.length < 1 || password.length > 128) throw invalidCredentials()
  const contact = String(input.contact ?? '').trim()
  const login = await repository.findLoginAccount(contact)
  if (!login || !(await Bun.password.verify(password, login.account.password_hash)))
    throw invalidCredentials()
  const { account, roles } = login
  if (account.status === 'disabled')
    throw new ApplicationError(403, 'ACCOUNT_DISABLED', 'Akun ini sedang dinonaktifkan.')
  const internal = roles.some((entry) => entry.role !== 'customer')
  if (internal) {
    if (!account.mfa_enabled || !account.mfa_secret_encrypted)
      throw new ApplicationError(
        403,
        'MFA_SETUP_REQUIRED',
        'Akun internal memerlukan MFA sebelum dapat digunakan.',
      )
    let valid: boolean
    try {
      valid = mfa.verify(account.mfa_secret_encrypted, String(input.mfaCode ?? ''))
    } catch {
      throw new ApplicationError(503, 'MFA_UNAVAILABLE', 'Konfigurasi keamanan MFA belum tersedia.')
    }
    if (!valid && String(input.mfaCode ?? '').length >= 16)
      valid = await repository.consumeRecoveryCode(
        account.id,
        hash(String(input.mfaCode).trim().toUpperCase()),
      )
    if (!valid)
      throw new ApplicationError(
        401,
        'MFA_REQUIRED',
        'Masukkan kode 6 digit dari aplikasi autentikator.',
      )
  }
  const session = await repository.createSession(account.id)
  const user: User = {
    ...account,
    email_verified_at: account.email_verified_at?.toISOString() ?? null,
    phone_verified_at: account.phone_verified_at?.toISOString() ?? null,
    roles: roles.map((role) => ({ role: role.role, pharmacyId: role.pharmacy_id })),
    csrfToken: session.csrf,
  }
  return { user, token: session.token }
}

export function logoutIdentity(repository: IdentityRepository, token: string | null) {
  return token ? repository.revokeSession(hash(token)) : Promise.resolve()
}

export function createIdentitySession(repository: IdentityRepository, userId: string) {
  return repository.createSession(userId)
}

export function createIdentityToken(
  repository: IdentityRepository,
  userId: string,
  type: string,
  target: string | null,
) {
  return repository.issueToken(userId, type, target)
}

export function findSessionUser(repository: IdentityRepository, token: string | null) {
  return repository.findUserForSessionToken(token)
}

function invalidCredentials() {
  return new ApplicationError(
    401,
    'INVALID_CREDENTIALS',
    'Email/telepon atau kata sandi tidak cocok.',
  )
}
