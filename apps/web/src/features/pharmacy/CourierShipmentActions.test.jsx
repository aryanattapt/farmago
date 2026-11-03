import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CourierShipmentActions } from './CourierShipmentActions.jsx'

const pickupDraft = { pickupDate: '2026-11-04', pickupTime: '10:00', pickupVehicle: 'Motor' }
const handlers = {
  shipmentBusy: false,
  pickupDraft,
  setPickupDraft: () => {},
  onCreateBooking: () => {},
  onRequestPickup: () => {},
}
function render(shipment) {
  return renderToStaticMarkup(createElement(CourierShipmentActions, {
    ...handlers,
    order: { id: '00000000-0000-4000-8000-000000000001', shipment },
  }))
}

describe('CourierShipmentActions operational states', () => {
  test('asks staff to review the debit before creating a Komerce order', () => {
    const html = render(null)
    expect(html).toContain('Buat order kurir Komerce')
    expect(html).toContain('memotong saldo Shipping Delivery')
    expect(html).not.toContain('Jadwalkan pickup kurir')
  })

  test('shows a retry only after a confirmed provider rejection', () => {
    const html = render({ status: 'booking_failed' })
    expect(html).toContain('Booking ditolak Komerce')
    expect(html).toContain('Buat order kurir Komerce')
  })

  test('offers schedule fields and pickup only after an order is booked', () => {
    const html = render({ status: 'booked', providerOrderNo: 'KOM-7' })
    expect(html).toContain('Order kurir terkonfirmasi')
    expect(html).toContain('KOM-7')
    expect(html).toContain('type="date"')
    expect(html).toContain('type="time"')
    expect(html).toContain('value="Motor"')
    expect(html).toContain('Jadwalkan pickup kurir')
  })

  test('blocks an uncertain pickup outcome from being retried', () => {
    const html = render({ status: 'pickup_unknown', providerOrderNo: 'KOM-7' })
    expect(html).toContain('Hasil pickup belum pasti')
    expect(html).toContain('jangan ulangi request')
    expect(html).not.toContain('Jadwalkan pickup kurir')
  })

  test('offers the label download and tracking number after pickup succeeds', () => {
    const html = render({
      status: 'pickup_requested',
      providerOrderNo: 'KOM-7',
      trackingNumber: 'AWB-7',
      pickupDate: '2026-11-04',
      pickupTime: '10:00',
      pickupVehicle: 'Motor',
    })
    expect(html).toContain('AWB-7')
    expect(html).toContain('Unduh label pengiriman')
    expect(html).toContain('/api/v1/orders/00000000-0000-4000-8000-000000000001/shipment-label')
  })
})
