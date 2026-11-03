import { describe, expect, test } from 'bun:test'
import { ApplicationError } from '../../../shared/application-error'
import { createAdminPharmacy, createAdminProduct, updateAdminPharmacy } from './administration.service'

const productInput = {
  sku: 'OTC-008',
  name: 'Vitamin C',
  category: 'Vitamin',
  sellUnit: 'botol isi 30 tablet',
  shippingWeightGrams: 120,
  shippingWidthCm: 5,
  shippingHeightCm: 8,
  shippingLengthCm: 5,
}

describe('admin product shipping weights', () => {
  test('requires a positive measured weight in grams when creating a product', async () => {
    const calls: unknown[][] = []
    const repository = { createProduct: async (...args: unknown[]) => { calls.push(args); return { id: 'product-1' } } } as any
    const created = await createAdminProduct(repository, 'admin-1', productInput)
    expect(created).toEqual({ id: 'product-1' })
    expect(calls[0][2]).toMatchObject({ shippingWeightGrams: 120, shippingWidthCm: 5, shippingHeightCm: 8, shippingLengthCm: 5 })
    for (const shippingWeightGrams of [undefined, 0, -1, 30001, 1.5, 'invalid']) {
      expect(() => createAdminProduct(repository, 'admin-1', {
        ...productInput,
        shippingWeightGrams,
      })).toThrow(ApplicationError)
    }
  })

  test('requires usable package dimensions for Delivery API orders', async () => {
    const repository = { createProduct: async () => ({ id: 'product-1' }) } as any
    for (const shippingWidthCm of [undefined, 0, 201, 2.5, 'bad']) {
      expect(() => createAdminProduct(repository, 'admin-1', { ...productInput, shippingWidthCm })).toThrow(ApplicationError)
    }
  })

  test('requires operational sender contact details when creating a pharmacy', async () => {
    const repository = { createPharmacy: async () => ({ id: 'pharmacy-1' }) } as any
    const input = {
      name: 'Apotek Farma',
      addressText: 'Jl. Sehat No. 1',
      city: 'Jakarta',
      postalCodes: ['12345'],
      deliveryContactName: 'Staf Apotek',
      deliveryPhone: '081234567890',
      deliveryEmail: 'pickup@example.test',
    }
    await expect(createAdminPharmacy(repository, 'admin-1', input)).resolves.toMatchObject({ id: 'pharmacy-1' })
    expect(() => createAdminPharmacy(repository, 'admin-1', { ...input, deliveryPhone: '555' })).toThrow(ApplicationError)
  })

  test('saves a branch origin selected from RajaOngkir location results', async () => {
    const calls: unknown[][] = []
    const repository = {
      updatePharmacy: async (...args: unknown[]) => { calls.push(args); return { ok: true, value: { id: 'pharmacy-1' } } },
    } as any
    const saved = await updateAdminPharmacy(repository, 'admin-1', 'pharmacy-1', {
      rajaongkirOriginId: '456',
    })
    expect(saved).toEqual({ id: 'pharmacy-1' })
    expect(calls[0]).toEqual(['admin-1', 'pharmacy-1', null, 456])
    await updateAdminPharmacy(repository, 'admin-1', 'pharmacy-1', {
      deliveryPhone: '081234567890',
    })
    expect(calls[1][4]).toEqual({ deliveryPhone: '081234567890' })
    await expect(updateAdminPharmacy(repository, 'admin-1', 'pharmacy-1', {
      rajaongkirOriginId: 'invalid',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SHIPPING_ORIGIN' })
  })
})
