import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { addresses } from '../../../infrastructure/database/schema'
import type { AddressInputDto } from '../application/address.dto'
import type { AddressRepository } from '../application/address.service'

export class PostgresAddressRepository implements AddressRepository {
  async listForUser(userId: string) {
    return await db
      .select({
        id: addresses.id,
        recipientName: addresses.recipientName,
        phone: addresses.phone,
        addressText: addresses.addressText,
        city: addresses.city,
        postalCode: addresses.postalCode,
        rajaongkirDestinationId: addresses.rajaongkirDestinationId,
        createdAt: addresses.createdAt,
      })
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.createdAt))
  }

  async createForUser(userId: string, address: AddressInputDto) {
    const [saved] = await db
      .insert(addresses)
      .values({
        userId,
        recipientName: address.recipientName,
        phone: address.phone,
        addressText: address.addressText,
        city: address.city,
        postalCode: address.postalCode,
        rajaongkirDestinationId: address.rajaongkirDestinationId,
      })
      .returning({
        id: addresses.id,
        recipientName: addresses.recipientName,
        phone: addresses.phone,
        addressText: addresses.addressText,
        city: addresses.city,
        postalCode: addresses.postalCode,
        rajaongkirDestinationId: addresses.rajaongkirDestinationId,
      })
    return saved
  }

  async updateForUser(userId: string, addressId: string, address: AddressInputDto) {
    const updated = await db
      .update(addresses)
      .set({
        recipientName: address.recipientName,
        phone: address.phone,
        addressText: address.addressText,
        city: address.city,
        postalCode: address.postalCode,
        rajaongkirDestinationId: address.rajaongkirDestinationId,
        updatedAt: sql`now()`,
      })
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .returning({ id: addresses.id })
    return updated.length > 0
  }
}
