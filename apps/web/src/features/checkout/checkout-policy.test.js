import { describe, expect, test } from 'bun:test'
import { canCreateCheckoutOrder, canRequestCheckoutQuote } from './checkout-policy.js'

describe('checkout requirement gates', () => {
  test('requires a verified contact and a non-empty cart before requesting a quote', () => {
    expect(canRequestCheckoutQuote({ loading: false, contactVerified: false, itemCount: 1, pharmacyOptions: [], selectedPharmacyId: '' })).toBe(false)
    expect(canRequestCheckoutQuote({ loading: false, contactVerified: true, itemCount: 0, pharmacyOptions: [], selectedPharmacyId: '' })).toBe(false)
    expect(canRequestCheckoutQuote({ loading: false, contactVerified: true, itemCount: 1, pharmacyOptions: [], selectedPharmacyId: '' })).toBe(true)
  })

  test('requires the buyer to select an eligible pharmacy when choices are shown', () => {
    const pharmacyOptions = [{ id: 'pharmacy-a' }, { id: 'pharmacy-b' }]
    expect(canRequestCheckoutQuote({ loading: false, contactVerified: true, itemCount: 1, pharmacyOptions, selectedPharmacyId: '' })).toBe(false)
    expect(canRequestCheckoutQuote({ loading: false, contactVerified: true, itemCount: 1, pharmacyOptions, selectedPharmacyId: 'pharmacy-b' })).toBe(true)
  })

  test('creates an order only after the current quote is accepted and idle', () => {
    const quote = { quoteId: 'quote-1' }
    expect(canCreateCheckoutOrder({ loading: false, quote, accepted: false })).toBe(false)
    expect(canCreateCheckoutOrder({ loading: true, quote, accepted: true })).toBe(false)
    expect(canCreateCheckoutOrder({ loading: false, quote: null, accepted: true })).toBe(false)
    expect(canCreateCheckoutOrder({ loading: false, quote, accepted: true })).toBe(true)
  })
})
