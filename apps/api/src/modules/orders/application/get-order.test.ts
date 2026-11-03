import { describe, expect, test } from 'bun:test'
import type { User } from '../../../shared/domain/access'
import { getOrderView, type OrderReadModel, type OrderReadRepository } from './get-order'

const model: OrderReadModel = {
  order: {
    id: 'order-1',
    customer_id: 'customer-1',
    pharmacy_id: 'pharmacy-1',
    pharmacy_name: 'Apotek FarmaGO',
    pharmacy_address: null,
    review_version: 1,
    status: 'ready',
    fulfillment_method: 'pickup',
    pickup_code: 'PICKUP123',
    subtotal: '10.00',
    discount: '0.00',
    shipping_fee: '0.00',
    service_fee: '0.00',
    total: '10.00',
    expires_at: null,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
  },
  items: [],
  prescriptions: [],
  history: [],
  payment: null,
  fulfillmentCheck: null,
  shipment: null,
}

const customer: User = {
  id: 'customer-1',
  name: 'Customer',
  email: null,
  phone: null,
  email_verified_at: null,
  phone_verified_at: null,
  roles: [],
  csrfToken: '',
}

function repository(order: OrderReadModel | null): OrderReadRepository {
  return { findById: async () => order }
}

describe('order read application', () => {
  test('shows pickup code to customer and hides it from pharmacy staff', async () => {
    const customerView = await getOrderView(repository(model), 'order-1', customer)
    const staffView = await getOrderView(repository(model), 'order-1', {
      ...customer,
      id: 'staff-1',
      roles: [{ role: 'pharmacy_staff', pharmacyId: 'pharmacy-1' }],
    })

    expect(customerView.pickupCode).toBe('PICKUP123')
    expect(staffView.pickupCode).toBeUndefined()
  })

  test('hides orders outside the user scope', async () => {
    await expect(
      getOrderView(repository(model), 'order-1', { ...customer, id: 'other-customer' }),
    ).rejects.toMatchObject({ status: 403, code: 'PHARMACY_SCOPE_REQUIRED' })
  })

  test('returns not found when repository has no order', async () => {
    await expect(getOrderView(repository(null), 'missing', customer)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    })
  })
})
