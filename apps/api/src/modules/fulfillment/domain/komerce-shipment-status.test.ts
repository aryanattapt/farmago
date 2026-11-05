import { describe, expect, test } from 'bun:test'
import { mapKomerceShipmentStatus } from './komerce-shipment-status'

describe('Komerce shipment lifecycle mapping', () => {
  test('maps accepted delivery status variants to the order lifecycle', () => {
    for (const status of ['dikirim', 'SHIPPED', 'in_transit', 'On Delivery', 'in-delivery'])
      expect(mapKomerceShipmentStatus(status)).toBe('in_delivery')

    for (const status of ['diterima', 'RECEIVED', 'delivered', 'completed'])
      expect(mapKomerceShipmentStatus(status)).toBe('delivered')

    for (const status of ['retur', 'returned', 'delivery_failed', 'gagal diantar', 'cancelled'])
      expect(mapKomerceShipmentStatus(status)).toBe('exception')
  })

  test('leaves unknown and empty provider values unmapped', () => {
    expect(mapKomerceShipmentStatus('')).toBeNull()
    expect(mapKomerceShipmentStatus(null)).toBeNull()
    expect(mapKomerceShipmentStatus('label printed')).toBeNull()
  })
})
