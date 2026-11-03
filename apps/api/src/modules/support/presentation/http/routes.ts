import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import {
  createSupportCase,
  submitReturnRefund,
  getReturnRefund,
  listReturnRefunds,
  getReturnRefundEvidence,
  decideReturnRefund,
  markReturnRefunded,
  decideCancellation,
  listSupportCases,
  requestCancellation,
  updateSupportCaseById,
} from '../../public'
import type {
  CancellationDecisionRequestDto,
  CancellationRequestDto,
  CreateSupportCaseRequestDto,
  UpdateSupportCaseRequestDto,
  ReturnRefundRequestRequestDto,
  ReturnRefundDecisionRequestDto,
  ManualRefundCompletionRequestDto,
} from './dto'

const { apiError, body, json, limit, requireRole } = shared

export async function handleSupportRoutes({
  request,
  path,
  method,
  currentUser,
}: AuthenticatedRouteContext): Promise<Response | null> {
  const returnRequestsMatch = path.match(/^\/orders\/([0-9a-f-]+)\/return-refund-requests$/i)
  if (returnRequestsMatch && method === 'GET')
    return json(await getReturnRefund(returnRequestsMatch[1], currentUser))
  if (returnRequestsMatch && method === 'POST') {
    limit(request, 'return-refund-request', 5, currentUser.id)
    const form = await request.formData()
    const evidence = form.get('video')
    if (evidence !== null && !(evidence instanceof File))
      apiError(400, 'INVALID_RETURN_EVIDENCE', 'Video bukti tidak valid.')
    const result = await submitReturnRefund(
      returnRequestsMatch[1],
      currentUser,
      {
        reason: form.get('reason')?.toString(),
        bankName: form.get('bankName')?.toString(),
        accountHolderName: form.get('accountHolderName')?.toString(),
        accountNumber: form.get('accountNumber')?.toString(),
      },
      evidence instanceof File
        ? { data: Buffer.from(await evidence.arrayBuffer()), filename: evidence.name, mimeType: evidence.type }
        : null,
    )
    return json(result, 201)
  }

  const pharmacyReturnRequests = path === '/pharmacy/return-refund-requests'
  if (pharmacyReturnRequests && method === 'GET') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    return json({ items: await listReturnRefunds(currentUser) })
  }
  const returnEvidenceMatch = path.match(/^\/return-refund-requests\/([0-9a-f-]+)\/evidence$/i)
  if (returnEvidenceMatch && method === 'GET') {
    const evidence = await getReturnRefundEvidence(returnEvidenceMatch[1], currentUser)
    return new Response(Bun.file(evidence.filePath), {
      headers: {
        'content-type': evidence.mimeType,
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  }
  const returnDecisionMatch = path.match(/^\/return-refund-requests\/([0-9a-f-]+)\/decision$/i)
  if (returnDecisionMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    const input = await body<ReturnRefundDecisionRequestDto>(request)
    return json(await decideReturnRefund(returnDecisionMatch[1], currentUser, input))
  }
  const manualRefundMatch = path.match(/^\/return-refund-requests\/([0-9a-f-]+)\/manual-refund$/i)
  if (manualRefundMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist', 'pharmacy_staff')
    const input = await body<ManualRefundCompletionRequestDto>(request)
    return json(await markReturnRefunded(manualRefundMatch[1], currentUser, input))
  }

  const cancellationMatch = path.match(/^\/orders\/([0-9a-f-]+)\/cancellation-requests$/i)
  if (cancellationMatch && method === 'POST') {
    const input = await body<CancellationRequestDto>(request)
    const result = await requestCancellation(cancellationMatch[1], currentUser, input)
    return json(result, 201)
  }
  const cancellationDecision = path.match(/^\/cancellation-requests\/([0-9a-f-]+)\/decision$/i)
  if (cancellationDecision && method === 'POST') {
    requireRole(currentUser, 'cs', 'admin')
    const input = await body<CancellationDecisionRequestDto>(request)
    const result = await decideCancellation(cancellationDecision[1], currentUser, input)
    return json(result)
  }

  const casesMatch = path.match(/^\/orders\/([0-9a-f-]+)\/support-cases$/i)
  if (casesMatch && method === 'GET')
    return json({ items: await listSupportCases(casesMatch[1], currentUser) })
  if (casesMatch && method === 'POST') {
    const input = await body<CreateSupportCaseRequestDto>(request)
    return json(await createSupportCase(casesMatch[1], currentUser, input), 201)
  }
  const caseMatch = path.match(/^\/support-cases\/([0-9a-f-]+)$/i)
  if (caseMatch && method === 'PATCH') {
    requireRole(currentUser, 'cs', 'finance', 'admin')
    const input = await body<UpdateSupportCaseRequestDto>(request)
    return json(await updateSupportCaseById(caseMatch[1], currentUser, input))
  }

  return null
}
