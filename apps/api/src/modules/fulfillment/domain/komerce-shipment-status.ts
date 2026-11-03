export type KomerceShipmentLifecycle = 'in_delivery' | 'delivered' | 'exception' | null

export function mapKomerceShipmentStatus(value: unknown): KomerceShipmentLifecycle {
  const status = String(value ?? '')
    .trim()
    .toLocaleLowerCase('id-ID')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (['dikirim', 'shipped', 'in transit', 'on delivery', 'in delivery'].includes(status))
    return 'in_delivery'
  if (['diterima', 'received', 'delivered', 'completed'].includes(status))
    return 'delivered'
  if (['retur', 'returned', 'return', 'return to sender', 'failed', 'delivery failed', 'exception', 'gagal antar', 'gagal diantar'].includes(status))
    return 'exception'
  if (['batal', 'cancel', 'cancelled', 'canceled'].includes(status))
    return 'exception'
  return null
}
