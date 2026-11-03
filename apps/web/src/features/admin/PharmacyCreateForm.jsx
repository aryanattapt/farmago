import { useState } from 'react'
import { api } from '../../shared/api/client.js'
import { DestinationLookup } from '../checkout/DestinationLookup.jsx'

export function PharmacyCreateForm({csrf,onCreated,onError}){
  const [draft,setDraft]=useState({name:'',addressText:'',city:'',postalCodes:'',licenseReference:'',deliveryContactName:'',deliveryPhone:'',deliveryEmail:''})
  const [originDestination,setOriginDestination]=useState(null)
  const [busy,setBusy]=useState(false)
  const submit=async(event)=>{
    event.preventDefault();setBusy(true)
    try{
      await api('/admin/pharmacies',{method:'POST',csrf,body:JSON.stringify({...draft,postalCodes:draft.postalCodes.split(',').map((code)=>code.trim()).filter(Boolean),rajaongkirOriginId:originDestination?.id??null})})
      setDraft({name:'',addressText:'',city:'',postalCodes:'',licenseReference:'',deliveryContactName:'',deliveryPhone:'',deliveryEmail:''});setOriginDestination(null);onCreated()
    }catch(error){onError(error.message)}finally{setBusy(false)}
  }
  return <section className="workspace-panel pharmacy-create"><div><span className="section-kicker">ONBOARDING MITRA</span><h2>Tambah apotek</h2><p>Apotek baru menunggu pemeriksaan; isi juga kontak pengirim untuk booking Shipping Delivery.</p></div><form className="admin-form" onSubmit={submit}><label>Nama apotek<input required maxLength="160" value={draft.name} onChange={(e)=>setDraft((old)=>({...old,name:e.target.value}))}/></label><label>Kota<input required maxLength="100" value={draft.city} onChange={(e)=>setDraft((old)=>({...old,city:e.target.value}))}/></label><DestinationLookup className="form-wide" label="Lokasi asal pengiriman apotek" value={originDestination} onChange={(item)=>{setOriginDestination(item);if(item)setDraft((old)=>({...old,city:item.cityName}))}}/><label className="form-wide">Alamat<input required maxLength="500" value={draft.addressText} onChange={(e)=>setDraft((old)=>({...old,addressText:e.target.value}))}/></label><label>Kode pos layanan<input required value={draft.postalCodes} onChange={(e)=>setDraft((old)=>({...old,postalCodes:e.target.value}))} placeholder="12190, 12210"/></label><label>Referensi izin<input value={draft.licenseReference} onChange={(e)=>setDraft((old)=>({...old,licenseReference:e.target.value}))} placeholder="Diisi sesuai pemeriksaan onboarding"/></label><label>Nama kontak pengirim<input required maxLength="100" value={draft.deliveryContactName} onChange={(e)=>setDraft((old)=>({...old,deliveryContactName:e.target.value}))}/></label><label>Telepon pengirim<input required value={draft.deliveryPhone} onChange={(e)=>setDraft((old)=>({...old,deliveryPhone:e.target.value}))} placeholder="08... atau 62..."/></label><label className="form-wide">Email pengirim<input required type="email" maxLength="200" value={draft.deliveryEmail} onChange={(e)=>setDraft((old)=>({...old,deliveryEmail:e.target.value}))}/></label><button className="button button-dark form-wide" disabled={busy}>{busy?'Menyimpan...':'Simpan sebagai menunggu pemeriksaan'}</button></form></section>
}
