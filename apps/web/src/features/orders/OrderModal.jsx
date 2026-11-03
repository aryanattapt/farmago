import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Clock3, FileHeart, FileText, MapPin, Truck, X } from 'lucide-react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'
import { statusLabel } from '../../shared/lib/formatters.js'
import { ReturnRefundForm } from './ReturnRefundForm.jsx'

export function OrderModal({orderId,csrf,user,onClose,onToast}){
  const [order,setOrder]=useState(null)
  const [loading,setLoading]=useState(true)
  const [tracking,setTracking]=useState(null)
  const [trackingLoading,setTrackingLoading]=useState(false)
  const [trackingError,setTrackingError]=useState('')
  const [file,setFile]=useState(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [prescriptionMessages,setPrescriptionMessages]=useState([])
  const [clarificationReply,setClarificationReply]=useState('')
  const [cancelReason,setCancelReason]=useState('')
  const [cancelRequested,setCancelRequested]=useState(false)
  const refresh=()=>Promise.all([api(`/orders/${orderId}`),api(`/orders/${orderId}/prescription-messages`)]).then(([details,messages])=>{setOrder(details);setPrescriptionMessages(messages.items)}).catch((e)=>onToast(e.message)).finally(()=>setLoading(false))
  const refreshTracking=useCallback(async()=>{
    setTrackingLoading(true)
    try{
      const result=await api(`/orders/${orderId}/shipment-tracking`)
      setTracking(result);setTrackingError('')
      if(result.orderStatus)setOrder((current)=>current?({...current,status:result.orderStatus,shipment:current.shipment?({...current.shipment,status:result.shipmentStatus}):current.shipment}):current)
    }catch(error){setTrackingError(error.message)}finally{setTrackingLoading(false)}
  },[orderId])
  useEffect(()=>{refresh()},[])
  useEffect(()=>{
    if(order?.fulfillmentMethod!=='delivery'||!order.shipment?.trackingNumber)return
    refreshTracking()
    const interval=setInterval(refreshTracking,10*60*1000)
    return ()=>clearInterval(interval)
  },[order?.fulfillmentMethod,order?.shipment?.trackingNumber,refreshTracking])
  const upload=async()=>{
    if(!file)return
    const form=new FormData();form.append('file',file)
    setBusy(true)
    try{await api(`/orders/${orderId}/prescriptions`,{method:'POST',csrf,body:form});setFile(null);await refresh();onToast('Resep berhasil diunggah. Apoteker akan meninjaunya.')}
    catch(e){onToast(e.message)}finally{setBusy(false)}
  }
  const openCase=async()=>{
    if(!message.trim())return
    setBusy(true)
    try{await api(`/orders/${orderId}/support-cases`,{method:'POST',csrf,body:JSON.stringify({category:'order_help',description:message})});setMessage('');onToast('Permintaan bantuan telah dicatat.')}
    catch(e){onToast(e.message)}finally{setBusy(false)}
  }
  const replyToPharmacist=async()=>{
    if(!clarificationReply.trim())return
    setBusy(true)
    try{await api(`/orders/${orderId}/prescription-messages`,{method:'POST',csrf,body:JSON.stringify({message:clarificationReply})});setClarificationReply('');await refresh();onToast('Jawaban klarifikasi terkirim. Apoteker akan meninjaunya kembali.')}
    catch(e){onToast(e.message)}finally{setBusy(false)}
  }
  const requestCancellation=async()=>{
    if(!cancelReason.trim())return
    setBusy(true)
    try{await api(`/orders/${orderId}/cancellation-requests`,{method:'POST',csrf,body:JSON.stringify({reason:cancelReason})});setCancelRequested(true);setCancelReason('');onToast('Permintaan pembatalan tercatat dan menunggu keputusan petugas.')}
    catch(e){onToast(e.message)}finally{setBusy(false)}
  }
  if(loading)return <div className="overlay"><section className="modal order-modal"><div className="empty-state"><span className="loader"/>Memuat pesanan...</div></section></div>
  if(!order)return null
  const statusIndex=order.fulfillmentMethod==='delivery'
    ? ({awaiting_prescription:0,awaiting_payment:1,paid:2,processing:3,ready:3,in_delivery:4,completed:5}[order.status]??-1)
    : ({awaiting_prescription:0,awaiting_payment:1,paid:2,processing:3,ready:4,completed:5}[order.status]??-1)
  const timelineSteps=order.fulfillmentMethod==='delivery'?['Pesanan dibuat','Resep ditinjau','Pembayaran','Penyiapan','Dalam pengiriman','Selesai']:['Pesanan dibuat','Resep ditinjau','Pembayaran','Penyiapan','Siap diambil','Selesai']
  return <div className="overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal order-modal"><div className="modal-head"><div><span className="section-kicker">PESANAN KAMU</span><h2>Pesanan #{order.id.slice(0,8).toUpperCase()}</h2></div><button className="close-button" onClick={onClose}><X/></button></div><div className="order-success"><span className="success-ring"><Check size={23}/></span><div><strong>{order.status==='awaiting_prescription'?'Pesanan dibuat, selanjutnya unggah resep':statusLabel[order.status]}</strong><span>Apotek {order.pharmacyName} · {new Date(order.createdAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}</span></div></div><div className="order-timeline">{timelineSteps.map((step,index)=><div className={index<=Math.max(statusIndex,0)?'timeline-step done':'timeline-step'} key={step}><i>{index<Math.max(statusIndex,0)?<Check size={12}/>:index+1}</i><span>{step}</span></div>)}</div>{order.shipment&&<div className="shipping-quote"><Truck size={18}/><span><strong>{order.shipment.provider||'Kurir'} · {order.shipment.status==='pickup_requested'?'Pickup terjadwal':order.shipment.status==='booked'?'Menunggu jadwal pickup':order.shipment.status==='in_delivery'?'Dalam pengiriman':order.shipment.status==='delivered'?'Telah diterima':order.shipment.status==='exception'?'Pengiriman terkendala':'Diproses'}</strong><small>{order.shipment.trackingNumber?`Nomor resi ${order.shipment.trackingNumber}`:'Nomor resi akan muncul setelah kurir mengonfirmasi pickup.'}</small></span></div>}{order.fulfillmentMethod==='delivery'&&order.shipment?.trackingNumber&&<div className="shipment-tracking"><div className="shipment-tracking-head"><strong>{tracking?.lastStatus||'Status kurir belum tersedia'}</strong><button type="button" disabled={trackingLoading} onClick={refreshTracking}>{trackingLoading?'Memuat...':'Perbarui status'}</button></div>{order.shipment?.status==='exception'&&<small className="tracking-error">Kurir mengalami kendala. Kasus bantuan sudah dibuka untuk ditindaklanjuti.</small>}{trackingError&&<small className="tracking-error">{trackingError}</small>}{tracking?.stale&&<small className="tracking-error">Belum dapat diperbarui; menampilkan data terakhir yang tersimpan.</small>}{tracking?.history?.length>0?<ol className="shipment-tracking-list">{tracking.history.map((event,index)=><li key={event.date+'-'+event.code+'-'+index}><strong>{event.status||event.code||'Update kurir'}</strong>{event.description&&<span>{event.description}</span>}{event.date&&<small>{event.date}</small>}</li>)}</ol>:!trackingLoading&&!trackingError?<small>Belum ada riwayat dari kurir.</small>:null}{tracking?.refreshedAt&&<small>Diperbarui {new Date(tracking.refreshedAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}</small>}</div>}<div className="order-detail-items">{order.items.map((item)=><div className="checkout-item" key={item.id}><span>{item.name} <small>× {item.quantity} {item.sellUnit}</small>{item.requiresPrescription&&<em>Resep</em>}</span><b>{money(item.lineTotal)}</b></div>)}</div>{order.shipping&&<div className="shipping-quote"><span><strong>{order.shipping.courierName} · {order.shipping.service}</strong><small>{order.shipping.description}{order.shipping.etd?' · Estimasi '+order.shipping.etd:''}</small></span></div>}<div className="cost-total order-total"><strong>Total</strong><strong>{money(order.totals.total)}</strong></div>{order.fulfillmentMethod==='pickup'&&<div className="pickup-code"><MapPin size={17}/><span>Kode pengambilan</span><strong>{order.pickupCode}</strong><small>Tunjukkan kode ini saat mengambil di apotek.</small></div>}
    {order.status==='awaiting_prescription'&&order.prescriptions?.some((p)=>p.status==='clarification')&&<div className="clarification-panel"><div className="clarification-title"><FileHeart size={18}/><strong>Apoteker meminta klarifikasi</strong></div>{prescriptionMessages.filter((item)=>item.type==='clarification_request'||item.type==='customer_response').map((item)=><div className={item.type==='customer_response'?'clarification-message customer':'clarification-message'} key={item.id}><small>{item.type==='customer_response'?'Jawabanmu':'Catatan apoteker'}</small><p>{item.body}</p></div>)}<label>Jawaban klarifikasi<textarea value={clarificationReply} onChange={(e)=>setClarificationReply(e.target.value)} rows="2" maxLength="2000" placeholder="Tulis jawaban untuk apoteker"/></label><button className="button button-outline full-width" disabled={!clarificationReply.trim()||busy} onClick={replyToPharmacist}>Kirim jawaban</button><small>Jawabanmu tidak otomatis menyetujui resep. Apoteker akan membuat keputusan baru.</small></div>}
    {order.status==='awaiting_prescription'&&<div className="upload-box"><div><FileText size={20}/><span><strong>Unggah resep</strong><small>Foto jelas atau PDF · maks. 8 MB</small></span></div><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e)=>setFile(e.target.files?.[0])}/><button className="button button-dark full-width" disabled={!file||busy} onClick={upload}>{busy?'Mengunggah...':'Kirim ke apoteker'} <ArrowRight size={16}/></button>{order.prescriptions?.map((p)=><small key={p.id} className="uploaded-status">Dokumen {p.revision} · {p.status==='pending'?'Menunggu pemeriksaan':p.status}</small>)}</div>}
    {order.status==='awaiting_payment'&&<div className="notice notice-warm"><Clock3 size={18}/><span>Persyaratan resep terpenuhi. Integrasi pembayaran belum dikonfigurasi untuk lingkungan ini.</span></div>}{order.status==='completed'&&<ReturnRefundForm order={order} csrf={csrf} onToast={onToast}/>}
    {['awaiting_prescription','awaiting_payment','paid','processing','ready'].includes(order.status)&&<div className="cancel-section">{cancelRequested?<div className="notice notice-warm"><Clock3 size={17}/><span>Permintaan pembatalan menunggu keputusan petugas.</span></div>:<><button className="cancel-link" onClick={()=>setCancelReason((old)=>old?'':' ') }>Ajukan pembatalan</button>{cancelReason!==''&&<><label>Alasan pembatalan<textarea value={cancelReason.trimStart()} onChange={(e)=>setCancelReason(e.target.value)} rows="2" maxLength="500" placeholder="Jelaskan alasanmu"/></label><button className="button button-outline full-width" disabled={cancelReason.trim().length<3||busy} onClick={requestCancellation}>Kirim permintaan pembatalan</button></>}</>}</div>}
    <div className="order-help"><label>Butuh bantuan terkait pesanan ini?<textarea value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Ceritakan kendalamu" rows="2" maxLength="2000"/></label><button className="button button-outline full-width" disabled={!message.trim()||busy} onClick={openCase}>Kirim permintaan bantuan</button></div>
  </section></div>
}
