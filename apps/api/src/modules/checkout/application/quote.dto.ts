import type { CartItem } from '../domain/cart'
import type { QuoteSnapshot } from './build-quote'

export type CreateQuoteRequestDto = {
  items?: unknown
  fulfillmentMethod?: string
  addressId?: string
  pharmacyId?: string
  shippingSelection?: unknown
}

export type BuildQuoteInputDto = {
  customerId: string
  addressId: string | null
  fulfillmentMethod: 'pickup' | 'delivery'
  items: CartItem[]
  pharmacyId?: string
  shippingSelection?: { courierCode: string; service: string }
}

export type QuoteAddressDto = {
  recipientName: string
  phone: string
  addressText: string
  city: string
  postalCode: string
  rajaongkirDestinationId: number
}

export type QuoteResponseDto = {
  quoteId: string
  expiresAt: Date
  pharmacy: { id: string; name: string; address: string }
  fulfillmentMethod: 'pickup' | 'delivery'
  items: QuoteSnapshot['items']
  totals: QuoteSnapshot['totals']
  needsPrescription: boolean
  prescriptionHours: Array<{ weekday: number; opensAt: string; closesAt: string; timezone: string }>
  shipping: import('../../shipping/public').ShippingSnapshot | null
  shippingOptions: import('../../shipping/public').ShippingSnapshot[]
}
