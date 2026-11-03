import { ApplicationError } from '../../../shared/application-error'
import { RajaOngkirClient, type RajaOngkirRate } from '../infrastructure/rajaongkir.client'
import { listActiveRajaOngkirCourierCodes } from '../infrastructure/rajaongkir-courier.repository'

export type ShippingOption = {
  provider: 'RajaOngkir'
  courierName: string
  courierCode: string
  service: string
  description: string
  cost: string
  etd: string
}

export type ShippingSnapshot = ShippingOption & {
  originId: number
  destinationId: number
  weightGrams: number
}

const destinationCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<RajaOngkirClient['searchDomesticDestinations']>> }>()
let client: RajaOngkirClient | null = null
const MAX_PARCEL_WEIGHT_GRAMS = 100_000

export async function searchShippingDestinations(rawSearch: unknown) {
  const search = String(rawSearch ?? '').trim().replace(/\s+/g, ' ')
  if (search.length < 3 || search.length > 100)
    throw new ApplicationError(400, 'INVALID_DESTINATION_QUERY', 'Ketik minimal 3 karakter untuk mencari area.')
  const cacheKey = search.toLocaleLowerCase('id-ID')
  const cached = destinationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = await getClient().searchDomesticDestinations(search)
  if (destinationCache.size >= 200) destinationCache.delete(destinationCache.keys().next().value!)
  destinationCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value })
  return value
}

export async function calculateShippingOptions(input: {
  originId: number
  destinationId: number
  weightGrams: number
}): Promise<ShippingSnapshot[]> {
  if (!Number.isSafeInteger(input.originId) || input.originId <= 0 ||
      !Number.isSafeInteger(input.destinationId) || input.destinationId <= 0 ||
      !Number.isSafeInteger(input.weightGrams) || input.weightGrams <= 0 || input.weightGrams > MAX_PARCEL_WEIGHT_GRAMS)
    throw new ApplicationError(422, 'INVALID_SHIPPING_REQUEST', 'Lokasi dan berat paket tidak valid untuk menghitung ongkir.')
  const courierCodes = await listActiveRajaOngkirCourierCodes()
  const rates = await getClient().calculateDomesticCost(input, courierCodes)
  return [...rates]
    .sort(compareRates)
    .map((rate) => toShippingSnapshot(rate, input.originId, input.destinationId, input.weightGrams))
}

export async function calculateLowestShippingOption(input: {
  originId: number
  destinationId: number
  weightGrams: number
}): Promise<ShippingSnapshot | null> {
  return (await calculateShippingOptions(input))[0] ?? null
}

export function packageWeightGrams(items: Array<{ quantity: number; shippingWeightGrams: number }>) {
  const packagingWeight = Number(process.env.RAJAONGKIR_PACKAGING_WEIGHT_GRAMS ?? 250)
  if (!Number.isSafeInteger(packagingWeight) || packagingWeight < 0 || packagingWeight > 10_000)
    throw new ApplicationError(500, 'SHIPPING_CONFIG_INVALID', 'Berat kemasan RajaOngkir tidak valid.')
  if (!items.length || items.some((item) =>
    !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
    !Number.isSafeInteger(item.shippingWeightGrams) || item.shippingWeightGrams <= 0 || item.shippingWeightGrams > 30_000
  )) return null
  const total = items.reduce((sum, item) => sum + item.quantity * item.shippingWeightGrams, packagingWeight)
  return Number.isSafeInteger(total) && total <= MAX_PARCEL_WEIGHT_GRAMS ? total : null
}

export function toShippingSnapshot(rate: RajaOngkirRate, originId: number, destinationId: number, weightGrams: number): ShippingSnapshot {
  return {
    provider: 'RajaOngkir',
    courierName: rate.courierName,
    courierCode: rate.courierCode,
    service: rate.service,
    description: rate.description,
    cost: rate.cost.toFixed(2),
    etd: rate.etd,
    originId,
    destinationId,
    weightGrams,
  }
}

export function sameShippingSnapshot(left: ShippingSnapshot | null, right: ShippingSnapshot | null) {
  if (!left || !right) return left === right
  return left.provider === right.provider && left.courierCode === right.courierCode &&
    left.service === right.service && left.cost === right.cost && left.originId === right.originId &&
    left.destinationId === right.destinationId && left.weightGrams === right.weightGrams
}

function getClient() {
  client ??= new RajaOngkirClient()
  return client
}

function compareRates(left: RajaOngkirRate, right: RajaOngkirRate) {
  return left.cost - right.cost || left.courierCode.localeCompare(right.courierCode) || left.service.localeCompare(right.service)
}
