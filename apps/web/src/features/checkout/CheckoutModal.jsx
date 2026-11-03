import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, Clock3, FileHeart, MapPin, ShieldCheck, Truck, X } from 'lucide-react'
import { api } from '../../shared/api/client.js'
import { money } from '../../shared/lib/formatters.js'
import { DestinationLookup } from './DestinationLookup.jsx'

export function CheckoutModal({ cart, user, csrf, onClose, onOrder, onAuth, onToast }) {
  const [method,setMethod]=useState('pickup')
  const [addresses,setAddresses]=useState([])
  const [addressId,setAddressId]=useState('')
  const [newAddress,setNewAddress]=useState(false)
  const [destination,setDestination]=useState(null)
  const [address,setAddress]=useState({recipientName:user?.name||'',phone:user?.phone||'',addressText:'',city:'Jakarta Selatan',postalCode:''})
  const [quote,setQuote]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [accepted,setAccepted]=useState(false)
  useEffect(()=>{if(user) api('/addresses').then((r)=>{setAddresses(r.items);const first=r.items.find((item)=>item.rajaongkirDestinationId);if(first)setAddressId(first.id)}).catch(()=>{})},[user?.id])
  const deliveryAddresses=addresses.filter((item)=>item.rajaongkirDestinationId)
  const saveAddress=async()=>{
    if(!destination?.id) throw new Error('Pilih area tujuan dari hasil pencarian RajaOngkir.')
    if(!destination.zipCode) throw new Error('Area tujuan ini belum memiliki kode pos. Pilih area lain.')
    const result=await api('/addresses',{method:'POST',csrf,body:JSON.stringify({...address,city:destination.cityName,postalCode:destination.zipCode,rajaongkirDestinationId:destination.id,rajaongkirDestinationLabel:destination.label})})
    setAddresses((old)=>[result,...old]);setAddressId(result.id);setNewAddress(false);return result.id
  }
  const createQuote=async(e)=>{
    e.preventDefault();setLoading(true);setError('')
    try{
      let selected=addressId
      if(method==='delivery'&&(newAddress||!deliveryAddresses.length)) selected=await saveAddress()
      if(method==='delivery'&&!selected) throw new Error('Pilih alamat pengiriman.')
      if(method==='delivery'&&!newAddress&&deliveryAddresses.length>0&&!deliveryAddresses.some((item)=>item.id===selected)) throw new Error('Pilih alamat pengiriman yang memiliki area tujuan RajaOngkir.')
      const result=await api('/checkout/quote',{method:'POST',csrf,body:JSON.stringify({items:cart.map((i)=>({productId:i.id,quantity:i.quantity})),fulfillmentMethod:method,addressId:method==='delivery'?selected:undefined})})
      setQuote(result);setAccepted(false)
    }catch(err){setError(err.message)}finally{setLoading(false)}
  }
  const createOrder=async()=>{
    setLoading(true);setError('')
    try{
      const result=await api('/orders',{method:'POST',csrf,headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({quoteId:quote.quoteId})})
      onOrder(result)
    }catch(err){setError(err.message);if(err.code==='QUOTE_CHANGED'||err.code==='STOCK_UNAVAILABLE'){setQuote(null);setAccepted(false)}}finally{setLoading(false)}
  }
  const prescription=cart.some((item)=>item.requiresPrescription)
  const change=(key,value)=>setAddress((old)=>({...old,[key]:value}))
  return <div className="overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal checkout-modal"><div className="modal-head"><div><span className="section-kicker">SATU LANGKAH LAGI</span><h2>Konfirmasi pesanan</h2></div><button className="close-button" onClick={onClose}><X/></button></div><div className="checkout-progress"><span className="progress-active"><i>1</i> Pemenuhan</span><b/><span className={quote?'progress-active':''}><i>2</i> Tinjau & pesan</span></div>
    {!user?.contactVerified&&<div className="notice notice-warm"><ShieldCheck size={18}/><span>Verifikasi kontak diperlukan sebelum checkout. <button onClick={onAuth}>Masuk atau buat akun</button></span></div>}
    {!quote?<form onSubmit={createQuote} className="checkout-body"><div className="fulfillment-toggle"><button type="button" className={method==='pickup'?'fulfillment-option active':'fulfillment-option'} onClick={()=>setMethod('pickup')}><MapPin size={18}/><span><strong>Ambil di apotek</strong><small>Ongkir Rp0, ambil saat siap</small></span><span className="radio-dot"/></button><button type="button" className={method==='delivery'?'fulfillment-option active':'fulfillment-option'} onClick={()=>setMethod('delivery')}><Truck size={18}/><span><strong>Antar ke alamat</strong><small>Untuk area layanan apotek</small></span><span className="radio-dot"/></button></div>{method==='delivery'&&<div className="address-section">{deliveryAddresses.length>0&&!newAddress&&<label>Alamat pengiriman<select value={addressId} onChange={(e)=>setAddressId(e.target.value)}>{deliveryAddresses.map((a)=><option key={a.id} value={a.id}>{a.recipientName} · {a.addressText}, {a.city} {a.postalCode}</option>)}</select></label>}<button type="button" className="text-link add-address" onClick={()=>{setNewAddress((v)=>!v);setDestination(null)}}>{newAddress?'Pilih alamat tersimpan':'+ Tambah alamat baru'}</button>{newAddress||!deliveryAddresses.length?<div className="address-grid"><label>Nama penerima<input required value={address.recipientName} onChange={(e)=>change('recipientName',e.target.value)} /></label><label>Nomor telepon<input required value={address.phone} onChange={(e)=>change('phone',e.target.value)} /></label><label className="wide-field">Alamat lengkap<input required value={address.addressText} onChange={(e)=>change('addressText',e.target.value)} placeholder="Nama jalan, nomor, patokan" /></label><DestinationLookup className="wide-field" value={destination} onChange={(item)=>{setDestination(item);if(item)setAddress((old)=>({...old,city:item.cityName,postalCode:item.zipCode}))}} /></div>:null}</div>}
      {prescription&&<div className="notice notice-purple"><FileHeart size={18}/><span>Keranjang berisi produk resep. Apoteker akan memeriksa dokumen sebelum pembayaran tersedia.</span></div>}
      <div className="checkout-items"><div className="checkout-items-head"><strong>Ringkasan belanja</strong><span>{cart.reduce((s,i)=>s+i.quantity,0)} produk</span></div>{cart.map((item)=><div className="checkout-item" key={item.id}><span>{item.name} <small>× {item.quantity}</small>{item.requiresPrescription&&<em>Resep</em>}</span><b>{money(Number(item.indicativePrice)*item.quantity)}</b></div>)}</div>
      {error&&<div className="form-error">{error}</div>}<button className="button button-dark full-width" disabled={loading||!user?.contactVerified||!cart.length}>{loading?'Memeriksa apotek...':method==='delivery'?'Lihat rincian ongkir':'Lihat rincian biaya'} <ArrowRight size={17}/></button><p className="fine-print">Belum ada stok yang direservasi. Rincian harga akhir perlu kamu setujui.</p>
    </form>:<div className="checkout-body quote-review"><div className="pharmacy-card"><span className="pharmacy-pin"><MapPin size={17}/></span><div><small>APOTEK YANG MEMENUHI PESANAN</small><strong>{quote.pharmacy.name}</strong><span>{quote.pharmacy.address}</span></div><BadgeCheck size={18} className="verified-icon"/></div>{quote.shipping&&<div className="shipping-quote"><Truck size={18}/><span><strong>{quote.shipping.courierName} · {quote.shipping.service}</strong><small>{quote.shipping.description}{quote.shipping.etd?' · Estimasi '+quote.shipping.etd:''}</small></span></div>}<div className="cost-breakdown">{[['Subtotal',quote.totals.subtotal],['Diskon','0.00'],['Ongkos kirim',quote.totals.shippingFee],['Biaya layanan',quote.totals.serviceFee]].map(([label,value])=><div key={label}><span>{label}</span><b>{money(value)}</b></div>)}<div className="cost-total"><strong>Total</strong><strong>{money(quote.totals.total)}</strong></div></div>{quote.needsPrescription&&<div className="notice notice-purple"><Clock3 size={18}/><span>Jam pemeriksaan resep: {quote.prescriptionHours.map((h)=>`${['Min','Sen','Sel','Rab','Kam','Jum','Sab'][h.weekday]} ${h.opensAt.slice(0,5)}–${h.closesAt.slice(0,5)}`).join(' · ')} ({quote.prescriptionHours[0]?.timezone}). Reservasi berlangsung {quote.reservationMinutes} menit.</span></div>}<label className="consent-row"><input type="checkbox" checked={accepted} onChange={(e)=>setAccepted(e.target.checked)}/><span>Saya telah meninjau harga dan biaya. Saya memahami bahwa jumlah akan direservasi selama {quote.reservationMinutes} menit setelah pesanan dibuat.</span></label>{error&&<div className="form-error">{error}</div>}<button className="button button-dark full-width" disabled={!accepted||loading} onClick={createOrder}>{loading?'Membuat pesanan...':'Buat pesanan'} <ArrowRight size={17}/></button><button className="button button-quiet full-width" onClick={()=>{setQuote(null);setError('')}}>Kembali ubah pemenuhan</button><p className="fine-print">Quote berlaku sampai {new Date(quote.expiresAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}. Harga dan stok diperiksa lagi saat pesanan dibuat.</p></div>}
  </section></div>
}
