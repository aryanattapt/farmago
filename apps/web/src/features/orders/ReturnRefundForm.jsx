import { useEffect, useState } from 'react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'

const statusLabel = {
  requested: 'Menunggu pemeriksaan apotek',
  approved: 'Disetujui · menunggu transfer refund',
  rejected: 'Pengajuan ditolak',
  refunded: 'Refund sudah ditransfer',
}

export function ReturnRefundForm({ order, csrf, onToast }) {
  const [eligibility, setEligibility] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [video, setVideo] = useState(null)

  const refresh = () => api(`/orders/${order.id}/return-refund-requests`)
    .then(setEligibility)
    .catch((error) => onToast(error.message))
    .finally(() => setLoading(false))

  useEffect(() => {
    if (order.status === 'completed') refresh()
  }, [order.id, order.status])

  if (order.status !== 'completed') return null

  const submit = async (event) => {
    event.preventDefault()
    if (eligibility?.requiresVideo && !video) {
      onToast('Video unboxing wajib diunggah untuk pesanan kurir.')
      return
    }
    const form = new FormData()
    form.set('reason', reason)
    form.set('bankName', bankName)
    form.set('accountHolderName', accountHolderName)
    form.set('accountNumber', accountNumber)
    if (video) form.set('video', video)
    setBusy(true)
    try {
      await api(`/orders/${order.id}/return-refund-requests`, {
        method: 'POST',
        csrf,
        body: form,
      })
      onToast('Pengajuan refund terkirim ke apotek.')
      setReason('')
      setVideo(null)
      await refresh()
    } catch (error) {
      onToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="notice notice-warm">Memeriksa batas waktu pengajuan refund…</div>
  if (!eligibility) return null

  const request = eligibility.request
  return <section className="return-refund-form">
    <div className="return-refund-heading">
      <strong>Pengajuan refund</strong>
      <small>{eligibility.eligibleUntil
        ? `Batas pengajuan: ${new Date(eligibility.eligibleUntil).toLocaleString('id-ID')}`
        : 'Pengajuan tersedia setelah penerimaan barang tercatat.'}</small>
    </div>
    {request && <div className={`notice ${request.status === 'rejected' ? 'notice-warm' : 'notice-success'}`}>
      <span><strong>{statusLabel[request.status] || request.status}</strong>
      {request.decision_reason && <small> · {request.decision_reason}</small>}
      {request.refundDueAt && <small> · Batas transfer apotek: {new Date(request.refundDueAt).toLocaleString('id-ID')}</small>}
      {request.refundedAt && <small> · {money(request.refundAmount)} · Ref. {request.transfer_reference}</small>}</span>
    </div>}
    {eligibility.eligible
      ? <form className="return-refund-fields" onSubmit={submit}>
          <label>Alasan pengajuan<textarea required minLength="3" maxLength="1000" rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan pengajuan refund"/></label>
          <label>Bank penerima<input required maxLength="100" value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Contoh: BCA"/></label>
          <label>Nama pemilik rekening<input required maxLength="120" value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} placeholder="Sesuai nama di rekening"/></label>
          <label>Nomor rekening<input required inputMode="numeric" pattern="[0-9 -]{6,40}" maxLength="40" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Nomor rekening tujuan"/></label>
          {eligibility.requiresVideo && <label>Video unboxing<input required type="file" accept="video/mp4,video/webm" onChange={(event) => setVideo(event.target.files?.[0] || null)}/><small>Format MP4/WebM · maks. 25 MB.</small></label>}
          <button className="button button-outline full-width" disabled={busy || reason.trim().length < 3 || !bankName.trim() || !accountHolderName.trim() || !accountNumber.trim() || (eligibility.requiresVideo && !video)}>{busy ? 'Mengirim…' : 'Ajukan refund'}</button>
          <small>Pengajuan harus masuk paling lambat 3 hari setelah barang diterima. Jika disetujui, apotek memproses transfer manual maksimal 7 hari.</small>
        </form>
      : !request || request.status === 'rejected'
        ? <small className="return-refund-expired">Masa pengajuan 3 hari sejak barang diterima sudah berakhir.</small>
        : null}
  </section>
}
