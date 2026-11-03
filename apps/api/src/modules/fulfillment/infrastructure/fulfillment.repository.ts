import { randomUUID } from 'node:crypto'
import { canAccessPharmacy, hasRole, type User } from '../../../shared/domain/access'
import { and, eq, sql } from 'drizzle-orm'
import { db, transaction } from '../../../infrastructure/database/client'
import { orders, shipments } from '../../../infrastructure/database/schema'
import { KomerceDeliveryClient, KomerceDeliveryError } from '../../shipping'
import { buildKomerceStoreOrderPayload, validateKomercePickupInput } from '../domain/komerce-order'
import { recordAudit } from '../../platform'
import { canTransitionOrder, insertOrderStatusHistory, normalizePickupCode } from '../../orders'
import { parseDispensedLots } from '../domain/dispensed-lots'
import type {
  FulfillmentCheckRequestDto,
  FulfillmentCommandRequestDto,
  FulfillmentItemRequestDto,
} from '../application/fulfillment.dto'
import {
  FulfillmentOperationError,
  type FulfillmentRepository,
} from '../application/fulfillment.service'

function fail(status: number, code: string, message: string): never {
  throw new FulfillmentOperationError(status, code, message)
}

function checkPharmacyScope(actor: User, pharmacyId: string) {
  if (!canAccessPharmacy(actor, pharmacyId))
    fail(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
}

export class PostgresFulfillmentRepository implements FulfillmentRepository {
  constructor(private readonly deliveryClient = new KomerceDeliveryClient()) {}
  async executeCommand(orderId: string, actor: User, input: FulfillmentCommandRequestDto) {
    return transaction(async (client) => {
      const selected = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])
      if (!selected.rowCount) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      const order = selected.rows[0]
      checkPharmacyScope(actor, order.pharmacy_id)
      if (input.command === 'start_processing') {
        if (!canTransitionOrder(order.status, 'processing'))
          fail(409, 'INVALID_ORDER_STATE', 'Pesanan harus sudah dibayar sebelum diproses.')
        const paid = await client.query(
          "SELECT 1 FROM payments WHERE order_id=$1 AND status='succeeded' AND received_amount=amount",
          [order.id],
        )
        if (!paid.rowCount)
          fail(409, 'PAYMENT_NOT_CONFIRMED', 'Pembayaran belum terkonfirmasi penuh oleh penyedia.')
        await client.query("UPDATE orders SET status='processing',updated_at=now() WHERE id=$1", [
          order.id,
        ])
        await insertOrderStatusHistory(client, order.id, 'paid', 'processing', actor.id)
      } else if (input.command === 'mark_ready') {
        if (!canTransitionOrder(order.status, 'ready'))
          fail(409, 'INVALID_ORDER_STATE', 'Pesanan harus sedang diproses.')
        const checks = await client.query(
          'SELECT id,passed,pharmacist_check FROM fulfillment_checks WHERE order_id=$1 ORDER BY checked_at DESC LIMIT 1',
          [order.id],
        )
        if (!checks.rowCount || !checks.rows[0].passed)
          fail(
            422,
            'FULFILLMENT_CHECK_REQUIRED',
            'Pemeriksaan kesesuaian produk harus lulus sebelum pesanan siap.',
          )
        const hasRx = await client.query(
          'SELECT 1 FROM order_items WHERE order_id=$1 AND requires_prescription_snapshot=true LIMIT 1',
          [order.id],
        )
        if (hasRx.rowCount && !checks.rows[0].pharmacist_check)
          fail(
            403,
            'PHARMACIST_CHECK_REQUIRED',
            'Pemeriksaan akhir pesanan resep harus dicatat apoteker.',
          )
        const consumed = await client.query(
          "SELECT * FROM stock_reservations WHERE order_id=$1 AND status='active' ORDER BY product_id FOR UPDATE",
          [order.id],
        )
        for (const reservation of consumed.rows) {
          const update = await client.query(
            'UPDATE inventory SET on_hand=on_hand-$3,reserved=reserved-$3,updated_at=now() WHERE pharmacy_id=$1 AND product_id=$2 AND on_hand >= $3 AND reserved >= $3',
            [reservation.pharmacy_id, reservation.product_id, reservation.quantity],
          )
          if (!update.rowCount)
            fail(
              409,
              'INVENTORY_MISMATCH',
              'Alokasi daring tidak cocok. Pemenuhan dihentikan untuk rekonsiliasi.',
            )
          await client.query("UPDATE stock_reservations SET status='consumed' WHERE id=$1", [
            reservation.id,
          ])
          await client.query(
            "INSERT INTO inventory_movements(pharmacy_id,product_id,order_id,delta_on_hand,reason,actor_id) VALUES($1,$2,$3,$4,'fulfillment',$5)",
            [
              reservation.pharmacy_id,
              reservation.product_id,
              order.id,
              -Number(reservation.quantity),
              actor.id,
            ],
          )
        }
        await client.query("UPDATE orders SET status='ready',updated_at=now() WHERE id=$1", [
          order.id,
        ])
        await insertOrderStatusHistory(client, order.id, 'processing', 'ready', actor.id)
      } else if (input.command === 'confirm_pickup') {
        if (order.fulfillment_method !== 'pickup' || !canTransitionOrder(order.status, 'completed'))
          fail(
            409,
            'INVALID_ORDER_STATE',
            'Hanya pesanan ambil di apotek yang siap dapat diselesaikan.',
          )
        const proofReference = String(input.proofReference ?? '').trim()
        const pickupCode = normalizePickupCode(input.pickupCode)
        if (
          !pickupCode ||
          pickupCode !== order.pickup_code ||
          !proofReference ||
          proofReference.length > 200
        )
          fail(422, 'PICKUP_PROOF_REQUIRED', 'Kode pengambilan dan referensi bukti wajib cocok.')
        await client.query("UPDATE orders SET status='completed',updated_at=now() WHERE id=$1", [
          order.id,
        ])
        await client.query(
          "INSERT INTO shipments(order_id,method,status,handover_reference) VALUES($1,'pickup','completed',$2) ON CONFLICT(order_id) DO UPDATE SET status='completed',handover_reference=EXCLUDED.handover_reference",
          [order.id, proofReference],
        )
        await insertOrderStatusHistory(client, order.id, 'ready', 'completed', actor.id, 'pickup')
        input.proofReference = proofReference
      } else if (input.command === 'handover_to_courier') {
        fail(422, 'PICKUP_SCHEDULE_REQUIRED', 'Jadwalkan pickup kurir melalui formulir pengiriman.')
      } else fail(400, 'INVALID_COMMAND', 'Perintah pemenuhan tidak dikenal.')
      await recordAudit(
        client,
        actor.id,
        `fulfillment.${input.command}`,
        'order',
        order.id,
        input.command === 'confirm_pickup' ? { proofReference: input.proofReference } : {},
      )
      return {
        orderId: order.id,
        status:
          input.command === 'start_processing'
            ? 'processing'
            : input.command === 'mark_ready'
              ? 'ready'
              : 'completed',
      }
    })
  }

  async createCheck(orderId: string, actor: User, input: FulfillmentCheckRequestDto) {
    return transaction(async (client) => {
      const order = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])
      if (!order.rowCount) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      checkPharmacyScope(actor, order.rows[0].pharmacy_id)
      if (!canTransitionOrder(order.rows[0].status, 'ready'))
        fail(409, 'INVALID_ORDER_STATE', 'Pemeriksaan hanya tersedia saat penyiapan.')
      const items = await client.query('SELECT id,quantity FROM order_items WHERE order_id=$1', [
        orderId,
      ])
      const supplied = Array.isArray(input.items)
        ? (input.items as FulfillmentItemRequestDto[])
        : []
      if (
        supplied.length !== items.rows.length ||
        items.rows.some(
          (item: { id: string; quantity: number }) =>
            !supplied.some(
              (entry) =>
                entry.orderItemId === item.id && Number(entry.quantity) === Number(item.quantity),
            ),
        )
      )
        fail(422, 'ITEM_CHECK_INCOMPLETE', 'Periksa semua item dan jumlah yang dipesan.')
      const hasRx = await client.query(
        'SELECT 1 FROM order_items WHERE order_id=$1 AND requires_prescription_snapshot=true',
        [orderId],
      )
      const pharmacistCheck = hasRole(actor, 'pharmacist') && input.pharmacistCheck === true
      const passed = input.passed === true
      const checkNote = String(input.note ?? '')
        .trim()
        .slice(0, 1000)
      if (!passed && checkNote.length < 3)
        fail(
          422,
          'FULFILLMENT_NOTE_REQUIRED',
          'Jelaskan kendala pemeriksaan sebelum mengeskalasikannya.',
        )
      if (hasRx.rowCount && !pharmacistCheck && passed)
        fail(
          403,
          'PHARMACIST_CHECK_REQUIRED',
          'Pemeriksaan akhir untuk pesanan resep hanya dapat dicatat apoteker.',
        )
      const batchItems = await client.query(
        'SELECT id,quantity,batch_tracking_required_snapshot FROM order_items WHERE order_id=$1',
        [orderId],
      )
      const lotPlans: Array<{
        orderItemId: string
        lotNumber: string
        expiresOn: string
        quantity: number
      }> = []
      if (passed) {
        for (const orderItem of batchItems.rows) {
          if (!orderItem.batch_tracking_required_snapshot) continue
          const entry = supplied.find((item) => item.orderItemId === orderItem.id)
          const parsedLots = parseDispensedLots(entry?.lots, Number(orderItem.quantity))
          if (!parsedLots.ok) {
            if (parsedLots.reason === 'required')
              fail(
                422,
                'LOT_REQUIRED',
                'Catat nomor batch dan tanggal kedaluwarsa untuk setiap produk yang memerlukan pelacakan.',
              )
            if (parsedLots.reason === 'quantity-mismatch')
              fail(
                422,
                'LOT_QUANTITY_MISMATCH',
                'Jumlah unit pada catatan batch harus sama dengan jumlah pesanan.',
              )
            fail(
              422,
              'LOT_INVALID',
              'Nomor batch, tanggal kedaluwarsa, dan jumlah unit harus diisi dengan benar.',
            )
          }
          for (const lot of parsedLots.lots) {
            const expiry = await client.query('SELECT $1::date>=CURRENT_DATE AS valid', [
              lot.expiresOn,
            ])
            if (!expiry.rows[0].valid)
              fail(422, 'LOT_EXPIRED', 'Tanggal kedaluwarsa produk sudah lewat.')
            lotPlans.push({ orderItemId: orderItem.id, ...lot })
          }
        }
      }
      const inserted = await client.query(
        `INSERT INTO fulfillment_checks(order_id,actor_id,pharmacist_check,passed,note)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [orderId, actor.id, pharmacistCheck, passed, checkNote || null],
      )
      for (const lot of lotPlans)
        await client.query(
          'INSERT INTO dispensed_lots(fulfillment_check_id,order_item_id,lot_number,expires_on,quantity) VALUES($1,$2,$3,$4,$5)',
          [inserted.rows[0].id, lot.orderItemId, lot.lotNumber, lot.expiresOn, lot.quantity],
        )
      if (!passed) {
        const activeCase = await client.query(
          "SELECT id FROM support_cases WHERE order_id=$1 AND category='fulfillment' AND status<>'closed' LIMIT 1",
          [orderId],
        )
        if (!activeCase.rowCount) {
          const opened = await client.query(
            "INSERT INTO support_cases(order_id,opened_by,category,description) VALUES($1,$2,'fulfillment',$3) RETURNING id",
            [orderId, actor.id, `Pemeriksaan pemenuhan gagal: ${checkNote}`],
          )
          await recordAudit(client, actor.id, 'support.opened', 'support_case', opened.rows[0].id, {
            category: 'fulfillment',
          })
        }
      }
      await recordAudit(client, actor.id, 'fulfillment.checked', 'order', orderId, {
        passed,
        pharmacistCheck,
      })
      return { id: inserted.rows[0].id, passed, pharmacistCheck, escalated: !passed }
    })
  }

  async createShipmentBooking(orderId: string, actor: User) {
    if (!this.deliveryClient.isConfigured())
      fail(503, 'DELIVERY_PROVIDER_NOT_CONFIGURED', 'Shipping Delivery Komerce belum dikonfigurasi.')
    const claim = await transaction(async (client) => {
      const selected = await client.query(
        `SELECT o.*,p.name AS pharmacy_name,p.address_text AS shipper_address,
          p.rajaongkir_origin_id,p.delivery_contact_name,p.delivery_phone,p.delivery_email,
          p.latitude AS shipper_latitude,p.longitude AS shipper_longitude,
          u.name AS receiver_name,u.email AS receiver_email,
          o.address_snapshot->>'phone' AS receiver_phone,
          o.address_snapshot->>'recipientName' AS receiver_snapshot_name,
          o.address_snapshot->>'addressText' AS receiver_address,
          NULLIF(o.address_snapshot->>'rajaongkirDestinationId','')::integer AS receiver_destination_id,
          NULLIF(o.address_snapshot->>'latitude','') AS receiver_latitude,
          NULLIF(o.address_snapshot->>'longitude','') AS receiver_longitude
        FROM orders o
        JOIN pharmacies p ON p.id=o.pharmacy_id
        JOIN users u ON u.id=o.customer_id
        WHERE o.id=$1 FOR UPDATE OF o`,
        [orderId],
      )
      if (!selected.rowCount) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      const order = selected.rows[0]
      checkPharmacyScope(actor, order.pharmacy_id)
      if (order.fulfillment_method !== 'delivery' || order.status !== 'ready')
        fail(409, 'INVALID_ORDER_STATE', 'Hanya pesanan pengiriman yang siap dapat dibuatkan booking.')
      const prior = await client.query('SELECT * FROM shipments WHERE order_id=$1 FOR UPDATE', [orderId])
      const shipment = prior.rows[0]
      if (shipment && shipment.method !== 'delivery')
        fail(409, 'SHIPMENT_METHOD_MISMATCH', 'Pesanan ini sudah tercatat sebagai ambil di apotek.')
      if (shipment && ['booking_pending','booking_unknown'].includes(shipment.status))
        fail(409, 'DELIVERY_BOOKING_REVIEW_REQUIRED', 'Hasil booking sebelumnya belum pasti. Periksa dashboard Komerce sebelum mencoba lagi.')
      if (shipment && ['booked','pickup_pending','pickup_unknown','pickup_requested','pickup_failed'].includes(shipment.status))
        return { alreadyBooked: true as const, shipmentId: shipment.id, providerOrderNo: shipment.provider_order_no, status: shipment.status, trackingNumber: shipment.tracking_number }
      if (shipment && !['pending','booking_failed'].includes(shipment.status))
        fail(409, 'DELIVERY_BOOKING_STATE_INVALID', 'Status pengiriman tidak mengizinkan pembuatan order kurir baru.')
      const snapshot = typeof order.shipping_snapshot === 'string'
        ? JSON.parse(order.shipping_snapshot)
        : order.shipping_snapshot
      if (!snapshot)
        fail(422, 'DELIVERY_DATA_INCOMPLETE', 'Snapshot ongkir pesanan tidak tersedia.')
      const itemRows = await client.query(
        `SELECT product_name_snapshot,sell_unit_snapshot,quantity,unit_price,line_total,
          shipping_weight_grams_snapshot,shipping_width_cm_snapshot,shipping_height_cm_snapshot,shipping_length_cm_snapshot
        FROM order_items WHERE order_id=$1 ORDER BY id`,
        [orderId],
      )
      const orderItems = itemRows.rows.map((item: any) => ({
        name: String(item.product_name_snapshot),
        variant: String(item.sell_unit_snapshot),
        quantity: Number(item.quantity),
        price: Math.round(Number(item.unit_price)),
        weightGrams: Number(item.shipping_weight_grams_snapshot),
        widthCm: item.shipping_width_cm_snapshot == null ? null : Number(item.shipping_width_cm_snapshot),
        heightCm: item.shipping_height_cm_snapshot == null ? null : Number(item.shipping_height_cm_snapshot),
        lengthCm: item.shipping_length_cm_snapshot == null ? null : Number(item.shipping_length_cm_snapshot),
      }))
      const itemValue = orderItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
      const shippingCost = Math.round(Number(snapshot.cost))
      if (
        itemValue !== Math.round(Number(order.subtotal)) ||
        !Number.isSafeInteger(shippingCost) ||
        shippingCost !== Math.round(Number(order.shipping_fee))
      )
        fail(409, 'DELIVERY_SNAPSHOT_MISMATCH', 'Nilai ongkir atau produk pada pesanan tidak cocok dengan snapshot checkout.')
      const originPinPoint = pinPoint(order.shipper_latitude, order.shipper_longitude)
      const destinationPinPoint = pinPoint(order.receiver_latitude, order.receiver_longitude)
      const payload = buildKomerceStoreOrderPayload({
        brandName: process.env.KOMERCE_DELIVERY_BRAND_NAME ?? 'FarmaGO',
        orderDate: order.created_at,
        shipperName: order.delivery_contact_name ?? '',
        shipperPhone: order.delivery_phone ?? '',
        shipperEmail: order.delivery_email ?? '',
        shipperDestinationId: Number(order.rajaongkir_origin_id),
        shipperAddress: order.shipper_address,
        originPinPoint,
        receiverName: order.receiver_snapshot_name || order.receiver_name,
        receiverPhone: order.receiver_phone,
        receiverEmail: order.receiver_email,
        receiverDestinationId: Number(order.receiver_destination_id),
        receiverAddress: order.receiver_address,
        destinationPinPoint,
        shipping: snapshot.courierName || snapshot.courierCode,
        shippingType: snapshot.service,
        shippingCost,
        itemValue,
        orderItems,
        notes: `FarmaGO #${orderId.slice(0,8)}`,
      })
      const requestSummary = {
        orderId,
        courier: payload.shipping,
        service: payload.shipping_type,
        shippingCost: payload.shipping_cost,
        itemCount: orderItems.length,
        weightGrams: orderItems.reduce((sum: number, item: any) => sum + item.weightGrams * item.quantity, 0),
      }
      const shipmentId = shipment?.id ?? randomUUID()
      if (shipment) {
        await client.query(
          `UPDATE shipments SET status='booking_pending',provider='Komerce',provider_order_no=NULL,
            tracking_number=NULL,pickup_date=NULL,pickup_time=NULL,pickup_vehicle=NULL WHERE id=$1`,
          [shipmentId],
        )
      } else {
        await client.query(
          `INSERT INTO shipments(id,order_id,method,provider,status) VALUES($1,$2,'delivery','Komerce','booking_pending')`,
          [shipmentId, orderId],
        )
      }
      const merchantReference = `fg-store-${orderId}-${randomUUID()}`
      const attempt = await client.query(
        `INSERT INTO shipment_attempts(shipment_id,merchant_reference,operation,status,request_snapshot)
        VALUES($1,$2,'store_order','creating',$3) RETURNING id`,
        [shipmentId, merchantReference, requestSummary],
      )
      await recordAudit(client, actor.id, 'shipment.booking_started', 'order', orderId, {
        provider: 'Komerce', shippingCost: requestSummary.shippingCost,
      })
      return {
        alreadyBooked: false as const,
        shipmentId,
        attemptId: attempt.rows[0].id,
        merchantReference,
        payload,
      }
    })
    if (claim.alreadyBooked) return {
      shipmentId: claim.shipmentId,
      providerOrderNo: claim.providerOrderNo,
      status: claim.status,
      trackingNumber: claim.trackingNumber,
      replayed: true,
    }
    try {
      const providerOrder = await this.deliveryClient.storeOrder(claim.payload)
      await transaction(async (client) => {
        await client.query(
          `UPDATE shipments SET status='booked',provider_order_no=$2 WHERE id=$1 AND status='booking_pending'`,
          [claim.shipmentId, providerOrder.orderNo],
        )
        await client.query(
          `UPDATE shipment_attempts SET status='confirmed',provider_reference=$2,response_snapshot=$3 WHERE id=$1`,
          [claim.attemptId, providerOrder.orderNo, { orderNo: providerOrder.orderNo, providerOrderId: providerOrder.providerOrderId }],
        )
        await recordAudit(client, actor.id, 'shipment.booking_confirmed', 'order', orderId, {
          provider: 'Komerce', providerOrderNo: providerOrder.orderNo,
        })
      })
      return { shipmentId: claim.shipmentId, providerOrderNo: providerOrder.orderNo, status: 'booked' }
    } catch (error) {
      const rejected = error instanceof KomerceDeliveryError && error.outcome === 'rejected'
      const message = error instanceof KomerceDeliveryError ? error.providerMessage : 'Komerce belum mengonfirmasi hasil booking.'
      const status = rejected ? 'booking_failed' : 'booking_unknown'
      await transaction(async (client) => {
        await client.query('UPDATE shipments SET status=$2 WHERE id=$1', [claim.shipmentId, status])
        await client.query(
          'UPDATE shipment_attempts SET status=$2,response_snapshot=$3 WHERE id=$1',
          [claim.attemptId, rejected ? 'failed' : 'exception', { message }],
        )
        await recordAudit(client, actor.id, rejected ? 'shipment.booking_failed' : 'shipment.booking_unknown', 'order', orderId, { provider: 'Komerce' })
      })
      if (rejected)
        fail(422, 'DELIVERY_BOOKING_REJECTED', `Komerce menolak booking: ${message}`)
      fail(503, 'DELIVERY_BOOKING_OUTCOME_UNKNOWN', 'Hasil booking kurir belum pasti. Periksa dashboard Komerce dan jangan ulangi booking sebelum status dipastikan.')
    }
  }

  async requestShipmentPickup(
    orderId: string,
    actor: User,
    input: { pickupDate?: unknown; pickupTime?: unknown; pickupVehicle?: unknown },
  ) {
    const schedule = validateKomercePickupInput({
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime,
      pickupVehicle: input.pickupVehicle,
    })
    if (!this.deliveryClient.isConfigured())
      fail(503, 'DELIVERY_PROVIDER_NOT_CONFIGURED', 'Shipping Delivery Komerce belum dikonfigurasi.')
    const claim = await transaction(async (client) => {
      const selected = await client.query(
        `SELECT o.id,o.pharmacy_id,o.fulfillment_method,o.status,s.id AS shipment_id,
          s.method,s.status AS shipment_status,s.provider_order_no,s.tracking_number,
          NULLIF(o.shipping_snapshot->>'weightGrams','')::integer AS weight_grams
        FROM orders o LEFT JOIN shipments s ON s.order_id=o.id
        WHERE o.id=$1 FOR UPDATE OF o`,
        [orderId],
      )
      if (!selected.rowCount) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      const order = selected.rows[0]
      checkPharmacyScope(actor, order.pharmacy_id)
      if (order.fulfillment_method !== 'delivery' || order.status !== 'ready')
        fail(409, 'INVALID_ORDER_STATE', 'Pickup kurir hanya dapat dijadwalkan untuk pesanan pengiriman yang siap.')
      if (!order.shipment_id || order.method !== 'delivery' || !order.provider_order_no)
        fail(409, 'SHIPMENT_NOT_BOOKED', 'Buat order kurir sebelum menjadwalkan pickup.')
      if (['pickup_pending','pickup_unknown'].includes(order.shipment_status))
        fail(409, 'DELIVERY_PICKUP_REVIEW_REQUIRED', 'Hasil request pickup sebelumnya belum pasti. Periksa dashboard Komerce sebelum mencoba lagi.')
      if (order.shipment_status === 'pickup_requested')
        return { alreadyRequested: true as const, shipmentId: order.shipment_id, orderNo: order.provider_order_no, status: order.shipment_status, trackingNumber: order.tracking_number }
      if (!['booked','pickup_failed'].includes(order.shipment_status))
        fail(409, 'SHIPMENT_NOT_BOOKED', 'Order kurir belum terkonfirmasi.')
      const weightGrams = Number(order.weight_grams)
      if (
        (schedule.pickupVehicle === 'Motor' && weightGrams > 5000) ||
        (weightGrams >= 10_000 && schedule.pickupVehicle !== 'Truk')
      )
        fail(422, 'PICKUP_VEHICLE_UNSUITABLE', 'Pilih Mobil untuk paket di atas 5 kg, dan Truk untuk paket 10 kg atau lebih.')
      await client.query(
        `UPDATE shipments SET status='pickup_pending',pickup_date=$2,pickup_time=$3,pickup_vehicle=$4 WHERE id=$1`,
        [order.shipment_id, schedule.pickupDate, schedule.pickupTime, schedule.pickupVehicle],
      )
      const merchantReference = `fg-pickup-${orderId}-${randomUUID()}`
      const attempt = await client.query(
        `INSERT INTO shipment_attempts(shipment_id,merchant_reference,operation,status,request_snapshot)
        VALUES($1,$2,'pickup','creating',$3) RETURNING id`,
        [order.shipment_id, merchantReference, { pickupDate: schedule.pickupDate, pickupTime: schedule.pickupTime, pickupVehicle: schedule.pickupVehicle }],
      )
      await recordAudit(client, actor.id, 'shipment.pickup_started', 'order', orderId, {
        provider: 'Komerce', pickupDate: schedule.pickupDate, pickupTime: schedule.pickupTime, pickupVehicle: schedule.pickupVehicle,
      })
      return {
        alreadyRequested: false as const,
        shipmentId: order.shipment_id,
        attemptId: attempt.rows[0].id,
        orderNo: order.provider_order_no,
        schedule,
      }
    })
    if (claim.alreadyRequested) return {
      shipmentId: claim.shipmentId,
      providerOrderNo: claim.orderNo,
      status: claim.status,
      trackingNumber: claim.trackingNumber,
      replayed: true,
    }
    try {
      const pickup = await this.deliveryClient.requestPickup({
        pickup_date: claim.schedule.pickupDate,
        pickup_time: claim.schedule.pickupTime,
        pickup_vehicle: claim.schedule.pickupVehicle,
        orders: [{ order_no: claim.orderNo }],
      })
      await transaction(async (client) => {
        await client.query(
          `UPDATE shipments SET status='pickup_requested',tracking_number=COALESCE($2,tracking_number) WHERE id=$1 AND status='pickup_pending'`,
          [claim.shipmentId, pickup.awb],
        )
        await client.query(
          `UPDATE shipment_attempts SET status='confirmed',provider_reference=$2,response_snapshot=$3 WHERE id=$1`,
          [claim.attemptId, pickup.awb, { awb: pickup.awb }],
        )
        await recordAudit(client, actor.id, 'shipment.pickup_confirmed', 'order', orderId, {
          provider: 'Komerce', awb: pickup.awb,
        })
      })
      return {
        shipmentId: claim.shipmentId,
        providerOrderNo: claim.orderNo,
        trackingNumber: pickup.awb,
        status: 'pickup_requested',
        pickupDate: claim.schedule.pickupDate,
        pickupTime: claim.schedule.pickupTime,
        pickupVehicle: claim.schedule.pickupVehicle,
      }
    } catch (error) {
      const rejected = error instanceof KomerceDeliveryError && error.outcome === 'rejected'
      const message = error instanceof KomerceDeliveryError ? error.providerMessage : 'Komerce belum mengonfirmasi hasil pickup.'
      const status = rejected ? 'pickup_failed' : 'pickup_unknown'
      await transaction(async (client) => {
        await client.query('UPDATE shipments SET status=$2 WHERE id=$1', [claim.shipmentId, status])
        await client.query(
          'UPDATE shipment_attempts SET status=$2,response_snapshot=$3 WHERE id=$1',
          [claim.attemptId, rejected ? 'failed' : 'exception', { message }],
        )
        await recordAudit(client, actor.id, rejected ? 'shipment.pickup_failed' : 'shipment.pickup_unknown', 'order', orderId, { provider: 'Komerce' })
      })
      if (rejected)
        fail(422, 'DELIVERY_PICKUP_REJECTED', `Komerce menolak request pickup: ${message}`)
      fail(503, 'DELIVERY_PICKUP_OUTCOME_UNKNOWN', 'Hasil request pickup belum pasti. Periksa dashboard Komerce dan jangan ulangi sebelum status dipastikan.')
    }
  }

  async getShipmentTracking(orderId: string, customerId: string) {
    const [shipment] = await db
      .select({
        method: shipments.method,
        trackingNumber: shipments.trackingNumber,
        trackingStatus: shipments.trackingStatus,
        trackingHistory: shipments.trackingHistory,
        trackingCheckedAt: shipments.trackingCheckedAt,
        trackingAttemptedAt: shipments.trackingAttemptedAt,
        shippingSnapshot: orders.shippingSnapshot,
      })
      .from(orders)
      .innerJoin(shipments, eq(shipments.orderId, orders.id))
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .limit(1)
    if (!shipment) fail(404, 'NOT_FOUND', 'Pesanan pengiriman tidak ditemukan.')
    if (shipment.method !== 'delivery')
      fail(409, 'SHIPMENT_METHOD_MISMATCH', 'Pelacakan hanya tersedia untuk pesanan pengiriman.')
    if (!shipment.trackingNumber)
      fail(409, 'TRACKING_NOT_READY', 'Nomor resi belum tersedia dari kurir.')
    if (!this.deliveryClient.isConfigured())
      fail(503, 'DELIVERY_PROVIDER_NOT_CONFIGURED', 'Shipping Delivery Komerce belum dikonfigurasi.')

    const trackingNumber = shipment.trackingNumber
    const refreshedAt = shipment.trackingCheckedAt?.toISOString() ?? null
    const attemptedAt = shipment.trackingAttemptedAt?.getTime() ?? 0
    const checkedAt = shipment.trackingCheckedAt?.getTime() ?? 0
    if (attemptedAt && Date.now() - attemptedAt < 30_000) {
      if (!shipment.trackingCheckedAt)
        fail(503, 'TRACKING_TEMPORARILY_UNAVAILABLE', 'Status kurir sedang diperbarui. Coba lagi sebentar.')
      return {
        trackingNumber,
        lastStatus: shipment.trackingStatus,
        history: Array.isArray(shipment.trackingHistory) ? shipment.trackingHistory : [],
        refreshedAt,
        stale: attemptedAt > checkedAt,
      }
    }

    const courier = trackingCourier(shipment.shippingSnapshot)
    if (!courier)
      fail(422, 'TRACKING_DATA_INCOMPLETE', 'Informasi kurir pada pesanan tidak tersedia.')

    const [claimed] = await db
      .update(shipments)
      .set({ trackingAttemptedAt: sql`now()` })
      .where(
        and(
          eq(shipments.orderId, orderId),
          sql`(${shipments.trackingAttemptedAt} IS NULL OR ${shipments.trackingAttemptedAt} < now() - interval '30 seconds')`,
        ),
      )
      .returning({ orderId: shipments.orderId })
    if (!claimed) {
      if (!shipment.trackingCheckedAt)
        fail(503, 'TRACKING_TEMPORARILY_UNAVAILABLE', 'Status kurir sedang diperbarui. Coba lagi sebentar.')
      return {
        trackingNumber,
        lastStatus: shipment.trackingStatus,
        history: Array.isArray(shipment.trackingHistory) ? shipment.trackingHistory : [],
        refreshedAt,
        stale: true,
      }
    }

    try {
      const tracking = await this.deliveryClient.getAirwayBillHistory(courier, trackingNumber)
      await db
        .update(shipments)
        .set({
          trackingNumber: tracking.airwayBill,
          trackingStatus: tracking.lastStatus,
          trackingHistory: tracking.history,
          trackingCheckedAt: sql`now()`,
        })
        .where(eq(shipments.orderId, orderId))
      return {
        trackingNumber: tracking.airwayBill,
        lastStatus: tracking.lastStatus,
        history: tracking.history,
        refreshedAt: new Date().toISOString(),
        stale: false,
      }
    } catch (error) {
      if (shipment.trackingCheckedAt) {
        return {
          trackingNumber,
          lastStatus: shipment.trackingStatus,
          history: Array.isArray(shipment.trackingHistory) ? shipment.trackingHistory : [],
          refreshedAt,
          stale: true,
        }
      }
      if (error instanceof KomerceDeliveryError && error.outcome === 'rejected')
        fail(422, 'TRACKING_UNAVAILABLE', 'Komerce belum dapat mengambil status untuk resi ini.')
      fail(503, 'TRACKING_TEMPORARILY_UNAVAILABLE', 'Status kurir belum dapat diperbarui. Coba lagi nanti.')
    }
  }

  async syncPendingShipmentTracking(limit = 100) {
    if (!this.deliveryClient.isConfigured())
      return { checked: 0, synced: 0, failed: 0, skipped: 0 }

    const dueShipments = await db
      .select({
        orderId: shipments.orderId,
        trackingNumber: shipments.trackingNumber,
        shippingSnapshot: orders.shippingSnapshot,
      })
      .from(orders)
      .innerJoin(shipments, eq(shipments.orderId, orders.id))
      .where(
        and(
          eq(shipments.method, 'delivery'),
          sql`${shipments.trackingNumber} IS NOT NULL`,
          sql`(${shipments.trackingAttemptedAt} IS NULL OR ${shipments.trackingAttemptedAt} < now() - interval '10 minutes')`,
          sql`${orders.status} NOT IN ('completed', 'cancelled', 'canceled', 'expired')`,
        ),
      )
      .orderBy(sql`${shipments.trackingAttemptedAt} ASC NULLS FIRST`)
      .limit(Math.min(Math.max(limit, 1), 25))

    let synced = 0
    let failed = 0
    let skipped = 0
    for (const shipment of dueShipments) {
      if (!shipment.trackingNumber) {
        skipped += 1
        continue
      }
      const courier = trackingCourier(shipment.shippingSnapshot)
      if (!courier) {
        skipped += 1
        continue
      }
      try {
        const [claimed] = await db
          .update(shipments)
          .set({ trackingAttemptedAt: sql`now()` })
          .where(
            and(
              eq(shipments.orderId, shipment.orderId),
              sql`(${shipments.trackingAttemptedAt} IS NULL OR ${shipments.trackingAttemptedAt} < now() - interval '10 minutes')`,
            ),
          )
          .returning({ orderId: shipments.orderId })
        if (!claimed) {
          skipped += 1
          continue
        }
        const tracking = await this.deliveryClient.getAirwayBillHistory(
          courier,
          shipment.trackingNumber,
        )
        await db
          .update(shipments)
          .set({
            trackingNumber: tracking.airwayBill,
            trackingStatus: tracking.lastStatus,
            trackingHistory: tracking.history,
            trackingCheckedAt: sql`now()`,
          })
          .where(eq(shipments.orderId, shipment.orderId))
        synced += 1
      } catch {
        failed += 1
      }
    }
    return { checked: dueShipments.length, synced, failed, skipped }
  }

  async getShipmentLabel(orderId: string, actor: User) {
    if (!this.deliveryClient.isConfigured())
      fail(503, 'DELIVERY_PROVIDER_NOT_CONFIGURED', 'Shipping Delivery Komerce belum dikonfigurasi.')
    const [shipment] = await db
      .select({
        id: orders.id,
        pharmacyId: orders.pharmacyId,
        method: orders.fulfillmentMethod,
        providerOrderNo: shipments.providerOrderNo,
        shipmentStatus: shipments.status,
      })
      .from(orders)
      .leftJoin(shipments, eq(shipments.orderId, orders.id))
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!shipment) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
    checkPharmacyScope(actor, shipment.pharmacyId)
    if (shipment.method !== 'delivery' || !shipment.providerOrderNo || shipment.shipmentStatus !== 'pickup_requested')
      fail(409, 'DELIVERY_LABEL_NOT_READY', 'Label baru tersedia setelah pickup terkonfirmasi.')
    try {
      return await this.deliveryClient.printLabel(shipment.providerOrderNo)
    } catch (error) {
      if (error instanceof KomerceDeliveryError && error.outcome === 'rejected')
        fail(422, 'DELIVERY_LABEL_REJECTED', `Komerce belum dapat membuat label: ${error.providerMessage}`)
      fail(503, 'DELIVERY_LABEL_UNAVAILABLE', 'Label pengiriman belum dapat diambil. Coba lagi sebentar.')
    }
  }
}

function trackingCourier(value: unknown) {
  let snapshot: any = value
  if (typeof value === 'string') {
    try {
      snapshot = JSON.parse(value)
    } catch {
      return ''
    }
  }
  return String(snapshot?.courierCode ?? snapshot?.courierName ?? '').trim().toLowerCase()
}

function pinPoint(latitude: unknown, longitude: unknown) {
  if (latitude == null || longitude == null) return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    return null
  return `${lat}, ${lng}`
}
