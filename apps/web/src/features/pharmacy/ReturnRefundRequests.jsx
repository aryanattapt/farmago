import { useEffect, useState } from 'react'
import { ArrowRight, FileText, RefreshCw } from 'lucide-react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'

export function ReturnRefundRequests({ csrf, onToast }) {
  const [items, setItems] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const result = await api('/pharmacy/return-refund-requests')
      setItems(result.items)
    } catch (error) {
      onToast(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const updateDraft = (id, key, value) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))

  const decide = async (item, decision) => {
    const draft = drafts[item.id] || {}
    try {
      await api(`/return-refund-requests/${item.id}/decision`, {
        method: 'POST',
        csrf,
        body: JSON.stringify({
          decision,
          reason: draft.reason || (decision === 'approved' ? 'Disetujui apotek' : ''),
          refundAmount: draft.refundAmount ?? item.received_amount ?? item.total,
        }),
      })
      onToast(decision === 'approved' ? 'Pengajuan disetujui. Transfer refund maksimal 7 hari.' : 'Pengajuan ditolak.')
      await reload()
    } catch (error) {
      onToast(error.message)
    }
  }

  const markRefunded = async (item) => {
    const transferReference = drafts[item.id]?.transferReference || ''
    try {
      await api(`/return-refund-requests/${item.id}/manual-refund`, {
        method: 'POST',
        csrf,
        body: JSON.stringify({ transferReference }),
      })
      onToast('Transfer refund dicatat.')
      await reload()
    } catch (error) {
      onToast(error.message)
    }
  }

  return <section className="workspace-panel return-refund-panel">
    <div className="panel-title">
      <div><h2>Pengajuan refund pelanggan</h2><p>Data rekening hanya tampil pada ruang kerja apotek yang ditugaskan.</p></div>
      <button className="icon-button" type="button" disabled={loading} onClick={reload}><RefreshCw size={16}/></button>
    </div>
    {loading && !items.length ? <div className="empty-state"><span className="loader"/></div>
      : items.length ? items.map((item) => <article className="return-refund-card" key={item.id}>
        <div className="return-refund-card-head">
          <strong>#{item.order_id.slice(0, 8).toUpperCase()} · {item.customer_name}</strong>
          <span className={`status-pill status-${item.status}`}>{item.status === 'requested' ? 'Menunggu keputusan' : 'Menunggu transfer'}</span>
        </div>
        <p>{item.reason}</p>
        <small>Diterima: {new Date(item.received_at).toLocaleString('id-ID')} · Ajukan sebelum: {new Date(item.eligible_until).toLocaleString('id-ID')}</small>
        <div className="return-refund-bank"><strong>Rekening refund</strong><span>{item.bank_name} · {item.account_holder_name} · {item.account_number}</span></div>
        {item.video_object_key && <a className="text-link" href={`/api/v1/return-refund-requests/${item.id}/evidence`} target="_blank" rel="noreferrer">Tonton video unboxing <ArrowRight size={14}/></a>}
        {item.status === 'requested'
          ? <div className="return-refund-actions">
              <label>Nominal refund (maks. dana diterima)
                <input type="number" min="0.01" step="0.01" max={item.received_amount ?? item.total} value={drafts[item.id]?.refundAmount ?? item.received_amount ?? item.total} onChange={(event) => updateDraft(item.id, 'refundAmount', event.target.value)}/>
              </label>
              <label>Catatan keputusan<input maxLength="500" value={drafts[item.id]?.reason ?? ''} onChange={(event) => updateDraft(item.id, 'reason', event.target.value)} placeholder="Wajib diisi jika ditolak"/></label>
              <div className="review-buttons">
                <button className="button button-outline" type="button" onClick={() => decide(item, 'rejected')}>Tolak</button>
                <button className="button button-dark" type="button" onClick={() => decide(item, 'approved')}>Setujui</button>
              </div>
            </div>
          : <div className="return-refund-actions">
              <strong>{money(item.refund_amount)} · batas transfer {new Date(item.refund_due_at).toLocaleString('id-ID')}</strong>{new Date(item.refund_due_at).getTime() < Date.now() && <em className="return-refund-overdue">Melewati tenggat</em>}
              <label>Referensi transfer<input maxLength="120" value={drafts[item.id]?.transferReference ?? ''} onChange={(event) => updateDraft(item.id, 'transferReference', event.target.value)} placeholder="Nomor referensi transfer bank"/></label>
              <button className="button button-dark" type="button" disabled={!drafts[item.id]?.transferReference?.trim()} onClick={() => markRefunded(item)}>Catat refund ditransfer</button>
            </div>}
      </article>) : <div className="empty-state compact"><FileText size={18}/><span>Belum ada pengajuan refund yang perlu diproses.</span></div>}
  </section>
}
