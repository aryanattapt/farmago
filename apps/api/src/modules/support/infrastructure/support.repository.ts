import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { ApplicationError } from '../../../shared/application-error'
import { canAccessPharmacy, type User } from '../../../shared/domain/access'
import { db, transaction } from '../../../infrastructure/database/client'
import { orders, supportCases } from '../../../infrastructure/database/schema'
import { recordAudit } from '../../platform'
import { canTransitionOrder, insertOrderStatusHistory } from '../../orders'
import type {
  CancellationDecisionDto,
  CreateSupportCaseDto,
  UpdateSupportCaseDto,
} from '../application/support.dto'
import type { ReturnRefundSubmission, SupportRepository, ValidatedReturnRefundDecision } from '../application/support.service'

export class PostgresSupportRepository implements SupportRepository {
  requestCancellation(orderId: string, actorId: string, reason: string, canModerate: boolean) {
    return transaction(async (client) => {
      const order = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])
      if (!order.rowCount) return { ok: false as const, reason: 'not-found' as const }
      if (order.rows[0].customer_id !== actorId && !canModerate)
        return { ok: false as const, reason: 'forbidden' as const }
      if (
        !['awaiting_prescription', 'awaiting_payment', 'paid', 'processing', 'ready'].includes(
          order.rows[0].status,
        )
      )
        return { ok: false as const, reason: 'cancellation-not-allowed' as const }
      const existing = await client.query(
        "SELECT id,status FROM cancellation_requests WHERE order_id=$1 AND status='requested'",
        [orderId],
      )
      if (existing.rowCount) return { ok: true as const, value: existing.rows[0] }
      const saved = await client.query(
        'INSERT INTO cancellation_requests(order_id,requested_by,reason) VALUES($1,$2,$3) RETURNING id,status',
        [orderId, actorId, reason],
      )
      await recordAudit(client, actorId, 'cancellation.requested', 'order', orderId, {
        requestId: saved.rows[0].id,
      })
      return { ok: true as const, value: saved.rows[0] }
    })
  }

  decideCancellation(requestId: string, actorId: string, input: CancellationDecisionDto) {
    return transaction(async (client) => {
      const request = await client.query(
        'SELECT cr.*,o.status AS order_status,o.pharmacy_id,o.fulfillment_method AS order_fulfillment_method FROM cancellation_requests cr JOIN orders o ON o.id=cr.order_id WHERE cr.id=$1 FOR UPDATE OF cr,o',
        [requestId],
      )
      if (!request.rowCount) return { ok: false as const, reason: 'not-found' as const }
      if (request.rows[0].status !== 'requested')
        return { ok: false as const, reason: 'already-decided' as const }
      const approved = input.decision === 'approved'
      if (!approved && input.decision !== 'rejected')
        return { ok: false as const, reason: 'invalid-decision' as const }
      if (approved && !canTransitionOrder(request.rows[0].order_status, 'cancelled'))
        return { ok: false as const, reason: 'cancellation-not-allowed' as const }
      if (approved && request.rows[0].order_fulfillment_method === 'delivery') {
        const shipment = await client.query(
          'SELECT id,status,provider_order_no,booking_cancellation_reference,handed_over_at FROM shipments WHERE order_id=$1 FOR UPDATE',
          [request.rows[0].order_id],
        )
        if (shipment.rowCount) {
          const current = shipment.rows[0]
          const safeStatuses = new Set(['pending', 'booking_failed', 'booking_cancelled'])
          const confirmedProviderCancellation =
            current.status === 'booking_cancelled' &&
            String(current.booking_cancellation_reference ?? '').trim().length >= 3
          if (
            current.handed_over_at ||
            !safeStatuses.has(current.status) ||
            (current.status === 'booking_cancelled' && !confirmedProviderCancellation) ||
            (current.provider_order_no && !confirmedProviderCancellation)
          )
            return { ok: false as const, reason: 'delivery-booking-active' as const }
        }
      }
      const status = approved ? 'approved' : 'rejected'
      await client.query(
        'UPDATE cancellation_requests SET status=$2,decided_by=$3,decision_reason=$4,decided_at=now() WHERE id=$1',
        [requestId, status, actorId, String(input.reason ?? '').slice(0, 500) || null],
      )
      if (approved) {
        const orderId = request.rows[0].order_id
        const active = await client.query(
          "SELECT * FROM stock_reservations WHERE order_id=$1 AND status='active' FOR UPDATE",
          [orderId],
        )
        for (const reservation of active.rows) {
          await client.query("UPDATE stock_reservations SET status='released' WHERE id=$1", [
            reservation.id,
          ])
          await client.query(
            'UPDATE inventory SET reserved=reserved-$3,updated_at=now() WHERE pharmacy_id=$1 AND product_id=$2',
            [reservation.pharmacy_id, reservation.product_id, reservation.quantity],
          )
        }
        await client.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1", [
          orderId,
        ])
        await insertOrderStatusHistory(
          client,
          orderId,
          request.rows[0].order_status,
          'cancelled',
          actorId,
          'Pembatalan disetujui',
        )
        if (['paid', 'processing', 'ready'].includes(request.rows[0].order_status)) {
          await client.query(
            "INSERT INTO support_cases(order_id,opened_by,category,description) SELECT $1,$2,'refund','Pembatalan disetujui; proses refund perlu ditangani finance.'",
            [orderId, actorId],
          )
        }
      }
      await recordAudit(
        client,
        actorId,
        'cancellation.decided',
        'cancellation_request',
        requestId,
        {
          decision: status,
        },
      )
      return { ok: true as const, value: { id: requestId, status } }
    })
  }

  getCancellationRequest(orderId: string, actor: User) {
    return transaction(async (client) => {
      const order = await client.query('SELECT customer_id FROM orders WHERE id=$1', [orderId])
      if (!order.rowCount)
        throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      if (order.rows[0].customer_id !== actor.id)
        throw new ApplicationError(403, 'FORBIDDEN', 'Pesanan ini bukan milik Anda.')
      const result = await client.query(
        `SELECT id,reason,status,decision_reason,created_at,decided_at
         FROM cancellation_requests WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      )
      return result.rows[0] ?? null
    })
  }

  recordCourierBookingCancellation(
    orderId: string,
    actorId: string,
    providerCancellationReference: string,
  ) {
    return transaction(async (client) => {
      const order = await client.query(
        'SELECT id,status,fulfillment_method FROM orders WHERE id=$1 FOR UPDATE',
        [orderId],
      )
      if (!order.rowCount) return { ok: false as const, reason: 'not-found' as const }
      if (!canTransitionOrder(order.rows[0].status, 'cancelled'))
        return { ok: false as const, reason: 'handover-already-recorded' as const }
      const pending = await client.query(
        "SELECT id FROM cancellation_requests WHERE order_id=$1 AND status='requested' LIMIT 1",
        [orderId],
      )
      if (!pending.rowCount)
        return { ok: false as const, reason: 'cancellation-request-not-open' as const }
      if (order.rows[0].fulfillment_method !== 'delivery')
        return { ok: false as const, reason: 'shipment-state-unresolved' as const }
      const selected = await client.query(
        'SELECT id,status,provider_order_no,handed_over_at FROM shipments WHERE order_id=$1 FOR UPDATE',
        [orderId],
      )
      if (!selected.rowCount) return { ok: false as const, reason: 'shipment-state-unresolved' as const }
      const shipment = selected.rows[0]
      const reconcilableStatuses = new Set([
        'booking_unknown',
        'booked',
        'pickup_unknown',
        'pickup_requested',
        'pickup_failed',
      ])
      if (
        shipment.handed_over_at ||
        !reconcilableStatuses.has(shipment.status)
      )
        return { ok: false as const, reason: 'shipment-state-unresolved' as const }
      await client.query(
        `UPDATE shipments SET status='booking_cancelled',booking_cancellation_reference=$2,
          booking_cancelled_at=now(),booking_cancelled_by=$3 WHERE id=$1`,
        [shipment.id, providerCancellationReference, actorId],
      )
      await recordAudit(
        client,
        actorId,
        'shipment.booking_cancelled_confirmed',
        'order',
        orderId,
        {
          shipmentId: shipment.id,
          providerOrderNo: shipment.provider_order_no,
          providerCancellationReference,
        },
      )
      return { ok: true as const, value: { orderId, status: 'booking_cancelled' } }
    })
  }

  async submitReturnRefundRequest(
    orderId: string,
    actor: User,
    input: ReturnRefundSubmission,
  ) {
    let savedFile: string | null = null
    try {
      return await transaction(async (client) => {
        const selected = await client.query(
          `SELECT o.id,o.customer_id,o.status,o.fulfillment_method,s.status AS shipment_status,
            s.delivered_at,
            (SELECT h.created_at FROM order_status_history h
             WHERE h.order_id=o.id AND h.to_status='completed'
             ORDER BY h.created_at DESC LIMIT 1) AS completed_at
          FROM orders o LEFT JOIN shipments s ON s.order_id=o.id
          WHERE o.id=$1 FOR UPDATE OF o`,
          [orderId],
        )
        if (!selected.rowCount)
          throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
        const order = selected.rows[0]
        if (order.customer_id !== actor.id)
          throw new ApplicationError(403, 'FORBIDDEN', 'Pesanan ini bukan milik Anda.')
        if (order.status !== 'completed')
          throw new ApplicationError(
            409,
            'RETURN_REQUEST_NOT_ALLOWED',
            'Pengajuan refund hanya dapat dibuat setelah barang diterima.',
          )
        const receivedAt =
          order.fulfillment_method === 'delivery' && order.shipment_status === 'delivered'
            ? order.delivered_at
            : order.fulfillment_method === 'pickup'
              ? order.completed_at
              : null
        if (!receivedAt)
          throw new ApplicationError(
            409,
            'RECEIPT_TIME_UNAVAILABLE',
            'Waktu penerimaan barang belum tercatat. Hubungi bantuan.',
          )
        const receivedDate = new Date(receivedAt)
        const eligibleUntil = new Date(receivedDate.getTime() + 3 * 24 * 60 * 60 * 1000)
        if (Date.now() > eligibleUntil.getTime())
          throw new ApplicationError(
            409,
            'RETURN_WINDOW_EXPIRED',
            'Pengajuan hanya dapat dikirim dalam 3 hari sejak barang diterima.',
          )
        if (order.fulfillment_method === 'delivery' && !input.evidence)
          throw new ApplicationError(
            400,
            'RETURN_EVIDENCE_REQUIRED',
            'Video unboxing wajib diunggah untuk pesanan yang dikirim kurir.',
          )

        const existing = await client.query(
          'SELECT id,status FROM return_refund_requests WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1',
          [orderId],
        )
        if (existing.rowCount && existing.rows[0].status !== 'rejected') {
          return {
            id: existing.rows[0].id,
            status: existing.rows[0].status,
            duplicate: true,
          }
        }

        const requestId = randomUUID()
        let objectKey: string | null = null
        if (input.evidence) {
          objectKey = `${orderId}/${requestId}${input.evidence.extension}`
          const filePath = join(
            process.cwd(),
            'storage',
            'return-refund-evidence',
            objectKey,
          )
          await mkdir(join(process.cwd(), 'storage', 'return-refund-evidence', orderId), {
            recursive: true,
          })
          savedFile = filePath
          await Bun.write(filePath, input.evidence.data)
        }
        const saved = await client.query(
          `INSERT INTO return_refund_requests(
            id,order_id,requested_by,reason,bank_name,account_holder_name,account_number,
            video_object_key,video_mime_type,received_at,eligible_until
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING id,status,created_at AS requested_at,eligible_until`,
          [
            requestId,
            orderId,
            actor.id,
            input.reason,
            input.bankName,
            input.accountHolderName,
            input.accountNumber,
            objectKey,
            input.evidence?.mimeType ?? null,
            receivedDate,
            eligibleUntil,
          ],
        )
        await recordAudit(client, actor.id, 'return_refund.requested', 'return_refund_request', requestId, {
          orderId,
          hasEvidence: Boolean(objectKey),
        })
        return { ...saved.rows[0], duplicate: false }
      })
    } catch (error) {
      if (savedFile) await unlink(savedFile).catch(() => {})
      throw error
    }
  }

  async getReturnRefundRequest(orderId: string, actor: User) {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT o.id,o.customer_id,o.status,o.fulfillment_method,s.status AS shipment_status,
          s.delivered_at,
          (SELECT h.created_at FROM order_status_history h
           WHERE h.order_id=o.id AND h.to_status='completed'
           ORDER BY h.created_at DESC LIMIT 1) AS completed_at
        FROM orders o LEFT JOIN shipments s ON s.order_id=o.id
        WHERE o.id=$1`,
        [orderId],
      )
      if (!selected.rowCount)
        throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
      const order = selected.rows[0]
      if (order.customer_id !== actor.id)
        throw new ApplicationError(403, 'FORBIDDEN', 'Pesanan ini bukan milik Anda.')
      const receivedAt =
        order.fulfillment_method === 'delivery' && order.shipment_status === 'delivered'
          ? order.delivered_at
          : order.fulfillment_method === 'pickup'
            ? order.completed_at
            : null
      const eligibleUntil = receivedAt
        ? new Date(new Date(receivedAt).getTime() + 3 * 24 * 60 * 60 * 1000)
        : null
      const request = await client.query(
        `SELECT id,status,reason,decision_reason,refund_amount,refund_due_at,refunded_at,
          transfer_reference,created_at AS requested_at,decided_at FROM return_refund_requests
         WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      )
      const rawRequest = request.rows[0] ?? null
      const existing = rawRequest
        ? {
            id: rawRequest.id,
            status: rawRequest.status,
            reason: rawRequest.reason,
            decisionReason: rawRequest.decision_reason,
            refundAmount: rawRequest.refund_amount,
            refundDueAt: rawRequest.refund_due_at,
            refundedAt: rawRequest.refunded_at,
            transferReference: rawRequest.transfer_reference,
            requestedAt: rawRequest.requested_at,
            decidedAt: rawRequest.decided_at,
          }
        : null
      return {
        request: existing,
        receivedAt,
        eligibleUntil,
        requiresVideo: order.fulfillment_method === 'delivery',
        eligible: Boolean(
          receivedAt &&
            eligibleUntil &&
            Date.now() <= eligibleUntil.getTime() &&
            order.status === 'completed' &&
            (!existing || existing.status === 'rejected'),
        ),
      }
    })
  }

  async listReturnRefundRequests(actor: User) {
    const pharmacyIds = actor.roles
      .filter((entry) => ['pharmacist', 'pharmacy_staff'].includes(entry.role))
      .map((entry) => entry.pharmacyId)
      .filter((id): id is string => Boolean(id))
    if (pharmacyIds.length === 0)
      throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Penugasan apotek diperlukan.')
    return transaction(async (client) => {
      const result = await client.query(
        `SELECT r.id,r.order_id,r.status,r.reason,r.bank_name,r.account_holder_name,
          r.account_number,r.video_object_key,r.video_mime_type,r.refund_amount,r.refund_due_at,
          r.decision_reason,r.received_at,r.eligible_until,r.created_at AS requested_at,r.decided_at,r.refunded_at,r.transfer_reference,
          o.pharmacy_id,o.total,o.fulfillment_method,u.name AS customer_name,
          p.received_amount
        FROM return_refund_requests r
        JOIN orders o ON o.id=r.order_id
        JOIN users u ON u.id=r.requested_by
        LEFT JOIN LATERAL (
          SELECT received_amount FROM payments WHERE order_id=o.id
          ORDER BY created_at DESC LIMIT 1
        ) p ON true
        WHERE o.pharmacy_id=ANY($1::uuid[])
          AND r.status IN ('requested','approved')
        ORDER BY r.created_at ASC`,
        [pharmacyIds],
      )
      for (const row of result.rows)
        await recordAudit(client, actor.id, 'return_refund.details_viewed', 'return_refund_request', row.id, { orderId: row.order_id })
      return result.rows
    })
  }

  async recordReturnRefundEvidenceViewed(requestId: string, actorId: string) {
    await transaction(async (client) => {
      await recordAudit(client, actorId, 'return_refund.evidence_viewed', 'return_refund_request', requestId, {})
    })
  }

  async findReturnRefundEvidence(requestId: string) {
    const result = await transaction(async (client) =>
      client.query(
        `SELECT r.video_object_key AS object_key,r.video_mime_type AS mime_type,
          o.customer_id,o.pharmacy_id
        FROM return_refund_requests r JOIN orders o ON o.id=r.order_id
        WHERE r.id=$1 AND r.video_object_key IS NOT NULL`,
        [requestId],
      ),
    )
    if (!result.rowCount) return null
    return {
      customerId: result.rows[0].customer_id,
      pharmacyId: result.rows[0].pharmacy_id,
      objectKey: result.rows[0].object_key,
      mimeType: result.rows[0].mime_type,
    }
  }

  async decideReturnRefundRequest(
    requestId: string,
    actor: User,
    input: ValidatedReturnRefundDecision,
  ) {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT r.*,o.pharmacy_id,o.status AS order_status
        FROM return_refund_requests r JOIN orders o ON o.id=r.order_id
        WHERE r.id=$1 FOR UPDATE OF r,o`,
        [requestId],
      )
      if (!selected.rowCount)
        throw new ApplicationError(404, 'NOT_FOUND', 'Pengajuan refund tidak ditemukan.')
      const request = selected.rows[0]
      if (!canAccessPharmacy(actor, request.pharmacy_id))
        throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
      if (request.status !== 'requested')
        throw new ApplicationError(409, 'ALREADY_DECIDED', 'Pengajuan refund sudah diputuskan.')
      if (request.order_status !== 'completed')
        throw new ApplicationError(409, 'ORDER_NOT_COMPLETED', 'Pesanan yang diterima harus tetap berstatus selesai.')
      const rejected = input.decision === 'rejected'
      if (rejected) {
        await client.query(
          `UPDATE return_refund_requests SET status='rejected',decided_by=$2,
            decision_reason=$3,decided_at=now() WHERE id=$1`,
          [requestId, actor.id, input.reason],
        )
        await recordAudit(client, actor.id, 'return_refund.rejected', 'return_refund_request', requestId, {
          orderId: request.order_id,
        })
        return { id: requestId, status: 'rejected', decisionReason: input.reason }
      }

      const paymentResult = await client.query(
        `SELECT id,received_amount FROM payments
        WHERE order_id=$1 AND status IN ('succeeded','late') AND received_amount IS NOT NULL
        ORDER BY confirmed_at DESC NULLS LAST,created_at DESC LIMIT 1 FOR UPDATE`,
        [request.order_id],
      )
      if (!paymentResult.rowCount)
        throw new ApplicationError(409, 'PAYMENT_NOT_RECEIVED', 'Dana pembayaran terverifikasi belum tersedia.')
      const payment = paymentResult.rows[0]
      const capacity = await client.query(
        `SELECT $1::numeric <= $2::numeric - COALESCE(
          (SELECT SUM(amount) FROM refunds
           WHERE payment_id=$3 AND status IN ('requested','processing','succeeded')),0
        ) AS allowed`,
        [input.refundAmount, payment.received_amount, payment.id],
      )
      if (!capacity.rows[0].allowed)
        throw new ApplicationError(409, 'REFUND_LIMIT_EXCEEDED', 'Nominal refund melebihi sisa dana yang diterima.')
      const merchantReference = `manual-return-${requestId}`
      const refund = await client.query(
        `INSERT INTO refunds(payment_id,merchant_reference,amount,reason,status,requested_by)
         VALUES($1,$2,$3,$4,'requested',$5) RETURNING id`,
        [payment.id, merchantReference, input.refundAmount, input.reason || request.reason, actor.id],
      )
      const updatedRequest = await client.query(
        `UPDATE return_refund_requests SET status='approved',decided_by=$2,
          decision_reason=$3,refund_id=$4,refund_amount=$5,decided_at=now(),
          refund_due_at=now()+interval '7 days' WHERE id=$1 RETURNING refund_due_at`,
        [requestId, actor.id, input.reason || null, refund.rows[0].id, input.refundAmount],
      )
      await recordAudit(client, actor.id, 'return_refund.approved', 'return_refund_request', requestId, {
        orderId: request.order_id,
        refundId: refund.rows[0].id,
        dueInDays: 7,
      })
      return {
        id: requestId,
        status: 'approved',
        refundAmount: input.refundAmount,
        refundDueAt: updatedRequest.rows[0].refund_due_at,
      }
    })
  }

  async markManualRefund(requestId: string, actor: User, transferReference: string) {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT r.status,r.refund_id,r.order_id,o.pharmacy_id
        FROM return_refund_requests r JOIN orders o ON o.id=r.order_id
        WHERE r.id=$1 FOR UPDATE OF r,o`,
        [requestId],
      )
      if (!selected.rowCount)
        throw new ApplicationError(404, 'NOT_FOUND', 'Pengajuan refund tidak ditemukan.')
      const request = selected.rows[0]
      if (!canAccessPharmacy(actor, request.pharmacy_id))
        throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
      if (request.status !== 'approved' || !request.refund_id)
        throw new ApplicationError(409, 'REFUND_NOT_APPROVED', 'Pengajuan refund belum disetujui.')
      const refund = await client.query(
        `UPDATE refunds SET status='succeeded',provider_reference=$2
        WHERE id=$1 AND status IN ('requested','processing') RETURNING id`,
        [request.refund_id, transferReference],
      )
      if (!refund.rowCount)
        throw new ApplicationError(409, 'REFUND_ALREADY_COMPLETED', 'Refund sudah ditandai selesai.')
      await client.query(
        `UPDATE return_refund_requests SET status='refunded',refunded_at=now(),
          transfer_reference=$2 WHERE id=$1`,
        [requestId, transferReference],
      )
      await recordAudit(client, actor.id, 'return_refund.manual_transfer_recorded', 'return_refund_request', requestId, {
        orderId: request.order_id,
        refundId: request.refund_id,
      })
      return { id: requestId, status: 'refunded', transferReference }
    })
  }

  async findOrderForCases(orderId: string) {
    const [order] = await db
      .select({
        customer_id: orders.customerId,
        pharmacy_id: orders.pharmacyId,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    return order ?? null
  }

  async listCases(orderId: string) {
    const items = await db
      .select({
        id: supportCases.id,
        category: supportCases.category,
        status: supportCases.status,
        description: supportCases.description,
        created_at: supportCases.createdAt,
        updated_at: supportCases.updatedAt,
      })
      .from(supportCases)
      .where(eq(supportCases.orderId, orderId))
      .orderBy(desc(supportCases.createdAt))
    return items
  }

  createCase(
    orderId: string,
    actorId: string,
    canOpenForOthers: boolean,
    input: CreateSupportCaseDto,
  ) {
    return transaction(async (client) => {
      const order = await client.query('SELECT customer_id FROM orders WHERE id=$1', [orderId])
      if (!order.rowCount) return { ok: false as const, reason: 'not-found' as const }
      if (order.rows[0].customer_id !== actorId && !canOpenForOthers)
        return { ok: false as const, reason: 'forbidden' as const }
      const result = await client.query(
        'INSERT INTO support_cases(order_id,opened_by,category,description) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',
        [
          orderId,
          actorId,
          String(input.category ?? 'other').slice(0, 50),
          String(input.description ?? '').trim(),
        ],
      )
      await recordAudit(client, actorId, 'support.opened', 'support_case', result.rows[0].id, {
        orderId,
      })
      return { ok: true as const, value: result.rows[0] }
    })
  }

  updateCase(caseId: string, actorId: string, assignedTo: string, input: UpdateSupportCaseDto) {
    return transaction(async (client) => {
      const assignee = await client.query(
        "SELECT 1 FROM user_roles WHERE user_id=$1 AND role IN ('admin','cs','finance') LIMIT 1",
        [assignedTo],
      )
      if (!assignee.rowCount) return { ok: false as const, reason: 'invalid-assignee' as const }
      const result = await client.query(
        'UPDATE support_cases SET status=$2,assigned_to=$3,updated_at=now() WHERE id=$1 RETURNING id,status,updated_at',
        [caseId, input.status, assignedTo],
      )
      if (!result.rowCount) return { ok: false as const, reason: 'not-found' as const }
      await recordAudit(client, actorId, 'support.updated', 'support_case', caseId, {
        status: input.status,
        assignedTo,
      })
      return { ok: true as const, value: result.rows[0] }
    })
  }
}
