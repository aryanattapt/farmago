import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import type { FulfillmentCheckRequestDto, FulfillmentCommandRequestDto, ShipmentPickupRequestDto } from './dto'
import { downloadShipmentLabel, fetchCustomerShipmentTracking, requestShipmentBooking, runFulfillmentCommand, saveFulfillmentCheck, scheduleShipmentPickup } from '../../public'

const { body, json, limit, requireRole } = shared

export async function handleFulfillmentRoutes({
  request,
  path,
  method,
  currentUser,
}: AuthenticatedRouteContext): Promise<Response | null> {
  const trackingMatch = path.match(/^\/orders\/([0-9a-f-]+)\/shipment-tracking$/i)
  if (trackingMatch && method === 'GET') {
    requireRole(currentUser, 'customer')
    limit(request, 'shipment-tracking', 12, currentUser.id)
    return json(await fetchCustomerShipmentTracking(trackingMatch[1], currentUser.id))
  }

  const fulfillmentMatch = path.match(/^\/orders\/([0-9a-f-]+)\/fulfillment$/i)
  if (fulfillmentMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    limit(request, 'fulfillment-write', 6_000)
    const input = await body<FulfillmentCommandRequestDto>(request)
    if (input.command === 'confirm_pickup') {
      limit(request, 'pickup-confirm-actor', 60, currentUser.id)
      limit(request, 'pickup-confirm-order', 5, currentUser.id + ':' + fulfillmentMatch[1])
    }
    return json(await runFulfillmentCommand(fulfillmentMatch[1], currentUser, input))
  }
  const checkMatch = path.match(/^\/orders\/([0-9a-f-]+)\/fulfillment-checks$/i)
  if (checkMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    limit(request, 'fulfillment-write', 6_000)
    const input = await body<FulfillmentCheckRequestDto>(request)
    return json(await saveFulfillmentCheck(checkMatch[1], currentUser, input), 201)
  }
  const shipmentMatch = path.match(/^\/orders\/([0-9a-f-]+)\/shipment-bookings$/i)
  if (shipmentMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    limit(request, 'fulfillment-write', 6_000)
    return json(await requestShipmentBooking(shipmentMatch[1], currentUser), 201)
  }
  const pickupMatch = path.match(/^\/orders\/([0-9a-f-]+)\/shipment-pickups$/i)
  if (pickupMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    limit(request, 'fulfillment-write', 6_000)
    const input = await body<ShipmentPickupRequestDto>(request)
    return json(await scheduleShipmentPickup(pickupMatch[1], currentUser, input), 201)
  }
  const labelMatch = path.match(/^\/orders\/([0-9a-f-]+)\/shipment-label$/i)
  if (labelMatch && method === 'GET') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    limit(request, 'fulfillment-read', 6_000)
    const label = await downloadShipmentLabel(labelMatch[1], currentUser)
    const binary = Uint8Array.from(atob(label.base64), (character) => character.charCodeAt(0))
    return new Response(binary, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="FarmaGO-${labelMatch[1].slice(0,8)}-label.pdf"`,
        'cache-control': 'no-store',
      },
    })
  }

  return null
}
