import { ApplicationError } from '../../../shared/application-error'

export type KomerceOrderItem = {
  name: string
  variant: string
  quantity: number
  price: number
  weightGrams: number
  widthCm: number | null
  heightCm: number | null
  lengthCm: number | null
}

export type KomerceStoreOrderInput = {
  brandName: string
  orderDate: Date | string
  shipperName: string
  shipperPhone: string
  shipperEmail: string
  shipperDestinationId: number
  shipperAddress: string
  originPinPoint?: string | null
  receiverName: string
  receiverPhone: string
  receiverEmail?: string | null
  receiverDestinationId: number
  receiverAddress: string
  destinationPinPoint?: string | null
  shipping: string
  shippingType: string
  shippingCost: number
  shippingCashback?: number
  additionalCost?: number
  itemValue: number
  orderItems: KomerceOrderItem[]
  notes?: string
}

export function buildKomerceStoreOrderPayload(input: KomerceStoreOrderInput) {
  const shipperPhone = providerPhone(input.shipperPhone)
  const receiverPhone = providerPhone(input.receiverPhone)
  const orderItems = input.orderItems.map((item) => {
    const dimensions = [item.widthCm, item.heightCm, item.lengthCm]
    if (
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      !Number.isSafeInteger(item.price) || item.price < 0 ||
      !Number.isSafeInteger(item.weightGrams) || item.weightGrams < 1 ||
      dimensions.some((value) => !Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 200)
    )
      throw invalidDeliveryData('Dimensi, berat, harga, dan jumlah produk harus dilengkapi sebelum booking kurir.')
    return {
      product_name: clean(item.name, 160),
      product_variant_name: clean(item.variant, 100) || '-',
      product_price: item.price,
      product_weight: item.weightGrams,
      product_width: item.widthCm,
      product_height: item.heightCm,
      product_length: item.lengthCm,
      qty: item.quantity,
      subtotal: item.price * item.quantity,
    }
  })
  const requiredText = [
    input.brandName,
    input.shipperName,
    input.shipperEmail,
    input.shipperAddress,
    input.receiverName,
    input.receiverAddress,
    input.shipping,
    input.shippingType,
  ]
  if (
    requiredText.some((value) => !clean(value, 500)) ||
    !Number.isSafeInteger(input.shipperDestinationId) || input.shipperDestinationId <= 0 ||
    !Number.isSafeInteger(input.receiverDestinationId) || input.receiverDestinationId <= 0 ||
    !Number.isSafeInteger(input.shippingCost) || input.shippingCost < 0 ||
    !Number.isSafeInteger(input.itemValue) || input.itemValue < 0 ||
    !orderItems.length ||
    orderItems.some((item) => !Number.isSafeInteger(item.subtotal))
  )
    throw invalidDeliveryData('Kontak pengirim, lokasi, layanan, atau rincian produk belum lengkap.')
  const origin = pinPoint(input.originPinPoint)
  const destination = pinPoint(input.destinationPinPoint)
  return {
    order_date: new Date(input.orderDate).toISOString(),
    brand_name: clean(input.brandName, 80),
    shipper_name: clean(input.shipperName, 100),
    shipper_phone: shipperPhone,
    shipper_email: clean(input.shipperEmail, 200),
    shipper_destination_id: input.shipperDestinationId,
    shipper_address: clean(input.shipperAddress, 500),
    ...(origin ? { origin_pin_point: origin } : {}),
    receiver_name: clean(input.receiverName, 100),
    receiver_phone: receiverPhone,
    receiver_destination_id: input.receiverDestinationId,
    receiver_address: clean(input.receiverAddress, 500),
    ...(input.receiverEmail ? { receiver_email: clean(input.receiverEmail, 200) } : {}),
    ...(destination ? { destination_pin_point: destination } : {}),
    shipping: clean(input.shipping, 40).toUpperCase(),
    shipping_type: clean(input.shippingType, 80),
    payment_method: 'BANK TRANSFER',
    shipping_cost: input.shippingCost,
    shipping_cashback: input.shippingCashback ?? 0,
    service_fee: 0,
    additional_cost: input.additionalCost ?? 0,
    grand_total: input.itemValue + input.shippingCost + (input.additionalCost ?? 0),
    cod_value: 0,
    insurance_value: 0,
    notes: clean(input.notes ?? 'Farmasi', 300),
    order_details: orderItems,
  }
}

export function validateKomercePickupInput(input: {
  pickupDate: unknown
  pickupTime: unknown
  pickupVehicle: unknown
  now?: Date
}) {
  const pickupDate = String(input.pickupDate ?? '')
  const pickupTime = String(input.pickupTime ?? '')
  const pickupVehicle = String(input.pickupVehicle ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime))
    throw new ApplicationError(400, 'INVALID_PICKUP_SCHEDULE', 'Isi tanggal dan jam pickup dengan format yang benar.')
  const date = new Date(pickupDate + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== pickupDate)
    throw new ApplicationError(400, 'INVALID_PICKUP_SCHEDULE', 'Tanggal pickup tidak valid.')
  if (!['Motor', 'Mobil', 'Truk'].includes(pickupVehicle))
    throw new ApplicationError(400, 'INVALID_PICKUP_VEHICLE', 'Pilih kendaraan Motor, Mobil, atau Truk.')
  const pickupAt = new Date(pickupDate + 'T' + pickupTime + ':00+07:00')
  const now = input.now ?? new Date()
  if (pickupAt.getTime() < now.getTime() + 90 * 60_000)
    throw new ApplicationError(422, 'PICKUP_TOO_SOON', 'Jadwalkan pickup setidaknya 90 menit dari sekarang (WIB).')
  return {
    pickupDate,
    pickupTime,
    pickupVehicle: pickupVehicle as 'Motor' | 'Mobil' | 'Truk',
  }
}

export function providerPhone(value: string) {
  const digits = String(value ?? '').replace(/\D/g, '')
  let result = digits
  if (result.startsWith('62')) result = '62' + result.slice(2)
  else if (result.startsWith('0')) result = result
  else if (result.startsWith('8')) result = '0' + result
  if (!/^(?:0\d{8,14}|62\d{8,14})$/.test(result))
    throw invalidDeliveryData('Nomor telepon pengirim dan penerima harus diawali 0 atau 62.')
  return result
}

function pinPoint(value?: string | null) {
  if (!value) return undefined
  const match = String(value).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (!match) throw invalidDeliveryData('Titik koordinat pengiriman tidak valid.')
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    throw invalidDeliveryData('Titik koordinat pengiriman tidak valid.')
  return latitude + ', ' + longitude
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function invalidDeliveryData(message: string): ApplicationError {
  return new ApplicationError(422, 'DELIVERY_DATA_INCOMPLETE', message)
}
