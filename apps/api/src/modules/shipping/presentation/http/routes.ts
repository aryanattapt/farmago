import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import { searchShippingDestinations } from '../../public'
const { json, requireRole } = shared

export async function handleShippingRoutes({ url, path, method, currentUser }: AuthenticatedRouteContext): Promise<Response | null> {
  if (path !== '/shipping/destinations' || method !== 'GET') return null
  requireRole(currentUser, 'customer', 'admin')
  return json({ items: await searchShippingDestinations(url.searchParams.get('search')) })
}
