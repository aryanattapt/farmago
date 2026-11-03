import { describe, expect, test } from 'bun:test'
import type { User } from '../../../shared/domain/access'
import { getOrderView, type OrderReadModel, type OrderReadRepository } from './get-order'

const customer: User = {
  id: 'customer-1', name: 'Customer', email: null, phone: null,
  email_verified_at: null, phone_verified_at: null, roles: [], csrfToken: '',
}
const createdAt = new Date('2026-11-01T00:00:00.000Z')
const orderModel: OrderReadModel = {
  order: {
    id: 'order-1', customer_id: 'customer-1', pharmacy_id: 'pharmacy-1',
    pharmacy_name: 'Apotek FarmaGO', pharmacy_address: null, review_version: '3',
    status: 'ready', fulfillment_method: 'pickup', pickup_code: 'PICKUP123',
    subtotal: '5.00', discount: '0.00', shipping_fee: '0.00',
    service_fee: '1.25', total: '6.25', expires_at: null, created_at: createdAt,
  },
  items: [{
    id: 'line-1', product_id: 'product-1', product_name_snapshot: 'Vitamin C',
    sell_unit_snapshot: 'botol', requires_prescription_snapshot: true,
    batch_tracking_required_snapshot: true, quantity: 2, unit_price: '2.50', line_total: '5.00',
  }],
  prescriptions: [{ id: 'rx-1', status: 'approved', document_revision: 3, created_at: createdAt }],
  history: [{ from_status: 'paid', to_status: 'processing', reason: 'accepted', created_at: createdAt }],
  payment: { id: 'payment-1', status: 'settled', amount: '6.25', received_amount: null, currency: 'IDR', expires_at: null },
  fulfillmentCheck: { passed: true, pharmacist_check: true, note: 'checked', checked_at: createdAt },
  shipment: { provider: 'Komerce', tracking_number: 'AWB-7', status: 'pickup_requested', pickup_date: '2026-11-04', pickup_time: '10:00', pickup_vehicle: 'Motor' },
}
function repository(model: OrderReadModel): OrderReadRepository {
  return { findById: async () => model }
}

describe('order read projection', () => {
  test('maps persisted snapshots and nested payment, prescription, fulfillment, and history data', async () => {
    const view = await getOrderView(repository(orderModel), 'order-1', customer)
    expect(view).toMatchObject({
      id: 'order-1',
      reviewVersion: 3,
      totals: { subtotal: '5.00', total: '6.25' },
      items: [{
        productId: 'product-1', name: 'Vitamin C', quantity: 2,
        unitPrice: '2.50', lineTotal: '5.00',
        requiresPrescription: true, batchTrackingRequired: true,
      }],
      payment: { id: 'payment-1', amount: '6.25', receivedAmount: null, currency: 'IDR' },
      fulfillmentCheck: { passed: true, pharmacistCheck: true, note: 'checked' },
      prescriptions: [{ id: 'rx-1', status: 'approved', revision: 3, uploadedAt: createdAt }],
      history: [{ from: 'paid', to: 'processing', reason: 'accepted', at: createdAt }],
      shipment: { provider: 'Komerce', trackingNumber: 'AWB-7', status: 'pickup_requested', pickupDate: '2026-11-04', pickupTime: '10:00', pickupVehicle: 'Motor' },
      pickupCode: 'PICKUP123',
    })
  })

  test('withholds pickup codes from pharmacy staff and for delivery orders', async () => {
    const staff: User = { ...customer, id: 'staff-1', roles: [{ role: 'pharmacy_staff', pharmacyId: 'pharmacy-1' }] }
    const staffView = await getOrderView(repository(orderModel), 'order-1', staff)
    expect(staffView.pickupCode).toBeUndefined()
    const deliveryModel = { ...orderModel, order: { ...orderModel.order, fulfillment_method: 'delivery' } }
    const customerView = await getOrderView(repository(deliveryModel), 'order-1', customer)
    expect(customerView.pickupCode).toBeUndefined()
  })

  test('permits assigned pharmacy roles and rejects users assigned elsewhere', async () => {
    const assigned: User = { ...customer, id: 'staff-1', roles: [{ role: 'pharmacist', pharmacyId: 'pharmacy-1' }] }
    const other: User = { ...customer, id: 'staff-2', roles: [{ role: 'pharmacy_staff', pharmacyId: 'pharmacy-2' }] }
    await expect(getOrderView(repository(orderModel), 'order-1', assigned)).resolves.toMatchObject({ id: 'order-1' })
    await expect(getOrderView(repository(orderModel), 'order-1', other)).rejects.toMatchObject({ status: 403 })
  })
})
