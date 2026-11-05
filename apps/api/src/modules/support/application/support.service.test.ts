import { describe, expect, test } from 'bun:test'
import { ApplicationError } from '../../../shared/application-error'
import type { User } from '../../../shared/domain/access'
import type { SupportRepository } from './support.service'
import {
  completeManualReturnRefund,
  decideOrderCancellation,
  decidePharmacyReturnRefund,
  listPharmacyReturnRefundRequests,
  requestOrderCancellation,
  submitOrderReturnRefund,
} from './support.service'

const customer = user('customer')
const pharmacist = user('pharmacist', 'pharmacy-1')

function user(role: string, pharmacyId: string | null = null): User {
  return {
    id: 'user-1',
    name: 'Arya',
    email: 'arya@example.com',
    phone: null,
    email_verified_at: '2026-11-01T00:00:00.000Z',
    phone_verified_at: null,
    roles: [{ role, pharmacyId }],
    csrfToken: 'csrf-token',
  }
}

function supportRepository(methods: Record<string, unknown>) {
  return methods as unknown as SupportRepository
}

function validRefundInput() {
  return {
    reason: ' Produk rusak saat diterima. ',
    bankName: ' BCA ',
    accountHolderName: ' Arya Paramita ',
    accountNumber: '1234-5678 90',
  }
}

describe('support and manual refund requirements', () => {
  test('normalizes bank details and validates MP4 evidence before repository submission', async () => {
    let saved: unknown[] | undefined
    const repo = supportRepository({
      submitReturnRefundRequest: async (...args: unknown[]) => {
        saved = args
        return { status: 'requested' }
      },
    })
    const video = Buffer.alloc(12)
    video.write('ftyp', 4)

    const result = await submitOrderReturnRefund(repo, 'order-1', customer, validRefundInput(), {
      data: video,
      filename: 'unboxing.mp4',
      mimeType: 'video/mp4',
    })

    expect(result).toEqual({ status: 'requested' })
    expect(saved?.[2]).toMatchObject({
      reason: 'Produk rusak saat diterima.',
      bankName: 'BCA',
      accountHolderName: 'Arya Paramita',
      accountNumber: '1234567890',
      evidence: { extension: '.mp4', mimeType: 'video/mp4' },
    })
  })

  test('rejects invalid account details and video bytes before persistence', async () => {
    let called = false
    const repo = supportRepository({
      submitReturnRefundRequest: async () => { called = true },
    })

    await expect(submitOrderReturnRefund(repo, 'order-1', customer, {
      ...validRefundInput(),
      accountNumber: '1234abcd',
    }, null)).rejects.toMatchObject({ status: 400, code: 'INVALID_ACCOUNT_NUMBER' })

    await expect(submitOrderReturnRefund(repo, 'order-1', customer, validRefundInput(), {
      data: Buffer.from('this is not an mp4'),
      filename: 'unboxing.mp4',
      mimeType: 'video/mp4',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_RETURN_EVIDENCE' })
    expect(called).toBe(false)
  })

  test('requires pharmacy staff to list or decide refund requests', async () => {
    const repo = supportRepository({})
    await expect(listPharmacyReturnRefundRequests(repo, customer)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
    await expect(decidePharmacyReturnRefund(repo, 'refund-1', customer, {
      decision: 'approved',
      refundAmount: 100,
    })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  test('requires a rejection reason and passes normalized approved amounts to persistence', async () => {
    let decision: unknown[] | undefined
    const repo = supportRepository({
      decideReturnRefundRequest: async (...args: unknown[]) => {
        decision = args
        return { status: 'approved' }
      },
    })

    await expect(decidePharmacyReturnRefund(repo, 'refund-1', pharmacist, {
      decision: 'rejected',
      reason: '  ',
    })).rejects.toMatchObject({ status: 400, code: 'DECISION_REASON_REQUIRED' })

    await decidePharmacyReturnRefund(repo, 'refund-1', pharmacist, {
      decision: 'approved',
      reason: '  Valid request  ',
      refundAmount: 1250.5,
    })
    expect(decision?.[2]).toEqual({
      decision: 'approved',
      reason: 'Valid request',
      refundAmount: '1250.50',
    })
  })

  test('requires and trims the manual bank-transfer reference', async () => {
    let reference = ''
    const repo = supportRepository({
      markManualRefund: async (_id: string, _actor: User, value: string) => {
        reference = value
        return { status: 'refunded' }
      },
    })

    await expect(completeManualReturnRefund(repo, 'refund-1', pharmacist, {
      transferReference: '  ',
    })).rejects.toMatchObject({ status: 400, code: 'TRANSFER_REFERENCE_REQUIRED' })
    await completeManualReturnRefund(repo, 'refund-1', pharmacist, {
      transferReference: '  BANK-TRANSFER-42  ',
    })
    expect(reference).toBe('BANK-TRANSFER-42')
  })

  test('keeps buyer cancellation reasons and blocks approval while courier booking is active', async () => {
    let requestArgs: unknown[] | undefined
    const requestRepo = supportRepository({
      requestCancellation: async (...args: unknown[]) => {
        requestArgs = args
        return { ok: true, value: { status: 'requested' } }
      },
    })
    await requestOrderCancellation(requestRepo, 'order-1', customer, { reason: '  Changed my mind  ' })
    expect(requestArgs?.slice(0, 4)).toEqual(['order-1', 'user-1', 'Changed my mind', false])

    const decisionRepo = supportRepository({
      decideCancellation: async () => ({ ok: false, reason: 'delivery-booking-active' }),
    })
    await expect(decideOrderCancellation(decisionRepo, 'cancel-1', pharmacist, {
      decision: 'approved',
    })).rejects.toMatchObject({ status: 409, code: 'DELIVERY_BOOKING_ACTIVE' })
  })
})
