import { syncPendingShipmentTracking } from '../../modules/fulfillment/public'

export async function syncShipmentTracking() {
  const result = await syncPendingShipmentTracking()
  if (result.checked > 0)
    console.info(
      'Sinkronisasi tracking kurir selesai:',
      result.checked,
      'diperiksa,',
      result.synced,
      'diperbarui,',
      result.failed,
      'gagal,',
      result.skipped,
      'dilewati.',
    )
}
