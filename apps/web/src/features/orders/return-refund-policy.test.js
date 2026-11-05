import { describe, expect, test } from 'bun:test'
import { canSubmitReturnRefund } from './return-refund-policy.js'

const validRequest = {
  busy: false,
  reason: 'Barang diterima dalam kondisi rusak.',
  bankName: 'BCA',
  accountHolderName: 'Arya Paramita',
  accountNumber: '12345678',
  requiresVideo: false,
  video: null,
}

describe('post-delivery refund form requirements', () => {
  test('allows a complete pickup request without an unboxing video', () => {
    expect(canSubmitReturnRefund(validRequest)).toBe(true)
  })

  test('requires an unboxing video for courier delivery requests', () => {
    expect(canSubmitReturnRefund({ ...validRequest, requiresVideo: true })).toBe(false)
    expect(canSubmitReturnRefund({ ...validRequest, requiresVideo: true, video: { name: 'evidence.mp4' } })).toBe(true)
  })

  test('rejects incomplete or invalid bank details and short reasons', () => {
    expect(canSubmitReturnRefund({ ...validRequest, reason: 'no' })).toBe(false)
    expect(canSubmitReturnRefund({ ...validRequest, bankName: 'A' })).toBe(false)
    expect(canSubmitReturnRefund({ ...validRequest, accountHolderName: 'A' })).toBe(false)
    expect(canSubmitReturnRefund({ ...validRequest, accountNumber: '12345' })).toBe(false)
    expect(canSubmitReturnRefund({ ...validRequest, accountNumber: '1234abcd' })).toBe(false)
  })

  test('normalizes account number separators and blocks while submitting', () => {
    expect(canSubmitReturnRefund({ ...validRequest, accountNumber: '12-345 678' })).toBe(true)
    expect(canSubmitReturnRefund({ ...validRequest, busy: true })).toBe(false)
  })
})
