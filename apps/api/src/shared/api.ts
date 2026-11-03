import { basename } from 'node:path'
import {
  canAccessPharmacy,
  hasRole as hasDomainRole,
  hasVerifiedContact,
  type Role,
  type User,
} from './domain/access'
import { hash } from './security/hash'
import {
  API,
  MAX_REQUEST_BODY_BYTES,
  RESERVATION_MINUTES,
  RETURN_EVIDENCE_MAX_BYTES,
  SESSION_SECONDS,
  UPLOAD_MAX_BYTES,
  WEB_ORIGIN,
  secureCookie,
  serviceFee,
} from './config'

export {
  API,
  MAX_REQUEST_BODY_BYTES,
  RESERVATION_MINUTES,
  RETURN_EVIDENCE_MAX_BYTES,
  SESSION_SECONDS,
  UPLOAD_MAX_BYTES,
  WEB_ORIGIN,
  secureCookie,
  serviceFee,
}
export { hash }
export { amount, cents, money } from './domain/money'
export type { Role, User }
export type Context = { user: User; requestId: string }

export const rateBuckets = new Map<string, { count: number; resetAt: number }>()
export let lastRateBucketCleanup = Date.now()
let requestIpResolver: (request: Request) => string | undefined = () => undefined

export function configureRequestIpResolver(resolve: (request: Request) => string | undefined) {
  requestIpResolver = resolve
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function apiError(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message)
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify({ data }), { status, headers: responseHeaders })
}

export function errorJson(error: ApiError, requestId: string) {
  return new Response(
    JSON.stringify({ error: { code: error.code, message: error.message, requestId } }),
    {
      status: error.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  )
}

export async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return apiError(400, 'INVALID_JSON', 'Isi permintaan tidak valid.')
  }
}

export function cookieValue(request: Request, name: string) {
  const entry = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

export function sessionCookie(token: string) {
  return `apotek_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secureCookie ? '; Secure' : ''}`
}

export function expiredCookie() {
  return `apotek_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureCookie ? '; Secure' : ''}`
}

const RATE_BUCKET_CLEANUP_INTERVAL_MS = 10_000
const RATE_BUCKET_WINDOW_MS = 60_000
const MAX_RATE_BUCKETS = 25_000

function assertRateBucketAvailable(key: string, max: number, now: number) {
  const current = rateBuckets.get(key)
  if (current && current.resetAt > now && current.count >= max)
    apiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.')
}

function consumeRateBucket(key: string, max: number, now: number) {
  const current = rateBuckets.get(key)
  if (current && current.resetAt > now) {
    if (++current.count > max)
      apiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.')
    return
  }
  if (!current && rateBuckets.size >= MAX_RATE_BUCKETS)
    apiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.')
  rateBuckets.set(key, { count: 1, resetAt: now + RATE_BUCKET_WINDOW_MS })
}

export function limit(
  request: Request,
  scope: string,
  max = 30,
  subject?: string | readonly unknown[],
) {
  const now = Date.now()
  if (now - lastRateBucketCleanup >= RATE_BUCKET_CLEANUP_INTERVAL_MS) {
    for (const [entry, bucket] of rateBuckets)
      if (bucket.resetAt <= now) rateBuckets.delete(entry)
    lastRateBucketCleanup = now
  }

  // Only trust the server-resolved peer IP; forwarded headers can be supplied by clients.
  const ip = requestIpResolver(request) || 'local'
  const values = typeof subject === 'string' ? [subject] : subject ?? []
  const normalizedSubjects = [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  const hasIdentityInput = subject !== undefined
  const ipMax = hasIdentityInput ? Math.max(1_000, max * 100) : max
  const ipKey = scope + ':ip:' + ip
  const subjectKeys = normalizedSubjects.map(
    (value) => scope + ':subject:' + hash(scope + '\u0000' + value),
  )

  assertRateBucketAvailable(ipKey, ipMax, now)
  for (const key of subjectKeys) assertRateBucketAvailable(key, max, now)
  for (const key of subjectKeys) consumeRateBucket(key, max, now)
  consumeRateBucket(ipKey, ipMax, now)
}

export function requireUser(user: User | null): User {
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Silakan masuk untuk melanjutkan.')
  return user
}

export function hasRole(user: User, ...roles: string[]) {
  return hasDomainRole(user, ...roles)
}

export function requireRole(user: User, ...roles: string[]) {
  if (!hasDomainRole(user, ...roles))
    apiError(403, 'FORBIDDEN', 'Akses tidak diizinkan untuk akun ini.')
}

export function pharmacyScope(user: User, pharmacyId: string) {
  if (!canAccessPharmacy(user, pharmacyId))
    apiError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
}

export function verified(user: User) {
  if (!hasVerifiedContact(user))
    apiError(
      422,
      'CONTACT_NOT_VERIFIED',
      'Verifikasi email atau nomor telepon sebelum bertransaksi.',
    )
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function csvSafeName(name: string) {
  return (
    basename(name)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120) || 'dokumen'
  )
}

export function userJson(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    contactVerified: hasVerifiedContact(user),
    roles: user.roles,
    csrfToken: user.csrfToken,
  }
}
