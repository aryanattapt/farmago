export class ResendPasswordResetMailer {
  isConfigured() {
    return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const from = process.env.EMAIL_FROM?.trim()
    if (!apiKey || !from) throw new Error('RESEND_NOT_CONFIGURED')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
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
      }),
    })

    if (!response.ok) throw new Error('RESEND_REQUEST_FAILED_' + response.status)
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}