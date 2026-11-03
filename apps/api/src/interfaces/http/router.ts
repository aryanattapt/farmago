import { randomUUID } from 'node:crypto'
import { Elysia } from 'elysia'
import {
  API,
  ApiError,
  MAX_REQUEST_BODY_BYTES,
  WEB_ORIGIN,
  apiError,
  cookieValue,
  errorJson,
  requireUser,
} from '../../shared/api'
import type { User } from '../../shared/api'
import { ApplicationError } from '../../shared/application-error'
import type { AuthenticatedRouteContext, PublicRouteContext } from '../../shared/http/route-context'
import { handleSystemRoute } from '../../modules/platform'
import { findUserForSessionToken, handleAuthRoutes } from '../../modules/identity'
import { handleCatalogRoutes } from '../../modules/catalog'
import { handleCustomerRoutes } from '../../modules/customer'
import { handleCheckoutRoutes } from '../../modules/checkout'
import { handleOrderRoutes } from '../../modules/orders'
import { handlePrescriptionRoutes } from '../../modules/prescriptions'
import { handlePaymentRoutes } from '../../modules/payments'
import { handleFulfillmentRoutes } from '../../modules/fulfillment'
import { handleSupportRoutes } from '../../modules/support'
import { handleAdminRoutes } from '../../modules/administration'
import { handlePharmacyRoutes } from '../../modules/pharmacy'
import { handleShippingRoutes } from '../../modules/shipping'

type RequestState = { requestId: string; user: User | null }
type EndpointContext = { request: Request }
type Endpoint = (context: EndpointContext) => Promise<Response>
type PublicHandler = (context: PublicRouteContext) => Promise<Response | null>
type AuthenticatedHandler = (context: AuthenticatedRouteContext) => Promise<Response | null>
type HttpMethod = 'GET' | 'POST' | 'PATCH'
type RouteDefinition = { method: HttpMethod; path: string; handler: Endpoint }

const requestStates = new WeakMap<Request, RequestState>()
const publicWritePaths = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/contact-verification',
  '/auth/password-reset',
])

function requestState(request: Request): RequestState {
  let state = requestStates.get(request)
  if (!state) {
    state = { requestId: randomUUID(), user: null }
    requestStates.set(request, state)
  }
  return state
}

function createPublicEndpoint(handler: PublicHandler): Endpoint {
  return async ({ request }) => {
    const state = requestState(request)
    const context = createPublicContext(request, state)
    const response = await handler(context)
    if (!response) requireUser(context.user)
    return withResponseHeaders(response ?? notFoundResponse(state.requestId), request, state)
  }
}

function createAuthenticatedEndpoint(handler: AuthenticatedHandler): Endpoint {
  return async ({ request }) => {
    const state = requestState(request)
    const context = createPublicContext(request, state)
    const currentUser = requireUser(context.user)
    const response = await handler({ ...context, user: currentUser, currentUser })
    return withResponseHeaders(response ?? notFoundResponse(state.requestId), request, state)
  }
}

function createPublicContext(request: Request, state: RequestState): PublicRouteContext {
  const url = new URL(request.url)
  return {
    request,
    user: state.user,
    requestId: state.requestId,
    url,
    path: url.pathname.slice(API.length) || '/',
    method: request.method.toUpperCase(),
  }
}

function notFoundResponse(requestId: string) {
  return new Response(
    JSON.stringify({
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId },
    }),
    { status: 404, headers: { 'content-type': 'application/json' } },
  )
}

function withResponseHeaders(response: Response, request: Request, state: RequestState) {
  response.headers.set('x-request-id', state.requestId)
  if (request.headers.get('origin') === WEB_ORIGIN) {
    response.headers.set('access-control-allow-origin', WEB_ORIGIN)
    response.headers.set('access-control-allow-credentials', 'true')
    response.headers.append('vary', 'Origin')
  }
  return response
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof ApplicationError)
    return new ApiError(error.status, error.code, error.message)

  const databaseError = error as { code?: string; constraint?: string } | null
  if (
    databaseError?.code === '23505' &&
    ['users_email_unique', 'users_phone_unique'].includes(databaseError.constraint ?? '')
  ) {
    return new ApiError(409, 'CONTACT_IN_USE', 'Email atau nomor telepon sudah terdaftar.')
  }
  if (databaseError?.code === '23505')
    return new ApiError(409, 'RESOURCE_CONFLICT', 'Permintaan ini bertentangan dengan data yang sudah ada.')

  return new ApiError(500, 'INTERNAL_ERROR', 'Terjadi gangguan. Coba lagi atau hubungi bantuan.')
}

function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': WEB_ORIGIN,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type,x-csrf-token,idempotency-key',
    },
  })
}

export function createApiApp() {
  const app = new Elysia({
    prefix: API,
    strictPath: true,
    serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES },
  })
    .onRequest(async ({ request }) => {
      const state: RequestState = { requestId: randomUUID(), user: null }
      requestStates.set(request, state)

      const origin = request.headers.get('origin')
      if (origin && origin !== WEB_ORIGIN)
        return new Response('Origin tidak diizinkan.', { status: 403 })
      if (request.method === 'OPTIONS') return preflightResponse()

      const pathname = new URL(request.url).pathname
      if (!pathname.startsWith(API + '/')) return

      const contentLength = Number(request.headers.get('content-length') ?? 0)
      if (contentLength > MAX_REQUEST_BODY_BYTES)
        apiError(413, 'REQUEST_TOO_LARGE', 'Ukuran permintaan melebihi batas yang diizinkan.')

      state.user = await findUserForSessionToken(cookieValue(request, 'apotek_session'))
      const path = pathname.slice(API.length) || '/'
      if (
        state.user &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        !publicWritePaths.has(path) &&
        request.headers.get('x-csrf-token') !== state.user.csrfToken
      ) {
        apiError(403, 'CSRF_INVALID', 'Sesi tidak valid. Muat ulang halaman dan coba lagi.')
      }
    })
    .onError(({ request, code, error }) => {
      const state = requestState(request)
      const pathname = new URL(request.url).pathname

      if (code === 'NOT_FOUND') {
        if (!pathname.startsWith(API + '/')) return new Response('Not found', { status: 404 })
        if (!state.user)
          return withResponseHeaders(
            errorJson(new ApiError(401, 'UNAUTHENTICATED', 'Silakan masuk untuk melanjutkan.'), state.requestId),
            request,
            state,
          )
        return withResponseHeaders(notFoundResponse(state.requestId), request, state)
      }

      const apiErrorResponse = toApiError(error)
      if (!(error instanceof ApiError)) {
        console.error(
          JSON.stringify({
            requestId: state.requestId,
            error: error instanceof Error ? error.message : 'unknown',
          }),
        )
      }
      return withResponseHeaders(errorJson(apiErrorResponse, state.requestId), request, state)
    })

  const routes: RouteDefinition[] = [
    { method: 'GET', path: '/health', handler: createPublicEndpoint(handleSystemRoute) },
    { method: 'GET', path: '/products', handler: createPublicEndpoint(handleCatalogRoutes) },
    { method: 'GET', path: '/products/:productId', handler: createPublicEndpoint(handleCatalogRoutes) },
    { method: 'POST', path: '/webhooks/payment/:provider', handler: createPublicEndpoint(handleCatalogRoutes) },
    { method: 'POST', path: '/webhooks/shipping/:provider', handler: createPublicEndpoint(handleCatalogRoutes) },

    { method: 'GET', path: '/auth/session', handler: createPublicEndpoint(handleAuthRoutes) },
    { method: 'POST', path: '/auth/register', handler: createPublicEndpoint(handleAuthRoutes) },
    { method: 'POST', path: '/auth/contact-verification', handler: createPublicEndpoint(handleAuthRoutes) },
    { method: 'POST', path: '/auth/password-reset', handler: createPublicEndpoint(handleAuthRoutes) },
    { method: 'POST', path: '/auth/login', handler: createPublicEndpoint(handleAuthRoutes) },
    { method: 'POST', path: '/auth/logout', handler: createPublicEndpoint(handleAuthRoutes) },

    { method: 'GET', path: '/admin/products', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'GET', path: '/admin/pharmacies', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'GET', path: '/admin/orders', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'GET', path: '/admin/cancellation-requests', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'GET', path: '/admin/support-cases', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'POST', path: '/admin/products', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'POST', path: '/admin/inventory', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'PATCH', path: '/admin/products/:productId', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'POST', path: '/admin/pharmacies', handler: createAuthenticatedEndpoint(handleAdminRoutes) },
    { method: 'PATCH', path: '/admin/pharmacies/:pharmacyId', handler: createAuthenticatedEndpoint(handleAdminRoutes) },

    { method: 'POST', path: '/checkout/quote', handler: createAuthenticatedEndpoint(handleCheckoutRoutes) },
    { method: 'GET', path: '/addresses', handler: createAuthenticatedEndpoint(handleCustomerRoutes) },
    { method: 'POST', path: '/addresses', handler: createAuthenticatedEndpoint(handleCustomerRoutes) },
    { method: 'PATCH', path: '/addresses/:addressId', handler: createAuthenticatedEndpoint(handleCustomerRoutes) },

    { method: 'POST', path: '/orders', handler: createAuthenticatedEndpoint(handleOrderRoutes) },
    { method: 'GET', path: '/orders', handler: createAuthenticatedEndpoint(handleOrderRoutes) },
    { method: 'GET', path: '/orders/:orderId', handler: createAuthenticatedEndpoint(handleOrderRoutes) },
    { method: 'POST', path: '/orders/:orderId/fulfillment', handler: createAuthenticatedEndpoint(handleFulfillmentRoutes) },
    { method: 'POST', path: '/orders/:orderId/fulfillment-checks', handler: createAuthenticatedEndpoint(handleFulfillmentRoutes) },
    { method: 'POST', path: '/orders/:orderId/shipment-bookings', handler: createAuthenticatedEndpoint(handleFulfillmentRoutes) },
    { method: 'POST', path: '/orders/:orderId/shipment-pickups', handler: createAuthenticatedEndpoint(handleFulfillmentRoutes) },
    { method: 'GET', path: '/orders/:orderId/shipment-label', handler: createAuthenticatedEndpoint(handleFulfillmentRoutes) },
    { method: 'POST', path: '/orders/:orderId/prescriptions', handler: createAuthenticatedEndpoint(handlePrescriptionRoutes) },
    { method: 'GET', path: '/prescriptions/:prescriptionId/file', handler: createAuthenticatedEndpoint(handlePrescriptionRoutes) },
    { method: 'POST', path: '/prescriptions/:prescriptionId/reviews', handler: createAuthenticatedEndpoint(handlePrescriptionRoutes) },
    { method: 'GET', path: '/orders/:orderId/prescription-messages', handler: createAuthenticatedEndpoint(handlePrescriptionRoutes) },
    { method: 'POST', path: '/orders/:orderId/prescription-messages', handler: createAuthenticatedEndpoint(handlePrescriptionRoutes) },
    { method: 'POST', path: '/orders/:orderId/payments', handler: createAuthenticatedEndpoint(handlePaymentRoutes) },
    { method: 'POST', path: '/payments/:paymentId/refunds', handler: createAuthenticatedEndpoint(handlePaymentRoutes) },

    { method: 'GET', path: '/pharmacy/inventory', handler: createAuthenticatedEndpoint(handlePharmacyRoutes) },
    { method: 'POST', path: '/pharmacy/inventory-adjustments', handler: createAuthenticatedEndpoint(handlePharmacyRoutes) },
    { method: 'PATCH', path: '/pharmacies/:pharmacyId/service-hours', handler: createAuthenticatedEndpoint(handlePharmacyRoutes) },
    { method: 'GET', path: '/shipping/destinations', handler: createAuthenticatedEndpoint(handleShippingRoutes) },

    { method: 'POST', path: '/orders/:orderId/cancellation-requests', handler: createAuthenticatedEndpoint(handleSupportRoutes) },
    { method: 'POST', path: '/cancellation-requests/:requestId/decision', handler: createAuthenticatedEndpoint(handleSupportRoutes) },
    { method: 'GET', path: '/orders/:orderId/support-cases', handler: createAuthenticatedEndpoint(handleSupportRoutes) },
    { method: 'POST', path: '/orders/:orderId/support-cases', handler: createAuthenticatedEndpoint(handleSupportRoutes) },
    { method: 'PATCH', path: '/support-cases/:caseId', handler: createAuthenticatedEndpoint(handleSupportRoutes) },
  ]

  for (const route of routes)
    app.route(route.method, route.path, route.handler, { parse: 'none' })

  return app
}
