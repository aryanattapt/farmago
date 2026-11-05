import { ApplicationError } from '../../../shared/application-error'

export type RajaOngkirConfig = {
  apiKey: string
  baseUrl: string
  couriers?: string[]
}
export type RajaOngkirFetch = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>

export type RajaOngkirDestination = {
  id: number
  label: string
  provinceName: string
  cityName: string
  districtName: string
  subdistrictName: string
  zipCode: string
}

export type RajaOngkirRate = {
  courierName: string
  courierCode: string
  service: string
  description: string
  cost: number
  etd: string
}

export class RajaOngkirClient {
  constructor(
    private readonly config: RajaOngkirConfig | null = loadRajaOngkirConfig(),
    private readonly fetcher: RajaOngkirFetch = fetch,
  ) {}

  async searchDomesticDestinations(search: string): Promise<RajaOngkirDestination[]> {
    const config = this.requireConfig()
    const url = new URL('destination/domestic-destination', ensureTrailingSlash(config.baseUrl))
    url.searchParams.set('search', search)
    url.searchParams.set('limit', '10')
    url.searchParams.set('offset', '0')
    const payload = await this.request(url, { method: 'GET', headers: { key: config.apiKey } })
    if (Number(payload.meta?.code) === 404) return []
    if (!isSuccessful(payload) || !Array.isArray(payload.data)) throw providerUnavailable()
    return payload.data.flatMap((row: any) => {
      const id = Number(row?.id)
      if (!Number.isSafeInteger(id) || id <= 0) return []
      const provinceName = safeText(row.province_name, 100)
      const cityName = safeText(row.city_name, 100)
      const districtName = safeText(row.district_name, 100)
      const subdistrictName = safeText(row.subdistrict_name, 100)
      const zipCode = safeText(row.zip_code, 10)
      return [{
        id,
        label: safeText(row.label, 240) || [subdistrictName, districtName, cityName, provinceName, zipCode].filter(Boolean).join(', '),
        provinceName,
        cityName,
        districtName,
        subdistrictName,
        zipCode,
      }]
    })
  }

  async calculateDomesticCost(
    input: {
      originId: number
      destinationId: number
      weightGrams: number
    },
    activeCouriers?: string[],
  ): Promise<RajaOngkirRate[]> {
    const config = this.requireConfig()
    const couriers = [
      ...new Set((activeCouriers ?? config.couriers ?? [])
        .map((code) => code.trim().toLowerCase())
        .filter(Boolean)),
    ]
    if (!couriers.length)
      throw new ApplicationError(
        503,
        'SHIPPING_COURIERS_NOT_CONFIGURED',
        'Belum ada kurir aktif di tabel rajaongkir_couriers.',
      )
    if (couriers.some((code) => !/^[a-z0-9_-]{2,30}$/.test(code)))
      throw new ApplicationError(
        500,
        'SHIPPING_CONFIG_INVALID',
        'Kode kurir pada tabel rajaongkir_couriers tidak valid.',
      )
    const body = new URLSearchParams({
      origin: String(input.originId),
      destination: String(input.destinationId),
      weight: String(input.weightGrams),
      courier: couriers.join(':'),
      price: 'lowest',
    })
    const url = new URL('calculate/domestic-cost', ensureTrailingSlash(config.baseUrl))
    const payload = await this.request(url, {
      method: 'POST',
      headers: {
        key: config.apiKey,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if ([400, 404].includes(Number(payload.meta?.code)) && !Array.isArray(payload.data)) return []
    if (!isSuccessful(payload) || !Array.isArray(payload.data)) throw providerUnavailable()
    return payload.data.flatMap((row: any) => {
      const cost = Number(row?.cost)
      const courierCode = safeText(row?.code, 30).toLowerCase()
      const service = safeText(row?.service, 80)
      if (!Number.isSafeInteger(Math.round(cost)) || cost < 0 || !courierCode || !service) return []
      return [{
        courierName: safeText(row?.name, 100),
        courierCode,
        service,
        description: safeText(row?.description, 240),
        cost: Math.round(cost),
        etd: safeText(row?.etd, 80),
      }]
    })
  }

  private requireConfig() {
    if (!this.config?.apiKey)
      throw new ApplicationError(
        503,
        'SHIPPING_PROVIDER_NOT_CONFIGURED',
        'RajaOngkir belum dikonfigurasi. Tambahkan API key pada environment API.',
      )
    return this.config
  }

  private async request(url: URL, init: RequestInit) {
    try {
      const response = await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(8_000),
      })
      let payload: any
      try {
        payload = await response.json()
      } catch {
        throw new Error('invalid-json')
      }
      if (!response.ok && ![400, 404].includes(Number(payload?.meta?.code)))
        throw new Error('provider-http-error')
      return payload
    } catch {
      throw new ApplicationError(
        503,
        'SHIPPING_PROVIDER_UNAVAILABLE',
        'Layanan ongkir sedang tidak tersedia. Coba lagi sebentar.',
      )
    }
  }
}

export function loadRajaOngkirConfig(env: NodeJS.ProcessEnv = process.env): RajaOngkirConfig | null {
  const apiKey = String(env.RAJAONGKIR_API_KEY ?? '').trim()
  if (!apiKey) return null
  return {
    apiKey,
    baseUrl: String(env.RAJAONGKIR_BASE_URL ?? 'https://rajaongkir.komerce.id/api/v1').replace(/\/$/, ''),
  }
}

function providerUnavailable() {
  return new ApplicationError(
    503,
    'SHIPPING_PROVIDER_UNAVAILABLE',
    'Layanan ongkir sedang tidak tersedia. Coba lagi sebentar.',
  )
}

function isSuccessful(payload: any) {
  return Number(payload?.meta?.code) === 200 || payload?.meta?.status === 'success' || payload?.meta?.status === true
}

function safeText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : value + '/'
}
