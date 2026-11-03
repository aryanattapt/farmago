import {
  decideOrderCancellation,
  submitOrderReturnRefund,
  getOrderReturnRefundRequest,
  listPharmacyReturnRefundRequests,
  readReturnRefundEvidence,
  decidePharmacyReturnRefund,
  completeManualReturnRefund,
  listOrderSupportCases,
  openSupportCase,
  requestOrderCancellation,
  updateSupportCase,
} from './application/support.service'
import type {
  CancellationRequestDto,
  CancellationDecisionDto,
  ReturnRefundRequestDto,
  ReturnRefundDecisionDto,
  ManualRefundCompletionDto,
  CreateSupportCaseDto,
  UpdateSupportCaseDto,
} from './application/support.dto'
import type { User } from '../../shared/domain/access'
import { PostgresSupportRepository } from './infrastructure/support.repository'

const repository = new PostgresSupportRepository()

export const submitReturnRefund = (
  orderId: string,
  user: User,
  input: ReturnRefundRequestDto,
  evidence: { data: Buffer; filename: string; mimeType: string } | null,
) => submitOrderReturnRefund(repository, orderId, user, input, evidence)
export const getReturnRefund = (orderId: string, user: User) =>
  getOrderReturnRefundRequest(repository, orderId, user)
export const listReturnRefunds = (user: User) => listPharmacyReturnRefundRequests(repository, user)
export const getReturnRefundEvidence = (requestId: string, user: User) =>
  readReturnRefundEvidence(repository, requestId, user)
export const decideReturnRefund = (
  requestId: string,
  user: User,
  input: ReturnRefundDecisionDto,
) => decidePharmacyReturnRefund(repository, requestId, user, input)
export const markReturnRefunded = (
  requestId: string,
  user: User,
  input: ManualRefundCompletionDto,
) => completeManualReturnRefund(repository, requestId, user, input)

export const requestCancellation = (orderId: string, user: User, input: CancellationRequestDto) =>
  requestOrderCancellation(repository, orderId, user, input)
export const decideCancellation = (requestId: string, user: User, input: CancellationDecisionDto) =>
  decideOrderCancellation(repository, requestId, user, input)
export const listSupportCases = (orderId: string, user: User) =>
  listOrderSupportCases(repository, orderId, user)
export const createSupportCase = (orderId: string, user: User, input: CreateSupportCaseDto) =>
  openSupportCase(repository, orderId, user, input)
export const updateSupportCaseById = (caseId: string, user: User, input: UpdateSupportCaseDto) =>
  updateSupportCase(repository, caseId, user, input)
