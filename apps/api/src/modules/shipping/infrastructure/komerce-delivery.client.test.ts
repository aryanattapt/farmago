import { describe, expect, test } from 'bun:test'
import { KomerceDeliveryClient, KomerceDeliveryError } from './komerce-delivery.client'

const config = { apiKey: 'delivery-secret', baseUrl: 'https://api-sandbox.collaborator.komerce.id' }

describe('KomerceDeliveryClient', () => {
  test('creates Store Orders through the separate Delivery API key and maps Komerce order numbers', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = []
    const client = new KomerceDeliveryClient(config, async (input, init) => {
      calls.push({ url: new URL(String(input)), init: init ?? {} })
      return Response.json({ meta: { code: 201, status: 'success' }, data: { order_id: 7, order_no: 'KOM-7' } })
    })
    const result = await client.storeOrder({ payment_method: 'BANK TRANSFER' })
    expect(result).toEqual({ orderNo: 'KOM-7', providerOrderId: '7' })
    expect(calls[0]?.url.pathname).toBe('/order/api/v1/orders/store')
    expect((calls[0]?.init.headers as Record<string, string>)['x-api-key']).toBe('delivery-secret')
    expect(calls[0]?.init.headers).not.toHaveProperty('key')
  })

  test('classifies a provider rejection as safe to retry after correction', async () => {
    const client = new KomerceDeliveryClient(config, async () =>
      Response.json({ meta: { code: 422, status: 'failed', message: 'missing fields' }, data: null }),
    )
    await expect(client.storeOrder({})).rejects.toMatchObject({
      name: 'KomerceDeliveryError',
      outcome: 'rejected',
    })
  })

  test('classifies transport and server failures as outcome unknown', async () => {
    const offline = new KomerceDeliveryClient(config, async () => { throw new Error('offline') })
    await expect(offline.storeOrder({})).rejects.toMatchObject({ outcome: 'unknown' })
    const serverError = new KomerceDeliveryClient(config, async () => new Response('upstream error', { status: 503 }))
    await expect(serverError.storeOrder({})).rejects.toMatchObject({ outcome: 'unknown' })
  })

  test('parses pickup AWB and refuses a failed per-order result', async () => {
    const success = new KomerceDeliveryClient(config, async () =>
      Response.json({ meta: { code: 201, status: 'success' }, data: [{ status: 'success', order_no: 'KOM-7', awb: 'AWB-7' }] }),
    )
    await expect(success.requestPickup({
      pickup_date: '2026-11-04', pickup_time: '10:00', pickup_vehicle: 'Motor', orders: [{ order_no: 'KOM-7' }],
    })).resolves.toEqual({ awb: 'AWB-7' })
    const failed = new KomerceDeliveryClient(config, async () =>
      Response.json({ meta: { code: 201, status: 'success' }, data: [{ status: 'failed', order_no: 'KOM-7', awb: '' }] }),
    )
    await expect(failed.requestPickup({
      pickup_date: '2026-11-04', pickup_time: '10:00', pickup_vehicle: 'Motor', orders: [{ order_no: 'KOM-7' }],
    })).rejects.toBeInstanceOf(KomerceDeliveryError)
  })
})
