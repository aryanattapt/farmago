import { decryptMfaSecret, verifyTotp } from '../../infrastructure/security/mfa'
import {
  createIdentitySession,
  createIdentityToken,
  findSessionUser,
  loginIdentity,
  logoutIdentity,
  registerIdentity,
  resetIdentityPassword,
  verifyIdentityContact,
} from './application/auth.service'
import type {
  ContactVerificationRequestDto,
  LoginRequestDto,
  PasswordResetRequestDto,
  RegisterRequestDto,
} from './application/auth.dto'
import { PostgresIdentityRepository } from './infrastructure/auth.repository'
import { SmtpPasswordResetMailer } from './infrastructure/password-reset-email'

const repository = new PostgresIdentityRepository()
const passwordResetMailer = new SmtpPasswordResetMailer()
const mfa = {
  verify: (encryptedSecret: string, code: string) =>
    verifyTotp(decryptMfaSecret(encryptedSecret), code),
}

export const findUserForSessionToken = (token: string | null) => findSessionUser(repository, token)
export const createSession = (userId: string) => createIdentitySession(repository, userId)
export const issueToken = (userId: string, type: string, target: string | null) =>
  createIdentityToken(repository, userId, type, target)
export const registerIdentityAccount = (input: RegisterRequestDto) =>
  registerIdentity(repository, input)
export const verifyIdentityAccountContact = (input: ContactVerificationRequestDto) =>
  verifyIdentityContact(repository, input)
export const resetIdentityAccountPassword = (input: PasswordResetRequestDto) =>
  resetIdentityPassword(repository, passwordResetMailer, input)
export const loginIdentityAccount = (input: LoginRequestDto) =>
  loginIdentity(repository, mfa, input)
export const logoutIdentitySession = (token: string | null) => logoutIdentity(repository, token)
