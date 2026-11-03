import { createHash } from 'node:crypto'
import { amount } from '../../../shared/domain/money'

export function quoteFingerprint(
  pharmacyId: string,
  methodType: string,
  addressSnapshot: any,
  items: any[],
  totals: any,
) {
  const canonicalItems = items.map((item) => [
    item.productId,
    item.sku,
    item.name,
    item.sellUnit,
    item.requiresPrescription,
    item.batchTrackingRequired,
    Number(item.quantity),
    amount(item.unitPrice),
    amount(item.lineTotal),
  ])
  const canonicalTotals = [
    amount(totals.subtotal),
    amount(totals.discount),
    amount(totals.shippingFee),
    amount(totals.serviceFee),
    amount(totals.total),
  ]
  const canonicalAddress = addressSnapshot
    ? [
        addressSnapshot.recipientName,
        addressSnapshot.phone,
        addressSnapshot.addressText,
        addressSnapshot.city,
        addressSnapshot.postalCode,
        addressSnapshot.rajaongkirDestinationId ?? null,
      ]
    : null
  return createHash('sha256')
    .update(
      JSON.stringify([pharmacyId, methodType, canonicalAddress, canonicalItems, canonicalTotals]),
    )
    .digest('hex')
}
