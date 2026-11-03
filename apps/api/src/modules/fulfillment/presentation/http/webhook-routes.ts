import { timingSafeEqual } from 'node:crypto'
import * as shared from '../../../../shared/api'
import type { PublicRouteContext } from '../../../../shared/http/route-context'
import type { KomerceDeliveryWebhookDto } from '../../application/fulfillment.dto'
import { receiveKomerceShipmentWebhook } from '../../public'

const { apiError, body, json, limit } = shared

export async function handleKomerceShippingWebhookRoutes({
  request,
  url,
  path,
  method,
}: PublicRouteContext): Promise<Response | null> {
  if (method !== 'POST' || !/^\/webhooks\/shipping\/komerce$/i.test(path)) return null

  const expected = String(process.env.KOMERCE_DELIVERY_WEBHOOK_TOKEN ?? '').trim()
  if (Buffer.byteLength(expected) < 32)
    apiError(503, 'SHIPPING_WEBHOOK_NOT_CONFIGURED', 'Token webhook pengiriman belum dikonfigurasi.')
  const received = url.searchParams.get('token') ?? ''
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes))
    apiError(401, 'SHIPPING_WEBHOOK_UNAUTHORIZED', 'Token webhook pengiriman tidak valid.')

  limit(request, 'shipping-webhook', 120)
  const input = await body<Record<string, unknown>>(request)
  const orderNo = safeText(input.order_no, 120)
  const airwayBill = safeText(input.cnote ?? input.awb, 120) || null
  const status = safeText(input.status, 160)
  if (!orderNo || !status)
    apiError(422, 'SHIPPING_WEBHOOK_INVALID', 'Payload webhook Komerce harus berisi order_no dan status.')

  const payload: KomerceDeliveryWebhookDto = { orderNo, airwayBill, status }
  return json(await receiveKomerceShipmentWebhook(payload))
}

function safeText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}
