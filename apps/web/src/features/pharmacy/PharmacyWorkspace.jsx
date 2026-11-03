import { useEffect, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, Check, ChevronDown, FileHeart, Minus, PackageCheck, Plus, ShoppingBag, Stethoscope, X } from 'lucide-react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'
import { statusLabel } from '../../shared/lib/formatters.js'
import { Metric } from '../../components/ui/Metric.jsx'
import { WorkspaceGate } from '../../components/ui/WorkspaceGate.jsx'
import { WorkspaceDenied } from '../../components/ui/WorkspaceDenied.jsx'
import { CourierShipmentActions } from './CourierShipmentActions.jsx'

export function PharmacyWorkspace({user,csrf,onLogin,onBack,onToast}){
  const [orders,setOrders]=useState([])
  const [inventory,setInventory]=useState([])
  const [selected,setSelected]=useState(null)
  const [adjustment,setAdjustment]=useState(null)
  const [delta,setDelta]=useState('')
  const [adjustmentReason,setAdjustmentReason]=useState('')
  const [loading,setLoading]=useState(false)
  const [reason,setReason]=useState('')
  const [fulfillmentOutcome,setFulfillmentOutcome]=useState('')
  const [fulfillmentNote,setFulfillmentNote]=useState('')
  const [lotEntries,setLotEntries]=useState({})
  const [pickupCode,setPickupCode]=useState('')
  const [proofReference,setProofReference]=useState('')
  const [shipmentBusy,setShipmentBusy]=useState(false)
  const [pickupDraft,setPickupDraft]=useState({pickupDate:nextLocalDate(),pickupTime:'10:00',pickupVehicle:'Motor'})
  const canAccess=user?.roles?.some((r)=>['pharmacist','pharmacy_staff'].includes(r.role))
  const isPharmacist=user?.roles?.some((r)=>r.role==='pharmacist')
  const reload=async()=>{
    if(!user)return
    setLoading(true)
    try{const[o,i]=await Promise.all([api('/orders'),api('/pharmacy/inventory')]);setOrders(o.items);setInventory(i.items)}
    catch(e){onToast(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{reload()},[user?.id])
  if(!user)return <WorkspaceGate title="Panel apotek" onLogin={onLogin} onBack={onBack}/>
  if(!canAccess)return <WorkspaceDenied title="Panel apotek" onBack={onBack}/>
  const detail=async(id)=>{
    try{const order=await api(`/orders/${id}`);setSelected(order);setFulfillmentOutcome('');setFulfillmentNote('');setLotEntries(Object.fromEntries(order.items.filter((item)=>item.batchTrackingRequired).map((item)=>[item.id,{lots:[{lotNumber:'',expiresOn:'',quantity:item.quantity}]}])));setPickupCode('');setProofReference('')}
    catch(e){onToast(e.message)}
  }
  const review=async(prescription,decision,order)=>{
    if(!prescription){onToast('Pelanggan belum mengunggah resep.');return}
    try{await api(`/prescriptions/${prescription.id}/reviews`,{method:'POST',csrf,body:JSON.stringify({decision,expectedReviewVersion:order.reviewVersion??0,orderItemIds:order.items.filter((i)=>i.requiresPrescription).map((i)=>i.id),reason})});setReason('');onToast('Keputusan apoteker tersimpan.');await reload();await detail(order.id)}
    catch(e){onToast(e.message)}
  }
  const startProcessing=async(order)=>{
    try{await api(`/orders/${order.id}/fulfillment`,{method:'POST',csrf,body:JSON.stringify({command:'start_processing'})});onToast('Pesanan mulai disiapkan.');await reload();await detail(order.id)}
    catch(e){onToast(e.message)}
  }
  const recordChecks=async(order)=>{
    try{
      const passed=fulfillmentOutcome==='passed'
      await api(`/orders/${order.id}/fulfillment-checks`,{method:'POST',csrf,body:JSON.stringify({passed,pharmacistCheck:isPharmacist&&passed,items:order.items.map((item)=>({orderItemId:item.id,quantity:item.quantity,lots:passed&&item.batchTrackingRequired?(lotEntries[item.id]?.lots||[]).map((lot)=>({...lot,quantity:Number(lot.quantity)})):[]})),note:passed?'Pemeriksaan produk, jumlah, kondisi, dan kedaluwarsa selesai.':fulfillmentNote})})
      onToast(passed?'Pemeriksaan akhir lulus dan tersimpan.':'Kendala tercatat dan kasus operasional dibuka untuk CS.');await reload();await detail(order.id)
    }catch(e){onToast(e.message)}
  }
  const markReady=async(order)=>{
    try{await api(`/orders/${order.id}/fulfillment`,{method:'POST',csrf,body:JSON.stringify({command:'mark_ready'})});onToast('Pesanan siap diserahkan.');await reload();await detail(order.id)}
    catch(e){onToast(e.message)}
  }
  const createCourierOrder=async(order)=>{
    setShipmentBusy(true)
    try{await api('/orders/'+order.id+'/shipment-bookings',{method:'POST',csrf,body:JSON.stringify({})});onToast('Order kurir Komerce berhasil dibuat.');await reload();await detail(order.id)}
    catch(e){onToast(e.message);await detail(order.id)}finally{setShipmentBusy(false)}
  }
  const requestCourierPickup=async(order)=>{
    setShipmentBusy(true)
    try{await api('/orders/'+order.id+'/shipment-pickups',{method:'POST',csrf,body:JSON.stringify(pickupDraft)});onToast('Jadwal pickup kurir tersimpan.');await reload();await detail(order.id)}
    catch(e){onToast(e.message);await detail(order.id)}finally{setShipmentBusy(false)}
  }
  const confirmPickup=async(order)=>{
    try{await api(`/orders/${order.id}/fulfillment`,{method:'POST',csrf,body:JSON.stringify({command:'confirm_pickup',pickupCode,proofReference})});onToast('Pengambilan pesanan tercatat.');await reload();await detail(order.id)}
    catch(e){onToast(e.message)}
  }
  const saveAdjustment=async(event)=>{
    event.preventDefault()
    try{await api('/pharmacy/inventory-adjustments',{method:'POST',csrf,body:JSON.stringify({pharmacyId:adjustment.pharmacyId,productId:adjustment.productId,delta:Number(delta),reason:adjustmentReason})});setAdjustment(null);setDelta('');setAdjustmentReason('');onToast('Alokasi stok daring diperbarui.');await reload()}
    catch(e){onToast(e.message)}
  }
  const updateLot=(itemId,index,field,value)=>setLotEntries((old)=>({...old,[itemId]:{lots:(old[itemId]?.lots||[]).map((lot,i)=>i===index?{...lot,[field]:value}:lot)}}))
  const addLot=(item)=>setLotEntries((old)=>{const lots=(old[item.id]?.lots||[]).map((lot)=>({...lot}));const first=lots[0];if(first&&Number(first.quantity)>1)first.quantity=Number(first.quantity)-1;lots.push({lotNumber:'',expiresOn:'',quantity:1});return {...old,[item.id]:{lots}}})
  const removeLot=(itemId,index)=>setLotEntries((old)=>({...old,[itemId]:{lots:(old[itemId]?.lots||[]).filter((_,i)=>i!==index)}}))
  const lotDataComplete=selected?.items.filter((item)=>item.batchTrackingRequired).every((item)=>{
    const lots=lotEntries[item.id]?.lots||[]
    return lots.length>0&&lots.every((lot)=>lot.lotNumber.trim()&&lot.expiresOn&&Number.isInteger(Number(lot.quantity))&&Number(lot.quantity)>0)&&lots.reduce((sum,lot)=>sum+Number(lot.quantity||0),0)===Number(item.quantity)
  })??true
  const canMarkReady=selected?.fulfillmentCheck?.passed===true&&(!selected.items.some((item)=>item.requiresPrescription)||selected.fulfillmentCheck.pharmacistCheck===true)
  const canRecordChecks=Boolean(fulfillmentOutcome)&&(fulfillmentOutcome==='passed'?lotDataComplete:fulfillmentNote.trim().length>=3)
  return <main className="workspace wrap">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Kembali ke katalog</button>
    <div className="workspace-heading"><div><span className="section-kicker">PORTAL MITRA</span><h1>Ruang kerja apotek</h1><p>Kelola antrean resep, siapkan pesanan, dan pantau alokasi stok daring.</p></div><div className="workspace-heading-icon"><Stethoscope size={28}/></div></div>
    <div className="workspace-metrics"><Metric label="Antrean resep" value={orders.filter(o=>o.status==='awaiting_prescription').length} icon={FileHeart}/><Metric label="Perlu disiapkan" value={orders.filter(o=>o.status==='paid').length} icon={PackageCheck}/><Metric label="Produk tersedia" value={inventory.filter(i=>i.available>0).length} icon={ShoppingBag}/><Metric label="Pesanan hari ini" value={orders.filter(o=>new Date(o.createdAt).toDateString()===new Date().toDateString()).length} icon={Activity}/></div>
    <div className="workspace-columns">
      <section className="workspace-panel"><div className="panel-title"><div><h2>Antrean pesanan</h2><p>Pesanan sesuai penugasan apotekmu.</p></div><button className="icon-button" onClick={reload}><Activity size={17}/></button></div>{loading?<div className="empty-state"><span className="loader"/></div>:orders.length?<div className="pharmacy-orders">{orders.map((order)=><button key={order.id} className="pharmacy-order-row" onClick={()=>detail(order.id)}><span className="order-row-icon"><PackageCheck size={18}/></span><span className="pharmacy-order-info"><strong>#{order.id.slice(0,8).toUpperCase()}</strong><small>{order.fulfillmentMethod==='pickup'?'Ambil di apotek':'Pengiriman'} · {new Date(order.createdAt).toLocaleDateString('id-ID')}</small></span><span className={`status-pill status-${order.status}`}>{statusLabel[order.status]||order.status}</span><ChevronDown size={16}/></button>)}</div>:<div className="empty-state compact"><span className="empty-icon"><Check size={20}/></span><strong>Belum ada pesanan</strong><span>Pesanan baru akan muncul di sini.</span></div>}</section>
      <section className="workspace-panel"><div className="panel-title"><div><h2>Alokasi stok daring</h2><p>Terpisah dari stok kasir toko.</p></div><button className="text-link" onClick={()=>onToast('Perubahan stok dicatat dengan alasan dan tidak dapat melewati reservasi aktif.')}>Aturan stok <ArrowRight size={14}/></button></div><div className="inventory-list">{inventory.slice(0,8).map((item)=><div className="inventory-row" key={`${item.pharmacyId}-${item.productId}`}><span><strong>{item.name}</strong><small>{item.sellUnit} · {money(item.unitPrice)}</small></span><span className={item.available?'stock-count':'stock-count out'}>{item.available}<small>tersedia</small></span><button className="stock-edit-button" onClick={()=>{setAdjustment(item);setDelta('');setAdjustmentReason('')}}>Koreksi</button></div>)}</div></section>
    </div>
    {adjustment&&<div className="overlay" onMouseDown={(e)=>e.target===e.currentTarget&&setAdjustment(null)}><section className="modal adjustment-modal"><div className="modal-head"><div><span className="section-kicker">ALOKASI DARING</span><h2>Koreksi stok</h2></div><button className="close-button" onClick={()=>setAdjustment(null)}><X/></button></div><div className="adjustment-product"><strong>{adjustment.name}</strong><small>{adjustment.sellUnit} · tersedia {adjustment.available} · terreservasi {adjustment.reserved}</small></div><form className="auth-form" onSubmit={saveAdjustment}><label>Perubahan jumlah unit<input required type="number" step="1" value={delta} onChange={(e)=>setDelta(e.target.value)} placeholder="Gunakan angka positif atau negatif"/></label><label>Alasan koreksi<input required minLength="3" maxLength="500" value={adjustmentReason} onChange={(e)=>setAdjustmentReason(e.target.value)} placeholder="Hasil pemeriksaan stok fisik"/></label><button className="button button-dark full-width" disabled={!delta||Number(delta)===0}>Simpan koreksi stok <ArrowRight size={16}/></button></form></section></div>}
    {selected&&<div className="overlay" onMouseDown={(e)=>e.target===e.currentTarget&&setSelected(null)}><section className="modal order-modal"><div className="modal-head"><div><span className="section-kicker">DETAIL PESANAN</span><h2>#{selected.id.slice(0,8).toUpperCase()}</h2></div><button className="close-button" onClick={()=>setSelected(null)}><X/></button></div><div className="order-success"><span className="success-ring"><PackageCheck size={22}/></span><div><strong>{statusLabel[selected.status]}</strong><span>{selected.pharmacyName} · {selected.fulfillmentMethod==='pickup'?'Ambil di apotek':'Pengiriman'}</span></div></div><div className="order-detail-items">{selected.items.map((item)=><div className="checkout-item" key={item.id}><span>{item.name}<small>× {item.quantity} {item.sellUnit}</small>{item.requiresPrescription&&<em>Resep</em>}</span><b>{money(item.lineTotal)}</b></div>)}</div>{selected.prescriptions?.map((prescription)=><div className="prescription-review-card" key={prescription.id}><div><FileHeart size={19}/><span><strong>Dokumen resep · revisi {prescription.revision}</strong><small>Status: {prescription.status}</small></span></div><a className="text-link" href={`/api/v1/prescriptions/${prescription.id}/file`} target="_blank" rel="noreferrer">Buka berkas <ArrowRight size={14}/></a></div>)}{selected.status==='awaiting_prescription'&&selected.prescriptions?.length>0&&isPharmacist&&<div className="review-action"><label>Catatan untuk pelanggan<input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Opsional untuk persetujuan, wajib untuk klarifikasi"/></label><div className="review-buttons"><button className="button button-outline" onClick={()=>review(selected.prescriptions[0],'clarification',selected)}>Minta klarifikasi</button><button className="button button-danger" onClick={()=>review(selected.prescriptions[0],'rejected',selected)}>Tolak resep</button><button className="button button-dark" onClick={()=>review(selected.prescriptions[0],'approved',selected)}>Setujui</button></div><small>Keputusan resep hanya tersedia untuk akun apoteker.</small></div>}{selected.status==='paid'&&<button className="button button-dark full-width" onClick={()=>startProcessing(selected)}>Mulai penyiapan <ArrowRight size={16}/></button>}{selected.status==='processing'&&<div className="review-action">{selected.fulfillmentCheck&&<div className={`fulfillment-result ${selected.fulfillmentCheck.passed?'passed':'failed'}`}><strong>Pemeriksaan terakhir: {selected.fulfillmentCheck.passed?'Lulus':'Ada kendala'}</strong>{selected.fulfillmentCheck.note&&<small>{selected.fulfillmentCheck.note}</small>}</div>}<label>Hasil pemeriksaan<select value={fulfillmentOutcome} onChange={(e)=>setFulfillmentOutcome(e.target.value)}><option value="">Pilih hasil pemeriksaan</option><option value="passed">Lulus</option><option value="failed">Ada kendala</option></select></label>{fulfillmentOutcome==='failed'&&<label>Jelaskan kendala<textarea className="fulfillment-note" value={fulfillmentNote} onChange={(e)=>setFulfillmentNote(e.target.value)} rows="3" maxLength="1000" placeholder="Produk tidak sesuai, stok fisik tidak cocok, atau kendala lainnya"/></label>}{selected.items.some((item)=>item.batchTrackingRequired)&&fulfillmentOutcome==='passed'&&<div className="batch-check-list"><strong>Catatan lot dan kedaluwarsa</strong>{selected.items.filter((item)=>item.batchTrackingRequired).map((item)=><fieldset className="batch-item" key={item.id}><legend>{item.name} · {item.quantity} {item.sellUnit}</legend>{(lotEntries[item.id]?.lots||[]).map((lot,index)=><div className="batch-lot-row" key={`${item.id}-${index}`}><label>Nomor lot<input maxLength="120" value={lot.lotNumber} onChange={(e)=>updateLot(item.id,index,'lotNumber',e.target.value)} placeholder="Nomor pada kemasan"/></label><label>Kedaluwarsa<input type="date" value={lot.expiresOn} onChange={(e)=>updateLot(item.id,index,'expiresOn',e.target.value)}/></label><label>Jumlah unit<input type="number" min="1" max={item.quantity} step="1" value={lot.quantity} onChange={(e)=>updateLot(item.id,index,'quantity',e.target.value)}/></label><button type="button" className="icon-button" disabled={(lotEntries[item.id]?.lots||[]).length<2} title="Hapus lot" onClick={()=>removeLot(item.id,index)}><Minus size={15}/></button></div>)}<button type="button" className="text-link batch-add" disabled={(lotEntries[item.id]?.lots||[]).reduce((sum,lot)=>sum+Number(lot.quantity||0),0)>=Number(item.quantity)} onClick={()=>addLot(item)}><Plus size={14}/> Tambah lot</button></fieldset>)}</div>}{fulfillmentOutcome==='passed'&&<small>Untuk pesanan resep, pemeriksaan akhir hanya dapat dicatat apoteker.</small>}<button className="button button-outline full-width" disabled={!canRecordChecks} onClick={()=>recordChecks(selected)}>Catat pemeriksaan akhir</button><button className="button button-dark full-width" disabled={!canMarkReady} onClick={()=>markReady(selected)}>Tandai siap <ArrowRight size={16}/></button><small>Stok akan dikonsumsi saat pesanan ditandai siap.</small></div>}{selected.status==='ready'&&selected.fulfillmentMethod==='delivery'&&<CourierShipmentActions order={selected} shipmentBusy={shipmentBusy} pickupDraft={pickupDraft} setPickupDraft={setPickupDraft} onCreateBooking={createCourierOrder} onRequestPickup={requestCourierPickup}/>}{selected.status==='ready'&&selected.fulfillmentMethod==='pickup'&&<div className="review-action"><label>Kode pengambilan dari pelanggan<input value={pickupCode} onChange={(e)=>setPickupCode(e.target.value)} placeholder="12 karakter"/></label><label>Referensi bukti serah terima<input value={proofReference} onChange={(e)=>setProofReference(e.target.value)} placeholder="Nomor bukti atau catatan SOP"/></label><button className="button button-dark full-width" disabled={!pickupCode||!proofReference} onClick={()=>confirmPickup(selected)}>Konfirmasi pengambilan</button></div>}</section></div>}
  </main>
}

