import { amount } from './money'

export function publicProduct(row: any) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    sellUnit: row.sell_unit,
    requiresPrescription: row.requires_prescription,
    batchTrackingRequired: row.batch_tracking_required === true,
    indicativePrice: amount(row.indicative_price),
    available: Number(row.available ?? 0) > 0,
    stock: Math.max(0, Number(row.available ?? 0)),
  }
}
