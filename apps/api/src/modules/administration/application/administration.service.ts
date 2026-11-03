import { amount } from '../../../shared/domain/money'
import { ApplicationError } from '../../../shared/application-error'
import { publicProduct } from '../../catalog'
import type {
  ConfigureInventoryRequestDto,
  CreatePharmacyRequestDto,
  CreateProductRequestDto,
  UpdatePharmacyRequestDto,
  UpdateProductRequestDto,
} from './administration.dto'

export type AdministrationProductRow = {
  id: string
  sku: string
  name: string
  description: string | null
  category: string
  sell_unit: string
  requires_prescription: boolean
  batch_tracking_required: boolean
  indicative_price: string
  available: number
  status: string
  shipping_weight_grams: number
}
export type AdministrationPharmacyRow = {
  id: string
  name: string
  address_text: string
  city: string
  postal_codes: string[]
  status: string
  license_reference: string | null
  rajaongkir_origin_id: number | null
  created_at: Date
}
export type AdministrationOrderRow = {
  id: string
  status: string
  fulfillment_method: string
  total: string | number
  created_at: Date
  expires_at: Date | null
  customer_name: string
  pharmacy_name: string
}
export type AdministrationCancellationRow = {
  id: string
  order_id: string
  reason: string
  status: string
  order_status: string
  total: string | number
  customer_name: string
  pharmacy_name: string
  created_at: Date
}
export type AdministrationSupportRow = {
  id: string
  order_id: string
  category: string
  status: string
  description: string
  created_at: Date
  order_status: string
  customer_name: string
  pharmacy_name: string
}

export type AdministrationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not-found' | 'reservation-conflict' | 'onboarding-incomplete' }

export interface AdministrationRepository {
  listProducts(): Promise<AdministrationProductRow[]>
  listPharmacies(): Promise<AdministrationPharmacyRow[]>
  listOrders(): Promise<AdministrationOrderRow[]>
  listCancellationRequests(): Promise<AdministrationCancellationRow[]>
  listSupportCases(): Promise<AdministrationSupportRow[]>
  createProduct(
    actorId: string,
    input: CreateProductRequestDto,
    values: ProductValues,
  ): Promise<unknown>
  configureInventory(
    actorId: string,
    input: ConfigureInventoryRequestDto,
    values: InventoryValues,
  ): Promise<AdministrationResult<InventoryResult>>
  updateProduct(
    actorId: string,
    productId: string,
    input: UpdateProductRequestDto,
  ): Promise<AdministrationResult<unknown>>
  createPharmacy(
    actorId: string,
    input: CreatePharmacyRequestDto,
    values: PharmacyValues,
  ): Promise<unknown>
  updatePharmacy(
    actorId: string,
    pharmacyId: string,
    status: string | null,
    originId?: number | null,
  ): Promise<AdministrationResult<unknown>>
}

export type ProductValues = {
  sku: string
  name: string
  category: string
  sellUnit: string
  shippingWeightGrams: number
}
export type InventoryValues = {
  pharmacyId: string
  productId: string
  onHand: number
  unitPrice: number
}
export type InventoryResult = Omit<InventoryValues, 'unitPrice'> & {
  reserved: number
  available: number
  unitPrice: string
}
export type PharmacyValues = {
  name: string
  address: string
  city: string
  postalCodes: string[]
  rajaongkirOriginId: number | null
}

export async function listAdminProducts(repository: AdministrationRepository) {
  return (await repository.listProducts()).map((row) => ({
    ...publicProduct(row),
    status: row.status,
    shippingWeightGrams: row.shipping_weight_grams,
  }))
}

export async function listAdminPharmacies(repository: AdministrationRepository) {
  return (await repository.listPharmacies()).map((row) => ({
    id: row.id,
    name: row.name,
    addressText: row.address_text,
    city: row.city,
    postalCodes: row.postal_codes,
    status: row.status,
    licenseReference: row.license_reference,
    rajaongkirOriginId: row.rajaongkir_origin_id,
    createdAt: row.created_at,
  }))
}

export async function listAdminOrders(repository: AdministrationRepository) {
  return (await repository.listOrders()).map((row) => ({
    id: row.id,
    status: row.status,
    fulfillmentMethod: row.fulfillment_method,
    total: amount(row.total),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    customerName: row.customer_name,
    pharmacyName: row.pharmacy_name,
  }))
}

export async function listAdminCancellationRequests(repository: AdministrationRepository) {
  return (await repository.listCancellationRequests()).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    reason: row.reason,
    status: row.status,
    orderStatus: row.order_status,
    total: amount(row.total),
    customerName: row.customer_name,
    pharmacyName: row.pharmacy_name,
    createdAt: row.created_at,
  }))
}

export async function listAdminSupportCases(repository: AdministrationRepository) {
  return (await repository.listSupportCases()).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    category: row.category,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
    orderStatus: row.order_status,
    customerName: row.customer_name,
    pharmacyName: row.pharmacy_name,
  }))
}

export function createAdminProduct(
  repository: AdministrationRepository,
  actorId: string,
  input: CreateProductRequestDto,
) {
  const sku = String(input.sku ?? '')
    .trim()
    .toUpperCase()
  const name = String(input.name ?? '').trim()
  const category = String(input.category ?? '').trim()
  const sellUnit = String(input.sellUnit ?? '').trim()
  const shippingWeightGrams = Number(input.shippingWeightGrams)
  if (
    !/^[A-Z0-9_-]{2,40}$/.test(sku) ||
    name.length < 2 ||
    name.length > 160 ||
    category.length < 2 ||
    category.length > 80 ||
    sellUnit.length < 2 ||
    sellUnit.length > 100 ||
    !Number.isSafeInteger(shippingWeightGrams) ||
    shippingWeightGrams < 1 ||
    shippingWeightGrams > 30000
  )
    throw new ApplicationError(
      400,
      'INVALID_PRODUCT',
      'SKU, nama, kategori, satuan jual, dan berat kemasan 1 sampai 30000 gram harus valid.',
    )
  return repository.createProduct(actorId, input, { sku, name, category, sellUnit, shippingWeightGrams })
}

export async function configureAdminInventory(
  repository: AdministrationRepository,
  actorId: string,
  input: ConfigureInventoryRequestDto,
) {
  const pharmacyId = String(input.pharmacyId ?? '')
  const productId = String(input.productId ?? '')
  const onHand = Number(input.onHand)
  const unitPrice = Number(input.unitPrice)
  const validUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  if (
    !validUuid(pharmacyId) ||
    !validUuid(productId) ||
    !Number.isInteger(onHand) ||
    onHand < 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  )
    throw new ApplicationError(
      400,
      'INVALID_INVENTORY',
      'Apotek, produk, alokasi, dan harga harus valid.',
    )
  const result = await repository.configureInventory(actorId, input, {
    pharmacyId,
    productId,
    onHand,
    unitPrice,
  })
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Apotek atau produk tidak ditemukan.')
  throw new ApplicationError(
    409,
    'RESERVATION_CONFLICT',
    'Alokasi baru tidak boleh lebih rendah dari stok yang sudah direservasi.',
  )
}

export async function updateAdminProduct(
  repository: AdministrationRepository,
  actorId: string,
  productId: string,
  input: UpdateProductRequestDto,
) {
  const allowed = [
    'name',
    'description',
    'category',
    'sellUnit',
    'requiresPrescription',
    'batchTrackingRequired',
    'specialHandling',
    'shippingWeightGrams',
    'status',
  ]
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new ApplicationError(
      400,
      'INVALID_PRODUCT',
      'Perubahan produk memuat field yang tidak didukung.',
    )
  if (
    input.shippingWeightGrams != null &&
    (!Number.isSafeInteger(Number(input.shippingWeightGrams)) ||
      Number(input.shippingWeightGrams) < 0 || Number(input.shippingWeightGrams) > 30000)
  )
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Berat kemasan harus berupa bilangan bulat 0 sampai 30000 gram.')
  if (input.status !== undefined && !['active', 'inactive'].includes(input.status))
    throw new ApplicationError(400, 'INVALID_STATUS', 'Status produk tidak valid.')
  const result = await repository.updateProduct(actorId, productId, input)
  if (!result.ok) throw new ApplicationError(404, 'NOT_FOUND', 'Produk tidak ditemukan.')
  return result.value
}

export function createAdminPharmacy(
  repository: AdministrationRepository,
  actorId: string,
  input: CreatePharmacyRequestDto,
) {
  const name = String(input.name ?? '').trim()
  const address = String(input.addressText ?? '').trim()
  const city = String(input.city ?? '').trim()
  const postalCodes = Array.isArray(input.postalCodes)
    ? [...new Set(input.postalCodes.map((value) => String(value).trim()))]
    : []
  const rajaongkirOriginId =
    input.rajaongkirOriginId == null || input.rajaongkirOriginId === ''
      ? null
      : Number(input.rajaongkirOriginId)
  if (
    name.length < 2 ||
    name.length > 160 ||
    address.length < 5 ||
    address.length > 500 ||
    city.length < 2 ||
    city.length > 100 ||
    !postalCodes.length ||
    postalCodes.some((code) => !/^\d{4,10}$/.test(code)) ||
    (rajaongkirOriginId != null &&
      (!Number.isSafeInteger(rajaongkirOriginId) || rajaongkirOriginId <= 0))
  )
    throw new ApplicationError(
      400,
      'INVALID_PHARMACY',
      'Nama, alamat, kota, dan kode pos layanan harus valid.',
    )
  return repository.createPharmacy(actorId, input, { name, address, city, postalCodes, rajaongkirOriginId })
}

export async function updateAdminPharmacy(
  repository: AdministrationRepository,
  actorId: string,
  pharmacyId: string,
  input: UpdatePharmacyRequestDto,
) {
  const status = input.status == null ? null : String(input.status)
  const hasOrigin = input.rajaongkirOriginId !== undefined
  let originId: number | null | undefined
  if (status !== null && !['pending', 'active', 'suspended'].includes(status))
    throw new ApplicationError(400, 'INVALID_STATUS', 'Status apotek tidak valid.')
  if (hasOrigin) {
    originId =
      input.rajaongkirOriginId == null || input.rajaongkirOriginId === ''
        ? null
        : Number(input.rajaongkirOriginId)
    if (originId != null && (!Number.isSafeInteger(originId) || originId <= 0))
      throw new ApplicationError(400, 'INVALID_SHIPPING_ORIGIN', 'ID lokasi asal RajaOngkir tidak valid.')
  }
  if (status === null && !hasOrigin)
    throw new ApplicationError(400, 'INVALID_PHARMACY_UPDATE', 'Perubahan apotek kosong.')
  const result = await repository.updatePharmacy(actorId, pharmacyId, status, originId)
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Apotek tidak ditemukan.')
  throw new ApplicationError(
    422,
    'PHARMACY_ONBOARDING_INCOMPLETE',
    'Lengkapi referensi izin, wilayah layanan, alokasi stok daring, dan jam pemeriksaan resep sebelum aktivasi.',
  )
}