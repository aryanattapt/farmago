import * as shared from '../../../../shared/api'
import type { PublicRouteContext } from '../../../../shared/http/route-context'
import {
  loginIdentityAccount,
  logoutIdentitySession,
  registerIdentityAccount,
  resendIdentityAccountContactVerification,
  resetIdentityAccountPassword,
  verifyIdentityAccountContact,
} from '../../public'
import type {
  ContactVerificationRequestDto,
  ContactVerificationResendRequestDto,
  LoginRequestDto,
  PasswordResetRequestDto,
  RegisterRequestDto,
} from './dto'

const { body, cookieValue, expiredCookie, json, limit, sessionCookie, userJson } = shared
const AUTH_WRITE_PATHS = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/contact-verification',
  '/auth/contact-verification/resend',
  '/auth/password-reset',
])

export async function handleAuthRoutes({
  request,
  path,
  method,
  user,
}: PublicRouteContext): Promise<Response | null> {
  if (method === 'POST' && AUTH_WRITE_PATHS.has(path)) limit(request, 'auth-write', 6_000)

  if (path === '/auth/session' && method === 'GET')
    return json({ user: user ? userJson(user) : null })

  if (path === '/auth/register' && method === 'POST') {
    const input = await body<RegisterRequestDto>(request)
    limit(request, 'register', 5, [input.email, input.phone])
    const created = await registerIdentityAccount(input)
    return json(
      {
        message: created.message,
        verificationUrl: created.verificationUrl,
        canResendVerification: created.canResendVerification,
      },
      201,
    )
  }

  if (path === '/auth/contact-verification/resend' && method === 'POST') {
    const input = await body<ContactVerificationResendRequestDto>(request)
    limit(request, 'contact-verification-resend', 3, input.contact)
    return json(await resendIdentityAccountContactVerification(input))
  }

  if (path === '/auth/contact-verification' && method === 'POST') {
    const input = await body<ContactVerificationRequestDto>(request)
    limit(request, 'verify', 10, [input.token])
    await verifyIdentityAccountContact(input)
    return json({ message: 'Kontak berhasil diverifikasi. Silakan masuk.' })
  }

  if (path === '/auth/password-reset' && method === 'POST') {
    const input = await body<PasswordResetRequestDto>(request)
    limit(request, 'password-reset', 5, [input.contact, input.token])
    return json(await resetIdentityAccountPassword(input))
  }

  if (path === '/auth/login' && method === 'POST') {
    const input = await body<LoginRequestDto>(request)
    limit(request, 'login', 12, [input.contact])
    const login = await loginIdentityAccount(input)
    return json({ user: userJson(login.user) }, 200, { 'set-cookie': sessionCookie(login.token) })
  }

  if (path === '/auth/logout' && method === 'POST') {
    await logoutIdentitySession(cookieValue(request, 'apotek_session'))
    return json({ message: 'Anda telah keluar.' }, 200, { 'set-cookie': expiredCookie() })
  }

  return null
}
