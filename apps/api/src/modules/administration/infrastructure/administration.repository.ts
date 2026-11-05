import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db, transaction } from '../../../infrastructure/database/client'
import {
  cancellationRequests,
  inventory,
  orders,
  pharmacies,
  products,
  shipments,
  supportCases,
  users,
} from '../../../infrastructure/database/schema'
import { recordAudit } from '../../platform'
import type {
  AdministrationCancellationRow,
  AdministrationOrderRow,
  AdministrationPharmacyRow,
  AdministrationProductRow,
  AdministrationRepository,
  AdministrationResult,
  AdministrationSupportRow,
  InventoryResult,
  InventoryValues,
  PharmacyValues,
} from '../application/administration.service'
import type {
  ConfigureInventoryRequestDto,
  CreatePharmacyRequestDto,
  CreateProductRequestDto,
  UpdateProductRequestDto,
} from '../application/administration.dto'

export class PostgresAdministrationRepository implements AdministrationRepository {
  async listProducts(): Promise<AdministrationProductRow[]> {
    const activeInventory = db
      .select({
        productId: inventory.productId,
        unitPrice: inventory.unitPrice,
        available: sql<number>`${inventory.onHand} - ${inventory.reserved}`,
      })
      .from(inventory)
      .innerJoin(
        pharmacies,
        and(eq(pharmacies.id, inventory.pharmacyId), eq(pharmacies.status, 'active')),
      )
      .as('active_inventory')
    return db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        description: products.description,
        category: products.category,
        sell_unit: products.sellUnit,
        requires_prescription: products.requiresPrescription,
        shipping_weight_grams: products.shippingWeightGrams,
        shipping_width_cm: products.shippingWidthCm,
        shipping_height_cm: products.shippingHeightCm,
        shipping_length_cm: products.shippingLengthCm,
        batch_tracking_required: products.batchTrackingRequired,
        status: products.status,
        indicative_price: sql<string>`COALESCE(MIN(${activeInventory.unitPrice}),0)`,
        available: sql<number>`COALESCE(MAX(${activeInventory.available}),0)`,
      })
      .from(products)
      .leftJoin(activeInventory, eq(activeInventory.productId, products.id))
      .groupBy(products.id)
      .orderBy(asc(products.category), asc(products.name))
  }

  async listPharmacies(): Promise<AdministrationPharmacyRow[]> {
    return db
      .select({
        id: pharmacies.id,
        name: pharmacies.name,
        address_text: pharmacies.addressText,
        city: pharmacies.city,
        postal_codes: pharmacies.postalCodes,
        status: pharmacies.status,
        license_reference: pharmacies.licenseReference,
        rajaongkir_origin_id: pharmacies.rajaongkirOriginId,
        delivery_contact_name: pharmacies.deliveryContactName,
        delivery_phone: pharmacies.deliveryPhone,
        delivery_email: pharmacies.deliveryEmail,
        created_at: pharmacies.createdAt,
      })
      .from(pharmacies)
      .orderBy(desc(pharmacies.createdAt))
  }

  async listOrders(): Promise<AdministrationOrderRow[]> {
    return db
      .select({
        id: orders.id,
        status: orders.status,
        fulfillment_method: orders.fulfillmentMethod,
        total: orders.total,
        created_at: orders.createdAt,
        expires_at: orders.expiresAt,
        customer_name: users.name,
        pharmacy_name: pharmacies.name,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.customerId))
      .innerJoin(pharmacies, eq(pharmacies.id, orders.pharmacyId))
      .orderBy(desc(orders.createdAt))
      .limit(200)
  }

  async listCancellationRequests(): Promise<AdministrationCancellationRow[]> {
    return db
      .select({
        id: cancellationRequests.id,
        order_id: cancellationRequests.orderId,
        reason: cancellationRequests.reason,
        status: cancellationRequests.status,
        created_at: cancellationRequests.createdAt,
        order_status: orders.status,
        fulfillment_method: orders.fulfillmentMethod,
        shipment_status: shipments.status,
        total: orders.total,
        customer_name: users.name,
        pharmacy_name: pharmacies.name,
      })
      .from(cancellationRequests)
      .innerJoin(orders, eq(orders.id, cancellationRequests.orderId))
      .innerJoin(users, eq(users.id, orders.customerId))
      .innerJoin(pharmacies, eq(pharmacies.id, orders.pharmacyId))
      .leftJoin(shipments, eq(shipments.orderId, orders.id))
      .where(eq(cancellationRequests.status, 'requested'))
      .orderBy(asc(cancellationRequests.createdAt))
  }

  async listSupportCases(): Promise<AdministrationSupportRow[]> {
    return db
      .select({
        id: supportCases.id,
        order_id: supportCases.orderId,
        category: supportCases.category,
        status: supportCases.status,
        description: supportCases.description,
        created_at: supportCases.createdAt,
        order_status: orders.status,
        customer_name: users.name,
        pharmacy_name: pharmacies.name,
      })
      .from(supportCases)
      .innerJoin(orders, eq(orders.id, supportCases.orderId))
      .innerJoin(users, eq(users.id, orders.customerId))
      .innerJoin(pharmacies, eq(pharmacies.id, orders.pharmacyId))
      .where(ne(supportCases.status, 'closed'))
      .orderBy(asc(supportCases.createdAt))
  }

  async createProduct(
    actorId: string,
    input: CreateProductRequestDto,
    values: { sku: string; name: string; category: string; sellUnit: string; shippingWeightGrams: number; shippingWidthCm: number; shippingHeightCm: number; shippingLengthCm: number },
  ) {
    return transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO products(sku,name,description,category,sell_unit,shipping_weight_grams,shipping_width_cm,shipping_height_cm,shipping_length_cm,requires_prescription,batch_tracking_required,special_handling,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inactive') RETURNING id,sku,name,status`,
        [
          values.sku,
          values.name,
          String(input.description ?? '').slice(0, 3000),
          values.category,
          values.sellUnit,
          values.shippingWeightGrams,
          values.shippingWidthCm,
          values.shippingHeightCm,
          values.shippingLengthCm,
          input.requiresPrescription === true,
          input.batchTrackingRequired === true,
          input.specialHandling === true,
        ],
      )
      await recordAudit(client, actorId, 'product.created', 'product', result.rows[0].id, {
        sku: values.sku,
        status: 'inactive',
        fields: ['sku', 'name', 'description', 'category', 'sellUnit', 'shippingDimensions', 'productFlags'],
      })
      return result.rows[0]
    })
  }

  async configureInventory(
    actorId: string,
    input: ConfigureInventoryRequestDto,
    values: InventoryValues,
  ): Promise<AdministrationResult<InventoryResult>> {
    return transaction(async (client) => {
      const pharmacy = await client.query('SELECT status FROM pharmacies WHERE id=$1 FOR UPDATE', [
        values.pharmacyId,
      ])
      const product = await client.query('SELECT id FROM products WHERE id=$1 FOR SHARE', [
        values.productId,
      ])
      if (!pharmacy.rowCount || !product.rowCount) return { ok: false, reason: 'not-found' }
      const existing = await client.query(
        'SELECT on_hand,reserved FROM inventory WHERE pharmacy_id=$1 AND product_id=$2 FOR UPDATE',
        [values.pharmacyId, values.productId],
      )
      const oldOnHand = existing.rowCount ? Number(existing.rows[0].on_hand) : 0
      const reserved = existing.rowCount ? Number(existing.rows[0].reserved) : 0
      if (values.onHand < reserved) return { ok: false, reason: 'reservation-conflict' }
      await client.query(
        `INSERT INTO inventory(pharmacy_id,product_id,on_hand,reserved,unit_price,sales_blocked)
        VALUES($1,$2,$3,0,$4,false) ON CONFLICT(pharmacy_id,product_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,unit_price=EXCLUDED.unit_price,sales_blocked=false,updated_at=now()`,
        [values.pharmacyId, values.productId, values.onHand, values.unitPrice.toFixed(2)],
      )
      const delta = values.onHand - oldOnHand
      if (delta !== 0)
        await client.query(
          'INSERT INTO inventory_movements(pharmacy_id,product_id,delta_on_hand,reason,actor_id) VALUES($1,$2,$3,$4,$5)',
          [
            values.pharmacyId,
            values.productId,
            delta,
            String(input.reason ?? 'Pengaturan alokasi daring').slice(0, 500),
            actorId,
          ],
        )
      await recordAudit(client, actorId, 'inventory.configured', 'product', values.productId, {
        pharmacyId: values.pharmacyId,
        onHand: values.onHand,
        unitPrice: values.unitPrice.toFixed(2),
        reserved,
      })
      return {
        ok: true,
        value: {
          ...values,
          reserved,
          available: values.onHand - reserved,
          unitPrice: values.unitPrice.toFixed(2),
        },
      }
    })
  }

  async updateProduct(
    actorId: string,
    productId: string,
    input: UpdateProductRequestDto,
  ): Promise<AdministrationResult<unknown>> {
    return transaction(async (client) => {
      const beforeResult = await client.query(
        `SELECT id,name,description,category,sell_unit,requires_prescription,batch_tracking_required,
          special_handling,shipping_weight_grams,shipping_width_cm,shipping_height_cm,shipping_length_cm,status
         FROM products WHERE id=$1 FOR UPDATE`,
        [productId],
      )
      if (!beforeResult.rowCount) return { ok: false, reason: 'not-found' }
      const before = beforeResult.rows[0]
      const result = await client.query(
        `UPDATE products SET name=COALESCE($2,name),description=COALESCE($3,description),category=COALESCE($4,category),
        sell_unit=COALESCE($5,sell_unit),requires_prescription=COALESCE($6,requires_prescription),batch_tracking_required=COALESCE($7,batch_tracking_required),special_handling=COALESCE($8,special_handling),
        shipping_weight_grams=COALESCE($9,shipping_weight_grams),shipping_width_cm=COALESCE($10,shipping_width_cm),shipping_height_cm=COALESCE($11,shipping_height_cm),shipping_length_cm=COALESCE($12,shipping_length_cm),status=COALESCE($13,status),updated_at=now() WHERE id=$1 RETURNING id,sku,name,status,shipping_weight_grams,shipping_width_cm,shipping_height_cm,shipping_length_cm`,
        [
          productId,
          input.name ?? null,
          input.description ?? null,
          input.category ?? null,
          input.sellUnit ?? null,
          input.requiresPrescription ?? null,
          input.batchTrackingRequired ?? null,
          input.specialHandling ?? null,
          input.shippingWeightGrams == null ? null : Number(input.shippingWeightGrams),
          input.shippingWidthCm == null ? null : Number(input.shippingWidthCm),
          input.shippingHeightCm == null ? null : Number(input.shippingHeightCm),
          input.shippingLengthCm == null ? null : Number(input.shippingLengthCm),
          input.status ?? null,
        ],
      )
      const columns: Record<string, string> = {
        name: 'name',
        description: 'description',
        category: 'category',
        sellUnit: 'sell_unit',
        requiresPrescription: 'requires_prescription',
        batchTrackingRequired: 'batch_tracking_required',
        specialHandling: 'special_handling',
        shippingWeightGrams: 'shipping_weight_grams',
        shippingWidthCm: 'shipping_width_cm',
        shippingHeightCm: 'shipping_height_cm',
        shippingLengthCm: 'shipping_length_cm',
        status: 'status',
      }
      const changedFields = Object.entries(input)
        .filter(([field, value]) => value !== undefined && value !== null &&
          String(before[columns[field]]) !== String(value))
        .map(([field]) => field)
      await recordAudit(client, actorId, 'product.updated', 'product', result.rows[0].id, {
        changedFields,
        ...(input.status !== undefined ? { fromStatus: before.status, toStatus: result.rows[0].status } : {}),
      })
      return { ok: true, value: result.rows[0] }
    })
  }

  async createPharmacy(actorId: string, input: CreatePharmacyRequestDto, values: PharmacyValues) {
    return transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO pharmacies(name,address_text,city,postal_codes,license_reference,rajaongkir_origin_id,delivery_contact_name,delivery_phone,delivery_email,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING id,name,status,rajaongkir_origin_id`,
        [
          values.name,
          values.address,
          values.city,
          values.postalCodes,
          String(input.licenseReference ?? '')
            .trim()
            .slice(0, 160) || null,
          values.rajaongkirOriginId,
          values.deliveryContactName,
          values.deliveryPhone,
          values.deliveryEmail,
        ],
      )
      await recordAudit(client, actorId, 'pharmacy.created', 'pharmacy', result.rows[0].id, {
        status: 'pending',
        postalCodeCount: values.postalCodes.length,
        hasShippingOrigin: values.rajaongkirOriginId != null,
      })
      return result.rows[0]
    })
  }

  async updatePharmacy(
    actorId: string,
    pharmacyId: string,
    status: string | null,
    originId?: number | null,
    deliveryContact?: Partial<{ deliveryContactName: string | null; deliveryPhone: string | null; deliveryEmail: string | null }>,
  ): Promise<AdministrationResult<unknown>> {
    return transaction(async (client) => {
      const currentResult = await client.query(
        `SELECT id,status,license_reference,rajaongkir_origin_id,delivery_contact_name,delivery_phone,
          delivery_email,cardinality(postal_codes) AS postal_count
         FROM pharmacies WHERE id=$1 FOR UPDATE`,
        [pharmacyId],
      )
      if (!currentResult.rowCount) return { ok: false, reason: 'not-found' }
      const current = currentResult.rows[0]
      if (status === 'active') {
        const readiness = await client.query(
          `SELECT
            (SELECT COUNT(*) FROM inventory i WHERE i.pharmacy_id=p.id) AS inventory_count,
            (SELECT COUNT(DISTINCT h.weekday) FROM pharmacy_service_hours h
             WHERE h.pharmacy_id=p.id AND h.service_type='prescription' AND h.active=true) AS service_days
           FROM pharmacies p WHERE p.id=$1`,
          [pharmacyId],
        )
        const gate = readiness.rows[0]
        const contact = (field: 'deliveryContactName' | 'deliveryPhone' | 'deliveryEmail', column: string) =>
          deliveryContact && Object.prototype.hasOwnProperty.call(deliveryContact, field)
            ? deliveryContact[field]
            : current[column]
        const effectiveOriginId = originId === undefined ? current.rajaongkir_origin_id : originId
        if (
          !String(current.license_reference ?? '').trim() ||
          Number(current.postal_count) < 1 ||
          !effectiveOriginId ||
          !String(contact('deliveryContactName', 'delivery_contact_name') ?? '').trim() ||
          !String(contact('deliveryPhone', 'delivery_phone') ?? '').trim() ||
          !String(contact('deliveryEmail', 'delivery_email') ?? '').trim() ||
          Number(gate.inventory_count) < 1 ||
          Number(gate.service_days) < 1
        )
          return { ok: false, reason: 'onboarding-incomplete' }
      }
      const values: unknown[] = [pharmacyId]
      const assignments: string[] = []
      const add = (column: string, value: unknown) => {
        values.push(value)
        assignments.push(`${column}=$${values.length}`)
      }
      if (status !== null) add('status', status)
      if (originId !== undefined) add('rajaongkir_origin_id', originId)
      if (deliveryContact) {
        if (deliveryContact.deliveryContactName !== undefined) add('delivery_contact_name', deliveryContact.deliveryContactName)
        if (deliveryContact.deliveryPhone !== undefined) add('delivery_phone', deliveryContact.deliveryPhone)
        if (deliveryContact.deliveryEmail !== undefined) add('delivery_email', deliveryContact.deliveryEmail)
      }
      const result = await client.query(
        `UPDATE pharmacies SET ${assignments.join(',')} WHERE id=$1 RETURNING id,name,status,rajaongkir_origin_id,delivery_contact_name,delivery_phone,delivery_email`,
        values,
      )
      if (status !== null)
        await recordAudit(client, actorId, 'pharmacy.status_changed', 'pharmacy', pharmacyId, {
          fromStatus: current.status,
          toStatus: status,
        })
      if (originId !== undefined)
        await recordAudit(client, actorId, 'pharmacy.shipping_origin_changed', 'pharmacy', pharmacyId, {
          fromOriginId: current.rajaongkir_origin_id,
          originId,
        })
      if (deliveryContact) {
        const contactColumns: Record<string, string> = {
          deliveryContactName: 'delivery_contact_name',
          deliveryPhone: 'delivery_phone',
          deliveryEmail: 'delivery_email',
        }
        const changedFields = Object.entries(deliveryContact)
          .filter(([field, value]) => String(current[contactColumns[field]] ?? '') !== String(value ?? ''))
          .map(([field]) => field)
        await recordAudit(client, actorId, 'pharmacy.delivery_contact_changed', 'pharmacy', pharmacyId, {
          changedFields,
        })
      }
      return { ok: true, value: result.rows[0] }
    })
  }
}
