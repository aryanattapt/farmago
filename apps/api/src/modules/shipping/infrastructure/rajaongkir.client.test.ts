import { describe, expect, test } from 'bun:test'
import { RajaOngkirClient, type RajaOngkirConfig } from './rajaongkir.client'

const config: RajaOngkirConfig = {
  apiKey: 'test-secret',
  baseUrl: 'https://rajaongkir.komerce.id/api/v1',
  couriers: ['jne', 'sicepat'],
}

describe('RajaOngkir API v2 client', () => {
  test('searches destinations with the API key header and normalizes valid location IDs', async () => {
    const request: { url: string; headers: Headers } = { url: '', headers: new Headers() }
    const client = new RajaOngkirClient(config, async (input, init) => {
      request.url = String(input)
      request.headers = new Headers(init?.headers)
      return Response.json({
        meta: { code: 200, status: 'success' },
        data: [
          { id: 123, label: 'Kelurahan, Kecamatan, Kota', province_name: 'DKI Jakarta', city_name: 'Jakarta', district_name: 'Kecamatan', subdistrict_name: 'Kelurahan', zip_code: '10110' },
          { id: -1, label: 'Invalid row' },
        ],
      })
    })
    const results = await client.searchDomesticDestinations('  Kecamatan  ')
    expect(new URL(request.url).searchParams.get('search')).toBe('  Kecamatan  ')
    expect(new URL(request.url).searchParams.get('limit')).toBe('10')
    expect(request.headers.get('key')).toBe('test-secret')
    expect(results).toEqual([{
      id: 123,
      label: 'Kelurahan, Kecamatan, Kota',
      provinceName: 'DKI Jakarta',
      cityName: 'Jakarta',
      districtName: 'Kecamatan',
      subdistrictName: 'Kelurahan',
      zipCode: '10110',
    }])
  })

  test('posts form-encoded costs and normalizes the available courier services', async () => {
    const request: { url: string; headers: Headers; body: URLSearchParams } = {
      url: '',
      headers: new Headers(),
      body: new URLSearchParams(),
    }
    const client = new RajaOngkirClient(config, async (input, init) => {
      request.url = String(input)
      request.headers = new Headers(init?.headers)
      request.body = new URLSearchParams(String(init?.body))
      return Response.json({
        meta: { code: 200, status: 'success' },
        data: [
          { name: 'JNE', code: 'jne', service: 'REG', description: 'Regular', cost: 12000, etd: '2-3' },
          { name: 'SiCepat', code: 'sicepat', service: 'BEST', description: 'Express', cost: 9000, etd: '1-2' },
        ],
      })
    })
    const rates = await client.calculateDomesticCost({ originId: 1, destinationId: 2, weightGrams: 750 })
    expect(request.url).toBe('https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost')
    expect(request.headers.get('key')).toBe('test-secret')
    expect(request.headers.get('content-type')).toContain('application/x-www-form-urlencoded')
    expect(Object.fromEntries(request.body.entries())).toEqual({
      origin: '1', destination: '2', weight: '750', courier: 'jne:sicepat', price: 'lowest',
    })
    expect(rates.map((rate) => rate.cost)).toEqual([12000, 9000])
  })

  test('treats a no-route response as an empty set and hides provider details on outages', async () => {
    const noRoute = new RajaOngkirClient(config, async () => Response.json({ meta: { code: 400 }, data: null }, { status: 400 }))
    expect(await noRoute.calculateDomesticCost({ originId: 1, destinationId: 2, weightGrams: 500 })).toEqual([])
    const unavailable = new RajaOngkirClient(config, async () => new Response('sensitive upstream details', { status: 500 }))
    await expect(unavailable.calculateDomesticCost({ originId: 1, destinationId: 2, weightGrams: 500 }))
      .rejects.toMatchObject({ status: 503, code: 'SHIPPING_PROVIDER_UNAVAILABLE' })
  })

  test('maps unexpected provider meta errors to a sanitized unavailable response', async () => {
    const unauthorized = new RajaOngkirClient(config, async () => Response.json({
      meta: { code: 401, message: 'private account detail' },
    }))
    await expect(unauthorized.searchDomesticDestinations('Jakarta'))
      .rejects.toMatchObject({ status: 503, code: 'SHIPPING_PROVIDER_UNAVAILABLE' })
  })

  test('refuses upstream calls without a server-side API key', async () => {
    const client = new RajaOngkirClient(null, async () => { throw new Error('must not call') })
    await expect(client.searchDomesticDestinations('Jakarta'))
      .rejects.toMatchObject({ status: 503, code: 'SHIPPING_PROVIDER_NOT_CONFIGURED' })
  })
})
