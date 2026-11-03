import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from '../../../infrastructure/database/client'
import {
  addresses,
  checkoutQuotes,
  inventory,
  pharmacies,
  pharmacyServiceHours,
  products,
} from '../../../infrastructure/database/schema'
import { prescriptionServiceOpen } from '../../pharmacy'
import type { CheckoutRepository } from '../application/quote.service'

export class PostgresCheckoutRepository implements CheckoutRepository {
  async findAddress(addressId: string, customerId: string) {
    const [address] = await db
      .select({
        id: addresses.id,
        recipient_name: addresses.recipientName,
        phone: addresses.phone,
        address_text: addresses.addressText,
        city: addresses.city,
        postal_code: addresses.postalCode,
        rajaongkir_destination_id: addresses.rajaongkirDestinationId,
      })
      .from(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, customerId)))
      .limit(1)
    return address ?? null
  }

  async listActivePharmacies() {
    return await db
      .select({
        id: pharmacies.id,
        name: pharmacies.name,
        address_text: pharmacies.addressText,
        postal_codes: pharmacies.postalCodes,
        delivery_fee: pharmacies.deliveryFee,
        rajaongkir_origin_id: pharmacies.rajaongkirOriginId,
      })
      .from(pharmacies)
      .where(eq(pharmacies.status, 'active'))
      .orderBy(asc(pharmacies.createdAt))
  }

  async findStock(pharmacyId: string, productIds: string[]) {
    return await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        category: products.category,
        sell_unit: products.sellUnit,
        requires_prescription: products.requiresPrescription,
        batch_tracking_required: products.batchTrackingRequired,
        status: products.status,
        special_handling: products.specialHandling,
        unit_price: inventory.unitPrice,
        available: sql<number>`${inventory.onHand} - ${inventory.reserved}`,
        sales_blocked: inventory.salesBlocked,
        shipping_weight_grams: products.shippingWeightGrams,
      })
      .from(inventory)
      .innerJoin(products, eq(products.id, inventory.productId))
      .where(and(eq(inventory.pharmacyId, pharmacyId), inArray(products.id, productIds)))
  }

  isPrescriptionServiceOpen(pharmacyId: string) {
    return prescriptionServiceOpen(pool, pharmacyId)
  }

  async saveQuote(input: Parameters<CheckoutRepository['saveQuote']>[0]) {
    const [quote] = await db
      .insert(checkoutQuotes)
      .values({
        customerId: input.customerId,
        pharmacyId: input.pharmacyId,
        addressId: input.addressId,
        addressSnapshot: input.addressSnapshot,
        fulfillmentMethod: input.fulfillmentMethod,
        itemsSnapshot: input.items,
        totalsSnapshot: input.totals,
        shippingSnapshot: input.shippingSnapshot,
        inputFingerprint: input.fingerprint,
        expiresAt: sql`now() + interval '10 minutes'`,
      })
      .returning({ id: checkoutQuotes.id, expiresAt: checkoutQuotes.expiresAt })
    return quote
  }

  async listPrescriptionHours(pharmacyId: string) {
    return await db
      .select({
        weekday: pharmacyServiceHours.weekday,
        opens_at: pharmacyServiceHours.opensAt,
        closes_at: pharmacyServiceHours.closesAt,
        timezone: pharmacyServiceHours.timezone,
      })
      .from(pharmacyServiceHours)
      .where(
        and(
          eq(pharmacyServiceHours.pharmacyId, pharmacyId),
          eq(pharmacyServiceHours.serviceType, 'prescription'),
          eq(pharmacyServiceHours.active, true),
        ),
      )
      .orderBy(asc(pharmacyServiceHours.weekday))
  }
}
