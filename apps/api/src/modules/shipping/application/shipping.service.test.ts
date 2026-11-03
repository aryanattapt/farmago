import { describe, expect, test } from 'bun:test'
import { packageWeightGrams, sameShippingSnapshot } from './shipping.service'

describe('shipping weight and snapshot rules', () => {
  test('adds configured packaging weight to each sell-unit weight times quantity', () => {
    const original = process.env.RAJAONGKIR_PACKAGING_WEIGHT_GRAMS
    process.env.RAJAONGKIR_PACKAGING_WEIGHT_GRAMS = '250'
    try {
      expect(packageWeightGrams([
        { quantity: 2, shippingWeightGrams: 120 },
        { quantity: 3, shippingWeightGrams: 40 },
      ])).toBe(610)
    } finally {
      if (original === undefined) delete process.env.RAJAONGKIR_PACKAGING_WEIGHT_GRAMS
      else process.env.RAJAONGKIR_PACKAGING_WEIGHT_GRAMS = original
    }
  })

  test('rejects unknown, invalid, and over-limit product weights', () => {
    expect(packageWeightGrams([{ quantity: 1, shippingWeightGrams: 0 }])).toBeNull()
    expect(packageWeightGrams([{ quantity: 0, shippingWeightGrams: 120 }])).toBeNull()
    expect(packageWeightGrams([{ quantity: 400, shippingWeightGrams: 300 }])).toBeNull()
  })

  test('matches quote snapshots only when route, service, cost, and parcel inputs are unchanged', () => {
    const rate = {
      provider: 'RajaOngkir' as const,
      courierName: 'JNE',
      courierCode: 'jne',
      service: 'REG',
      description: 'Regular',
      cost: '12500.00',
      etd: '2-3',
      originId: 10,
      destinationId: 20,
      weightGrams: 450,
    }
    expect(sameShippingSnapshot(rate, { ...rate })).toBe(true)
    expect(sameShippingSnapshot(rate, { ...rate, cost: '13000.00' })).toBe(false)
    expect(sameShippingSnapshot(rate, { ...rate, destinationId: 21 })).toBe(false)
    expect(sameShippingSnapshot(null, null)).toBe(true)
    expect(sameShippingSnapshot(rate, null)).toBe(false)
  })
})
