import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import { createCheckoutQuote, listCheckoutPharmacies } from '../../public'
import type { CreateQuoteRequestDto } from './dto'

const { body, json, limit, requireRole, verified } = shared

export async function handleCheckoutRoutes({
  request,
  path,
  method,
  currentUser,
}: AuthenticatedRouteContext): Promise<Response | null> {
  if (
    method !== 'POST' ||
    !['/checkout/quote', '/checkout/pharmacies'].includes(path)
  )
    return null

  requireRole(currentUser, 'customer')
  verified(currentUser)
  limit(request, path === '/checkout/pharmacies' ? 'checkout-pharmacies' : 'checkout-quote', 12, currentUser.id)
  const input = await body<CreateQuoteRequestDto>(request)
  if (path === '/checkout/pharmacies')
    return json({ items: await listCheckoutPharmacies(currentUser.id, input) })
  return json(await createCheckoutQuote(currentUser.id, input))
}
