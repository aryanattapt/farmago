export { handleShippingRoutes } from './presentation/http/routes'
export {
  calculateLowestShippingOption,
  calculateShippingOptions,
  packageWeightGrams,
  searchShippingDestinations,
  sameShippingSnapshot,
  type ShippingOption,
  type ShippingSnapshot,
} from './application/shipping.service'

export { KomerceDeliveryClient, KomerceDeliveryError, type KomerceDeliveryConfig } from './infrastructure/komerce-delivery.client'
