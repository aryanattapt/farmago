import { describe, expect, test } from 'bun:test'
import { quoteFingerprint } from './quote-fingerprint'

const item = {
  productId: 'product-1',
  sku: 'SKU-1',
  name: 'Vitamin C',
  sellUnit: 'botol',
  requiresPrescription: false,
  batchTrackingRequired: false,
  quantity: 2,
  unitPrice: '10.00',
  lineTotal: '20.00',
}
const totals = { subtotal: '20.00', discount: '0.00', shippingFee: '0.00', serviceFee: '1.00', total: '21.00' }
const address = { recipientName: 'Arya', phone: '0812', addressText: 'Jl. Mawar', city: 'Jakarta', postalCode: '11840', rajaongkirDestinationId: 123 }
function fingerprint(options: { pharmacy?: string; method?: string; address?: typeof address | null; item?: typeof item; totals?: typeof totals } = {}) {
  return quoteFingerprint(options.pharmacy ?? 'pharmacy-1', options.method ?? 'pickup',
    options.address === undefined ? null : options.address, [options.item ?? item], options.totals ?? totals)
}

describe('quote fingerprint', () => {
  test('is a stable 64-character SHA-256 digest and normalizes decimal representations', () => {
    const expected = fingerprint()
    expect(expected).toMatch(/^[a-f0-9]{64}$/)
    expect(fingerprint()).toBe(expected)
    expect(quoteFingerprint('pharmacy-1', 'pickup', null, [{
      ...item, unitPrice: 10, lineTotal: 20,
    }], {
      subtotal: 20, discount: 0, shippingFee: 0, serviceFee: 1, total: 21,
    })).toBe(expected)
  })

  test('changes if pharmacy, fulfillment, address, item, or monetary data changes', () => {
    const changedItems = [
      { ...item, productId: 'product-2' }, { ...item, sku: 'SKU-2' },
      { ...item, name: 'Other' }, { ...item, sellUnit: 'box' },
      { ...item, requiresPrescription: true }, { ...item, batchTrackingRequired: true },
      { ...item, quantity: 3 }, { ...item, unitPrice: '10.01' }, { ...item, lineTotal: '20.01' },
    ]
    for (const changed of changedItems) expect(fingerprint({ item: changed })).not.toBe(fingerprint())
    expect(fingerprint({ pharmacy: 'pharmacy-2' })).not.toBe(fingerprint())
    expect(fingerprint({ method: 'delivery' })).not.toBe(fingerprint())
    expect(fingerprint({ address })).not.toBe(fingerprint())
    expect(fingerprint({ address: { ...address, rajaongkirDestinationId: 456 } })).not.toBe(fingerprint({ address }))
    expect(fingerprint({ totals: { ...totals, serviceFee: '1.01' } })).not.toBe(fingerprint())
  })
})
