import { describe, expect, test } from 'bun:test'
import { ApplicationError } from '../../../shared/application-error'
import {
  buildCheckoutQuote,
  requestCheckoutQuote,
  type CheckoutRepository,
  type ShippingCalculator,
} from './quote.service'
import type { BuildQuoteInputDto } from './quote.dto'

type AddressRow = NonNullable<Awaited<ReturnType<CheckoutRepository['findAddress']>>>
type PharmacyRow = Awaited<ReturnType<CheckoutRepository['listActivePharmacies']>>[number]
type StockRow = Awaited<ReturnType<CheckoutRepository['findStock']>>[number]
type SaveInput = Parameters<CheckoutRepository['saveQuote']>[0]
const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADDRESS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const makeAddress = (): AddressRow => ({
  id: ADDRESS_ID, recipient_name: 'Arya', phone: '0812', address_text: 'Jl. Mawar',
  city: 'Jakarta', postal_code: '11840', rajaongkir_destination_id: 123,
})
const makePharmacy = (id = 'pharmacy-1', overrides: Partial<PharmacyRow> = {}): PharmacyRow => ({
  id, name: 'Apotek ' + id, address_text: 'Jl. Sehat', postal_codes: ['11840'],
  delivery_fee: '4.50', rajaongkir_origin_id: 456, ...overrides,
})
const makeStock = (overrides: Partial<StockRow> = {}): StockRow => ({
  id: PRODUCT_ID, sku: 'SKU-1', name: 'Vitamin C', sell_unit: 'botol',
  category: 'Vitamin', requires_prescription: false, batch_tracking_required: false,
  status: 'active', special_handling: false, unit_price: '10.25',
  available: 10, sales_blocked: false, shipping_weight_grams: 100,
  shipping_width_cm: 5, shipping_height_cm: 8, shipping_length_cm: 5, ...overrides,
})
function makeRepository(options: {
  address?: AddressRow | null
  pharmacies?: PharmacyRow[]
  stocks?: Record<string, StockRow[]>
  prescriptionOpen?: Record<string, boolean>
  prescriptionHours?: Array<{ weekday: number; opens_at: string; closes_at: string; timezone: string }>
} = {}) {
  const calls = {
    addresses: [] as Array<[string, string]>,
    stock: [] as Array<[string, string[]]>,
    prescriptionChecks: [] as string[],
    saved: [] as SaveInput[],
    hours: [] as string[],
  }
  const repository: CheckoutRepository = {
    findAddress: async (id, customer) => {
      calls.addresses.push([id, customer])
      return options.address === undefined ? makeAddress() : options.address
    },
    listActivePharmacies: async () => options.pharmacies ?? [makePharmacy()],
    findStock: async (pharmacyId, productIds) => {
      calls.stock.push([pharmacyId, productIds])
      return options.stocks?.[pharmacyId] ?? [makeStock()]
    },
    isPrescriptionServiceOpen: async (id) => {
      calls.prescriptionChecks.push(id)
      return options.prescriptionOpen?.[id] ?? true
    },
    saveQuote: async (input) => {
      calls.saved.push(input)
      return { id: 'quote-1', expiresAt: new Date('2026-11-02T00:30:00.000Z') }
    },
    listPrescriptionHours: async (id) => {
      calls.hours.push(id)
      return options.prescriptionHours ?? []
    },
  }
  return { repository, calls }
}
const shipping: ShippingCalculator = {
  calculate: async ({ originId, destinationId, weightGrams }) => ({
    provider: 'RajaOngkir' as const,
    courierName: 'JNE', courierCode: 'jne', service: 'REG', description: 'Regular',
    cost: '12500.00', etd: '2-3 hari', originId, destinationId, weightGrams,
  }),
}
const pickup: BuildQuoteInputDto = {
  customerId: 'customer-1', addressId: null, fulfillmentMethod: 'pickup',
  items: [{ productId: PRODUCT_ID, quantity: 2 }],
}

describe('checkout quote use case', () => {
  test('persists an immutable pickup quote and returns stable pricing', async () => {
    const { repository, calls } = makeRepository()
    const result = await buildCheckoutQuote(repository, pickup)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.quote.pharmacy.id).toBe('pharmacy-1')
    expect(result.quote.items[0]).toMatchObject({ quantity: 2, unitPrice: '10.25', lineTotal: '20.50' })
    expect(result.quote.totals).toMatchObject({ subtotal: '20.50', shippingFee: '0.00' })
    expect(calls.addresses).toEqual([])
    expect(calls.saved[0]).toMatchObject({
      customerId: 'customer-1', pharmacyId: 'pharmacy-1', addressId: null,
      addressSnapshot: null, fulfillmentMethod: 'pickup',
    })
    expect(calls.saved[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(calls.hours).toEqual([])
  })

  test('skips inactive, restricted, blocked, handling-only, and insufficient stock rows', async () => {
    const cases: Array<[string, StockRow]> = [
      ['inactive', makeStock({ status: 'inactive' })],
      ['special handling', makeStock({ special_handling: true })],
      ['narcotics', makeStock({ category: 'Narkotika' })],
      ['psychotropics', makeStock({ category: 'psikotropika' })],
      ['sales blocked', makeStock({ sales_blocked: true })],
      ['insufficient allocation', makeStock({ available: 1 })],
    ]
    for (const [label, row] of cases) {
      const { repository } = makeRepository({ stocks: { 'pharmacy-1': [row] } })
      expect(await buildCheckoutQuote(repository, pickup)).toEqual({
        ok: false,
        reason: 'pharmacy-unavailable',
      })
    }
  })

  test('skips a closed prescription service and chooses the next eligible pharmacy', async () => {
    const rx = makeStock({ requires_prescription: true })
    const { repository, calls } = makeRepository({
      pharmacies: [makePharmacy('closed'), makePharmacy('open')],
      stocks: { closed: [rx], open: [rx] },
      prescriptionOpen: { closed: false, open: true },
      prescriptionHours: [{ weekday: 1, opens_at: '09:00', closes_at: '17:00', timezone: 'Asia/Jakarta' }],
    })
    const result = await buildCheckoutQuote(repository, pickup)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.quote.pharmacy.id).toBe('open')
    expect(calls.prescriptionChecks).toEqual(['closed', 'open'])
    expect(result.quote.prescriptionHours).toEqual([{
      weekday: 1, opensAt: '09:00', closesAt: '17:00', timezone: 'Asia/Jakarta',
    }])
  })

  test('filters delivery by postal code and saves address and fee snapshots', async () => {
    const { repository, calls } = makeRepository({
      address: makeAddress(),
      pharmacies: [
        makePharmacy('outside', { postal_codes: ['99999'] }),
        makePharmacy('delivery', { delivery_fee: '7.50' }),
      ],
    })
    const result = await buildCheckoutQuote(repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, shipping)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.quote.pharmacy.id).toBe('delivery')
    expect(result.quote.totals.shippingFee).toBe('12500.00')
    expect(result.quote.shipping).toMatchObject({ originId: 456, destinationId: 123, weightGrams: 450, courierCode: 'jne' })
    expect(calls.stock.map(([id]) => id)).toEqual(['delivery'])
    expect(calls.saved[0]).toMatchObject({
      addressId: ADDRESS_ID,
      addressSnapshot: { recipientName: 'Arya', postalCode: '11840', rajaongkirDestinationId: 123 },
      shippingSnapshot: { originId: 456, destinationId: 123, weightGrams: 450 },
    })
  })

  test('tries another eligible pharmacy when the first origin has no courier route', async () => {
    const { repository } = makeRepository({
      pharmacies: [
        makePharmacy('no-route', { rajaongkir_origin_id: 111 }),
        makePharmacy('route', { rajaongkir_origin_id: 222 }),
      ],
    })
    const originCalls: number[] = []
    const provider: ShippingCalculator = {
      calculate: async ({ originId, destinationId, weightGrams }) => {
        originCalls.push(originId)
        if (originId === 111) return null
        return {
          provider: 'RajaOngkir' as const,
          courierName: 'JNE', courierCode: 'jne', service: 'REG', description: 'Regular',
          cost: '9000.00', etd: '1-2 hari', originId, destinationId, weightGrams,
        }
      },
    }
    const result = await buildCheckoutQuote(repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, provider)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.quote.pharmacy.id).toBe('route')
    expect(result.quote.totals.shippingFee).toBe('9000.00')
    expect(originCalls).toEqual([111, 222])
  })

  test('requires all product package dimensions before offering delivery', async () => {
    const noDimensions = makeRepository({
      stocks: { 'pharmacy-1': [makeStock({ shipping_height_cm: null })] },
    })
    expect(await buildCheckoutQuote(noDimensions.repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, shipping)).toEqual({ ok: false, reason: 'shipping-dimensions-missing' })
    await expect(requestCheckoutQuote(noDimensions.repository, 'customer-1', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      fulfillmentMethod: 'delivery',
      addressId: ADDRESS_ID,
    }, shipping)).rejects.toMatchObject({
      status: 422,
      code: 'PRODUCT_DIMENSIONS_NOT_CONFIGURED',
    })
  })

  test('returns address-not-found and pharmacy-unavailable reasons', async () => {
    const noAddress = makeRepository({ address: null })
    expect(await buildCheckoutQuote(noAddress.repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    })).toEqual({ ok: false, reason: 'address-not-found' })
    const noPharmacy = makeRepository({ pharmacies: [] })
    expect(await buildCheckoutQuote(noPharmacy.repository, pickup)).toEqual({
      ok: false, reason: 'pharmacy-unavailable',
    })
  })

  test('validates customer input before repository operations and maps unavailable delivery', async () => {
    const { repository, calls } = makeRepository()
    await expect(requestCheckoutQuote(repository, 'customer-1', { items: [], fulfillmentMethod: 'pickup' }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_ITEMS' })
    await expect(requestCheckoutQuote(repository, 'customer-1', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }], fulfillmentMethod: 'invalid',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_FULFILLMENT' })
    await expect(requestCheckoutQuote(repository, 'customer-1', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }], fulfillmentMethod: 'delivery', addressId: ADDRESS_ID,
    }, {
      calculate: async () => { throw new ApplicationError(503, 'SHIPPING_PROVIDER_NOT_CONFIGURED', 'Not configured') },
    })).rejects.toMatchObject({ status: 503, code: 'SHIPPING_PROVIDER_NOT_CONFIGURED' })
    expect(calls.stock).toEqual([['pharmacy-1', [PRODUCT_ID]]])
    expect(calls.saved).toEqual([])
  })

  test('requires a resolved destination and known product weights for delivery', async () => {
    const noDestinationAddress = { ...makeAddress(), rajaongkir_destination_id: null }
    const noDestination = makeRepository({ address: noDestinationAddress })
    expect(await buildCheckoutQuote(noDestination.repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, shipping)).toEqual({ ok: false, reason: 'address-destination-missing' })
    expect(noDestination.calls.stock).toEqual([])

    const noWeight = makeRepository({ stocks: { 'pharmacy-1': [makeStock({ shipping_weight_grams: 0 })] } })
    expect(await buildCheckoutQuote(noWeight.repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, shipping)).toEqual({ ok: false, reason: 'shipping-weight-missing' })

    const noOrigin = makeRepository({ pharmacies: [makePharmacy('no-origin', { rajaongkir_origin_id: null })] })
    expect(await buildCheckoutQuote(noOrigin.repository, {
      ...pickup, addressId: ADDRESS_ID, fulfillmentMethod: 'delivery',
    }, shipping)).toEqual({ ok: false, reason: 'shipping-origin-missing' })
  })

  test('maps unavailable stock to a conflict and returns reservation metadata', async () => {
    const unavailable = makeRepository({ stocks: { 'pharmacy-1': [] } })
    await expect(requestCheckoutQuote(unavailable.repository, 'customer-1', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }], fulfillmentMethod: 'pickup',
    })).rejects.toMatchObject({ status: 409, code: 'PHARMACY_UNAVAILABLE' })
    const available = makeRepository()
    const quote = await requestCheckoutQuote(available.repository, 'customer-1', {
      items: [{ productId: PRODUCT_ID, quantity: '2' }], fulfillmentMethod: 'pickup',
    })
    expect(quote.quoteId).toBe('quote-1')
    expect(quote.reservationMinutes).toBeGreaterThan(0)
    expect(quote.message).toContain('diperiksa sekali lagi')
  })
})
