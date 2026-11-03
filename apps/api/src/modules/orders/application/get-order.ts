import { amount } from '../../../shared/domain/money'
import { canAccessPharmacy, type User } from '../../../shared/domain/access'
import { ApplicationError } from '../../../shared/application-error'

export type OrderReadModel = {
  order: any
  items: any[]
  prescriptions: any[]
  history: any[]
  payment: any | null
  fulfillmentCheck: any | null
  shipment?: any | null
}

export interface OrderReadRepository {
  findById(orderId: string): Promise<OrderReadModel | null>
}
export async function getOrderView(
  repository: OrderReadRepository,
  orderId: string,
  user: User,
): Promise<Record<string, unknown>> {
  const model = await repository.findById(orderId)
  if (!model) throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  const { order, items, prescriptions, history, payment, fulfillmentCheck, shipment } = model
  if (order.customer_id !== user.id && !canAccessPharmacy(user, order.pharmacy_id))
    throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
  return {
    id: order.id,
    customerId: order.customer_id,
    pharmacyId: order.pharmacy_id,
    pharmacyName: order.pharmacy_name,
    reviewVersion: Number(order.review_version),
    pharmacyAddress: order.pharmacy_address,
    status: order.status,
    fulfillmentMethod: order.fulfillment_method,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name_snapshot,
      sellUnit: item.sell_unit_snapshot,
      requiresPrescription: item.requires_prescription_snapshot,
      batchTrackingRequired: item.batch_tracking_required_snapshot,
      quantity: item.quantity,
      unitPrice: amount(item.unit_price),
      lineTotal: amount(item.line_total),
    })),
    totals: {
      subtotal: amount(order.subtotal),
      discount: amount(order.discount),
      shippingFee: amount(order.shipping_fee),
      serviceFee: amount(order.service_fee),
      total: amount(order.total),
    },
    shipping: order.shipping_snapshot ?? null,
    shipment: shipment
      ? {
          provider: shipment.provider,
          ...(order.customer_id !== user.id ? { providerOrderNo: shipment.provider_order_no } : {}),
          trackingNumber: shipment.tracking_number,
          status: shipment.status,
          pickupDate: shipment.pickup_date,
          pickupTime: shipment.pickup_time,
          pickupVehicle: shipment.pickup_vehicle,
          handedOverAt: shipment.handed_over_at,
          ...(order.customer_id !== user.id && shipment.handover_reference
            ? { handoverReference: shipment.handover_reference }
            : {}),
        }
      : null,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
    prescriptions: prescriptions.map((prescription) => ({
      id: prescription.id,
      status: prescription.status,
      revision: prescription.document_revision,
      uploadedAt: prescription.created_at,
    })),
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          amount: amount(payment.amount),
          receivedAmount: payment.received_amount == null ? null : amount(payment.received_amount),
          currency: payment.currency,
          expiresAt: payment.expires_at,
        }
      : null,
    fulfillmentCheck: fulfillmentCheck
      ? {
          passed: fulfillmentCheck.passed,
          pharmacistCheck: fulfillmentCheck.pharmacist_check,
          note: fulfillmentCheck.note,
          checkedAt: fulfillmentCheck.checked_at,
        }
      : null,
    pickupCode:
      order.customer_id === user.id && order.fulfillment_method === 'pickup'
        ? order.pickup_code
        : undefined,
    history: history.map((entry) => ({
      from: entry.from_status,
      to: entry.to_status,
      reason: entry.reason,
      at: entry.created_at,
    })),
  }
}
