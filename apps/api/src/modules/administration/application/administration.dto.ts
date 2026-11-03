export type CreateProductRequestDto = {
  sku?: string
  name?: string
  category?: string
  sellUnit?: string
  description?: string
  requiresPrescription?: boolean
  batchTrackingRequired?: boolean
  specialHandling?: boolean
  shippingWeightGrams?: number | string
  shippingWidthCm?: number | string
  shippingHeightCm?: number | string
  shippingLengthCm?: number | string
}

export type ConfigureInventoryRequestDto = {
  pharmacyId?: string
  productId?: string
  onHand?: number | string
  unitPrice?: number | string
  reason?: string
}

export type UpdateProductRequestDto = {
  name?: string | null
  description?: string | null
  category?: string | null
  sellUnit?: string | null
  requiresPrescription?: boolean | null
  batchTrackingRequired?: boolean | null
  specialHandling?: boolean | null
  shippingWeightGrams?: number | string | null
  shippingWidthCm?: number | string | null
  shippingHeightCm?: number | string | null
  shippingLengthCm?: number | string | null
  status?: string
}

export type CreatePharmacyRequestDto = {
  name?: string
  addressText?: string
  city?: string
  postalCodes?: unknown
  licenseReference?: string
  rajaongkirOriginId?: number | string | null
  deliveryContactName?: string
  deliveryPhone?: string
  deliveryEmail?: string
}

export type UpdatePharmacyRequestDto = {
  status?: string
  rajaongkirOriginId?: number | string | null
  deliveryContactName?: string | null
  deliveryPhone?: string | null
  deliveryEmail?: string | null
}
