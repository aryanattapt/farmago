import { join } from 'node:path'
import { RETURN_EVIDENCE_MAX_BYTES } from '../../../shared/config'
import { ApplicationError } from '../../../shared/application-error'
import { canAccessPharmacy, hasRole, type User } from '../../../shared/domain/access'
import type {
  CancellationDecisionDto,
  ManualRefundCompletionDto,
  ReturnRefundDecisionDto,
  ReturnRefundRequestDto,
  CancellationRequestDto,
  CourierBookingCancellationDto,
  CreateSupportCaseDto,
  UpdateSupportCaseDto,
} from './support.dto'

export type ReturnRefundSubmission = ReturnRefundRequestDto & {
  accountNumber: string
  accountHolderName: string
  bankName: string
  reason: string
  evidence: { data: Buffer; extension: string; mimeType: string } | null
}

export type ValidatedReturnRefundDecision = {
  decision: 'approved' | 'rejected'
  reason: string
  refundAmount: string | null
}

export type SupportResult<T, Reason extends string> =
  { ok: true; value: T } | { ok: false; reason: Reason }

export interface SupportRepository {
  submitReturnRefundRequest(
    orderId: string,
    actor: User,
    input: ReturnRefundSubmission,
  ): Promise<unknown>
  getReturnRefundRequest(orderId: string, actor: User): Promise<unknown>
  listReturnRefundRequests(actor: User): Promise<unknown[]>
  recordReturnRefundEvidenceViewed(requestId: string, actorId: string): Promise<void>
  findReturnRefundEvidence(requestId: string): Promise<{
    customerId: string
    pharmacyId: string
    objectKey: string
    mimeType: string
  } | null>
  decideReturnRefundRequest(
    requestId: string,
    actor: User,
    input: ValidatedReturnRefundDecision,
  ): Promise<unknown>
  markManualRefund(requestId: string, actor: User, transferReference: string): Promise<unknown>
  requestCancellation(
    orderId: string,
    actorId: string,
    reason: string,
    canModerate: boolean,
  ): Promise<SupportResult<unknown, 'not-found' | 'forbidden' | 'cancellation-not-allowed'>>
  decideCancellation(
    requestId: string,
    actorId: string,
    input: CancellationDecisionDto,
  ): Promise<
    SupportResult<
      unknown,
      'not-found'
      | 'already-decided'
      | 'invalid-decision'
      | 'cancellation-not-allowed'
      | 'delivery-booking-active'
    >
  >
  getCancellationRequest(orderId: string, actor: User): Promise<unknown>
  recordCourierBookingCancellation(
    orderId: string,
    actorId: string,
    providerCancellationReference: string,
  ): Promise<
    SupportResult<
      unknown,
      'not-found' | 'cancellation-request-not-open' | 'shipment-state-unresolved' | 'handover-already-recorded'
    >
  >
  findOrderForCases(orderId: string): Promise<{ customer_id: string; pharmacy_id: string } | null>
  listCases(orderId: string): Promise<unknown[]>
  createCase(
    orderId: string,
    actorId: string,
    canOpenForOthers: boolean,
    input: CreateSupportCaseDto,
  ): Promise<SupportResult<unknown, 'not-found' | 'forbidden'>>
  updateCase(
    caseId: string,
    actorId: string,
    assignedTo: string,
    input: UpdateSupportCaseDto,
  ): Promise<SupportResult<unknown, 'invalid-assignee' | 'not-found'>>
}

export async function requestOrderCancellation(
  repository: SupportRepository,
  orderId: string,
  user: User,
  input: CancellationRequestDto,
) {
  const reason = String(input.reason ?? '').trim()
  if (reason.length < 3 || reason.length > 500)
    throw new ApplicationError(400, 'INVALID_REASON', 'Alasan pembatalan wajib diisi.')
  const result = await repository.requestCancellation(
    orderId,
    user.id,
    reason,
    hasRole(user, 'cs', 'admin'),
  )
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  if (result.reason === 'forbidden')
    throw new ApplicationError(403, 'FORBIDDEN', 'Tidak dapat meminta pembatalan pesanan ini.')
  throw new ApplicationError(
    409,
    'CANCELLATION_NOT_ALLOWED',
    'Pesanan sudah diserahkan atau berakhir. Buat kasus bantuan.',
  )
}

export async function decideOrderCancellation(
  repository: SupportRepository,
  requestId: string,
  user: User,
  input: CancellationDecisionDto,
) {
  const result = await repository.decideCancellation(requestId, user.id, input)
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Permintaan pembatalan tidak ditemukan.')
  if (result.reason === 'already-decided')
    throw new ApplicationError(409, 'ALREADY_DECIDED', 'Permintaan pembatalan sudah diputuskan.')
  if (result.reason === 'invalid-decision')
    throw new ApplicationError(400, 'INVALID_DECISION', 'Keputusan tidak valid.')
  if (result.reason === 'delivery-booking-active')
    throw new ApplicationError(
      409,
      'DELIVERY_BOOKING_ACTIVE',
      'Booking kurir masih aktif atau belum dipastikan batal. Selesaikan pembatalan di Komerce dan catat referensinya sebelum menyetujui pembatalan pesanan.',
    )
  throw new ApplicationError(
    409,
    'CANCELLATION_NOT_ALLOWED',
    'Pesanan sudah diserahkan atau berakhir.',
  )
}

export function getOrderCancellationRequest(
  repository: SupportRepository,
  orderId: string,
  user: User,
) {
  return repository.getCancellationRequest(orderId, user)
}

export async function confirmCourierBookingCancellation(
  repository: SupportRepository,
  orderId: string,
  user: User,
  input: CourierBookingCancellationDto,
) {
  if (!hasRole(user, 'admin', 'cs'))
    throw new ApplicationError(403, 'FORBIDDEN', 'Akses tidak diizinkan untuk akun ini.')
  const reference = String(input.providerCancellationReference ?? '').trim()
  if (reference.length < 3 || reference.length > 200)
    throw new ApplicationError(
      400,
      'INVALID_PROVIDER_CANCELLATION_REFERENCE',
      'Referensi konfirmasi pembatalan kurir wajib diisi (3–200 karakter).',
    )
  const result = await repository.recordCourierBookingCancellation(orderId, user.id, reference)
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  if (result.reason === 'cancellation-request-not-open')
    throw new ApplicationError(409, 'CANCELLATION_REQUEST_NOT_OPEN', 'Tidak ada permintaan pembatalan yang menunggu keputusan.')
  if (result.reason === 'handover-already-recorded')
    throw new ApplicationError(409, 'HANDOVER_ALREADY_RECORDED', 'Pesanan sudah diserahkan; pembatalan biasa tidak dapat dilanjutkan.')
  throw new ApplicationError(
    409,
    'SHIPMENT_STATE_UNRESOLVED',
    'Status booking sedang diproses atau belum cocok untuk direkonsiliasi. Tunggu hasil provider, lalu periksa kembali di Komerce.',
  )
}

export async function listOrderSupportCases(
  repository: SupportRepository,
  orderId: string,
  user: User,
) {
  const order = await repository.findOrderForCases(orderId)
  if (!order) throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  if (
    order.customer_id !== user.id &&
    !hasRole(user, 'cs', 'finance', 'admin') &&
    !canAccessPharmacy(user, order.pharmacy_id)
  )
    throw new ApplicationError(403, 'PHARMACY_SCOPE_REQUIRED', 'Akses apotek ini tidak diizinkan.')
  return repository.listCases(orderId)
}

export async function openSupportCase(
  repository: SupportRepository,
  orderId: string,
  user: User,
  input: CreateSupportCaseDto,
) {
  const description = String(input.description ?? '').trim()
  const category = String(input.category ?? 'other').slice(0, 50)
  if (description.length < 4 || description.length > 2000)
    throw new ApplicationError(400, 'INVALID_CASE', 'Jelaskan kendala dengan singkat.')
  const result = await repository.createCase(
    orderId,
    user.id,
    hasRole(user, 'cs', 'finance', 'admin'),
    { description, category },
  )
  if (result.ok) return result.value
  if (result.reason === 'not-found')
    throw new ApplicationError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.')
  throw new ApplicationError(403, 'FORBIDDEN', 'Tidak dapat membuka kasus untuk pesanan ini.')
}

export async function updateSupportCase(
  repository: SupportRepository,
  caseId: string,
  user: User,
  input: UpdateSupportCaseDto,
) {
  if (!['open', 'in_progress', 'closed'].includes(input.status))
    throw new ApplicationError(400, 'INVALID_STATUS', 'Status kasus tidak valid.')
  const assignedTo =
    input.assignedTo && isUuid(String(input.assignedTo)) ? String(input.assignedTo) : user.id
  const result = await repository.updateCase(caseId, user.id, assignedTo, input)
  if (result.ok) return result.value
  if (result.reason === 'invalid-assignee')
    throw new ApplicationError(400, 'INVALID_ASSIGNEE', 'Penanggung jawab harus akun operasional.')
  throw new ApplicationError(404, 'NOT_FOUND', 'Kasus bantuan tidak ditemukan.')
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}


export async function submitOrderReturnRefund(
  repository: SupportRepository,
  orderId: string,
  user: User,
  input: ReturnRefundRequestDto,
  evidence: { data: Buffer; filename: string; mimeType: string } | null,
) {
  const reason = String(input.reason ?? '').trim()
  const bankName = String(input.bankName ?? '').trim()
  const accountHolderName = String(input.accountHolderName ?? '').trim()
  const accountNumber = String(input.accountNumber ?? '').replace(/[\s-]/g, '')
  if (reason.length < 3 || reason.length > 1000)
    throw new ApplicationError(400, 'INVALID_REASON', 'Alasan pengajuan wajib diisi (3–1.000 karakter).')
  if (bankName.length < 2 || bankName.length > 100)
    throw new ApplicationError(400, 'INVALID_BANK', 'Nama bank wajib diisi.')
  if (accountHolderName.length < 2 || accountHolderName.length > 120)
    throw new ApplicationError(400, 'INVALID_ACCOUNT_NAME', 'Nama pemilik rekening wajib diisi.')
  if (!/^\d{6,32}$/.test(accountNumber))
    throw new ApplicationError(400, 'INVALID_ACCOUNT_NUMBER', 'Nomor rekening harus berisi 6–32 digit.')

  const validatedEvidence = evidence ? validateReturnEvidence(evidence) : null
  return repository.submitReturnRefundRequest(orderId, user, {
    reason,
    bankName,
    accountHolderName,
    accountNumber,
    evidence: validatedEvidence,
  })
}

function validateReturnEvidence(file: { data: Buffer; filename: string; mimeType: string }) {
  if (!file.data.length || file.data.length > RETURN_EVIDENCE_MAX_BYTES)
    throw new ApplicationError(413, 'RETURN_EVIDENCE_TOO_LARGE', 'Video melebihi batas ukuran yang diizinkan.')
  const mimeType = String(file.mimeType ?? '').toLowerCase()
  const formats = {
    'video/mp4': { extension: '.mp4', matches: (data: Buffer) => data.length >= 12 && data.subarray(4, 8).toString() === 'ftyp' },
    'video/webm': { extension: '.webm', matches: (data: Buffer) => data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  } as const
  const format = formats[mimeType as keyof typeof formats]
  if (!format)
    throw new ApplicationError(400, 'RETURN_EVIDENCE_TYPE_NOT_ALLOWED', 'Format video yang didukung: MP4 atau WebM.')
  if (!format.matches(file.data))
    throw new ApplicationError(400, 'INVALID_RETURN_EVIDENCE', 'Isi video tidak sesuai dengan formatnya.')
  return { data: file.data, extension: format.extension, mimeType }
}

export async function getOrderReturnRefundRequest(
  repository: SupportRepository,
  orderId: string,
  user: User,
) {
  return repository.getReturnRefundRequest(orderId, user)
}

export async function listPharmacyReturnRefundRequests(
  repository: SupportRepository,
  user: User,
) {
  if (!hasRole(user, 'pharmacist', 'pharmacy_staff'))
    throw new ApplicationError(403, 'FORBIDDEN', 'Akses apotek ini tidak diizinkan.')
  return repository.listReturnRefundRequests(user)
}

export async function readReturnRefundEvidence(
  repository: SupportRepository,
  requestId: string,
  user: User,
) {
  const evidence = await repository.findReturnRefundEvidence(requestId)
  if (!evidence) throw new ApplicationError(404, 'NOT_FOUND', 'Video bukti tidak ditemukan.')
  if (evidence.customerId !== user.id && (!hasRole(user, 'pharmacist', 'pharmacy_staff') || !canAccessPharmacy(user, evidence.pharmacyId)))
    throw new ApplicationError(403, 'FORBIDDEN', 'Akses video bukti tidak diizinkan.')
  const filePath = join(process.cwd(), 'storage', 'return-refund-evidence', evidence.objectKey)
  if (!(await Bun.file(filePath).exists()))
    throw new ApplicationError(404, 'FILE_MISSING', 'Video bukti tidak tersedia.')
  await repository.recordReturnRefundEvidenceViewed(requestId, user.id)
  return { filePath, mimeType: evidence.mimeType }
}

export async function decidePharmacyReturnRefund(
  repository: SupportRepository,
  requestId: string,
  user: User,
  input: ReturnRefundDecisionDto,
) {
  if (!hasRole(user, 'pharmacist', 'pharmacy_staff'))
    throw new ApplicationError(403, 'FORBIDDEN', 'Keputusan hanya dapat dilakukan petugas apotek.')
  if (!['approved', 'rejected'].includes(String(input.decision)))
    throw new ApplicationError(400, 'INVALID_DECISION', 'Keputusan tidak valid.')
  const reason = String(input.reason ?? '').trim()
  if (input.decision === 'rejected' && (reason.length < 3 || reason.length > 500))
    throw new ApplicationError(400, 'DECISION_REASON_REQUIRED', 'Alasan penolakan wajib diisi.')
  let refundAmount: string | null = null
  if (input.decision === 'approved') {
    const amount = Number(input.refundAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)))
      throw new ApplicationError(400, 'INVALID_REFUND_AMOUNT', 'Nominal refund harus lebih besar dari nol.')
    refundAmount = amount.toFixed(2)
  }
  return repository.decideReturnRefundRequest(requestId, user, {
    decision: input.decision as 'approved' | 'rejected',
    reason,
    refundAmount,
  })
}

export async function completeManualReturnRefund(
  repository: SupportRepository,
  requestId: string,
  user: User,
  input: ManualRefundCompletionDto,
) {
  if (!hasRole(user, 'pharmacist', 'pharmacy_staff'))
    throw new ApplicationError(403, 'FORBIDDEN', 'Penyelesaian refund hanya dapat dilakukan petugas apotek.')
  const transferReference = String(input.transferReference ?? '').trim()
  if (transferReference.length < 3 || transferReference.length > 120)
    throw new ApplicationError(400, 'TRANSFER_REFERENCE_REQUIRED', 'Referensi transfer wajib diisi.')
  return repository.markManualRefund(requestId, user, transferReference)
}
