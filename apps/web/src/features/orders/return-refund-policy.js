export function canSubmitReturnRefund({
  busy,
  reason,
  bankName,
  accountHolderName,
  accountNumber,
  requiresVideo,
  video,
}) {
  const normalizedAccount = String(accountNumber ?? '').replace(/[\s-]/g, '')
  return Boolean(
    !busy &&
      String(reason ?? '').trim().length >= 3 &&
      String(reason).trim().length <= 1000 &&
      String(bankName ?? '').trim().length >= 2 &&
      String(bankName).trim().length <= 100 &&
      String(accountHolderName ?? '').trim().length >= 2 &&
      String(accountHolderName).trim().length <= 120 &&
      /^\d{6,32}$/.test(normalizedAccount) &&
      (!requiresVideo || Boolean(video)),
  )
}
