import { API, apiError, json, requireUser } from '../../shared/api'
import type { User } from '../../shared/api'
import type { PublicRouteContext, AuthenticatedRouteContext } from '../../shared/http/route-context'
import { handleSystemRoute } from '../../modules/platform'
import { handleAuthRoutes } from '../../modules/identity'
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

export async function route(
  request: Request,
  user: User | null,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url)
  const context: PublicRouteContext = {
    request,
    user,
    requestId,
    url,
    path: url.pathname.slice(API.length) || '/',
    method: request.method.toUpperCase(),
  }

  const publicHandlers = [handleSystemRoute, handleAuthRoutes, handleCatalogRoutes]
  for (const handler of publicHandlers) {
    const response = await handler(context)
    if (response) return response
  }

  const currentUser = requireUser(user)
  const authenticatedContext: AuthenticatedRouteContext = {
    ...context,
    user: currentUser,
    currentUser,
  }
  const authenticatedHandlers = [
    handleCustomerRoutes,
    handleCheckoutRoutes,
    handleOrderRoutes,
    handlePrescriptionRoutes,
    handlePaymentRoutes,
    handleFulfillmentRoutes,
    handleSupportRoutes,
    handleAdminRoutes,
    handlePharmacyRoutes,
    handleShippingRoutes,
  ]
  for (const handler of authenticatedHandlers) {
    const response = await handler(authenticatedContext)
    if (response) return response
  }

  return new Response(
    JSON.stringify({
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId },
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' },
    },
  )
}
