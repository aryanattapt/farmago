import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import { beginOrderPayment, submitPaymentRefund } from '../../public'
import type { RefundRequestDto } from './dto'
const { apiError, body, requireRole } = shared

export async function handlePaymentRoutes({
  request,
  url,
  path,
  method,
  requestId,
  user,
  currentUser,
}: AuthenticatedRouteContext): Promise<Response | null> {
  const paymentMatch = path.match(/^\/orders\/([0-9a-f-]+)\/payments$/i)
  if (paymentMatch && method === 'POST') {
    await beginOrderPayment(paymentMatch[1], currentUser.id)
  }
  const paymentWebhook = path.match(/^\/webhooks\/payment\/([a-z0-9_-]+)$/i)
  if (paymentWebhook && method === 'POST')
    apiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Adapter pembayaran belum dikonfigurasi.')
  const refundMatch = path.match(/^\/payments\/([0-9a-f-]+)\/refunds$/i)
  if (refundMatch && method === 'POST') {
    requireRole(currentUser, 'finance', 'admin')
    const input = await body<RefundRequestDto>(request)
    await submitPaymentRefund(refundMatch[1], input)
  }
  return null
}
