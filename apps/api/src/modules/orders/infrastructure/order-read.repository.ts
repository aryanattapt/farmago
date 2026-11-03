import type { OrderReadModel } from '../application/get-order'
import type { OrderListFilter, OrderListRepository, OrderListRow } from '../application/list-orders'
import { asc, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import {
  fulfillmentChecks,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  pharmacies,
  prescriptions,
  shipments,
  users,
} from '../../../infrastructure/database/schema'

export class PostgresOrderReadRepository implements OrderListRepository {
  private listQuery() {
    return db
      .select({
        id: orders.id,
        status: orders.status,
        fulfillment_method: orders.fulfillmentMethod,
        total: orders.total,
        created_at: orders.createdAt,
        expires_at: orders.expiresAt,
        pharmacy_id: orders.pharmacyId,
      })
      .from(orders)
  }

  async findList(filter: OrderListFilter): Promise<OrderListRow[]> {
    const query = this.listQuery()
    if (filter.pharmacyIds) {
      return await query
        .where(
          or(
            eq(orders.customerId, filter.customerId!),
            inArray(orders.pharmacyId, filter.pharmacyIds),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(100)
    }
    if (filter.customerId) {
      return await query
        .where(eq(orders.customerId, filter.customerId))
        .orderBy(desc(orders.createdAt))
        .limit(100)
    }
    return await query.orderBy(desc(orders.createdAt)).limit(100)
  }

  async findById(orderId: string): Promise<OrderReadModel | null> {
    const [order] = await db
      .select({
        id: orders.id,
        customer_id: orders.customerId,
        pharmacy_id: orders.pharmacyId,
        pharmacy_name: pharmacies.name,
        pharmacy_address: pharmacies.addressText,
        review_version: orders.reviewVersion,
        status: orders.status,
        fulfillment_method: orders.fulfillmentMethod,
        pickup_code: orders.pickupCode,
        subtotal: orders.subtotal,
        discount: orders.discount,
        shipping_fee: orders.shippingFee,
        shipping_snapshot: orders.shippingSnapshot,
        service_fee: orders.serviceFee,
        total: orders.total,
        expires_at: orders.expiresAt,
        created_at: orders.createdAt,
        customer_name: users.name,
      })
      .from(orders)
      .innerJoin(pharmacies, eq(pharmacies.id, orders.pharmacyId))
      .innerJoin(users, eq(users.id, orders.customerId))
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!order) return null
    const [items, prescriptionRows, history, payment, fulfillmentCheck, shipmentRows] = await Promise.all([
      db
        .select({
          id: orderItems.id,
          product_id: orderItems.productId,
          product_name_snapshot: orderItems.productNameSnapshot,
          sell_unit_snapshot: orderItems.sellUnitSnapshot,
          batch_tracking_required_snapshot: orderItems.batchTrackingRequiredSnapshot,
          requires_prescription_snapshot: orderItems.requiresPrescriptionSnapshot,
          quantity: orderItems.quantity,
          unit_price: orderItems.unitPrice,
          line_total: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.productNameSnapshot)),
      db
        .select({
          id: prescriptions.id,
          status: prescriptions.status,
          document_revision: prescriptions.documentRevision,
          created_at: prescriptions.createdAt,
        })
        .from(prescriptions)
        .where(eq(prescriptions.orderId, orderId))
        .orderBy(desc(prescriptions.createdAt)),
      db
        .select({
          from_status: orderStatusHistory.fromStatus,
          to_status: orderStatusHistory.toStatus,
          reason: orderStatusHistory.reason,
          created_at: orderStatusHistory.createdAt,
        })
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, orderId))
        .orderBy(asc(orderStatusHistory.createdAt)),
      db
        .select({
          id: payments.id,
          status: payments.status,
          amount: payments.amount,
          received_amount: payments.receivedAmount,
          currency: payments.currency,
          expires_at: payments.expiresAt,
        })
        .from(payments)
        .where(eq(payments.orderId, orderId))
        .orderBy(desc(payments.createdAt))
        .limit(1),
      db
        .select({
          passed: fulfillmentChecks.passed,
          pharmacist_check: fulfillmentChecks.pharmacistCheck,
          note: fulfillmentChecks.note,
          checked_at: fulfillmentChecks.checkedAt,
        })
        .from(fulfillmentChecks)
        .where(eq(fulfillmentChecks.orderId, orderId))
        .orderBy(desc(fulfillmentChecks.checkedAt))
        .limit(1),
      db
        .select({
          provider: shipments.provider,
          provider_order_no: shipments.providerOrderNo,
          tracking_number: shipments.trackingNumber,
          status: shipments.status,
          pickup_date: shipments.pickupDate,
          pickup_time: shipments.pickupTime,
          pickup_vehicle: shipments.pickupVehicle,
          handover_reference: shipments.handoverReference,
          handed_over_at: shipments.handedOverAt,
        })
        .from(shipments)
        .where(eq(shipments.orderId, orderId))
        .limit(1),
    ])
    return {
      order,
      items,
      prescriptions: prescriptionRows,
      history,
      payment: payment[0] ?? null,
      fulfillmentCheck: fulfillmentCheck[0] ?? null,
      shipment: shipmentRows[0] ?? null,
    }
  }
}
