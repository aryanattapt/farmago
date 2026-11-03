# FarmaGO

Web responsif dan API awal untuk MVP FarmaGO, mengikuti dokumen di `requirement/`.

## Menjalankan lokal

Prasyarat: Bun dan Docker Compose.

1. Salin `.env.example` menjadi `.env`.
2. Jalankan PostgreSQL: `docker compose up -d db`.
3. Pasang dependensi: `bun install`.
4. Buat tabel: `bun run db:migrate`.
5. Muat katalog dan satu apotek contoh: `bun run db:seed`.
6. Jalankan API di terminal pertama: `bun run dev:api`.
7. Jalankan web di terminal kedua: `bun run dev:web`.
8. Buka `http://localhost:5173`.

## Menjalankan seluruh stack dengan Docker

Jalankan `docker compose up --build -d`, lalu buka `http://localhost:8080`. Compose menjalankan PostgreSQL, migrasi, API, dan web. Untuk memuat data contoh, jalankan `docker compose exec api bun apps/api/src/interfaces/cli/seed.ts`.

Katalog dapat dijelajahi tanpa login. Untuk transaksi, daftar lalu gunakan tautan verifikasi yang ditampilkan pada mode development. Atur `MFA_ENCRYPTION_KEY` menjadi kunci acak 32 byte sebelum membuat akun internal melalui `bun run provision:user -- "Nama" email@contoh.id admin` atau role lain; staf apotek memerlukan ID apotek. Perintah provisioning menampilkan secret TOTP dan kode pemulihan satu kali. Jangan gunakan data atau resep nyata pada lingkungan pengembangan.

## Yang tersedia

- React + Vite untuk katalog, keranjang, checkout pickup dan pengiriman bertarif RajaOngkir, riwayat/detail pesanan, unggah resep, dan panel apotek/admin.
- Bun HTTP API dengan sesi cookie HttpOnly, CSRF untuk mutasi, hashing kata sandi adaptif, RBAC berbasis penugasan, dan pembatasan unggah resep privat.
- PostgreSQL schema untuk quote, snapshot harga, reservasi stok transaksional, masa reservasi, audit, review versi resep, pemenuhan, pembayaran, refund, kasus bantuan, dan outbox.
- Pemeriksaan stok dan harga ulang saat pesanan dibuat; quote berubah memerlukan persetujuan ulang; job melepas reservasi yang belum dibayar setelah batas waktu.
- Pemenuhan mencatat hasil pemeriksaan akhir; produk yang ditandai perlu pelacakan batch mewajibkan nomor lot, tanggal kedaluwarsa yang belum lewat, dan jumlah lot sesuai pesanan. Pesanan resep harus disahkan apoteker sebelum siap; pemeriksaan gagal membuka kasus operasional untuk CS.

## Integrasi dan gerbang sebelum pilot

Kutipan tarif pengiriman memakai RajaOngkir API v2. Untuk mengaktifkannya, isi `RAJAONGKIR_API_KEY`, `RAJAONGKIR_COURIERS`, dan bila perlu `RAJAONGKIR_PACKAGING_WEIGHT_GRAMS` pada environment API; API key hanya disimpan di server. Atur ID lokasi asal subdistrict masing-masing apotek melalui panel admin. Cabang yang belum memiliki titik asal RajaOngkir tidak menawarkan pengiriman. Jalankan migrasi terbaru, lalu lengkapi berat kemasan (gram) pada tiap produk di panel admin. Pelanggan memilih area tujuan dari hasil pencarian RajaOngkir; tarif dan layanan terendah disimpan pada quote selama masa berlakunya.

Integrasi ini menghitung biaya dan estimasi layanan. Pembuatan label/booking kurir serta pickup kurir belum tersedia; pembayaran, email/SMS, dan kebijakan refund final juga masih memerlukan adapter atau keputusan operasional. Akun internal memakai TOTP MFA dan kode pemulihan sekali pakai. Jangan menganggap aplikasi ini siap produksi/pilot sebelum gerbang hukum, farmasi, keamanan, operasional, retensi data, malware scanning, object storage privat, notifikasi, backup, kebijakan refund, dan UAT di planning dipenuhi.

Unggahan saat ini disimpan privat di `apps/api/storage/` dan folder tersebut dikecualikan dari Git. Produksi memerlukan object storage privat dan pemindaian malware. Data produk seed hanyalah data contoh untuk development.

## Tes API

Jalankan unit test dan pemeriksaan batas arsitektur dengan `bun run test:api`.

## Struktur kode

API dikelompokkan ke modul bisnis dengan layer domain, application, infrastructure, dan
presentation. Komponen web dikelompokkan per alur. Lihat [ARCHITECTURE.md](ARCHITECTURE.md)
untuk batas tanggung jawab dan panduan menambah fitur.
