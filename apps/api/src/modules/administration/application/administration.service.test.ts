import { describe, expect, test } from 'bun:test'
import { ApplicationError } from '../../../shared/application-error'
import { createAdminProduct, updateAdminPharmacy } from './administration.service'

const productInput = {
  sku: 'OTC-008',
  name: 'Vitamin C',
  category: 'Vitamin',
  sellUnit: 'botol isi 30 tablet',
  shippingWeightGrams: 120,
}

describe('admin product shipping weights', () => {
  test('requires a positive measured weight in grams when creating a product', async () => {
    const calls: unknown[][] = []
    const repository = { createProduct: async (...args: unknown[]) => { calls.push(args); return { id: 'product-1' } } } as any
    const created = await createAdminProduct(repository, 'admin-1', productInput)
    expect(created).toEqual({ id: 'product-1' })
    expect(calls[0][2]).toMatchObject({ shippingWeightGrams: 120 })
    for (const shippingWeightGrams of [undefined, 0, -1, 30001, 1.5, 'invalid']) {
      expect(() => createAdminProduct(repository, 'admin-1', {
        ...productInput,
        shippingWeightGrams,
      })).toThrow(ApplicationError)
    }
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
    await expect(updateAdminPharmacy(repository, 'admin-1', 'pharmacy-1', {
      rajaongkirOriginId: 'invalid',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_SHIPPING_ORIGIN' })
  })
})
