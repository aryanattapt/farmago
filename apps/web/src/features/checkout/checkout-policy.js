export function canRequestCheckoutQuote({ loading, contactVerified, itemCount, pharmacyOptions, selectedPharmacyId }) {
  if (loading || !contactVerified || itemCount < 1) return false
  return pharmacyOptions.length === 0 || Boolean(selectedPharmacyId)
}

export function canCreateCheckoutOrder({ loading, quote, accepted }) {
  return Boolean(!loading && quote && accepted)
}
