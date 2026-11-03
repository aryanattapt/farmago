export const ORDER_STATUSES = [
  'awaiting_prescription',
  'awaiting_payment',
  'paid',
  'processing',
  'ready',
  'in_delivery',
  'completed',
  'cancelled',
  'expired',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_prescription: ['awaiting_payment', 'cancelled', 'expired'],
  awaiting_payment: ['paid', 'cancelled', 'expired'],
  paid: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'],
  ready: ['in_delivery', 'completed', 'cancelled'],
  in_delivery: ['completed'],
  completed: [],
  cancelled: [],
  expired: [],
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

export function canTransitionOrder(from: string, to: string): boolean {
  return isOrderStatus(from) && isOrderStatus(to) && TRANSITIONS[from].includes(to)
}
