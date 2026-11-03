import { ArrowRight } from 'lucide-react'

export function CourierShipmentActions({
  order,
  shipmentBusy,
  pickupDraft,
  setPickupDraft,
  proofReference,
  setProofReference,
  onCreateBooking,
  onRequestPickup,
  onHandoverToCourier,
}) {
  const shipment = order.shipment
  return <div className="review-action">
    <span className="section-kicker">PENGIRIMAN KOMERCE</span>
    {!shipment || shipment.status === 'booking_failed'
      ? <>
          <p>Buat order kurir setelah paket siap. Proses ini memotong saldo Shipping Delivery di akun Komerce sebesar ongkir yang dikirim.</p>
          {shipment?.status === 'booking_failed' && <div className="fulfillment-result failed"><strong>Booking ditolak Komerce</strong><small>Perbaiki kontak apotek, dimensi produk, atau layanan kurir sebelum mencoba lagi.</small></div>}
          <button className="button button-dark full-width" disabled={shipmentBusy} onClick={() => onCreateBooking(order)}>
            {shipmentBusy ? 'Mengirim booking...' : 'Buat order kurir Komerce'} <ArrowRight size={16}/>
          </button>
        </>
      : <>
          <div className={['booking_unknown','pickup_unknown','pickup_failed','exception'].includes(shipment.status) ? 'fulfillment-result failed' : 'fulfillment-result passed'}>
            <strong>{shipment.status === 'booked' ? 'Order kurir terkonfirmasi' : shipment.status === 'pickup_requested' ? 'Pickup kurir terjadwal' : shipment.status === 'pickup_failed' ? 'Request pickup ditolak Komerce' : shipment.status === 'pickup_pending' ? 'Request pickup sedang diproses' : shipment.status === 'pickup_unknown' ? 'Hasil pickup belum pasti' : shipment.status === 'in_delivery' ? 'Paket sudah diserahkan ke kurir' : shipment.status === 'delivered' ? 'Komerce mengonfirmasi pesanan diterima' : shipment.status === 'exception' ? 'Pengiriman terkendala' : shipment.status === 'booking_unknown' ? 'Hasil booking belum pasti' : 'Pengiriman diproses'}</strong>
            <small>{shipment.providerOrderNo ? 'Nomor order Komerce: ' + shipment.providerOrderNo + '. ' : ''}{shipment.trackingNumber ? 'AWB: ' + shipment.trackingNumber + '. ' : ''}{shipment.handoverReference ? 'Bukti serah-terima: ' + shipment.handoverReference + '. ' : ''}{['booking_unknown','pickup_unknown','booking_pending','pickup_pending'].includes(shipment.status) ? 'Periksa dashboard Komerce dan jangan ulangi request sebelum status dipastikan.' : ''}</small>
          </div>
          {['booked','pickup_failed'].includes(shipment.status) && <>
            <label>Tanggal pickup<input type="date" required min={todayLocalDate()} value={pickupDraft.pickupDate} onChange={(event) => setPickupDraft((old) => ({ ...old, pickupDate: event.target.value }))}/></label>
            <label>Jam pickup (WIB)<input type="time" required value={pickupDraft.pickupTime} onChange={(event) => setPickupDraft((old) => ({ ...old, pickupTime: event.target.value }))}/></label>
            <label>Kendaraan pickup<select value={pickupDraft.pickupVehicle} onChange={(event) => setPickupDraft((old) => ({ ...old, pickupVehicle: event.target.value }))}><option value="Motor">Motor</option><option value="Mobil">Mobil</option><option value="Truk">Truk</option></select></label>
            <small>Pickup harus dijadwalkan minimal 90 menit dari sekarang. Komerce menyarankan Motor untuk paket ≤5 kg dan Truk mulai 10 kg.</small>
            <button className="button button-dark full-width" disabled={shipmentBusy} onClick={() => onRequestPickup(order)}>
              {shipmentBusy ? 'Meminta pickup...' : 'Jadwalkan pickup kurir'} <ArrowRight size={16}/>
            </button>
          </>}
          {shipment.status === 'pickup_requested' && <>
            <small>{shipment.pickupDate} · {shipment.pickupTime} WIB · {shipment.pickupVehicle}</small>
            <a className="button button-outline full-width" href={'/api/v1/orders/' + order.id + '/shipment-label'}>Unduh label pengiriman <ArrowRight size={16}/></a>
            <label>Referensi bukti serah-terima<input required maxLength="200" value={proofReference} onChange={(event) => setProofReference(event.target.value)} placeholder="Nomor AWB atau tanda terima kurir"/></label>
            <small>Konfirmasi setelah paket benar-benar diterima kurir. Referensi ini disimpan di audit serah-terima.</small>
            <button className="button button-dark full-width" disabled={shipmentBusy || !proofReference.trim()} onClick={() => onHandoverToCourier(order, proofReference.trim())}>
              {shipmentBusy ? 'Mencatat serah-terima...' : 'Konfirmasi serah ke kurir'} <ArrowRight size={16}/>
            </button>
          </>}
          {shipment.status === 'in_delivery' && <small>Pesanan tetap dalam pengiriman sampai Komerce mengonfirmasi status diterima.</small>}
          {shipment.status === 'exception' && <small>Kasus bantuan sudah dibuka. Pesanan tetap dalam pengiriman sampai petugas menindaklanjuti.</small>}
        </>}
  </div>
}

function todayLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}
