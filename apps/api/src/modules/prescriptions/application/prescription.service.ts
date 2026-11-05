import { basename, extname, join } from 'node:path'
import { UPLOAD_MAX_BYTES } from '../../../shared/config'
import { ApplicationError } from '../../../shared/application-error'
import { canAccessPharmacy, hasRole, type User } from '../../../shared/domain/access'
import { hash } from '../../../shared/security/hash'
import type { PrescriptionDecision } from '../domain/review-policy'
import { isPrescriptionDecision } from '../domain/review-policy'
import type {
  PrescriptionMessageRequestDto,
  PrescriptionReviewRequestDto,
} from './prescription.dto'

export class PrescriptionOperationError extends ApplicationError {}

export type PrescriptionReviewInput = Omit<PrescriptionReviewRequestDto, 'decision'> & {
  decision: PrescriptionDecision
}
export type PrescriptionUploadRequest = {
  data: Buffer
  filename: string
  mimeType: string
}
export type PrescriptionUploadInput = {
  data: Buffer
  extension: string
  originalFilename: string
  mimeType: string
  sha256: string
}
export type PrescriptionFile = {
  id: string
  customer_id: string
  pharmacy_id: string
  object_key: string
  mime_type: string
}
export type PrescriptionMessageOrder = {
  customer_id: string
  pharmacy_id: string
  status: string
}

export interface PrescriptionRepository {
  upload(orderId: string, actor: User, input: PrescriptionUploadInput): Promise<unknown>
  findFile(prescriptionId: string): Promise<PrescriptionFile | null>
  recordFileViewed(prescriptionId: string, actorId: string): Promise<void>
  recordFileAccessDenied(prescriptionId: string, actorId: string, reason: string): Promise<void>
  review(prescriptionId: string, actor: User, input: PrescriptionReviewInput): Promise<unknown>
  findMessageOrder(orderId: string): Promise<PrescriptionMessageOrder | null>
  listMessages(
    orderId: string,
  ): Promise<
    Array<{ id: string; author_id: string; message_type: string; body: string; created_at: Date }>
  >
  hasOpenClarification(orderId: string): Promise<boolean>
  createMessage(
    orderId: string,
    actorId: string,
    type: 'customer_response' | 'clarification_request',
    message: string,
  ): Promise<{ id: string; created_at: Date }>
}

export async function uploadPrescription(
  repository: PrescriptionRepository,
  orderId: string,
  actor: User,
  request: PrescriptionUploadRequest,
) {
  if (request.data.length < 1 || request.data.length > UPLOAD_MAX_BYTES)
    throw new ApplicationError(
      413,
      'FILE_TOO_LARGE',
      'Ukuran berkas melebihi batas yang diizinkan.',
    )
  const originalFilename = safeFilename(request.filename)
  const extension = extname(originalFilename).toLowerCase()
  const extensionByMime = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['application/pdf', '.pdf'],
  ])
  if (
    !extensionByMime.has(request.mimeType) ||
    !['.jpg', '.jpeg', '.png', '.pdf'].includes(extension)
  )
    throw new ApplicationError(
      400,
      'FILE_TYPE_NOT_ALLOWED',
      'Format yang didukung: JPG, PNG, atau PDF.',
    )
  const detected =
    extension === '.pdf'
      ? request.data.subarray(0, 5).toString() === '%PDF-'
      : extension === '.png'
        ? request.data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : request.data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  if (!detected)
    throw new ApplicationError(400, 'INVALID_FILE', 'Isi berkas tidak sesuai dengan formatnya.')
  return repository.upload(orderId, actor, {
    data: request.data,
    extension: extensionByMime.get(request.mimeType)!,
    originalFilename,
    mimeType: request.mimeType,
    sha256: hash(request.data),
  })
}

export async function readPrescriptionFile(
  repository: PrescriptionRepository,
  prescriptionId: string,
  user: User,
) {
  const prescription = await repository.findFile(prescriptionId)
  if (!prescription) throw new ApplicationError(404, 'NOT_FOUND', 'Berkas tidak ditemukan.')
  if (prescription.customer_id !== user.id) {
    if (!hasRole(user, 'pharmacist')) {
      await repository.recordFileAccessDenied(prescription.id, user.id, 'pharmacist_role_required')
      throw new ApplicationError(403, 'FORBIDDEN', 'Akses berkas tidak diizinkan.')
    }
    if (!canAccessPharmacy(user, prescription.pharmacy_id)) {
      await repository.recordFileAccessDenied(prescription.id, user.id, 'pharmacy_scope_mismatch')
      checkPharmacyScope(user, prescription.pharmacy_id)
    }
  }
  const filePath = join(process.cwd(), 'storage', 'prescriptions', prescription.object_key)
  if (!(await Bun.file(filePath).exists()))
    throw new ApplicationError(404, 'FILE_MISSING', 'Berkas tidak tersedia.')
  await repository.recordFileViewed(prescription.id, user.id)
  return { id: prescription.id, filePath, mimeType: prescription.mime_type }
}

export async function reviewPrescription(
  repository: PrescriptionRepository,
  prescriptionId: string,
  actor: User,
  input: PrescriptionReviewRequestDto,
) {
  if (!isPrescriptionDecision(input.decision))
    throw new ApplicationError(400, 'INVALID_DECISION', 'Keputusan tidak valid.')
  if (
    ['clarification', 'rejected'].includes(input.decision) &&
    String(input.reason ?? '').trim().length < 3
  )
    throw new ApplicationError(
      422,
      'REVIEW_REASON_REQUIRED',
      'Catatan diperlukan untuk klarifikasi atau penolakan resep.',
    )
  return repository.review(prescriptionId, actor, { ...input, decision: input.decision })
}

export async function listPrescriptionMessages(
  repository: PrescriptionRepository,
  orderId: string,
  user: User,
) {
  const order = await getMessageOrder(repository, orderId)
  checkMessageAccess(order, user)
  return (await repository.listMessages(orderId)).map((message) => ({
    id: message.id,
    authorId: message.author_id,
    type: message.message_type,
    body: message.body,
    createdAt: message.created_at,
  }))
}

export async function createPrescriptionMessage(
  repository: PrescriptionRepository,
  orderId: string,
  user: User,
  input: PrescriptionMessageRequestDto,
) {
  const order = await getMessageOrder(repository, orderId)
  checkMessageAccess(order, user)
  const isCustomer = order.customer_id === user.id
  const message = String(input.message ?? '').trim()
  if (!message || message.length > 2000)
    throw new ApplicationError(
      400,
      'INVALID_MESSAGE',
      'Pesan klarifikasi wajib diisi dan maksimal 2.000 karakter.',
    )
  if (isCustomer) {
    if (order.status !== 'awaiting_prescription')
      throw new ApplicationError(
        409,
        'REVIEW_LOCKED',
        'Klarifikasi hanya dapat dijawab sebelum pembayaran.',
      )
    if (!(await repository.hasOpenClarification(orderId)))
      throw new ApplicationError(
        409,
        'NO_OPEN_CLARIFICATION',
        'Belum ada permintaan klarifikasi yang perlu dijawab.',
      )
  }
  const type = isCustomer ? 'customer_response' : 'clarification_request'
  const result = await repository.createMessage(orderId, user.id, type, message)
  return { id: result.id, type, createdAt: result.created_at }
}

async function getMessageOrder(repository: PrescriptionRepository, orderId: string) {
  const order = await repository.findMessageOrder(orderId)
  if (!order) throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  return order
}

function checkMessageAccess(order: PrescriptionMessageOrder, user: User) {
  if (order.customer_id === user.id) return
  if (!hasRole(user, 'pharmacist'))
    throw new ApplicationError(403, 'FORBIDDEN', 'Akses tidak diizinkan.')
  checkPharmacyScope(user, order.pharmacy_id)
}

function checkPharmacyScope(user: User, pharmacyId: string) {
  if (!canAccessPharmacy(user, pharmacyId))
    throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
}

function safeFilename(filename: string) {
  return (
    basename(filename)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120) || 'dokumen'
  )
}
