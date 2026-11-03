export type RegisterRequestDto = {
  name?: string
  email?: string
  phone?: string
  password?: string
}

export type ContactVerificationRequestDto = {
  token?: string
}

export type ContactVerificationResendRequestDto = {
  contact?: string
}

export type PasswordResetRequestDto = {
  token?: string
  newPassword?: string
  contact?: string
}

export type LoginRequestDto = {
  contact?: string
  password?: string
  mfaCode?: string
}
