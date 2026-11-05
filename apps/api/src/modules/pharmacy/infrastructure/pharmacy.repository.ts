import { asc, eq, inArray } from 'drizzle-orm'
import { db, transaction } from '../../../infrastructure/database/client'
import { ApplicationError } from '../../../shared/application-error'
import { inventory, products } from '../../../infrastructure/database/schema'
import { recordAudit } from '../../platform'
import type { InventoryAdjustmentDto, ReplaceServiceHoursDto } from '../application/pharmacy.dto'
import type { InventoryAdjustmentResult, PharmacyRepository } from '../application/pharmacy.service'

export class PostgresPharmacyRepository implements PharmacyRepository {
  async listInventory(pharmacyIds: string[] | null) {
    const query = db
      .select({
        pharmacy_id: inventory.pharmacyId,
        product_id: products.id,
        sku: products.sku,
        name: products.name,
        sell_unit: products.sellUnit,
        requires_prescription: products.requiresPrescription,
        on_hand: inventory.onHand,
        reserved: inventory.reserved,
        unit_price: inventory.unitPrice,
        sales_blocked: inventory.salesBlocked,
      })
      .from(inventory)
      .innerJoin(products, eq(products.id, inventory.productId))
    return pharmacyIds
      ? await query.where(inArray(inventory.pharmacyId, pharmacyIds)).orderBy(asc(products.name))
      : await query.orderBy(asc(products.name))
  }

  async adjustInventory(
    actorId: string,
    input: InventoryAdjustmentDto,
  ): Promise<InventoryAdjustmentResult> {
    return transaction(async (client) => {
      const row = await client.query(
        'SELECT * FROM inventory WHERE pharmacy_id=$1 AND product_id=$2 FOR UPDATE',
        [input.pharmacyId, input.productId],
      )
      if (!row.rowCount) return { ok: false, reason: 'not-found' }
      const next = Number(row.rows[0].on_hand) + Number(input.delta)
      const reserved = Number(row.rows[0].reserved)
      if (next < reserved) return { ok: false, reason: 'reservation-conflict' }
      await client.query(
        'UPDATE inventory SET on_hand=$3,sales_blocked=false,updated_at=now() WHERE pharmacy_id=$1 AND product_id=$2',
        [input.pharmacyId, input.productId, next],
      )
      const movement = await client.query(
        'INSERT INTO inventory_movements(pharmacy_id,product_id,delta_on_hand,reason,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [input.pharmacyId, input.productId, input.delta, input.reason.slice(0, 500), actorId],
      )
      await recordAudit(client, actorId, 'inventory.adjusted', 'product', input.productId, {
        delta: input.delta,
        pharmacyId: input.pharmacyId,
        onHand: next,
        movementId: movement.rows[0].id,
      })
      return { ok: true, onHand: next, reserved }
    })
  }

  replaceServiceHours(pharmacyId: string, actorId: string, input: ReplaceServiceHoursDto) {
    return transaction(async (client) => {
      const pharmacy = await client.query('SELECT id FROM pharmacies WHERE id=$1 FOR UPDATE', [pharmacyId])
      if (!pharmacy.rowCount)
        throw new ApplicationError(404, 'NOT_FOUND', 'Apotek tidak ditemukan.')
      await client.query(
        "DELETE FROM pharmacy_service_hours WHERE pharmacy_id=$1 AND service_type='prescription'",
        [pharmacyId],
      )
      for (const item of input.hours) {
        await client.query(
          `INSERT INTO pharmacy_service_hours(pharmacy_id,service_type,weekday,opens_at,closes_at,timezone,active)
           VALUES($1,'prescription',$2,$3,$4,$5,$6)`,
          [
            pharmacyId,
            item.weekday,
            item.opensAt,
            item.closesAt,
            item.timezone ?? 'Asia/Jakarta',
            item.active !== false,
          ],
        )
      }
      for (const item of input.exceptions) {
        await client.query(
          `INSERT INTO pharmacy_service_exceptions(pharmacy_id,service_type,local_date,closed,opens_at,closes_at,reason)
           VALUES($1,'prescription',$2,$3,$4,$5,$6)
           ON CONFLICT(pharmacy_id,service_type,local_date) DO UPDATE SET
             closed=EXCLUDED.closed,opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,reason=EXCLUDED.reason`,
          [
            pharmacyId,
            item.localDate,
            item.closed,
            item.closed ? null : item.opensAt,
            item.closed ? null : item.closesAt,
            String(item.reason ?? '').slice(0, 200) || null,
          ],
        )
      }
      await recordAudit(
        client,
        actorId,
        'pharmacy.service_hours_changed',
        'pharmacy',
        pharmacyId,
        {
          serviceDays: input.hours.filter((item) => item.active !== false).length,
          exceptionCount: input.exceptions.length,
        },
      )
    })
  }
}
