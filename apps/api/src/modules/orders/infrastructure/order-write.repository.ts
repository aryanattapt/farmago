import { amount, cents, money } from '../../../shared/domain/money'
import { RESERVATION_MINUTES, serviceFee } from '../../../shared/config'
import { transaction } from '../../../infrastructure/database/client'
import { recordAudit } from '../../platform'
import { quoteFingerprint } from '../../checkout'
import { prescriptionServiceOpen } from '../../pharmacy'
import { insertOrderStatusHistory } from './order-history.repository'
import { OrderWriteError, type OrderWriteRepository } from '../application/create-order'
import { generatePickupCode } from '../domain/pickup-code'
import { packageWeightGrams, type ShippingSnapshot } from '../../shipping/public'

export class PostgresOrderWriteRepository implements OrderWriteRepository {
  create(input: {
    quoteId: string
    customerId: string
    idempotencyKey: string
    requestHash: string
  }) {
    return transaction(async (client) => {
      const existing = await client.query(
        'SELECT request_hash,response FROM idempotency_keys WHERE actor_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE',
        [input.customerId, 'create-order', input.idempotencyKey],
      )
      if (existing.rowCount) {
        if (existing.rows[0].request_hash !== input.requestHash)
          throw new OrderWriteError('idempotency-conflict')
        if (existing.rows[0].response) return { ...existing.rows[0].response, replayed: true }
      } else {
        await client.query(
          'INSERT INTO idempotency_keys(actor_id,scope,idempotency_key,request_hash) VALUES($1,$2,$3,$4)',
          [input.customerId, 'create-order', input.idempotencyKey, input.requestHash],
        )
      }

      const quoteResult = await client.query(
        'SELECT * FROM checkout_quotes WHERE id=$1 AND customer_id=$2 FOR UPDATE',
        [input.quoteId, input.customerId],
      )
      if (!quoteResult.rowCount || new Date(quoteResult.rows[0].expires_at).getTime() <= Date.now())
        throw new OrderWriteError('quote-expired')
      const quote = quoteResult.rows[0]
      const already = await client.query(
        'SELECT id,status,expires_at,total FROM orders WHERE quote_id=$1',
        [input.quoteId],
      )
      if (already.rowCount) {
        return {
          id: already.rows[0].id,
          status: already.rows[0].status,
          expiresAt: already.rows[0].expires_at,
          total: amount(already.rows[0].total),
        }
      }

      const itemSnapshots = quote.items_snapshot as any[]
      const ids = itemSnapshots.map((item) => item.productId)
      const locked = await client.query(
        `SELECT p.id,p.name,p.category,p.sell_unit,p.requires_prescription,p.batch_tracking_required,p.status,p.special_handling,
        i.on_hand,i.reserved,i.unit_price,i.sales_blocked,p.shipping_weight_grams FROM inventory i JOIN products p ON p.id=i.product_id
        WHERE i.pharmacy_id=$1 AND p.id=ANY($2::uuid[]) ORDER BY p.id FOR UPDATE OF i`,
        [quote.pharmacy_id, ids],
      )
      if (
        locked.rows.length !== itemSnapshots.length ||
        locked.rows.some(
          (row: any) =>
            row.status !== 'active' ||
            row.special_handling ||
            ['narkotika', 'psikotropika'].includes(String(row.category).toLowerCase()) ||
            row.sales_blocked,
        )
      )
        throw new OrderWriteError('stock-unavailable')
      const updatedItems = itemSnapshots.map((snapshot) => {
        const row = locked.rows.find((entry: any) => entry.id === snapshot.productId)
        const quantity = Number(snapshot.quantity)
        if (!row || Number(row.on_hand) - Number(row.reserved) < quantity)
          throw new OrderWriteError('stock-changed')
        return {
          ...snapshot,
          name: row.name,
          sellUnit: row.sell_unit,
          requiresPrescription: row.requires_prescription,
          batchTrackingRequired: row.batch_tracking_required,
          unitPrice: amount(row.unit_price),
          lineTotal: money(cents(row.unit_price) * quantity),
        }
      })

      let currentAddress: any = null
      if (quote.fulfillment_method === 'delivery') {
        const addressResult = await client.query(
          'SELECT * FROM addresses WHERE id=$1 AND user_id=$2',
          [quote.address_id, input.customerId],
        )
        if (!addressResult.rowCount) throw new OrderWriteError('quote-changed')
        const address = addressResult.rows[0]
        currentAddress = {
          recipientName: address.recipient_name,
          phone: address.phone,
          addressText: address.address_text,
          city: address.city,
          postalCode: address.postal_code,
          rajaongkirDestinationId: address.rajaongkir_destination_id,
        }
      }
      const pharmacyResult = await client.query(
        "SELECT name,address_text,postal_codes,delivery_fee,rajaongkir_origin_id FROM pharmacies WHERE id=$1 AND status='active' FOR SHARE",
        [quote.pharmacy_id],
      )
      if (!pharmacyResult.rowCount) throw new OrderWriteError('pharmacy-unavailable')
      const pharmacy = pharmacyResult.rows[0]
      const shippingSnapshot = quote.shipping_snapshot as ShippingSnapshot | null
      let shippingCents = 0
      if (quote.fulfillment_method === 'delivery') {
        const currentWeight = packageWeightGrams(
          updatedItems.map((item) => ({
            quantity: Number(item.quantity),
            shippingWeightGrams: Number(
              locked.rows.find((row: any) => row.id === item.productId)?.shipping_weight_grams ?? 0,
            ),
          })),
        )
        if (
          !shippingSnapshot ||
          currentWeight == null ||
          currentWeight !== shippingSnapshot.weightGrams ||
          Number(currentAddress?.rajaongkirDestinationId) !== shippingSnapshot.destinationId ||
          Number(pharmacy.rajaongkir_origin_id) !== shippingSnapshot.originId
        )
          throw new OrderWriteError('quote-changed')
        shippingCents = cents(shippingSnapshot.cost)
      }
      const subtotalCents = updatedItems.reduce((sum, item) => sum + cents(item.lineTotal), 0)
      const totals = {
        subtotal: money(subtotalCents),
        discount: '0.00',
        shippingFee: money(shippingCents),
        serviceFee: amount(serviceFee),
        total: money(subtotalCents + shippingCents + cents(serviceFee)),
      }
      const currentFingerprint = quoteFingerprint(
        quote.pharmacy_id,
        quote.fulfillment_method,
        currentAddress,
        updatedItems,
        totals,
      )
      if (
        currentFingerprint !== quote.input_fingerprint ||
        (quote.fulfillment_method === 'delivery' &&
          pharmacy.postal_codes.length > 0 &&
          !pharmacy.postal_codes.includes(currentAddress.postalCode))
      )
        throw new OrderWriteError('quote-changed')
      if (
        updatedItems.some((item) => item.requiresPrescription) &&
        !(await prescriptionServiceOpen(client, quote.pharmacy_id))
      )
        throw new OrderWriteError('prescription-service-closed')

      const hasPrescription = updatedItems.some((item) => item.requiresPrescription)
      const status = hasPrescription ? 'awaiting_prescription' : 'awaiting_payment'
      const inserted = await client.query(
        `INSERT INTO orders(quote_id,customer_id,pharmacy_id,address_snapshot,fulfillment_method,status,pickup_code,subtotal,discount,shipping_fee,service_fee,total,shipping_snapshot,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,now()+make_interval(mins=>$13::int)) RETURNING id,expires_at`,
        [
          input.quoteId,
          input.customerId,
          quote.pharmacy_id,
          currentAddress,
          quote.fulfillment_method,
          status,
          generatePickupCode(),
          totals.subtotal,
          totals.shippingFee,
          totals.serviceFee,
          totals.total,
          shippingSnapshot,
          RESERVATION_MINUTES,
        ],
      )
      const order = inserted.rows[0]
      for (const item of updatedItems) {
        const orderItem = await client.query(
          `INSERT INTO order_items(order_id,product_id,product_name_snapshot,sell_unit_snapshot,batch_tracking_required_snapshot,requires_prescription_snapshot,quantity,unit_price,line_total)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            order.id,
            item.productId,
            item.name,
            item.sellUnit,
            item.batchTrackingRequired === true,
            item.requiresPrescription,
            item.quantity,
            item.unitPrice,
            item.lineTotal,
          ],
        )
        await client.query(
          'UPDATE inventory SET reserved=reserved+$3,updated_at=now() WHERE pharmacy_id=$1 AND product_id=$2',
          [quote.pharmacy_id, item.productId, item.quantity],
        )
        await client.query(
          `INSERT INTO stock_reservations(order_id,order_item_id,pharmacy_id,product_id,quantity,status,expires_at)
          VALUES($1,$2,$3,$4,$5,'active',$6)`,
          [
            order.id,
            orderItem.rows[0].id,
            quote.pharmacy_id,
            item.productId,
            item.quantity,
            order.expires_at,
          ],
        )
      }
      await insertOrderStatusHistory(
        client,
        order.id,
        null,
        status,
        input.customerId,
        'Pesanan dibuat',
      )
      await recordAudit(client, input.customerId, 'order.created', 'order', order.id, {
        fulfillmentMethod: quote.fulfillment_method,
      })
      await client.query(
        "INSERT INTO outbox_events(event_type,aggregate_id,payload) VALUES('order.created',$1,$2)",
        [order.id, { orderId: order.id, status }],
      )
      const response = { id: order.id, status, expiresAt: order.expires_at, totals }
      await client.query(
        'UPDATE idempotency_keys SET response=$4 WHERE actor_id=$1 AND scope=$2 AND idempotency_key=$3',
        [input.customerId, 'create-order', input.idempotencyKey, response],
      )
      return response
    })
  }
}
