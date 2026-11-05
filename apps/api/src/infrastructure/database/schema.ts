import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const id = () => uuid('id').defaultRandom().primaryKey()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// SQL migrations remain the source of database constraints; this schema maps queryable columns.
export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  mfaSecretEncrypted: text('mfa_secret_encrypted'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const userRoles = pgTable('user_roles', {
  id: id(),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  pharmacyId: uuid('pharmacy_id'),
  createdAt: createdAt(),
})

export const authSessions = pgTable('auth_sessions', {
  id: id(),
  userId: uuid('user_id').notNull(),
  sessionTokenHash: text('session_token_hash').notNull(),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const authTokens = pgTable('auth_tokens', {
  id: id(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  targetContact: text('target_contact'),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const mfaRecoveryCodes = pgTable('mfa_recovery_codes', {
  id: id(),
  userId: uuid('user_id').notNull(),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const pharmacies = pgTable('pharmacies', {
  id: id(),
  name: text('name').notNull(),
  addressText: text('address_text').notNull(),
  city: text('city').notNull(),
  postalCodes: text('postal_codes')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  deliveryFee: numeric('delivery_fee', { precision: 14, scale: 2 }),
  rajaongkirOriginId: integer('rajaongkir_origin_id'),
  deliveryContactName: text('delivery_contact_name'),
  deliveryPhone: text('delivery_phone'),
  deliveryEmail: text('delivery_email'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  status: text('status').notNull().default('pending'),
  licenseReference: text('license_reference'),
  createdAt: createdAt(),
})

export const pharmacyServiceHours = pgTable('pharmacy_service_hours', {
  id: id(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  serviceType: text('service_type').notNull(),
  weekday: integer('weekday').notNull(),
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  active: boolean('active').notNull().default(true),
})

export const pharmacyServiceExceptions = pgTable('pharmacy_service_exceptions', {
  id: id(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  serviceType: text('service_type').notNull(),
  localDate: date('local_date').notNull(),
  closed: boolean('closed').notNull().default(false),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
  reason: text('reason'),
})

export const rajaongkirCouriers = pgTable('rajaongkir_couriers', {
  courierCode: text('courier_code').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
})

export const addresses = pgTable('addresses', {
  id: id(),
  userId: uuid('user_id').notNull(),
  recipientName: text('recipient_name').notNull(),
  phone: text('phone').notNull(),
  addressText: text('address_text').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code').notNull(),
  rajaongkirDestinationId: integer('rajaongkir_destination_id'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const products = pgTable('products', {
  id: id(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull(),
  sellUnit: text('sell_unit').notNull(),
  shippingWeightGrams: integer('shipping_weight_grams').notNull().default(0),
  shippingWidthCm: integer('shipping_width_cm'),
  shippingHeightCm: integer('shipping_height_cm'),
  shippingLengthCm: integer('shipping_length_cm'),
  batchTrackingRequired: boolean('batch_tracking_required').notNull().default(false),
  requiresPrescription: boolean('requires_prescription').notNull().default(false),
  specialHandling: boolean('special_handling').notNull().default(false),
  status: text('status').notNull().default('inactive'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const inventory = pgTable(
  'inventory',
  {
    pharmacyId: uuid('pharmacy_id').notNull(),
    productId: uuid('product_id').notNull(),
    onHand: integer('on_hand').notNull(),
    reserved: integer('reserved').notNull().default(0),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    salesBlocked: boolean('sales_blocked').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.pharmacyId, table.productId] })],
)

export const inventoryMovements = pgTable('inventory_movements', {
  id: id(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  productId: uuid('product_id').notNull(),
  orderId: uuid('order_id'),
  deltaOnHand: integer('delta_on_hand').notNull(),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id'),
  createdAt: createdAt(),
})

export const checkoutQuotes = pgTable('checkout_quotes', {
  id: id(),
  customerId: uuid('customer_id').notNull(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  addressId: uuid('address_id'),
  addressSnapshot: jsonb('address_snapshot'),
  fulfillmentMethod: text('fulfillment_method').notNull(),
  itemsSnapshot: jsonb('items_snapshot').notNull(),
  totalsSnapshot: jsonb('totals_snapshot').notNull(),
  shippingSnapshot: jsonb('shipping_snapshot'),
  inputFingerprint: text('input_fingerprint').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const orders = pgTable('orders', {
  id: id(),
  quoteId: uuid('quote_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  addressSnapshot: jsonb('address_snapshot'),
  fulfillmentMethod: text('fulfillment_method').notNull(),
  status: text('status').notNull(),
  pickupCode: text('pickup_code').notNull(),
  documentRevision: integer('document_revision').notNull().default(0),
  reviewVersion: integer('review_version').notNull().default(0),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  shippingFee: numeric('shipping_fee', { precision: 14, scale: 2 }).notNull().default('0'),
  shippingSnapshot: jsonb('shipping_snapshot'),
  serviceFee: numeric('service_fee', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const orderItems = pgTable('order_items', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  productId: uuid('product_id').notNull(),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  sellUnitSnapshot: text('sell_unit_snapshot').notNull(),
  batchTrackingRequiredSnapshot: boolean('batch_tracking_required_snapshot')
    .notNull()
    .default(false),
  shippingWeightGramsSnapshot: integer('shipping_weight_grams_snapshot'),
  shippingWidthCmSnapshot: integer('shipping_width_cm_snapshot'),
  shippingHeightCmSnapshot: integer('shipping_height_cm_snapshot'),
  shippingLengthCmSnapshot: integer('shipping_length_cm_snapshot'),
  requiresPrescriptionSnapshot: boolean('requires_prescription_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
})

export const stockReservations = pgTable('stock_reservations', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  orderItemId: uuid('order_item_id').notNull(),
  pharmacyId: uuid('pharmacy_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const prescriptions = pgTable('prescriptions', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  objectKey: text('object_key').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  documentRevision: integer('document_revision').notNull(),
  documentSha256: text('document_sha256').notNull(),
  status: text('status').notNull(),
  createdAt: createdAt(),
})

export const prescriptionMessages = pgTable('prescription_messages', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  authorId: uuid('author_id').notNull(),
  messageType: text('message_type').notNull(),
  body: text('body'),
  privateObjectKey: text('private_object_key'),
  createdAt: createdAt(),
})

export const prescriptionReviews = pgTable('prescription_reviews', {
  id: id(),
  prescriptionId: uuid('prescription_id').notNull(),
  pharmacistId: uuid('pharmacist_id').notNull(),
  documentRevision: integer('document_revision').notNull(),
  reviewSequence: integer('review_sequence').notNull(),
  decision: text('decision').notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
})

export const reviewItems = pgTable(
  'review_items',
  {
    reviewId: uuid('review_id').notNull(),
    orderItemId: uuid('order_item_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.orderItemId] })],
)

export const payments = pgTable('payments', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  provider: text('provider').notNull(),
  merchantReference: text('merchant_reference').notNull(),
  operation: text('operation').notNull().default('store_order'),
  providerReference: text('provider_reference'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  receivedAmount: numeric('received_amount', { precision: 14, scale: 2 }),
  currency: text('currency').notNull().default('IDR'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  providerPaidAt: timestamp('provider_paid_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const refunds = pgTable('refunds', {
  id: id(),
  paymentId: uuid('payment_id').notNull(),
  merchantReference: text('merchant_reference').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  providerReference: text('provider_reference'),
  requestedBy: uuid('requested_by').notNull(),
  createdAt: createdAt(),
})

export const paymentEvents = pgTable(
  'payment_events',
  {
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    paymentId: uuid('payment_id'),
    payloadHash: text('payload_hash').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerEventId] })],
)

export const fulfillmentChecks = pgTable('fulfillment_checks', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  pharmacistCheck: boolean('pharmacist_check').notNull().default(false),
  passed: boolean('passed').notNull(),
  note: text('note'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
})

export const shipments = pgTable('shipments', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  method: text('method').notNull(),
  provider: text('provider'),
  trackingNumber: text('tracking_number'),
  trackingStatus: text('tracking_status'),
  trackingHistory: jsonb('tracking_history').notNull().default(sql`'[]'::jsonb`),
  trackingCheckedAt: timestamp('tracking_checked_at', { withTimezone: true }),
  trackingAttemptedAt: timestamp('tracking_attempted_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),
  providerOrderNo: text('provider_order_no'),
  pickupDate: date('pickup_date'),
  pickupTime: time('pickup_time'),
  pickupVehicle: text('pickup_vehicle'),
  createdAt: createdAt(),
  handoverReference: text('handover_reference'),
  handedOverAt: timestamp('handed_over_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  bookingCancellationReference: text('booking_cancellation_reference'),
  bookingCancelledAt: timestamp('booking_cancelled_at', { withTimezone: true }),
  bookingCancelledBy: uuid('booking_cancelled_by'),
})

export const shipmentAttempts = pgTable('shipment_attempts', {
  id: id(),
  shipmentId: uuid('shipment_id').notNull(),
  merchantReference: text('merchant_reference').notNull(),
  providerReference: text('provider_reference'),
  status: text('status').notNull(),
  requestSnapshot: jsonb('request_snapshot').notNull(),
  responseSnapshot: jsonb('response_snapshot'),
  createdAt: createdAt(),
})

export const dispensedLots = pgTable('dispensed_lots', {
  id: id(),
  fulfillmentCheckId: uuid('fulfillment_check_id').notNull(),
  orderItemId: uuid('order_item_id').notNull(),
  lotNumber: text('lot_number'),
  expiresOn: date('expires_on'),
  quantity: integer('quantity').notNull(),
})

export const orderStatusHistory = pgTable('order_status_history', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorId: uuid('actor_id'),
  reason: text('reason'),
  createdAt: createdAt(),
})

export const supportCases = pgTable('support_cases', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  openedBy: uuid('opened_by').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull().default('open'),
  description: text('description').notNull(),
  assignedTo: uuid('assigned_to'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const cancellationRequests = pgTable('cancellation_requests', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('requested'),
  decidedBy: uuid('decided_by'),
  decisionReason: text('decision_reason'),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
})

export const returnRefundRequests = pgTable('return_refund_requests', {
  id: id(),
  orderId: uuid('order_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  reason: text('reason').notNull(),
  bankName: text('bank_name').notNull(),
  accountHolderName: text('account_holder_name').notNull(),
  accountNumber: text('account_number').notNull(),
  videoObjectKey: text('video_object_key'),
  videoMimeType: text('video_mime_type'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  eligibleUntil: timestamp('eligible_until', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('requested'),
  decidedBy: uuid('decided_by'),
  decisionReason: text('decision_reason'),
  refundId: uuid('refund_id'),
  refundAmount: numeric('refund_amount', { precision: 14, scale: 2 }),
  refundDueAt: timestamp('refund_due_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  transferReference: text('transfer_reference'),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
})

export const auditLog = pgTable('audit_log', {
  id: id(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: createdAt(),
})

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    actorId: uuid('actor_id').notNull(),
    scope: text('scope').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.scope, table.idempotencyKey] })],
)

export const outboxEvents = pgTable('outbox_events', {
  id: id(),
  eventType: text('event_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: createdAt(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})
