import { describe, expect, test } from 'bun:test'
import { buildKomerceStoreOrderPayload, providerPhone, validateKomercePickupInput } from './komerce-order'
import { ApplicationError } from '../../../shared/application-error'

const orderInput = {
  brandName: 'FarmaGO',
  orderDate: '2026-11-03T10:00:00.000Z',
  shipperName: 'Apotek Farma',
  shipperPhone: '081234567890',
  shipperEmail: 'apotek@example.test',
  shipperDestinationId: 123,
  shipperAddress: 'Jl. Farmasi No. 1',
  receiverName: 'Pelanggan',
  receiverPhone: '+6281234567890',
  receiverDestinationId: 456,
  receiverAddress: 'Jl. Sehat No. 2',
  shipping: 'JNE',
  shippingType: 'REG',
  shippingCost: 18000,
  itemValue: 57000,
  orderItems: [{
    name: 'Vitamin C',
    variant: 'Botol isi 30 tablet',
    quantity: 2,
    price: 28500,
    weightGrams: 120,
    widthCm: 5,
    heightCm: 8,
    lengthCm: 5,
  }],
}

describe('Komerce Delivery payload', () => {
  test('maps the approved checkout and pharmacy snapshots to Store Order fields', () => {
    const payload = buildKomerceStoreOrderPayload(orderInput)
    expect(payload).toMatchObject({
      brand_name: 'FarmaGO',
      shipper_destination_id: 123,
      receiver_destination_id: 456,
      shipper_phone: '081234567890',
      receiver_phone: '6281234567890',
      shipping: 'JNE',
      shipping_type: 'REG',
      payment_method: 'BANK TRANSFER',
      shipping_cost: 18000,
      shipping_cashback: 0,
      service_fee: 0,
      additional_cost: 0,
      grand_total: 75000,
      cod_value: 0,
      order_details: [{
        product_name: 'Vitamin C',
        product_variant_name: 'Botol isi 30 tablet',
        product_price: 28500,
        product_weight: 120,
        product_width: 5,
        product_height: 8,
        product_length: 5,
        qty: 2,
        subtotal: 57000,
      }],
    })
    expect(payload.shipper_email).toBe('apotek@example.test')
  })

  test('requires dimensions per product and valid RajaOngkir phone formats', () => {
    expect(() => buildKomerceStoreOrderPayload({
      ...orderInput,
      orderItems: [{ ...orderInput.orderItems[0], widthCm: null }],
    })).toThrow(ApplicationError)
    expect(providerPhone('+62 812-3456-7890')).toBe('6281234567890')
    expect(() => providerPhone('555')).toThrow(ApplicationError)
  })

  test('requires a valid pickup slot at least 90 minutes ahead in WIB', () => {
    const now = new Date('2026-11-03T02:00:00.000Z')
    expect(validateKomercePickupInput({
      pickupDate: '2026-11-03',
      pickupTime: '11:00',
      pickupVehicle: 'Motor',
      now,
    })).toEqual({
      pickupDate: '2026-11-03',
      pickupTime: '11:00',
      pickupVehicle: 'Motor',
    })
    for (const pickupTime of ['09:29', 'invalid']) {
      expect(() => validateKomercePickupInput({
        pickupDate: '2026-11-03',
        pickupTime,
        pickupVehicle: 'Motor',
        now,
      })).toThrow(ApplicationError)
    }
    expect(() => validateKomercePickupInput({
      pickupDate: '2026-11-03',
      pickupTime: '12:00',
      pickupVehicle: 'Sepeda',
      now,
    })).toThrow(ApplicationError)
  })
})
