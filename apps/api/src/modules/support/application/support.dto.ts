export type CancellationRequestDto = {
  reason?: string
}

export type CancellationDecisionDto = {
  decision?: string
  reason?: string
}

export type ReturnRefundRequestDto = {
  reason?: string
  bankName?: string
  accountHolderName?: string
  accountNumber?: string
}

export type ReturnRefundDecisionDto = {
  decision?: string
  reason?: string
  refundAmount?: string | number
}

export type ManualRefundCompletionDto = {
  transferReference?: string
}

export type CreateSupportCaseDto = {
  description?: string
  category?: string
}

export type UpdateSupportCaseDto = {
  status: string
  assignedTo?: string
}
