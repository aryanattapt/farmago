export const API = '/api/v1'
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
export const WEB_ORIGINS = new Set(
  (process.env.WEB_ORIGINS ?? WEB_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin),
)
export const SESSION_SECONDS = 60 * 60 * 24 * 7
export const RESERVATION_MINUTES = Math.max(5, Number(process.env.RESERVATION_MINUTES ?? 30))
export const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 8 * 1024 * 1024)
export const RETURN_EVIDENCE_MAX_BYTES = Number(
  process.env.RETURN_EVIDENCE_MAX_BYTES ?? 25 * 1024 * 1024,
)

if (!Number.isSafeInteger(UPLOAD_MAX_BYTES) || UPLOAD_MAX_BYTES < 1) {
  throw new Error('UPLOAD_MAX_BYTES harus berupa bilangan bulat positif.')
}
if (!Number.isSafeInteger(RETURN_EVIDENCE_MAX_BYTES) || RETURN_EVIDENCE_MAX_BYTES < 1) {
  throw new Error('RETURN_EVIDENCE_MAX_BYTES harus berupa bilangan bulat positif.')
}

export const MAX_REQUEST_BODY_BYTES = Math.max(UPLOAD_MAX_BYTES, RETURN_EVIDENCE_MAX_BYTES) + 256 * 1024
export const secureCookie =
  process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
export const serviceFee = Number(process.env.SERVICE_FEE ?? 0)
