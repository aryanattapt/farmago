import { configureRequestIpResolver } from './shared/api'
import { expireUnpaidOrders } from './application/jobs/expire-unpaid-orders'
import { createApiApp } from './interfaces/http/router'

const port = Number(process.env.API_PORT ?? 4000)
const app = createApiApp()
app.listen(port)

configureRequestIpResolver((request) => app.server?.requestIP(request)?.address)
console.info('API FarmaGO berjalan di http://localhost:' + String(app.server?.port ?? port))

const expirationTimer = setInterval(() => {
  void expireUnpaidOrders().catch(() =>
    console.error('Pekerjaan kedaluwarsa reservasi gagal; akan dicoba kembali.'),
  )
}, 15_000)
expirationTimer.unref?.()
