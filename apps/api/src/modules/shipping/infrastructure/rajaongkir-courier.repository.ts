import { asc, eq } from 'drizzle-orm'
import { rajaongkirCouriers } from '../../../infrastructure/database/schema'

export async function listActiveRajaOngkirCourierCodes() {
  const { db } = await import('../../../infrastructure/database/client')
  const rows = await db
    .select({ courierCode: rajaongkirCouriers.courierCode })
    .from(rajaongkirCouriers)
    .where(eq(rajaongkirCouriers.enabled, true))
    .orderBy(asc(rajaongkirCouriers.sortOrder), asc(rajaongkirCouriers.courierCode))

  return rows.map((row) => row.courierCode)
}
