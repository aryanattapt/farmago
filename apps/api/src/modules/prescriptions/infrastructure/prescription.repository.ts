import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, transaction } from '../../../infrastructure/database/client'
import {
  auditLog,
  orders,
  prescriptionMessages,
  prescriptions,
} from '../../../infrastructure/database/schema'
import { canAccessPharmacy, type User } from '../../../shared/domain/access'
import { recordAudit } from '../../platform'
import { canTransitionOrder, insertOrderStatusHistory } from '../../orders'
import { allRequiredItemsApproved, validateReviewItems } from '../domain/review-policy'
import type {
  PrescriptionFile,
  PrescriptionMessageOrder,
  PrescriptionRepository,
  PrescriptionReviewInput,
  PrescriptionUploadInput,
} from '../application/prescription.service'
import { PrescriptionOperationError } from '../application/prescription.service'

function fail(status: number, code: string, message: string): never {
  throw new PrescriptionOperationError(status, code, message)
}

function checkPharmacyScope(actor: User, pharmacyId: string) {
  if (!canAccessPharmacy(actor, pharmacyId))
    fail(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
}

export class PostgresPrescriptionRepository implements PrescriptionRepository {
  async upload(orderId: string, actor: User, input: PrescriptionUploadInput) {
    let savedFile: string | null = null
    try {
      return await transaction(async (client) => {
        const orderResult = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [
          orderId,
        ])
        if (!orderResult.rowCount) fail(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
        const order = orderResult.rows[0]
        if (order.customer_id !== actor.id) fail(403, 'FORBIDDEN', 'Pesanan ini bukan milik Anda.')
        if (order.status !== 'awaiting_prescription')
          fail(409, 'REVIEW_LOCKED', 'Unggahan resep hanya dapat diubah sebelum tagihan dibuat.')
        const objectKey = `${orderId}/${randomUUID()}${input.extension}`
        const filePath = join(process.cwd(), 'storage', 'prescriptions', objectKey)
        await mkdir(join(process.cwd(), 'storage', 'prescriptions', orderId), { recursive: true })
        savedFile = filePath
        await Bun.write(filePath, input.data)
        const revision = Number(order.document_revision) + 1
        const inserted = await client.query(
          `INSERT INTO prescriptions(order_id,uploaded_by,object_key,original_filename,mime_type,document_revision,document_sha256,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id,created_at`,
          [
            orderId,
            actor.id,
            objectKey,
            input.originalFilename,
            input.mimeType,
            revision,
            input.sha256,
          ],
        )
        await client.query(
          'UPDATE orders SET document_revision=$2,review_version=review_version+1,updated_at=now() WHERE id=$1',
          [orderId, revision],
        )
        await recordAudit(
          client,
          actor.id,
          'prescription.uploaded',
          'prescription',
          inserted.rows[0].id,
          {
            revision,
          },
        )
        return { id: inserted.rows[0].id, revision, uploadedAt: inserted.rows[0].created_at }
      })
    } catch (error) {
      if (savedFile) await unlink(savedFile).catch(() => {})
      throw error
    }
  }

  async findFile(prescriptionId: string): Promise<PrescriptionFile | null> {
    const [prescription] = await db
      .select({
        id: prescriptions.id,
        customer_id: orders.customerId,
        pharmacy_id: orders.pharmacyId,
        object_key: prescriptions.objectKey,
        mime_type: prescriptions.mimeType,
      })
      .from(prescriptions)
      .innerJoin(orders, eq(orders.id, prescriptions.orderId))
      .where(eq(prescriptions.id, prescriptionId))
      .limit(1)
    return prescription ?? null
  }

  async recordFileViewed(prescriptionId: string, actorId: string) {
    await db.insert(auditLog).values({
      actorId,
      action: 'prescription.viewed',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      metadata: {},
    })
  }

  async recordFileAccessDenied(prescriptionId: string, actorId: string, reason: string) {
    await db.insert(auditLog).values({
      actorId,
      action: 'prescription.access_denied',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      metadata: { reason },
    })
  }

  async review(prescriptionId: string, actor: User, input: PrescriptionReviewInput) {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT p.*,o.id AS order_id,o.pharmacy_id,o.status AS order_status,o.document_revision AS current_document_revision,o.review_version,o.expires_at
        FROM prescriptions p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 FOR UPDATE OF o,p`,
        [prescriptionId],
      )
      if (!selected.rowCount) fail(404, 'NOT_FOUND', 'Dokumen resep tidak ditemukan.')
      const prescription = selected.rows[0]
      checkPharmacyScope(actor, prescription.pharmacy_id)
      if (
        prescription.order_status !== 'awaiting_prescription' ||
        Number(prescription.document_revision) !== Number(prescription.current_document_revision)
      )
        fail(409, 'REVIEW_LOCKED', 'Pemeriksaan resep sudah dikunci atau ada revisi dokumen baru.')
      if (Number(input.expectedReviewVersion) !== Number(prescription.review_version))
        fail(409, 'REVIEW_CONFLICT', 'Resep sudah ditinjau oleh petugas lain. Muat ulang antrean.')
      if (new Date(prescription.expires_at).getTime() <= Date.now())
        fail(409, 'ORDER_EXPIRED', 'Reservasi pesanan sudah berakhir.')
      const orderItems = await client.query(
        'SELECT id,requires_prescription_snapshot FROM order_items WHERE order_id=$1',
        [prescription.order_id],
      )
      const requiredIds = orderItems.rows
        .filter(
          (item: { requires_prescription_snapshot: boolean }) =>
            item.requires_prescription_snapshot,
        )
        .map((item: { id: string }) => item.id)
      const itemReview = validateReviewItems(requiredIds, input.orderItemIds, input.decision)
      if (!itemReview.ok && itemReview.reason !== 'incomplete')
        fail(400, 'INVALID_REVIEW_ITEMS', 'Pilih item resep pada pesanan ini.')
      if (!itemReview.ok)
        fail(422, 'REVIEW_INCOMPLETE', 'Persetujuan harus mencakup seluruh item wajib resep.')
      const reviewedIds = itemReview.itemIds
      const sequence = Number(prescription.review_version) + 1
      const review = await client.query(
        `INSERT INTO prescription_reviews(prescription_id,pharmacist_id,document_revision,review_sequence,decision,reason)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          prescription.id,
          actor.id,
          prescription.document_revision,
          sequence,
          input.decision,
          String(input.reason ?? '').trim() || null,
        ],
      )
      for (const itemId of reviewedIds)
        await client.query('INSERT INTO review_items(review_id,order_item_id) VALUES($1,$2)', [
          review.rows[0].id,
          itemId,
        ])
      await client.query('UPDATE prescriptions SET status=$2 WHERE id=$1', [
        prescription.id,
        input.decision,
      ])
      if (input.decision === 'clarification')
        await client.query(
          "INSERT INTO prescription_messages(order_id,author_id,message_type,body) VALUES($1,$2,'clarification_request',$3)",
          [prescription.order_id, actor.id, String(input.reason).trim()],
        )
      await client.query('UPDATE orders SET review_version=$2,updated_at=now() WHERE id=$1', [
        prescription.order_id,
        sequence,
      ])
      let status = prescription.order_status
      if (input.decision === 'rejected') {
        if (!canTransitionOrder(prescription.order_status, 'cancelled'))
          fail(409, 'INVALID_ORDER_STATE', 'Pesanan tidak dapat dibatalkan dari status saat ini.')
        await client.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1", [
          prescription.order_id,
        ])
        const active = await client.query(
          "SELECT * FROM stock_reservations WHERE order_id=$1 AND status='active' FOR UPDATE",
          [prescription.order_id],
        )
        for (const reservation of active.rows) {
          await client.query("UPDATE stock_reservations SET status='released' WHERE id=$1", [
            reservation.id,
          ])
          await client.query(
            'UPDATE inventory SET reserved=reserved-$3 WHERE pharmacy_id=$1 AND product_id=$2',
            [reservation.pharmacy_id, reservation.product_id, reservation.quantity],
          )
        }
        await insertOrderStatusHistory(
          client,
          prescription.order_id,
          prescription.order_status,
          'cancelled',
          actor.id,
          'Resep ditolak oleh apoteker',
        )
        status = 'cancelled'
      } else if (input.decision === 'approved') {
        const latest = await client.query(
          `SELECT oi.id,rv.decision,rv.document_revision FROM order_items oi
          LEFT JOIN LATERAL (SELECT pr.decision,pr.document_revision FROM review_items ri JOIN prescription_reviews pr ON pr.id=ri.review_id
            JOIN prescriptions ps ON ps.id=pr.prescription_id WHERE ri.order_item_id=oi.id AND ps.order_id=$1
            ORDER BY pr.review_sequence DESC LIMIT 1) rv ON true
          WHERE oi.order_id=$1 AND oi.requires_prescription_snapshot=true`,
          [prescription.order_id],
        )
        const latestReviews = latest.rows.map(
          (row: { id: string; decision: string | null; document_revision: number | null }) => ({
            itemId: row.id,
            decision: row.decision,
            documentRevision: row.document_revision == null ? null : Number(row.document_revision),
          }),
        )
        if (
          allRequiredItemsApproved(
            requiredIds,
            latestReviews,
            Number(prescription.document_revision),
          ) &&
          new Date(prescription.expires_at).getTime() > Date.now()
        ) {
          await client.query(
            "UPDATE orders SET status='awaiting_payment',updated_at=now() WHERE id=$1",
            [prescription.order_id],
          )
          await insertOrderStatusHistory(
            client,
            prescription.order_id,
            'awaiting_prescription',
            'awaiting_payment',
            actor.id,
            'Seluruh item wajib resep disetujui',
          )
          status = 'awaiting_payment'
        }
      }
      await recordAudit(
        client,
        actor.id,
        'prescription.reviewed',
        'prescription',
        prescription.id,
        {
          decision: input.decision,
          revision: prescription.document_revision,
          sequence,
        },
      )
      return {
        prescriptionId: prescription.id,
        decision: input.decision,
        reviewVersion: sequence,
        orderStatus: status,
      }
    })
  }

  async findMessageOrder(orderId: string): Promise<PrescriptionMessageOrder | null> {
    const [order] = await db
      .select({
        customer_id: orders.customerId,
        pharmacy_id: orders.pharmacyId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    return order ?? null
  }

  async listMessages(orderId: string) {
    return db
      .select({
        id: prescriptionMessages.id,
        author_id: prescriptionMessages.authorId,
        message_type: prescriptionMessages.messageType,
        body: sql<string>`COALESCE(${prescriptionMessages.body}, '')`,
        created_at: prescriptionMessages.createdAt,
      })
      .from(prescriptionMessages)
      .where(eq(prescriptionMessages.orderId, orderId))
      .orderBy(asc(prescriptionMessages.createdAt))
  }

  async hasOpenClarification(orderId: string) {
    const [open] = await db
      .select({ id: prescriptions.id })
      .from(prescriptions)
      .where(and(eq(prescriptions.orderId, orderId), eq(prescriptions.status, 'clarification')))
      .limit(1)
    return Boolean(open)
  }

  async createMessage(
    orderId: string,
    actorId: string,
    type: 'customer_response' | 'clarification_request',
    message: string,
  ) {
    const [result] = await db
      .insert(prescriptionMessages)
      .values({ orderId, authorId: actorId, messageType: type, body: message })
      .returning({ id: prescriptionMessages.id, created_at: prescriptionMessages.createdAt })
    return result
  }
}
