import { ApplicationError } from '../../../shared/application-error'

export type KomerceDeliveryConfig = { apiKey: string; baseUrl: string }
export type KomerceStoreOrderPayload = Record<string, unknown>
export type KomercePickupPayload = {
  pickup_date: string
  pickup_time: string
  pickup_vehicle: 'Motor' | 'Mobil' | 'Truk'
  orders: Array<{ order_no: string }>
}

export class KomerceDeliveryError extends Error {
  constructor(
    readonly outcome: 'rejected' | 'unknown',
    readonly providerMessage: string,
  ) {
    super(providerMessage)
    this.name = 'KomerceDeliveryError'
  }
}

export class KomerceDeliveryClient {
  constructor(
    private readonly config: KomerceDeliveryConfig | null = loadKomerceDeliveryConfig(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.config?.apiKey)
  }

  async storeOrder(payload: KomerceStoreOrderPayload) {
    const response = await this.request('/order/api/v1/orders/store', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const orderNo = safeText(response?.data?.order_no, 120)
    if (!isProviderSuccess(response)) throw rejectionOrUnknown(response)
    if (!orderNo) throw unknown('Komerce tidak mengembalikan nomor order.')
    return { orderNo, providerOrderId: safeText(response?.data?.order_id, 120) || null }
  }

  async requestPickup(payload: KomercePickupPayload) {
    const response = await this.request('/order/api/v1/pickup/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const row = Array.isArray(response?.data) ? response.data[0] : response?.data
    if (!isProviderSuccess(response)) throw rejectionOrUnknown(response)
    if (String(row?.status ?? '').toLowerCase() === 'failed')
      throw new KomerceDeliveryError('rejected', 'Komerce gagal menjadwalkan pickup untuk order ini.')
    const orderNo = safeText(row?.order_no, 120)
    if (orderNo && orderNo !== payload.orders[0]?.order_no)
      throw unknown('Respons pickup Komerce tidak cocok dengan nomor order.')
    return { awb: safeText(row?.awb, 120) || null }
  }

  async printLabel(orderNo: string, page = 'page_5') {
    const url = new URL('/order/api/v1/orders/print-label', ensureBase(this.requireConfig().baseUrl))
    url.searchParams.set('page', page)
    url.searchParams.set('order_no', orderNo)
    const response = await this.requestUrl(url, { method: 'POST' })
    if (!isProviderSuccess(response)) throw rejectionOrUnknown(response)
    const base64 = String(response?.data?.base_64 ?? '').replace(/\s+/g, '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length < 100 || base64.length > 15_000_000)
      throw unknown('Komerce tidak mengembalikan label PDF yang valid.')
    return { base64 }
  }

  private async request(path: string, init: RequestInit) {
    return this.requestUrl(new URL(path, ensureBase(this.requireConfig().baseUrl)), init)
  }

  private async requestUrl(url: URL, init: RequestInit) {
    const config = this.requireConfig()
    try {
      const response = await this.fetcher(url, {
        ...init,
        headers: {
          'x-api-key': config.apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(12_000),
      })
      let payload: any
      try {
        payload = await response.json()
      } catch {
        throw unknown('Respons Komerce tidak dapat dibaca.')
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500)
          throw rejected(payload)
        throw unknown('Komerce belum mengonfirmasi hasil permintaan.')
      }
      return payload
    } catch (error) {
      if (error instanceof KomerceDeliveryError) throw error
      throw unknown('Koneksi ke Komerce terputus sebelum hasil permintaan dikonfirmasi.')
    }
  }

  private requireConfig() {
    if (!this.config?.apiKey)
      throw new ApplicationError(
        503,
        'DELIVERY_PROVIDER_NOT_CONFIGURED',
        'Shipping Delivery Komerce belum dikonfigurasi. Tambahkan KOMERCE_DELIVERY_API_KEY pada environment API.',
      )
    return this.config
  }
}

export function loadKomerceDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): KomerceDeliveryConfig | null {
  const apiKey = String(env.KOMERCE_DELIVERY_API_KEY ?? '').trim()
  if (!apiKey) return null
  const baseUrl = String(
    env.KOMERCE_DELIVERY_BASE_URL ?? 'https://api-sandbox.collaborator.komerce.id',
  ).trim()
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new ApplicationError(
      500,
      'DELIVERY_CONFIG_INVALID',
      'KOMERCE_DELIVERY_BASE_URL harus berupa URL HTTPS.',
    )
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))
    throw new ApplicationError(
      500,
      'DELIVERY_CONFIG_INVALID',
      'KOMERCE_DELIVERY_BASE_URL harus menggunakan HTTPS.',
    )
  return { apiKey, baseUrl: parsed.toString().replace(/\/$/, '') }
}

function isProviderSuccess(payload: any) {
  const status = String(payload?.meta?.status ?? '').toLowerCase()
  if (['failed', 'error', 'false'].includes(status)) return false
  return status === 'success' || payload?.meta?.status === true ||
    [200, 201].includes(Number(payload?.meta?.code))
}

function rejectionOrUnknown(payload: any): KomerceDeliveryError {
  if (Number(payload?.meta?.code) >= 500)
    return unknown(safeText(payload?.meta?.message, 300) || 'Komerce belum mengonfirmasi hasil permintaan.')
  return rejected(payload)
}

function rejected(payload: any): KomerceDeliveryError {
  return new KomerceDeliveryError(
    'rejected',
    safeText(payload?.meta?.message ?? payload?.message, 300) || 'Komerce menolak permintaan.',
  )
}

function unknown(message: string): KomerceDeliveryError {
  return new KomerceDeliveryError('unknown', message)
}

function safeText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function ensureBase(value: string) {
  return value.endsWith('/') ? value : value + '/'
}
