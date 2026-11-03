import { describe, expect, test } from 'bun:test'
import { parseCartItems } from './modules/checkout/domain/cart'
import { parseDispensedLots } from './modules/fulfillment/domain/dispensed-lots'
import { ORDER_STATUSES, canTransitionOrder, isOrderStatus } from './modules/orders/domain/order-status'
import { canRequestRefund } from './modules/payments/domain/refund-policy'
import {
  isValidServiceExceptions,
  isValidServiceHours,
  isWithinServiceHours,
  validClock,
  validLocalDate,
  validTimezone,
} from './modules/pharmacy/domain/service-hours'
import {
  allRequiredItemsApproved,
  validateReviewItems,
} from './modules/prescriptions/domain/review-policy'
import { canAccessPharmacy, hasRole, hasVerifiedContact, type User } from './shared/domain/access'

const USER: User = {
  id: 'user-1',
  name: 'Arya',
  email: 'arya@example.test',
  phone: '0812',
  email_verified_at: null,
  phone_verified_at: null,
  roles: [],
  csrfToken: '',
}
const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('API domain boundaries', () => {
  test('normalizes UUID casing and accepts cart quantity limits', () => {
    const parsed = parseCartItems([{ productId: PRODUCT_ID.toUpperCase(), quantity: '20' }])
    expect(parsed).toEqual({ ok: true, items: [{ productId: PRODUCT_ID, quantity: 20 }] })
    const maximum = Array.from({ length: 30 }, (_, index) => ({
      productId: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
      quantity: 1,
    }))
    const result = parseCartItems(maximum)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.items).toHaveLength(30)
    expect(parseCartItems([...maximum, { productId: '00000000-0000-4000-8000-000000000031', quantity: 1 }]))
      .toEqual({ ok: false, reason: 'INVALID_LENGTH' })
  })

  test('rejects non-object cart lines, boolean quantities, decimals, and duplicate IDs case-insensitively', () => {
    for (const input of [null, {}, [], [null], [1], [{ productId: 'bad', quantity: 1 }]]) {
      expect(parseCartItems(input).ok).toBe(false)
    }
    for (const quantity of [true, false, 0, 21, 1.25, '', 'not-a-number']) {
      expect(parseCartItems([{ productId: PRODUCT_ID, quantity }])).toEqual({
        ok: false,
        reason: 'INVALID_ITEM',
      })
    }
    expect(parseCartItems([
      { productId: PRODUCT_ID, quantity: 1 },
      { productId: PRODUCT_ID.toUpperCase(), quantity: 2 },
    ])).toEqual({ ok: false, reason: 'DUPLICATE_PRODUCT' })
  })

  test('checks every order status transition, including terminal and self transitions', () => {
    const allowed: Record<string, string[]> = {
      awaiting_prescription: ['awaiting_payment', 'cancelled', 'expired'],
      awaiting_payment: ['paid', 'cancelled', 'expired'],
      paid: ['processing', 'cancelled'],
      processing: ['ready', 'cancelled'],
      ready: ['in_delivery', 'completed', 'cancelled'],
      in_delivery: ['completed'],
      completed: [],
      cancelled: [],
      expired: [],
    }
    for (const from of ORDER_STATUSES) {
      expect(isOrderStatus(from)).toBe(true)
      for (const to of ORDER_STATUSES) {
        expect(canTransitionOrder(from, to)).toBe(allowed[from].includes(to))
      }
      expect(canTransitionOrder(from, from)).toBe(false)
    }
    expect(isOrderStatus('refunded')).toBe(false)
    expect(canTransitionOrder('unknown', 'paid')).toBe(false)
  })

  test('validates lot identifiers, calendar dates, integer quantities, and exact sums', () => {
    const lots = [{ lotNumber: '  LOT-1 ', expiresOn: '2028-02-29', quantity: '2' }]
    expect(parseDispensedLots(lots, 2)).toEqual({
      ok: true,
      lots: [{ lotNumber: 'LOT-1', expiresOn: '2028-02-29', quantity: 2 }],
    })
    for (const entry of [
      { lotNumber: '', expiresOn: '2027-01-01', quantity: 1 },
      { lotNumber: 'L'.repeat(121), expiresOn: '2027-01-01', quantity: 1 },
      { lotNumber: 'LOT-1', expiresOn: '2025-02-29', quantity: 1 },
      { lotNumber: 'LOT-1', expiresOn: '2027-01-01', quantity: 0 },
      { lotNumber: 'LOT-1', expiresOn: '2027-01-01', quantity: 1.5 },
    ]) {
      expect(parseDispensedLots([entry], 1)).toEqual({ ok: false, reason: 'invalid' })
    }
    expect(parseDispensedLots([], 1)).toEqual({ ok: false, reason: 'required' })
    expect(parseDispensedLots([{ lotNumber: 'LOT-1', expiresOn: '2027-01-01', quantity: 1 }], 2))
      .toEqual({ ok: false, reason: 'quantity-mismatch' })
  })

  test('validates clock, timezone, weekday, active state, and half-open service hours', () => {
    expect(validClock('00:00')).toBe(true)
    expect(validClock('23:59')).toBe(true)
    for (const clock of ['24:00', '9:00', '09:60', '']) expect(validClock(clock)).toBe(false)
    expect(validTimezone('Asia/Jakarta')).toBe(true)
    expect(validTimezone('not/a-timezone')).toBe(false)
    expect(validLocalDate('2024-02-29')).toBe(true)
    expect(validLocalDate('2025-02-29')).toBe(false)
    const monday = new Date('2026-11-02T02:00:00.000Z')
    const hours = { weekday: 1, opensAt: '09:00', closesAt: '10:00', timezone: 'Asia/Jakarta' }
    expect(isWithinServiceHours(hours, monday)).toBe(true)
    expect(isWithinServiceHours(hours, new Date('2026-11-02T03:00:00.000Z'))).toBe(false)
    expect(isWithinServiceHours({ ...hours, active: false }, monday)).toBe(false)
    expect(isValidServiceHours([{ ...hours, active: 'false' as unknown as boolean }])).toBe(false)
    expect(isValidServiceHours([{ weekday: 1, opensAt: '09:00', closesAt: '10:00' }])).toBe(true)
    expect(isValidServiceHours([hours, hours])).toBe(false)
    expect(isValidServiceExceptions([{ localDate: '2026-12-25', closed: true }])).toBe(true)
    expect(isValidServiceExceptions([{ localDate: '2026-12-25', closed: false }])).toBe(false)
  })

  test('permits refunds only within settled amount and rejects invalid capacity', () => {
    expect(canRequestRefund({ receivedAmount: '10.00', alreadyRequestedAmount: '0.10', requestedAmount: '9.90' }))
      .toBe(true)
    expect(canRequestRefund({ receivedAmount: '10.00', alreadyRequestedAmount: '0.10', requestedAmount: '9.91' }))
      .toBe(false)
    expect(canRequestRefund({ receivedAmount: 100, alreadyRequestedAmount: -1, requestedAmount: 100 }))
      .toBe(false)
    expect(canRequestRefund({ receivedAmount: 'invalid', alreadyRequestedAmount: 0, requestedAmount: 1 }))
      .toBe(false)
    expect(canRequestRefund({ receivedAmount: null, alreadyRequestedAmount: 0, requestedAmount: 1 }))
      .toBe(false)
  })

  test('requires complete approvals for current prescription revisions', () => {
    expect(validateReviewItems(['item-1', 'item-2'], ['item-1'], 'approved'))
      .toEqual({ ok: false, reason: 'incomplete' })
    expect(validateReviewItems(['item-1', 'item-2'], ['item-2', 'item-2'], 'clarification'))
      .toEqual({ ok: true, itemIds: ['item-2'] })
    expect(validateReviewItems(['item-1'], ['foreign-item'], 'rejected'))
      .toEqual({ ok: false, reason: 'unknown-item' })
    expect(allRequiredItemsApproved([], [], 1)).toBe(false)
    expect(allRequiredItemsApproved(['item-1', 'item-2'], [
      { itemId: 'item-1', decision: 'approved', documentRevision: 2 },
      { itemId: 'item-2', decision: 'approved', documentRevision: 1 },
    ], 2)).toBe(false)
    expect(allRequiredItemsApproved(['item-1'], [
      { itemId: 'item-1', decision: 'approved', documentRevision: 2 },
    ], 2)).toBe(true)
  })

  test('applies role, pharmacy assignment, and verified-contact rules', () => {
    const assigned = { ...USER, roles: [{ role: 'pharmacy_staff', pharmacyId: 'pharmacy-1' }] }
    expect(hasRole(assigned, 'admin', 'pharmacy_staff')).toBe(true)
    expect(canAccessPharmacy(assigned, 'pharmacy-1')).toBe(true)
    expect(canAccessPharmacy(assigned, 'pharmacy-2')).toBe(false)
    expect(canAccessPharmacy({ ...USER, roles: [{ role: 'admin', pharmacyId: null }] }, 'any')).toBe(true)
    expect(canAccessPharmacy({ ...USER, roles: [{ role: 'cs', pharmacyId: null }] }, 'pharmacy-1')).toBe(false)
    expect(hasVerifiedContact(USER)).toBe(false)
    expect(hasVerifiedContact({ ...USER, phone_verified_at: '2026-11-01T00:00:00Z' })).toBe(true)
    expect(hasVerifiedContact({ ...USER, email: null, email_verified_at: '2026-11-01T00:00:00Z' })).toBe(false)
  })
})
