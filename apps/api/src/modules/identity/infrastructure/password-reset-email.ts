import nodemailer from 'nodemailer'

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

export class SmtpIdentityMailer {
  isConfigured() {
    return getSmtpConfig() !== null
  }

  async sendContactVerificationEmail(to: string, verificationUrl: string) {
    const config = getSmtpConfig()
    if (!config) throw new Error('SMTP_NOT_CONFIGURED')

    await getTransporter(config).sendMail({
      from: config.from,
      to,
      subject: 'Verifikasi email akun FarmaGO',
      text: [
        'Kami menerima pendaftaran akun FarmaGO menggunakan alamat email ini.',
        '',
        'Verifikasi email sebelum bertransaksi dengan membuka tautan berikut:',
        verificationUrl,
        '',
        'Tautan berlaku selama 30 menit. Abaikan email ini jika Anda tidak membuat akun.',
      ].join('\n'),
      html: [
        '<!doctype html>',
        '<html lang="id"><body>',
        '<h1>Verifikasi email FarmaGO</h1>',
        '<p>Kami menerima pendaftaran akun FarmaGO menggunakan alamat email ini.</p>',
        '<p>Verifikasi email sebelum bertransaksi dengan membuka tautan berikut:</p>',
        '<p><a href="' + escapeHtml(verificationUrl) + '">Verifikasi email</a></p>',
        '<p>Tautan berlaku selama 30 menit. Abaikan email ini jika Anda tidak membuat akun.</p>',
        '</body></html>',
      ].join(''),
    })
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const config = getSmtpConfig()
    if (!config) throw new Error('SMTP_NOT_CONFIGURED')

    await getTransporter(config).sendMail({
      from: config.from,
      to,
      subject: 'Atur ulang kata sandi FarmaGO',
      text: [
        'Kami menerima permintaan untuk mengatur ulang kata sandi akun FarmaGO Anda.',
        '',
        'Buka tautan berikut untuk membuat kata sandi baru:',
        resetUrl,
        '',
        'Tautan berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset kata sandi.',
      ].join('\n'),
      html: [
        '<!doctype html>',
        '<html lang="id"><body>',
        '<h1>Atur ulang kata sandi FarmaGO</h1>',
        '<p>Kami menerima permintaan untuk mengatur ulang kata sandi akun FarmaGO Anda.</p>',
        '<p><a href="' + escapeHtml(resetUrl) + '">Buat kata sandi baru</a></p>',
        '<p>Tautan berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset kata sandi.</p>',
        '</body></html>',
      ].join(''),
    })
  }
}

function getTransporter(config: SmtpConfig) {
  transporter ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}),
    requireTLS: !config.secure,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return transporter
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim() ?? ''
  const from = process.env.EMAIL_FROM?.trim() ?? ''
  const portValue = process.env.SMTP_PORT?.trim() || '587'
  const port = Number(portValue)
  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase() ?? ''
  const user = process.env.SMTP_USER?.trim() ?? ''
  const password = process.env.SMTP_PASSWORD ?? ''

  if (
    !host ||
    !from ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (secureValue !== '' && secureValue !== 'true' && secureValue !== 'false') ||
    Boolean(user) !== Boolean(password)
  ) {
    return null
  }

  return { host, from, port, secure: secureValue === 'true', user, password }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
