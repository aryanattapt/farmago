import * as shared from '../../../../shared/api'
import type { AuthenticatedRouteContext } from '../../../../shared/http/route-context'
import {
  getPrescriptionFile,
  getPrescriptionMessages,
  reviewPrescriptionDocument,
  sendPrescriptionMessage,
  uploadPrescriptionFile,
} from '../../public'
import type { PrescriptionMessageRequestDto, PrescriptionReviewRequestDto } from './dto'

const { apiError, body, json, limit, requireRole } = shared

export async function handlePrescriptionRoutes({
  request,
  path,
  method,
  currentUser,
}: AuthenticatedRouteContext): Promise<Response | null> {
  const uploadMatch = path.match(/^\/orders\/([0-9a-f-]+)\/prescriptions$/i)
  if (uploadMatch && method === 'POST') {
    limit(request, 'prescription-upload', 10, currentUser.id)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File))
      return apiError(400, 'FILE_REQUIRED', 'Pilih foto atau PDF resep terlebih dahulu.')
    const data = Buffer.from(await file.arrayBuffer())
    const saved = await uploadPrescriptionFile(uploadMatch[1], currentUser, {
      data,
      filename: file.name,
      mimeType: file.type,
    })
    return json(saved, 201)
  }

  const fileMatch = path.match(/^\/prescriptions\/([0-9a-f-]+)\/file$/i)
  if (fileMatch && method === 'GET') {
    const prescription = await getPrescriptionFile(fileMatch[1], currentUser)
    return new Response(Bun.file(prescription.filePath), {
      headers: {
        'content-type': prescription.mimeType,
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  const reviewMatch = path.match(/^\/prescriptions\/([0-9a-f-]+)\/reviews$/i)
  if (reviewMatch && method === 'POST') {
    requireRole(currentUser, 'pharmacist')
    const input = await body<PrescriptionReviewRequestDto>(request)
    return json(await reviewPrescriptionDocument(reviewMatch[1], currentUser, input))
  }

  const messagesMatch = path.match(/^\/orders\/([0-9a-f-]+)\/prescription-messages$/i)
  if (messagesMatch && method === 'GET')
    return json({ items: await getPrescriptionMessages(messagesMatch[1], currentUser) })
  if (messagesMatch && method === 'POST') {
    const input = await body<PrescriptionMessageRequestDto>(request)
    return json(await sendPrescriptionMessage(messagesMatch[1], currentUser, input), 201)
  }

  return null
}
