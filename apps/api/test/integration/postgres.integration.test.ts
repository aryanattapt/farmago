import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pool } from '../../src/infrastructure/database/client'
import { createCheckoutQuote } from '../../src/modules/checkout/public'
import { createOrderForCustomer } from '../../src/modules/orders/public'
import {
  getPrescriptionFile,
  reviewPrescriptionDocument,
  uploadPrescriptionFile,
} from '../../src/modules/prescriptions/public'
import { runFulfillmentCommand, saveFulfillmentCheck } from '../../src/modules/fulfillment/public'
import type { User } from '../../src/shared/domain/access'

const uploadedOrderIds: string[] = []
let testDatabaseVerified = false

beforeAll(async () => {
  const result = await pool.query('SELECT current_database() AS name')
  const databaseName = String(result.rows[0]?.name ?? '')
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(
      'Refusing to truncate a database without "test" in its name. Set DATABASE_URL to a dedicated integration-test database.',
    )
  }
  testDatabaseVerified = true
})

beforeEach(async () => {
  if (!testDatabaseVerified) throw new Error('Integration database was not verified.')
  await pool.query('TRUNCATE TABLE outbox_events, users, pharmacies, products CASCADE')
})

afterEach(async () => {
  const prescriptionStorage = join(process.cwd(), 'storage', 'prescriptions')
  await Promise.all(
    uploadedOrderIds.splice(0).map((orderId) =>
      rm(join(prescriptionStorage, orderId), { recursive: true, force: true }),
    ),
  )
})

afterAll(async () => {
  await pool.end()
})

type SeededCatalog = {
  customer: User
  pharmacyId: string
  productId: string
}

describe('PostgreSQL-backed API integration', () => {
  test('creates one reservation and replays idempotently without duplicating an order', async () => {
    const fixture = await seedCatalog()
    const quote = await makeQuote(fixture)
    const otherQuote = await makeQuote(fixture)
    const idempotencyKey = 'integration-create-order-once'

    const first = (await createOrderForCustomer(
      fixture.customer.id,
      { quoteId: quote.quoteId },
      idempotencyKey,
    )) as { id: string; status: string }
    const replay = (await createOrderForCustomer(
      fixture.customer.id,
      { quoteId: quote.quoteId },
      idempotencyKey,
    )) as { id: string; replayed?: boolean }
    const duplicateQuote = (await createOrderForCustomer(
      fixture.customer.id,
      { quoteId: quote.quoteId },
      'integration-different-key-same-quote',
    )) as { id: string }

    expect(first.status).toBe('awaiting_payment')
    expect(replay.id).toBe(first.id)
    expect(replay.replayed).toBe(true)
    expect(duplicateQuote.id).toBe(first.id)
    await expect(
      createOrderForCustomer(
        fixture.customer.id,
        { quoteId: otherQuote.quoteId },
        idempotencyKey,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' })

    const state = await pool.query(
      `SELECT i.on_hand,i.reserved,
        (SELECT count(*)::int FROM orders) AS order_count,
        (SELECT count(*)::int FROM stock_reservations WHERE status='active') AS active_reservations
      FROM inventory i WHERE i.pharmacy_id=$1 AND i.product_id=$2`,
      [fixture.pharmacyId, fixture.productId],
    )
    expect(state.rows[0]).toMatchObject({ on_hand: 1, reserved: 1, order_count: 1, active_reservations: 1 })
  })

  test('allows only one concurrent order for the final available unit', async () => {
    const fixture = await seedCatalog({ onHand: 1 })
    const quotes = await Promise.all([makeQuote(fixture), makeQuote(fixture)])

    const outcomes = await Promise.allSettled(
      quotes.map((quote, index) =>
        createOrderForCustomer(
          fixture.customer.id,
          { quoteId: quote.quoteId },
          'integration-final-stock-' + index,
        ),
      ),
    )
    const successCount = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )

    expect(successCount).toBe(1)
    expect(rejected?.reason).toMatchObject({ status: 409, code: 'STOCK_UNAVAILABLE' })
    const state = await pool.query(
      `SELECT i.on_hand,i.reserved,
        (SELECT count(*)::int FROM orders) AS order_count,
        (SELECT count(*)::int FROM stock_reservations WHERE status='active') AS active_reservations
      FROM inventory i WHERE i.pharmacy_id=$1 AND i.product_id=$2`,
      [fixture.pharmacyId, fixture.productId],
    )
    expect(state.rows[0]).toMatchObject({ on_hand: 1, reserved: 1, order_count: 1, active_reservations: 1 })
  })

  test('rejects an order when the quoted price changes and rolls back all writes', async () => {
    const fixture = await seedCatalog()
    const quote = await makeQuote(fixture)
    await pool.query(
      'UPDATE inventory SET unit_price=$3 WHERE pharmacy_id=$1 AND product_id=$2',
      [fixture.pharmacyId, fixture.productId, '30000.00'],
    )

    await expect(
      createOrderForCustomer(
        fixture.customer.id,
        { quoteId: quote.quoteId },
        'integration-price-change',
      ),
    ).rejects.toMatchObject({ status: 409, code: 'QUOTE_CHANGED' })

    const state = await pool.query(
      `SELECT i.reserved,
        (SELECT count(*)::int FROM orders) AS order_count,
        (SELECT count(*)::int FROM stock_reservations) AS reservation_count,
        (SELECT count(*)::int FROM idempotency_keys) AS idempotency_count
      FROM inventory i WHERE i.pharmacy_id=$1 AND i.product_id=$2`,
      [fixture.pharmacyId, fixture.productId],
    )
    expect(state.rows[0]).toMatchObject({ reserved: 0, order_count: 0, reservation_count: 0, idempotency_count: 0 })
  })

  test('scopes prescription access, serializes reviews, and requires pharmacist approval', async () => {
    const fixture = await seedCatalog({ requiresPrescription: true, onHand: 2 })
    const otherPharmacyId = await createPharmacy('other')
    await addPrescriptionServiceHours(fixture.pharmacyId)
    const quote = await makeQuote(fixture)
    const order = (await createOrderForCustomer(
      fixture.customer.id,
      { quoteId: quote.quoteId },
      'integration-prescription-order',
    )) as { id: string; status: string }
    expect(order.status).toBe('awaiting_prescription')

    const itemResult = await pool.query(
      'SELECT id,quantity FROM order_items WHERE order_id=$1',
      [order.id],
    )
    const orderItemId = String(itemResult.rows[0].id)
    const pharmacistA = await createPharmacist(fixture.pharmacyId, 'pharmacist-a')
    const pharmacistB = await createPharmacist(fixture.pharmacyId, 'pharmacist-b')
    const foreignPharmacist = await createPharmacist(otherPharmacyId, 'foreign-pharmacist')
    const unrelatedCustomer = await createCustomer('unrelated-customer')

    uploadedOrderIds.push(order.id)
    const uploaded = (await uploadPrescriptionFile(order.id, fixture.customer, {
      data: Buffer.from('%PDF-1.7\nFarmaGO integration prescription\n'),
      filename: 'prescription.pdf',
      mimeType: 'application/pdf',
    })) as { id: string; revision: number }
    expect(uploaded.revision).toBe(1)

    const ownerFile = await getPrescriptionFile(uploaded.id, fixture.customer)
    expect(ownerFile.mimeType).toBe('application/pdf')
    await expect(getPrescriptionFile(uploaded.id, unrelatedCustomer)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
    await expect(getPrescriptionFile(uploaded.id, foreignPharmacist)).rejects.toMatchObject({
      status: 403,
      code: 'PHARMACY_SCOPE_REQUIRED',
    })
    const pharmacyFile = await getPrescriptionFile(uploaded.id, pharmacistA)
    expect(pharmacyFile.id).toBe(uploaded.id)
    await expect(
      reviewPrescriptionDocument(uploaded.id, foreignPharmacist, {
        decision: 'approved',
        expectedReviewVersion: 1,
        orderItemIds: [orderItemId],
      }),
    ).rejects.toMatchObject({ status: 403, code: 'PHARMACY_SCOPE_REQUIRED' })

    const clarificationInput = {
      decision: 'clarification' as const,
      expectedReviewVersion: 1,
      orderItemIds: [orderItemId],
      reason: 'Mohon kirim ulang foto yang lebih jelas.',
    }
    const concurrentReviews = await Promise.allSettled([
      reviewPrescriptionDocument(uploaded.id, pharmacistA, clarificationInput),
      reviewPrescriptionDocument(uploaded.id, pharmacistB, clarificationInput),
    ])
    expect(concurrentReviews.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    const reviewConflict = concurrentReviews.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    expect(reviewConflict?.reason).toMatchObject({ status: 409, code: 'REVIEW_CONFLICT' })

    const afterClarification = await pool.query(
      `SELECT o.status,o.review_version,p.status AS prescription_status,
        (SELECT count(*)::int FROM prescription_reviews WHERE prescription_id=p.id) AS review_count
      FROM orders o JOIN prescriptions p ON p.order_id=o.id WHERE p.id=$1`,
      [uploaded.id],
    )
    expect(afterClarification.rows[0]).toMatchObject({
      status: 'awaiting_prescription',
      review_version: 2,
      prescription_status: 'clarification',
      review_count: 1,
    })

    const approval = await reviewPrescriptionDocument(uploaded.id, pharmacistA, {
      decision: 'approved',
      expectedReviewVersion: 2,
      orderItemIds: [orderItemId],
    })
    expect(approval).toMatchObject({ decision: 'approved', orderStatus: 'awaiting_payment', reviewVersion: 3 })
    const finalState = await pool.query(
      `SELECT o.status,p.status AS prescription_status,
        (SELECT count(*)::int FROM prescription_reviews WHERE prescription_id=p.id) AS review_count,
        (SELECT count(*)::int FROM review_items ri JOIN prescription_reviews pr ON pr.id=ri.review_id WHERE pr.prescription_id=p.id) AS reviewed_items
      FROM orders o JOIN prescriptions p ON p.order_id=o.id WHERE p.id=$1`,
      [uploaded.id],
    )
    expect(finalState.rows[0]).toMatchObject({
      status: 'awaiting_payment',
      prescription_status: 'approved',
      review_count: 2,
      reviewed_items: 2,
    })
  })

  test('completes pickup only with a scoped staff member, matching code, and proof', async () => {
    const fixture = await seedCatalog()
    const otherPharmacyId = await createPharmacy('pickup-other')
    const staff = await createPharmacyStaff(fixture.pharmacyId, 'pickup-staff')
    const foreignStaff = await createPharmacyStaff(otherPharmacyId, 'foreign-staff')
    const quote = await makeQuote(fixture)
    const order = (await createOrderForCustomer(
      fixture.customer.id,
      { quoteId: quote.quoteId },
      'integration-pickup-order',
    )) as { id: string }
    const orderRow = await pool.query('SELECT total,pickup_code FROM orders WHERE id=$1', [order.id])
    const orderItem = await pool.query('SELECT id,quantity FROM order_items WHERE order_id=$1', [order.id])

    await pool.query(
      `INSERT INTO payments(order_id,provider,merchant_reference,amount,received_amount,status,expires_at,provider_paid_at,confirmed_at)
      VALUES($1,'integration-test',$2,$3,$3,'succeeded',now()+interval '15 minutes',now(),now())`,
      [order.id, randomUUID(), orderRow.rows[0].total],
    )
    await pool.query("UPDATE orders SET status='paid' WHERE id=$1", [order.id])
    await runFulfillmentCommand(order.id, staff, { command: 'start_processing' })
    await saveFulfillmentCheck(order.id, staff, {
      items: [{ orderItemId: orderItem.rows[0].id, quantity: Number(orderItem.rows[0].quantity) }],
      passed: true,
    })
    await runFulfillmentCommand(order.id, staff, { command: 'mark_ready' })

    const pickupCode = String(orderRow.rows[0].pickup_code)
    const wrongCode = pickupCode.slice(0, 11) + (pickupCode.endsWith('0') ? '1' : '0')
    await expect(
      runFulfillmentCommand(order.id, foreignStaff, {
        command: 'confirm_pickup',
        pickupCode,
        proofReference: 'POS-ORDER-123',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'PHARMACY_SCOPE_REQUIRED' })
    await expect(
      runFulfillmentCommand(order.id, staff, {
        command: 'confirm_pickup',
        pickupCode: wrongCode,
        proofReference: 'POS-ORDER-123',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'PICKUP_PROOF_REQUIRED' })

    const beforeHandover = await pool.query(
      `SELECT o.status,(SELECT count(*)::int FROM shipments WHERE order_id=o.id) AS shipment_count
      FROM orders o WHERE o.id=$1`,
      [order.id],
    )
    expect(beforeHandover.rows[0]).toMatchObject({ status: 'ready', shipment_count: 0 })

    const completion = await runFulfillmentCommand(order.id, staff, {
      command: 'confirm_pickup',
      pickupCode: '  ' + pickupCode.toLowerCase() + '  ',
      proofReference: '  POS-ORDER-123  ',
    })
    expect(completion).toMatchObject({ orderId: order.id, status: 'completed' })
    const completed = await pool.query(
      `SELECT o.status,s.method,s.status AS shipment_status,s.handover_reference,
        i.on_hand,i.reserved,r.status AS reservation_status,
        (SELECT count(*)::int FROM audit_log WHERE resource_id=o.id AND action='fulfillment.confirm_pickup') AS pickup_audit_count
      FROM orders o JOIN shipments s ON s.order_id=o.id
      JOIN inventory i ON i.pharmacy_id=o.pharmacy_id AND i.product_id=$2
      JOIN stock_reservations r ON r.order_id=o.id AND r.product_id=$2
      WHERE o.id=$1`,
      [order.id, fixture.productId],
    )
    expect(completed.rows[0]).toMatchObject({
      status: 'completed',
      method: 'pickup',
      shipment_status: 'completed',
      handover_reference: 'POS-ORDER-123',
      on_hand: 0,
      reserved: 0,
      reservation_status: 'consumed',
      pickup_audit_count: 1,
    })
    await expect(
      runFulfillmentCommand(order.id, staff, {
        command: 'confirm_pickup',
        pickupCode,
        proofReference: 'POS-ORDER-456',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_ORDER_STATE' })
    const shipmentCount = await pool.query(
      'SELECT count(*)::int AS count FROM shipments WHERE order_id=$1',
      [order.id],
    )
    expect(shipmentCount.rows[0].count).toBe(1)
  })
})

async function seedCatalog(options: { onHand?: number; requiresPrescription?: boolean } = {}): Promise<SeededCatalog> {
  const customer = await createCustomer('customer')
  const pharmacyId = await createPharmacy('main')
  const productId = await createProduct(options.requiresPrescription === true)
  await pool.query(
    'INSERT INTO inventory(pharmacy_id,product_id,on_hand,reserved,unit_price) VALUES($1,$2,$3,0,$4)',
    [pharmacyId, productId, options.onHand ?? 1, '28500.00'],
  )
  return { customer, pharmacyId, productId }
}

async function makeQuote(fixture: SeededCatalog) {
  return createCheckoutQuote(fixture.customer.id, {
    items: [{ productId: fixture.productId, quantity: 1 }],
    fulfillmentMethod: 'pickup',
  })
}

async function createCustomer(prefix: string): Promise<User> {
  const name = prefix + '-' + randomUUID()
  const email = name + '@example.test'
  const result = await pool.query(
    'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',
    [name, email, 'integration-test-only'],
  )
  const actor: User = {
    id: String(result.rows[0].id),
    name,
    email,
    phone: null,
    email_verified_at: null,
    phone_verified_at: null,
    roles: [],
    csrfToken: 'integration-test-csrf',
  }
  await addRole(actor, 'customer', null)
  return actor
}

async function createPharmacy(prefix: string) {
  const result = await pool.query(
    `INSERT INTO pharmacies(name,address_text,city,postal_codes,status)
    VALUES($1,'Jalan Integrasi 1','Jakarta',ARRAY['10110'],'active') RETURNING id`,
    [prefix + '-' + randomUUID()],
  )
  return String(result.rows[0].id)
}

async function createProduct(requiresPrescription: boolean) {
  const result = await pool.query(
    `INSERT INTO products(sku,name,category,sell_unit,requires_prescription,status)
    VALUES($1,'Vitamin Integrasi','vitamin','botol',$2,'active') RETURNING id`,
    ['TEST-' + randomUUID(), requiresPrescription],
  )
  return String(result.rows[0].id)
}

async function createPharmacist(pharmacyId: string, prefix: string) {
  const actor = await createCustomer(prefix)
  await pool.query('DELETE FROM user_roles WHERE user_id=$1 AND role=\'customer\'', [actor.id])
  actor.roles = []
  await addRole(actor, 'pharmacist', pharmacyId)
  return actor
}

async function createPharmacyStaff(pharmacyId: string, prefix: string) {
  const actor = await createCustomer(prefix)
  await pool.query('DELETE FROM user_roles WHERE user_id=$1 AND role=\'customer\'', [actor.id])
  actor.roles = []
  await addRole(actor, 'pharmacy_staff', pharmacyId)
  return actor
}

async function addRole(actor: User, role: string, pharmacyId: string | null) {
  await pool.query('INSERT INTO user_roles(user_id,role,pharmacy_id) VALUES($1,$2,$3)', [
    actor.id,
    role,
    pharmacyId,
  ])
  actor.roles.push({ role, pharmacyId })
}

async function addPrescriptionServiceHours(pharmacyId: string) {
  for (let weekday = 0; weekday <= 6; weekday++) {
    await pool.query(
      `INSERT INTO pharmacy_service_hours(pharmacy_id,service_type,weekday,opens_at,closes_at,timezone,active)
      VALUES($1,'prescription',$2,'00:00:00','23:59:59.999999','Asia/Jakarta',true)`,
      [pharmacyId, weekday],
    )
  }
}
