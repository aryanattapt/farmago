import { amount } from '../../../shared/domain/money'
import { ApplicationError } from '../../../shared/application-error'
import { publicProduct } from '../../../shared/domain/product-view'
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
  shipping_width_cm: number | null
  shipping_height_cm: number | null
  shipping_length_cm: number | null
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
  delivery_contact_name: string | null
  delivery_phone: string | null
  delivery_email: string | null
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
  fulfillment_method: string
  shipment_status: string | null
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
    deliveryContact?: Partial<Pick<UpdatePharmacyRequestDto, 'deliveryContactName' | 'deliveryPhone' | 'deliveryEmail'>>,
  ): Promise<AdministrationResult<unknown>>
}

export type ProductValues = {
  sku: string
  name: string
  category: string
  sellUnit: string
  shippingWeightGrams: number
  shippingWidthCm: number
  shippingHeightCm: number
  shippingLengthCm: number
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
  deliveryContactName: string
  deliveryPhone: string
  deliveryEmail: string
}

export async function listAdminProducts(repository: AdministrationRepository) {
  return (await repository.listProducts()).map((row) => ({
    ...publicProduct(row),
    status: row.status,
    shippingWeightGrams: row.shipping_weight_grams,
    shippingWidthCm: row.shipping_width_cm,
    shippingHeightCm: row.shipping_height_cm,
    shippingLengthCm: row.shipping_length_cm,
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
    deliveryContactName: row.delivery_contact_name,
    deliveryPhone: row.delivery_phone,
    deliveryEmail: row.delivery_email,
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
    fulfillmentMethod: row.fulfillment_method,
    shipmentStatus: row.shipment_status,
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
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Isi produk tidak valid.')
  const allowed = [
    'sku', 'name', 'category', 'sellUnit', 'description', 'requiresPrescription',
    'batchTrackingRequired', 'specialHandling', 'shippingWeightGrams', 'shippingWidthCm',
    'shippingHeightCm', 'shippingLengthCm',
  ]
  const fields = input as Record<string, unknown>
  if (Object.keys(fields).some((key) => !allowed.includes(key)))
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Produk memuat field yang tidak didukung.')
  for (const field of ['sku', 'name', 'category', 'sellUnit'] as const)
    if (fields[field] !== undefined && typeof fields[field] !== 'string')
      throw new ApplicationError(400, 'INVALID_PRODUCT', `Field ${field} harus berupa teks.`)
  for (const field of ['requiresPrescription', 'batchTrackingRequired', 'specialHandling'] as const)
    if (fields[field] !== undefined && typeof fields[field] !== 'boolean')
      throw new ApplicationError(400, 'INVALID_PRODUCT', `Field ${field} harus bernilai true atau false.`)
  if (fields.description !== undefined && (typeof fields.description !== 'string' || fields.description.length > 3000))
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Keterangan produk maksimal 3000 karakter.')
  const parseRequiredInteger = (value: unknown, min: number, max: number) => {
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN
    return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : Number.NaN
  }
  const sku = String(input.sku ?? '')
    .trim()
    .toUpperCase()
  const name = String(input.name ?? '').trim()
  const category = String(input.category ?? '').trim()
  const sellUnit = String(input.sellUnit ?? '').trim()
  const shippingWeightGrams = parseRequiredInteger(input.shippingWeightGrams, 1, 30000)
  const shippingWidthCm = parseRequiredInteger(input.shippingWidthCm, 1, 200)
  const shippingHeightCm = parseRequiredInteger(input.shippingHeightCm, 1, 200)
  const shippingLengthCm = parseRequiredInteger(input.shippingLengthCm, 1, 200)
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
    shippingWeightGrams > 30000 ||
    ![shippingWidthCm, shippingHeightCm, shippingLengthCm].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 200)
  )
    throw new ApplicationError(
      400,
      'INVALID_PRODUCT',
      'SKU, nama, kategori, satuan, berat, dan dimensi kemasan harus valid (dimensi 1–200 cm).',
    )
  return repository.createProduct(actorId, input, { sku, name, category, sellUnit, shippingWeightGrams, shippingWidthCm, shippingHeightCm, shippingLengthCm })
}

export async function configureAdminInventory(
  repository: AdministrationRepository,
  actorId: string,
  input: ConfigureInventoryRequestDto,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApplicationError(400, 'INVALID_INVENTORY', 'Isi perubahan stok tidak valid.')
  const pharmacyId = String(input.pharmacyId ?? '')
  const productId = String(input.productId ?? '')
  const parseNumber = (value: unknown) => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim()) return Number(value.trim())
    return Number.NaN
  }
  const onHand = parseNumber(input.onHand)
  const unitPrice = parseNumber(input.unitPrice)
  const validUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  if (
    !validUuid(pharmacyId) ||
    !validUuid(productId) ||
    !Number.isInteger(onHand) ||
    onHand < 0 ||
    onHand > 2_147_483_647 ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 999_999_999_999.99 ||
    Math.abs(Math.round(unitPrice * 100) - unitPrice * 100) > 0.000001
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
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Isi perubahan produk tidak valid.')
  const allowed = [
    'name',
    'description',
    'category',
    'sellUnit',
    'requiresPrescription',
    'batchTrackingRequired',
    'specialHandling',
    'shippingWeightGrams',
    'shippingWidthCm',
    'shippingHeightCm',
    'shippingLengthCm',
    'status',
  ]
  const values = input as Record<string, unknown>
  if (Object.keys(values).some((key) => !allowed.includes(key)))
    throw new ApplicationError(
      400,
      'INVALID_PRODUCT',
      'Perubahan produk memuat field yang tidak didukung.',
    )
  const normalized: UpdateProductRequestDto = {}
  const validateText = (field: 'name' | 'description' | 'category' | 'sellUnit', min: number, max: number) => {
    const value = values[field]
    if (value === undefined || value === null) return
    if (typeof value !== 'string')
      throw new ApplicationError(400, 'INVALID_PRODUCT', `Field ${field} harus berupa teks.`)
    const cleaned = field === 'description' ? value : value.trim()
    if (cleaned.length < min || cleaned.length > max)
      throw new ApplicationError(400, 'INVALID_PRODUCT', `Field ${field} harus berisi ${min}–${max} karakter.`)
    normalized[field] = cleaned
  }
  validateText('name', 2, 160)
  validateText('description', 0, 3000)
  validateText('category', 2, 80)
  validateText('sellUnit', 2, 100)
  for (const field of ['requiresPrescription', 'batchTrackingRequired', 'specialHandling'] as const) {
    const value = values[field]
    if (value === undefined || value === null) continue
    if (typeof value !== 'boolean')
      throw new ApplicationError(400, 'INVALID_PRODUCT', `Field ${field} harus bernilai true atau false.`)
    normalized[field] = value
  }
  const parseInteger = (field: 'shippingWeightGrams' | 'shippingWidthCm' | 'shippingHeightCm' | 'shippingLengthCm', min: number, max: number) => {
    const value = values[field]
    if (value === undefined || value === null) return
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN
    if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max)
      throw new ApplicationError(400, 'INVALID_PRODUCT', field === 'shippingWeightGrams'
        ? 'Berat kemasan harus berupa bilangan bulat 0 sampai 30000 gram.'
        : 'Dimensi kemasan harus berupa bilangan bulat 1 sampai 200 cm.')
    normalized[field] = numeric
  }
  parseInteger('shippingWeightGrams', 0, 30000)
  parseInteger('shippingWidthCm', 1, 200)
  parseInteger('shippingHeightCm', 1, 200)
  parseInteger('shippingLengthCm', 1, 200)
  if (values.status !== undefined && values.status !== null) {
    if (typeof values.status !== 'string' || !['active', 'inactive'].includes(values.status))
      throw new ApplicationError(400, 'INVALID_STATUS', 'Status produk tidak valid.')
    normalized.status = values.status
  }
  if (!Object.keys(normalized).length)
    throw new ApplicationError(400, 'INVALID_PRODUCT', 'Isi minimal satu perubahan produk yang valid.')
  if (Object.prototype.hasOwnProperty.call(values, 'status') && values.status === null)
    throw new ApplicationError(400, 'INVALID_STATUS', 'Status produk tidak valid.')
  const result = await repository.updateProduct(actorId, productId, normalized)
  if (!result.ok) throw new ApplicationError(404, 'NOT_FOUND', 'Produk tidak ditemukan.')
  return result.value
}

export function createAdminPharmacy(
  repository: AdministrationRepository,
  actorId: string,
  input: CreatePharmacyRequestDto,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApplicationError(400, 'INVALID_PHARMACY', 'Isi apotek tidak valid.')
  const fields = input as Record<string, unknown>
  const allowed = ['name', 'addressText', 'city', 'postalCodes', 'licenseReference', 'rajaongkirOriginId', 'deliveryContactName', 'deliveryPhone', 'deliveryEmail']
  if (Object.keys(fields).some((key) => !allowed.includes(key)))
    throw new ApplicationError(400, 'INVALID_PHARMACY', 'Apotek memuat field yang tidak didukung.')
  for (const field of ['name', 'addressText', 'city', 'licenseReference', 'deliveryContactName', 'deliveryPhone', 'deliveryEmail'] as const)
    if (fields[field] !== undefined && typeof fields[field] !== 'string')
      throw new ApplicationError(400, 'INVALID_PHARMACY', `Field ${field} harus berupa teks.`)
  if (input.licenseReference != null && input.licenseReference.length > 160)
    throw new ApplicationError(400, 'INVALID_PHARMACY', 'Referensi izin maksimal 160 karakter.')
  const name = String(input.name ?? '').trim()
  const address = String(input.addressText ?? '').trim()
  const city = String(input.city ?? '').trim()
  const postalCodes = Array.isArray(input.postalCodes) && input.postalCodes.every((value): value is string => typeof value === 'string')
    ? [...new Set(input.postalCodes.map((value) => value.trim()))]
    : []
  const deliveryContactName = String(input.deliveryContactName ?? '').trim()
  const deliveryPhone = String(input.deliveryPhone ?? '').trim()
  const deliveryEmail = String(input.deliveryEmail ?? '').trim()
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
    deliveryContactName.length < 2 || deliveryContactName.length > 100 ||
    !/^(?:\+?62|0|8)[\d\s()-]{8,18}$/.test(deliveryPhone) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail) || deliveryEmail.length > 200 ||
    (rajaongkirOriginId != null &&
      (!Number.isSafeInteger(rajaongkirOriginId) || rajaongkirOriginId <= 0))
  )
    throw new ApplicationError(
      400,
      'INVALID_PHARMACY',
      'Nama, alamat, kota, kode pos, dan kontak pengirim apotek harus valid.',
    )
  return repository.createPharmacy(actorId, input, { name, address, city, postalCodes, rajaongkirOriginId, deliveryContactName, deliveryPhone, deliveryEmail })
}

export async function updateAdminPharmacy(
  repository: AdministrationRepository,
  actorId: string,
  pharmacyId: string,
  input: UpdatePharmacyRequestDto,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApplicationError(400, 'INVALID_PHARMACY_UPDATE', 'Isi perubahan apotek tidak valid.')
  const values = input as Record<string, unknown>
  const allowed = ['status', 'rajaongkirOriginId', 'deliveryContactName', 'deliveryPhone', 'deliveryEmail']
  if (Object.keys(values).some((key) => !allowed.includes(key)))
    throw new ApplicationError(400, 'INVALID_PHARMACY_UPDATE', 'Perubahan apotek memuat field yang tidak didukung.')
  const status = input.status === undefined ? null : input.status
  const hasOrigin = Object.prototype.hasOwnProperty.call(values, 'rajaongkirOriginId')
  const hasDeliveryContact =
    Object.prototype.hasOwnProperty.call(values, 'deliveryContactName') ||
    Object.prototype.hasOwnProperty.call(values, 'deliveryPhone') ||
    Object.prototype.hasOwnProperty.call(values, 'deliveryEmail')
  const normalizeOptionalText = (field: 'deliveryContactName' | 'deliveryPhone' | 'deliveryEmail') => {
    const value = values[field]
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value !== 'string')
      throw new ApplicationError(400, 'INVALID_DELIVERY_CONTACT', 'Kontak pengirim apotek harus berupa teks.')
    const cleaned = value.trim()
    return field === 'deliveryEmail' ? cleaned.toLowerCase() : cleaned
  }
  const deliveryContact = hasDeliveryContact
    ? {
        ...(Object.prototype.hasOwnProperty.call(values, 'deliveryContactName')
          ? { deliveryContactName: normalizeOptionalText('deliveryContactName')! }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(values, 'deliveryPhone')
          ? { deliveryPhone: normalizeOptionalText('deliveryPhone')! }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(values, 'deliveryEmail')
          ? { deliveryEmail: normalizeOptionalText('deliveryEmail')! }
          : {}),
      }
    : undefined
  if (deliveryContact) {
    const { deliveryContactName, deliveryPhone, deliveryEmail } = deliveryContact
    if (
      (deliveryContactName != null && (deliveryContactName.length < 2 || deliveryContactName.length > 100)) ||
      (deliveryPhone != null && !/^(?:\+?62|0|8)[\d\s()-]{8,18}$/.test(deliveryPhone)) ||
      (deliveryEmail != null && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail) || deliveryEmail.length > 200))
    )
      throw new ApplicationError(400, 'INVALID_DELIVERY_CONTACT', 'Nama, telepon, dan email kontak pengirim apotek harus valid.')
  }
  let originId: number | null | undefined
  if (Object.prototype.hasOwnProperty.call(values, 'status')) {
    if (typeof status !== 'string' || !['pending', 'active', 'suspended'].includes(status))
      throw new ApplicationError(400, 'INVALID_STATUS', 'Status apotek tidak valid.')
  }
  if (hasOrigin) {
    originId =
      input.rajaongkirOriginId == null || input.rajaongkirOriginId === ''
        ? null
        : typeof input.rajaongkirOriginId === 'number'
          ? input.rajaongkirOriginId
          : typeof input.rajaongkirOriginId === 'string' && /^\d+$/.test(input.rajaongkirOriginId.trim())
            ? Number(input.rajaongkirOriginId.trim())
            : Number.NaN
    if (originId != null && (!Number.isSafeInteger(originId) || originId <= 0))
      throw new ApplicationError(400, 'INVALID_SHIPPING_ORIGIN', 'ID lokasi asal RajaOngkir tidak valid.')
  }
  if (!Object.keys(values).length)
    throw new ApplicationError(400, 'INVALID_PHARMACY_UPDATE', 'Perubahan apotek kosong.')
  const result = hasDeliveryContact
    ? await repository.updatePharmacy(actorId, pharmacyId, status, originId, deliveryContact)
    : await repository.updatePharmacy(actorId, pharmacyId, status, originId)
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Apotek tidak ditemukan.')
  throw new ApplicationError(
    422,
    'PHARMACY_ONBOARDING_INCOMPLETE',
    'Lengkapi izin, wilayah layanan, asal ongkir, kontak pengirim, stok daring, dan jam pemeriksaan resep sebelum aktivasi.',
  )
}
