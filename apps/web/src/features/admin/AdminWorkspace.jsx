import React from 'react'
import { useEffect, useState } from 'react'
import { Activity, ArrowLeft, Clock3, FileHeart, FileText, LockKeyhole, MapPin, Plus, ShoppingBag, X } from 'lucide-react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'
import { categoryIcon } from '../../shared/lib/catalog.js'
import { categoryColor } from '../../shared/lib/catalog.js'
import { statusLabel } from '../../shared/lib/formatters.js'
import { PharmacyCreateForm } from './PharmacyCreateForm.jsx'
import { DestinationLookup } from '../checkout/DestinationLookup.jsx'
import { Metric } from '../../components/ui/Metric.jsx'
import { WorkspaceGate } from '../../components/ui/WorkspaceGate.jsx'
import { WorkspaceDenied } from '../../components/ui/WorkspaceDenied.jsx'

export function AdminWorkspace({user,csrf,onLogin,onBack,onToast}){
  const [orders,setOrders]=useState([])
  const [products,setProducts]=useState([])
  const [pharmacies,setPharmacies]=useState([])
  const [inventory,setInventory]=useState([])
  const [cancellations,setCancellations]=useState([])
  const [supportCases,setSupportCases]=useState([])
  const [loading,setLoading]=useState(false)
  const [tab,setTab]=useState(()=>user?.roles?.some((r)=>r.role==='pharmacist')&&!user.roles.some((r)=>['admin','cs'].includes(r.role))?'products':'orders')
  const [showProductForm,setShowProductForm]=useState(false)
  const [stockProduct,setStockProduct]=useState(null)
  const [productDraft,setProductDraft]=useState({sku:'',name:'',description:'',category:'',sellUnit:'',shippingWeightGrams:'',shippingWidthCm:'',shippingHeightCm:'',shippingLengthCm:'',requiresPrescription:false,batchTrackingRequired:false,specialHandling:false})
  const [stockDraft,setStockDraft]=useState({pharmacyId:'',onHand:0,unitPrice:'',reason:'',shippingWeightGrams:0,shippingWidthCm:0,shippingHeightCm:0,shippingLengthCm:0})
  const [originPharmacy,setOriginPharmacy]=useState(null)
  const [originDestination,setOriginDestination]=useState(null)
  const [originSaving,setOriginSaving]=useState(false)
  const canAccess=user?.roles?.some((r)=>['admin','cs','pharmacist'].includes(r.role))
  const isAdmin=user?.roles?.some((r)=>r.role==='admin')
  const isPharmacist=user?.roles?.some((r)=>r.role==='pharmacist')
  const canOperate=user?.roles?.some((r)=>['admin','cs'].includes(r.role))
  const canViewCases=user?.roles?.some((r)=>['admin','cs','finance'].includes(r.role))
  const reload=async()=>{
    if(!user)return
    setLoading(true)
    try{
      const [orderResult,productResult,pharmacyResult,cancellationResult,caseResult,inventoryResult]=await Promise.all([
        canOperate?api('/admin/orders'):Promise.resolve({items:[]}),
        isAdmin||isPharmacist?api('/admin/products'):api('/products'),
        canOperate?api('/admin/pharmacies'):Promise.resolve({items:[]}),
        canOperate?api('/admin/cancellation-requests'):Promise.resolve({items:[]}),
        canViewCases?api('/admin/support-cases'):Promise.resolve({items:[]}),
        isAdmin?api('/pharmacy/inventory'):Promise.resolve({items:[]}),
      ])
      setOrders(orderResult.items);setProducts(productResult.items);setPharmacies(pharmacyResult.items);setCancellations(cancellationResult.items);setSupportCases(caseResult.items);setInventory(inventoryResult.items)
    }catch(e){onToast(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{reload()},[user?.id])
  if(!user)return <WorkspaceGate title="Panel operasional" onLogin={onLogin} onBack={onBack}/>
  if(!canAccess)return <WorkspaceDenied title="Panel operasional" onBack={onBack}/>
  const setProductStatus=async(product,status)=>{
    try{await api(`/admin/products/${product.id}`,{method:'PATCH',csrf,body:JSON.stringify({status})});onToast(`${product.name} ${status==='active'?'diaktifkan':'dinonaktifkan'}.`);reload()}
    catch(e){onToast(e.message)}
  }
  const createProduct=async(event)=>{
    event.preventDefault()
    try{
      await api('/admin/products',{method:'POST',csrf,body:JSON.stringify(productDraft)})
      setProductDraft({sku:'',name:'',description:'',category:'',sellUnit:'',shippingWeightGrams:'',shippingWidthCm:'',shippingHeightCm:'',shippingLengthCm:'',requiresPrescription:false,batchTrackingRequired:false,specialHandling:false})
      setShowProductForm(false);onToast('Produk dibuat dalam status nonaktif. Atur stok sebelum mengaktifkannya.');await reload()
    }catch(e){onToast(e.message)}
  }
  const openStockEditor=(product)=>{
    const activePharmacy=pharmacies.find((pharmacy)=>pharmacy.status==='active'&&inventory.some((item)=>item.productId===product.id&&item.pharmacyId===pharmacy.id))||pharmacies.find((pharmacy)=>pharmacy.status==='active')
    const existing=inventory.find((item)=>item.productId===product.id&&item.pharmacyId===activePharmacy?.id)
    setStockProduct(product);setStockDraft({pharmacyId:activePharmacy?.id||'',onHand:existing?.onHand??0,unitPrice:existing?.unitPrice??product.indicativePrice??'0.00',reason:'',shippingWeightGrams:product.shippingWeightGrams??0,shippingWidthCm:product.shippingWidthCm??0,shippingHeightCm:product.shippingHeightCm??0,shippingLengthCm:product.shippingLengthCm??0})
  }
  const changeStockPharmacy=(pharmacyId)=>{
    const existing=inventory.find((item)=>item.productId===stockProduct?.id&&item.pharmacyId===pharmacyId)
    setStockDraft((old)=>({...old,pharmacyId,onHand:existing?.onHand??0,unitPrice:existing?.unitPrice??stockProduct?.indicativePrice??'0.00'}))
  }
  const saveStock=async(event)=>{
    event.preventDefault()
    try{
      await api(`/admin/products/${stockProduct.id}`,{method:'PATCH',csrf,body:JSON.stringify({shippingWeightGrams:Number(stockDraft.shippingWeightGrams),shippingWidthCm:Number(stockDraft.shippingWidthCm),shippingHeightCm:Number(stockDraft.shippingHeightCm),shippingLengthCm:Number(stockDraft.shippingLengthCm)})})
      await api('/admin/inventory',{method:'POST',csrf,body:JSON.stringify({...stockDraft,productId:stockProduct.id,onHand:Number(stockDraft.onHand),unitPrice:Number(stockDraft.unitPrice)})})
      setStockProduct(null);onToast('Berat dan dimensi kemasan, alokasi, dan harga stok daring diperbarui.');await reload()
    }catch(e){onToast(e.message)}
  }
  const setPharmacyStatus=async(pharmacy,status)=>{
    try{await api(`/admin/pharmacies/${pharmacy.id}`,{method:'PATCH',csrf,body:JSON.stringify({status})});onToast(`${pharmacy.name}: status diperbarui.`);reload()}
    catch(e){onToast(e.message)}
  }
  const savePharmacyOrigin=async()=>{
    if(!originPharmacy||!originDestination?.id){onToast('Pilih lokasi asal apotek dari hasil pencarian RajaOngkir.');return}
    setOriginSaving(true)
    try{await api(`/admin/pharmacies/${originPharmacy.id}`,{method:'PATCH',csrf,body:JSON.stringify({rajaongkirOriginId:originDestination.id,deliveryContactName:originPharmacy.deliveryContactName,deliveryPhone:originPharmacy.deliveryPhone,deliveryEmail:originPharmacy.deliveryEmail})});setOriginPharmacy(null);setOriginDestination(null);onToast('Lokasi asal RajaOngkir apotek diperbarui.');await reload()}
    catch(e){onToast(e.message)}finally{setOriginSaving(false)}
  }
  const decideCancellation=async(request,decision)=>{
    try{await api(`/cancellation-requests/${request.id}/decision`,{method:'POST',csrf,body:JSON.stringify({decision,reason:decision==='approved'?'Disetujui tim operasional':'Ditolak tim operasional'})});onToast(`Permintaan pembatalan ${decision==='approved'?'disetujui':'ditolak'}.`);reload()}
    catch(e){onToast(e.message)}
  }
  const confirmCourierBookingCancellation=async(request)=>{
    const reference=window.prompt('Batalkan booking pesanan ini di dashboard Komerce terlebih dahulu. Masukkan nomor referensi atau bukti konfirmasi pembatalan:')
    if(reference===null)return
    if(reference.trim().length<3){onToast('Referensi pembatalan kurir wajib diisi.');return}
    try{await api(`/orders/${request.orderId}/shipment-booking-cancellation`,{method:'POST',csrf,body:JSON.stringify({providerCancellationReference:reference.trim()})});onToast('Konfirmasi pembatalan kurir tercatat. Permintaan pesanan bisa diputuskan sekarang.');reload()}
    catch(e){onToast(e.message)}
  }
  const closeSupportCase=async(item)=>{
    try{await api(`/support-cases/${item.id}`,{method:'PATCH',csrf,body:JSON.stringify({status:'closed'})});onToast('Kasus bantuan ditutup.');reload()}
    catch(e){onToast(e.message)}
  }
  return <main className="workspace wrap">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Kembali ke katalog</button>
    <div className="workspace-heading"><div><span className="section-kicker">OPERASIONAL</span><h1>Panel pengelola</h1><p>Pantau transaksi, katalog, dan status apotek mitra.</p></div><div className="workspace-heading-icon admin-icon"><Activity size={27}/></div></div>
    <div className="workspace-metrics"><Metric label="Total pesanan" value={orders.length} icon={ShoppingBag}/><Metric label="Menunggu resep" value={orders.filter(o=>o.status==='awaiting_prescription').length} icon={FileHeart}/><Metric label="Dalam proses" value={orders.filter(o=>['paid','processing','ready','in_delivery'].includes(o.status)).length} icon={Clock3}/><Metric label="Apotek mitra" value={pharmacies.length} icon={MapPin}/></div>
    <section className="workspace-panel admin-panel">
      <div className="panel-title"><div><h2>Ringkasan operasional</h2><p>Data seperlunya untuk tim layanan dan pengelola.</p></div><div className="tab-switch"><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Pesanan</button><button className={tab==='products'?'active':''} onClick={()=>setTab('products')}>Katalog</button><button className={tab==='pharmacies'?'active':''} onClick={()=>setTab('pharmacies')}>Apotek</button><button className="icon-button" onClick={reload}><Activity size={17}/></button></div></div>
    {loading?<div className="empty-state"><span className="loader"/></div>:tab==='orders'?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Apotek</th><th>Status</th><th>Total</th><th>Dibuat</th></tr></thead><tbody>{orders.map((order)=><tr key={order.id}><td className="table-id">#{order.id.slice(0,8).toUpperCase()}</td><td>{order.customerName}</td><td>{order.pharmacyName}</td><td><span className={`status-pill status-${order.status}`}>{statusLabel[order.status]}</span></td><td>{money(order.total)}</td><td>{new Date(order.createdAt).toLocaleDateString('id-ID')}</td></tr>)}</tbody></table>{!orders.length&&<div className="empty-state compact"><span>Belum ada pesanan.</span></div>}</div>:tab==='products'?<div className="admin-catalog"><div className="catalog-toolbar"><div><strong>Produk dan alokasi stok daring</strong><small>Produk baru nonaktif sampai data stok dan harga tersedia.</small></div>{isAdmin&&<button className="button button-dark button-small" onClick={()=>setShowProductForm((v)=>!v)}>{showProductForm?'Tutup form':'Tambah produk'} <Plus size={14}/></button>}</div>{showProductForm&&<form className="admin-form" onSubmit={createProduct}><label>SKU<input required maxLength="40" value={productDraft.sku} onChange={(e)=>setProductDraft((old)=>({...old,sku:e.target.value.toUpperCase()}))} placeholder="OTC-008"/></label><label>Nama produk<input required maxLength="160" value={productDraft.name} onChange={(e)=>setProductDraft((old)=>({...old,name:e.target.value}))} placeholder="Nama sesuai kemasan"/></label><label>Kategori<input required maxLength="80" value={productDraft.category} onChange={(e)=>setProductDraft((old)=>({...old,category:e.target.value}))} placeholder="Vitamin & suplemen"/></label><label>Satuan jual<input required maxLength="100" value={productDraft.sellUnit} onChange={(e)=>setProductDraft((old)=>({...old,sellUnit:e.target.value}))} placeholder="kotak isi 10 tablet"/></label><label>Berat satu kemasan (gram)<input required type="number" min="1" max="30000" step="1" value={productDraft.shippingWeightGrams} onChange={(e)=>setProductDraft((old)=>({...old,shippingWeightGrams:e.target.value}))} placeholder="120"/></label><label>Lebar satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={productDraft.shippingWidthCm} onChange={(e)=>setProductDraft((old)=>({...old,shippingWidthCm:e.target.value}))}/></label><label>Tinggi satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={productDraft.shippingHeightCm} onChange={(e)=>setProductDraft((old)=>({...old,shippingHeightCm:e.target.value}))}/></label><label>Panjang satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={productDraft.shippingLengthCm} onChange={(e)=>setProductDraft((old)=>({...old,shippingLengthCm:e.target.value}))}/></label><label className="form-wide">Keterangan<textarea maxLength="3000" value={productDraft.description} onChange={(e)=>setProductDraft((old)=>({...old,description:e.target.value}))} rows="2"/></label><label className="checkbox-field"><input type="checkbox" checked={productDraft.requiresPrescription} onChange={(e)=>setProductDraft((old)=>({...old,requiresPrescription:e.target.checked}))}/> Wajib resep</label><label className="checkbox-field"><input type="checkbox" checked={productDraft.batchTrackingRequired} onChange={(e)=>setProductDraft((old)=>({...old,batchTrackingRequired:e.target.checked}))}/> Catat lot & kedaluwarsa saat penyiapan</label><label className="checkbox-field"><input type="checkbox" checked={productDraft.specialHandling} onChange={(e)=>setProductDraft((old)=>({...old,specialHandling:e.target.checked}))}/> Penanganan khusus</label><button className="button button-dark form-wide">Buat produk nonaktif</button></form>}{stockProduct&&<form className="inventory-editor" onSubmit={saveStock}><div className="inventory-editor-head"><strong>Stok dan harga · {stockProduct.name}</strong><button type="button" className="icon-button" onClick={()=>setStockProduct(null)}><X size={16}/></button></div><label>Apotek aktif<select required value={stockDraft.pharmacyId} onChange={(e)=>changeStockPharmacy(e.target.value)}>{pharmacies.filter((pharmacy)=>pharmacy.status==='active').map((pharmacy)=><option key={pharmacy.id} value={pharmacy.id}>{pharmacy.name}</option>)}</select></label><div className="admin-form"><label>Alokasi stok daring<input required type="number" min="0" step="1" value={stockDraft.onHand} onChange={(e)=>setStockDraft((old)=>({...old,onHand:e.target.value}))}/></label><label>Harga satuan (Rp)<input required type="number" min="0" step="0.01" value={stockDraft.unitPrice} onChange={(e)=>setStockDraft((old)=>({...old,unitPrice:e.target.value}))}/></label><label>Berat satu kemasan (gram)<input required type="number" min="0" max="30000" step="1" value={stockDraft.shippingWeightGrams} onChange={(e)=>setStockDraft((old)=>({...old,shippingWeightGrams:e.target.value}))}/><small>Isi berat dan dimensi produk lengkap dengan kemasan farmasi.</small></label><label>Lebar satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={stockDraft.shippingWidthCm} onChange={(e)=>setStockDraft((old)=>({...old,shippingWidthCm:e.target.value}))}/></label><label>Tinggi satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={stockDraft.shippingHeightCm} onChange={(e)=>setStockDraft((old)=>({...old,shippingHeightCm:e.target.value}))}/></label><label>Panjang satu kemasan (cm)<input required type="number" min="1" max="200" step="1" value={stockDraft.shippingLengthCm} onChange={(e)=>setStockDraft((old)=>({...old,shippingLengthCm:e.target.value}))}/></label><label className="form-wide">Alasan perubahan<input value={stockDraft.reason} onChange={(e)=>setStockDraft((old)=>({...old,reason:e.target.value}))} placeholder="Pembaruan alokasi daring"/></label></div><button className="button button-dark button-small">Simpan alokasi dan harga</button></form>}<div className="admin-product-list">{products.map((product)=><div className="admin-product-row" key={product.id}><span className={`admin-product-icon ${categoryColor(product.category)}`}>{React.createElement(categoryIcon(product.category),{size:18})}</span><span className="admin-product-info"><strong>{product.name}</strong><small>{product.sku} · {product.category}{product.requiresPrescription?' · Wajib resep':''}{product.batchTrackingRequired?' · Catat lot':''} · {product.shippingWeightGrams>0?`${product.shippingWeightGrams} g`:'Berat belum diatur'} · {product.status==='active'?'Aktif':'Nonaktif'}</small></span><b>{money(product.indicativePrice)}</b><span className={product.available?'availability available':'availability'}>{product.available?'Tersedia':'Habis'}</span>{isAdmin&&<button className="button button-small button-outline" onClick={()=>openStockEditor(product)}>Stok & harga</button>}{isAdmin&&<button className={product.status==='inactive'?'button button-small button-outline':'button button-small button-quiet'} disabled={product.status==='inactive'&&!product.available} title={product.status==='inactive'&&!product.available?'Atur stok dan harga sebelum mengaktifkan':''} onClick={()=>setProductStatus(product,product.status==='inactive'?'active':'inactive')}>{product.status==='inactive'?'Aktifkan':'Nonaktifkan'}</button>}</div>)}</div></div>:<div className="admin-product-list">{pharmacies.map((pharmacy)=><div className="admin-product-row pharmacy-admin-row" key={pharmacy.id}><span className="admin-product-icon mint"><MapPin size={18}/></span><span className="admin-product-info"><strong>{pharmacy.name}</strong><small>{pharmacy.addressText}, {pharmacy.city} · Kode pos: {pharmacy.postalCodes.join(', ')||'belum ditentukan'} · Asal ongkir: {pharmacy.rajaongkirOriginId||'belum diatur'}</small></span><span className={`status-pill status-${pharmacy.status}`}>{pharmacy.status==='active'?'Aktif':pharmacy.status==='pending'?'Menunggu pemeriksaan':'Ditangguhkan'}</span>{isAdmin&&<button className="button button-small button-outline" onClick={()=>{setOriginPharmacy(pharmacy);setOriginDestination(null)}}>Atur asal ongkir</button>}{isAdmin&&<button className="button button-small button-outline" onClick={()=>setPharmacyStatus(pharmacy,pharmacy.status==='active'?'suspended':'active')}>{pharmacy.status==='active'?'Tangguhkan':'Aktifkan'}</button>}</div>)}</div>}
    </section>
    {tab==='pharmacies'&&isAdmin&&<PharmacyCreateForm csrf={csrf} onCreated={()=>{onToast('Apotek dibuat dengan status menunggu pemeriksaan.');reload()}} onError={onToast}/>}
    {cancellations.length>0&&<section className="workspace-panel cancellation-panel"><div className="panel-title"><div><h2>Permintaan pembatalan</h2><p>Periksa status pesanan dan kurir sebelum membuat keputusan.</p></div><span className="cancel-count">{cancellations.length}</span></div>{cancellations.map((request)=>{const canReconcileCourier=['booking_unknown','booked','pickup_unknown','pickup_requested','pickup_failed'].includes(request.shipmentStatus);return <div className="cancellation-row" key={request.id}><span className="admin-product-icon peach"><X size={17}/></span><span className="admin-product-info"><strong>#{request.orderId.slice(0,8).toUpperCase()} · {request.customerName}</strong><small>{request.reason} · {request.pharmacyName} · Status: {statusLabel[request.orderStatus]}{request.fulfillmentMethod==='delivery'?` · Kurir: ${request.shipmentStatus||'belum dibooking'}`:''}</small></span><b>{money(request.total)}</b>{request.fulfillmentMethod==='delivery'&&canReconcileCourier&&<button className="button button-small button-outline" onClick={()=>confirmCourierBookingCancellation(request)}>Catat kurir dibatalkan</button>}<button className="button button-small button-outline" onClick={()=>decideCancellation(request,'rejected')}>Tolak</button><button className="button button-small button-dark" onClick={()=>decideCancellation(request,'approved')}>Setujui</button></div>})}</section>}
    {supportCases.length>0&&<section className="workspace-panel cancellation-panel"><div className="panel-title"><div><h2>Kasus bantuan</h2><p>Keluhan dan kendala operasional yang masih terbuka.</p></div><span className="cancel-count">{supportCases.length}</span></div>{supportCases.map((item)=><div className="cancellation-row" key={item.id}><span className="admin-product-icon blue"><FileText size={17}/></span><span className="admin-product-info"><strong>#{item.orderId.slice(0,8).toUpperCase()} · {item.customerName} · {item.category}</strong><small>{item.description} · {item.pharmacyName} · Pesanan {statusLabel[item.orderStatus]}</small></span><button className="button button-small button-outline" onClick={()=>closeSupportCase(item)}>Tutup kasus</button></div>)}</section>}
    {originPharmacy&&<div className="overlay" onMouseDown={(e)=>e.target===e.currentTarget&&setOriginPharmacy(null)}><section className="modal"><div className="modal-head"><div><span className="section-kicker">KONFIGURASI PENGIRIMAN</span><h2>Titik asal · {originPharmacy.name}</h2></div><button className="close-button" onClick={()=>setOriginPharmacy(null)}><X/></button></div><div className="checkout-body"><p>Lokasi dan kontak ini dipakai untuk ongkir serta serah terima kurir Komerce. Store Order memotong saldo Shipping Delivery akun Komerce.</p><label>Nama kontak pengirim<input required maxLength="100" value={originPharmacy.deliveryContactName||''} onChange={(e)=>setOriginPharmacy((old)=>({...old,deliveryContactName:e.target.value}))}/></label><label>Telepon pengirim<input required value={originPharmacy.deliveryPhone||''} onChange={(e)=>setOriginPharmacy((old)=>({...old,deliveryPhone:e.target.value}))}/></label><label>Email pengirim<input required type="email" maxLength="200" value={originPharmacy.deliveryEmail||''} onChange={(e)=>setOriginPharmacy((old)=>({...old,deliveryEmail:e.target.value}))}/></label><DestinationLookup className="wide-field" label="Kelurahan atau kecamatan asal" value={originDestination} onChange={setOriginDestination}/><button className="button button-dark full-width" disabled={originSaving||!originDestination?.id||!originPharmacy.deliveryContactName||!originPharmacy.deliveryPhone||!originPharmacy.deliveryEmail} onClick={savePharmacyOrigin}>{originSaving?'Menyimpan...':'Simpan titik asal'}</button></div></section></div>}
    <div className="admin-note"><LockKeyhole size={16}/><span>Admin tidak dapat membuka dokumen resep atau memberi keputusan klinis. Aktivasi apotek dan perubahan katalog dicatat.</span></div>
  </main>
}
