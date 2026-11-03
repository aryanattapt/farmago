import { RESERVATION_MINUTES, serviceFee } from '../../../shared/config'
import { ApplicationError } from '../../../shared/application-error'
import { buildQuoteSnapshot, type QuoteSnapshot } from './build-quote'
import type {
  BuildQuoteInputDto,
  CreateQuoteRequestDto,
  QuoteAddressDto,
  QuoteResponseDto,
} from './quote.dto'
import { parseCartItems } from '../domain/cart'
import {
  calculateLowestShippingOption,
  packageWeightGrams,
  type ShippingSnapshot,
} from '../../shipping'

type AddressRow = {
  id: string
  recipient_name: string
  phone: string
  address_text: string
  city: string
  postal_code: string
  rajaongkir_destination_id: number | null
}

type PharmacyRow = {
  id: string
  name: string
  address_text: string
  postal_codes: string[]
  delivery_fee: string | null
  rajaongkir_origin_id: number | null
}

type StockRow = {
  id: string
  sku: string
  name: string
  category: string
  sell_unit: string
  requires_prescription: boolean
  batch_tracking_required: boolean
  status: string
  special_handling: boolean
  unit_price: string
  available: number
  sales_blocked: boolean
  shipping_weight_grams: number
}

export interface CheckoutRepository {
  findAddress(addressId: string, customerId: string): Promise<AddressRow | null>
  listActivePharmacies(): Promise<PharmacyRow[]>
  findStock(pharmacyId: string, productIds: string[]): Promise<StockRow[]>
  isPrescriptionServiceOpen(pharmacyId: string): Promise<boolean>
  saveQuote(input: {
    customerId: string
    pharmacyId: string
    addressId: string | null
    addressSnapshot: QuoteAddressDto | null
    fulfillmentMethod: 'pickup' | 'delivery'
    items: QuoteSnapshot['items']
    totals: QuoteSnapshot['totals']
    fingerprint: string
    shippingSnapshot: ShippingSnapshot | null
  }): Promise<{ id: string; expiresAt: Date }>
  listPrescriptionHours(
    pharmacyId: string,
  ): Promise<Array<{ weekday: number; opens_at: string; closes_at: string; timezone: string }>>
}

export type BuildQuoteResult =
  | { ok: true; quote: QuoteResponseDto }
  | {
      ok: false
      reason:
        | 'address-not-found'
        | 'address-destination-missing'
        | 'shipping-weight-missing'
        | 'shipping-origin-missing'
        | 'shipping-unavailable'
        | 'pharmacy-unavailable'
        | 'stock-changed'
    }

export type ShippingCalculator = {
  calculate(input: {
    originId: number
    destinationId: number
    weightGrams: number
  }): Promise<ShippingSnapshot | null>
}

const defaultShippingCalculator: ShippingCalculator = {
  calculate: calculateLowestShippingOption,
}

export async function buildCheckoutQuote(
  repository: CheckoutRepository,
  input: BuildQuoteInputDto,
  shipping: ShippingCalculator = defaultShippingCalculator,
): Promise<BuildQuoteResult> {
  const address =
    input.fulfillmentMethod === 'delivery' && input.addressId
      ? await repository.findAddress(input.addressId, input.customerId)
      : null
  if (input.fulfillmentMethod === 'delivery' && !address)
    return { ok: false, reason: 'address-not-found' }
  if (input.fulfillmentMethod === 'delivery' && !address?.rajaongkir_destination_id)
    return { ok: false, reason: 'address-destination-missing' }

  let chosen: { pharmacy: PharmacyRow; stock: StockRow[] } | null = null
  let shippingSnapshot: ShippingSnapshot | null = null
  let missingShippingOrigin = false
  let noShippingRoute = false
  for (const pharmacy of await repository.listActivePharmacies()) {
    if (
      input.fulfillmentMethod === 'delivery' &&
      pharmacy.postal_codes.length > 0 &&
      !pharmacy.postal_codes.includes(address!.postal_code)
    )
      continue

    const stock = await repository.findStock(
      pharmacy.id,
      input.items.map((item) => item.productId),
    )
    const unavailable =
      stock.length !== input.items.length ||
      stock.some(
        (row) =>
          row.status !== 'active' ||
          row.special_handling ||
          ['narkotika', 'psikotropika'].includes(row.category.toLowerCase()) ||
          row.sales_blocked ||
          Number(row.available) <
            (input.items.find((item) => item.productId === row.id)?.quantity ?? 0),
      )
    if (unavailable) continue
    if (
      stock.some((row) => row.requires_prescription) &&
      !(await repository.isPrescriptionServiceOpen(pharmacy.id))
    )
      continue

    if (input.fulfillmentMethod === 'delivery') {
      if (!pharmacy.rajaongkir_origin_id) {
        missingShippingOrigin = true
        continue
      }
      const weightGrams = packageWeightGrams(
        input.items.map((item) => ({
          quantity: item.quantity,
          shippingWeightGrams:
            Number(stock.find((row) => row.id === item.productId)?.shipping_weight_grams) || 0,
        })),
      )
      if (weightGrams == null) return { ok: false, reason: 'shipping-weight-missing' }
      shippingSnapshot = await shipping.calculate({
        originId: Number(pharmacy.rajaongkir_origin_id),
        destinationId: Number(address!.rajaongkir_destination_id),
        weightGrams,
      })
      if (!shippingSnapshot) {
        noShippingRoute = true
        continue
      }
    }
    chosen = { pharmacy, stock }
    break
  }
  if (!chosen) {
    if (noShippingRoute) return { ok: false, reason: 'shipping-unavailable' }
    if (missingShippingOrigin) return { ok: false, reason: 'shipping-origin-missing' }
    return { ok: false, reason: 'pharmacy-unavailable' }
  }

  const addressSnapshot: QuoteAddressDto | null = address
    ? {
        recipientName: address.recipient_name,
        phone: address.phone,
        addressText: address.address_text,
        city: address.city,
        postalCode: address.postal_code,
        rajaongkirDestinationId: Number(address.rajaongkir_destination_id),
      }
    : null
  const snapshot = buildQuoteSnapshot({
    pharmacyId: chosen.pharmacy.id,
    fulfillmentMethod: input.fulfillmentMethod,
    address: addressSnapshot,
    cart: input.items,
    stock: chosen.stock,
    shippingFee: shippingSnapshot?.cost,
    serviceFee,
  })
  if (!snapshot) return { ok: false, reason: 'stock-changed' }

  const quote = await repository.saveQuote({
    customerId: input.customerId,
    pharmacyId: chosen.pharmacy.id,
    addressId: address?.id ?? null,
    addressSnapshot,
    fulfillmentMethod: input.fulfillmentMethod,
    items: snapshot.items,
    totals: snapshot.totals,
    fingerprint: snapshot.fingerprint,
    shippingSnapshot,
  })
  const hours = snapshot.needsPrescription
    ? await repository.listPrescriptionHours(chosen.pharmacy.id)
    : []
  return {
    ok: true,
    quote: {
      quoteId: quote.id,
      expiresAt: quote.expiresAt,
      pharmacy: {
        id: chosen.pharmacy.id,
        name: chosen.pharmacy.name,
        address: chosen.pharmacy.address_text,
      },
      fulfillmentMethod: input.fulfillmentMethod,
      items: snapshot.items,
      totals: snapshot.totals,
      shipping: shippingSnapshot,
      needsPrescription: snapshot.needsPrescription,
      prescriptionHours: hours.map((row) => ({
        weekday: row.weekday,
        opensAt: row.opens_at,
        closesAt: row.closes_at,
        timezone: row.timezone,
      })),
    },
  }
}

export async function requestCheckoutQuote(
  repository: CheckoutRepository,
  customerId: string,
  input: CreateQuoteRequestDto,
  shipping: ShippingCalculator = defaultShippingCalculator,
) {
  const parsedItems = parseCartItems(input.items)
  if (!parsedItems.ok) {
    const message =
      parsedItems.reason === 'INVALID_LENGTH'
        ? 'Keranjang harus berisi 1 sampai 30 produk.'
        : parsedItems.reason === 'DUPLICATE_PRODUCT'
          ? 'Produk yang sama tidak boleh muncul lebih dari satu kali.'
          : 'Produk atau jumlah pada keranjang tidak valid.'
    throw new ApplicationError(400, 'INVALID_ITEMS', message)
  }
  const fulfillmentMethod =
    input.fulfillmentMethod === 'pickup'
      ? 'pickup'
      : input.fulfillmentMethod === 'delivery'
        ? 'delivery'
        : null
  if (!fulfillmentMethod)
    throw new ApplicationError(400, 'INVALID_FULFILLMENT', 'Pilih pengiriman atau ambil di apotek.')
  if (fulfillmentMethod === 'delivery' && !isUuid(String(input.addressId ?? '')))
    throw new ApplicationError(400, 'ADDRESS_REQUIRED', 'Pilih alamat pengiriman.')

  const result = await buildCheckoutQuote(repository, {
    customerId,
    addressId: input.addressId ?? null,
    fulfillmentMethod,
    items: parsedItems.items,
  }, shipping)
  if (!result.ok && result.reason === 'address-not-found')
    throw new ApplicationError(404, 'ADDRESS_NOT_FOUND', 'Alamat tidak ditemukan.')
  if (!result.ok && result.reason === 'address-destination-missing')
    throw new ApplicationError(
      422,
      'ADDRESS_DESTINATION_REQUIRED',
      'Pilih area tujuan dari pencarian RajaOngkir sebelum membuat quote pengiriman.',
    )
  if (!result.ok && result.reason === 'shipping-origin-missing')
    throw new ApplicationError(
      422,
      'PHARMACY_SHIPPING_ORIGIN_NOT_CONFIGURED',
      'Lokasi asal RajaOngkir untuk apotek ini belum diatur oleh admin.',
    )
  if (!result.ok && result.reason === 'shipping-weight-missing')
    throw new ApplicationError(
      422,
      'PRODUCT_WEIGHT_NOT_CONFIGURED',
      'Berat produk belum diatur atau total paket melewati batas. Minta admin memeriksa berat kemasan dalam gram.',
    )
  if (!result.ok && result.reason === 'shipping-unavailable')
    throw new ApplicationError(
      409,
      'SHIPPING_UNAVAILABLE',
      'Tidak ada layanan kurir untuk kombinasi apotek, alamat, dan berat ini.',
    )
  if (!result.ok && result.reason === 'stock-changed')
    throw new ApplicationError(
      409,
      'PHARMACY_UNAVAILABLE',
      'Stok apotek berubah. Perbarui keranjang dan coba lagi.',
    )
  if (!result.ok)
    throw new ApplicationError(
      409,
      'PHARMACY_UNAVAILABLE',
      fulfillmentMethod === 'delivery'
        ? 'Belum ada apotek dengan stok dan ongkir aktif untuk alamat ini. Coba ambil di apotek atau ubah alamat.'
        : 'Belum ada satu apotek yang dapat memenuhi seluruh isi keranjang.',
    )
  return {
    ...result.quote,
    reservationMinutes: RESERVATION_MINUTES,
    message:
      'Ongkir memakai tarif RajaOngkir saat quote dibuat dan berlaku sampai quote kedaluwarsa. Harga dan stok diperiksa sekali lagi saat pesanan dibuat.',
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
