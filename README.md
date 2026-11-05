# FarmaGO

FarmaGO adalah platform digital yang menghubungkan pelanggan dengan apotek mitra untuk membeli produk kesehatan dan menebus resep. Pelanggan memilih apotek yang mampu memenuhi seluruh isi keranjang; apotek memeriksa resep, menyiapkan pesanan, lalu menyerahkannya untuk diambil atau dikirim.

> **Status proyek (5 November 2026):** MVP masih dalam tahap implementasi dan validasi. Pembayaran belum terhubung ke penyedia, integrasi kurir masih memerlukan UAT dengan akun Komerce, dan beberapa gerbang bisnis, farmasi, legal, serta operasional belum disahkan. README ini menjelaskan cakupan produk dan kondisi kode, bukan pernyataan bahwa sistem siap untuk pilot atau produksi.

## Tujuan produk

FarmaGO membantu tiga pihak menjalankan transaksi apotek secara terkoordinasi:

| Pihak | Kebutuhan bisnis | Hasil yang diharapkan |
| --- | --- | --- |
| Pelanggan | Menemukan produk, memilih apotek dan metode pemenuhan, mengirim resep bila diperlukan, serta memantau pesanan. | Rincian harga dan ongkir jelas sebelum konfirmasi; status dan jalur bantuan mudah ditemukan. |
| Apoteker dan staf apotek | Memeriksa resep sesuai kewenangan, memvalidasi produk dan stok, menyiapkan pesanan, dan mencatat serah terima. | Keputusan dan pemeriksaan dapat ditelusuri ke petugas serta waktu pelaksanaan. |
| Admin, CS, dan operasional | Mengelola mitra dan katalog, menangani kendala pesanan, serta mengawasi pembatalan dan refund. | Kasus operasional memiliki pemilik, status, dan jejak audit. |

FarmaGO mengoordinasikan transaksi antara pelanggan dan apotek mitra. Penyedia pembayaran dan kurir merupakan pihak terpisah. Perizinan, tanggung jawab masing-masing pihak, serta ketentuan pemrosesan data perlu disepakati sebelum pilot.

## Alur bisnis utama

### Pengalaman pelanggan

1. Pelanggan menjelajahi katalog, mencari produk, dan melihat indikasi apakah resep diperlukan.
2. Pelanggan mengisi keranjang dan memilih **ambil di apotek** atau **kirim ke alamat**.
3. Sistem menampilkan apotek aktif yang memiliki stok semua item; untuk pengiriman, apotek juga harus melayani alamat tersebut. Pelanggan memilih satu apotek untuk seluruh pesanan.
4. Untuk pengiriman, pelanggan memilih kurir dan layanan dari tarif yang tersedia untuk rute tersebut. Untuk pengambilan, alamat dan ongkir pengiriman tidak diperlukan.
5. Sebelum pesanan dibuat, pelanggan meninjau harga produk, ongkir, biaya, dan total. Server memeriksa ulang harga dan stok. Jika rincian berubah, pelanggan harus menyetujui quote terbaru.
6. Jika ada produk wajib resep, pelanggan mengunggah dokumen. Apoteker dapat menyetujui, menolak, atau meminta klarifikasi. Tagihan dan pemenuhan tetap tertahan sampai semua persyaratan resep terpenuhi.
7. Setelah pembayaran terkonfirmasi, apotek memeriksa dan menyiapkan pesanan. Staf mencatat bukti pengambilan atau serah terima kepada kurir.
8. Pelanggan melihat status pesanan dan, untuk pengiriman, timeline pelacakan.

**Batasan penting:** integrasi penyedia pembayaran belum tersedia, sehingga alur di atas belum dapat menyelesaikan transaksi berbayar end-to-end di lingkungan nyata.

### Pembatalan dan refund

Pembatalan sebelum barang diserahkan adalah proses terpisah dari refund setelah barang diterima:

- **Sebelum serah terima:** pelanggan dapat meminta pembatalan dengan alasan. Petugas berwenang meninjau permintaan. Jika booking kurir sudah aktif atau hasil booking belum pasti, status booking harus direkonsiliasi sebelum pesanan dibatalkan.
- **Setelah barang diterima:** pelanggan mengajukan refund melalui form dalam **3 hari sejak waktu penerimaan tercatat**. Form meminta alasan, nama bank, nama pemilik rekening, dan nomor rekening. Video unboxing wajib untuk pesanan kurir dan tidak diwajibkan untuk pengambilan.
- **Keputusan dan transfer:** apotek dapat menyetujui atau menolak pengajuan dengan alasan. Refund ditransfer manual oleh apotek paling lambat **7 hari setelah disetujui** dan tidak boleh melebihi dana yang benar-benar diterima.
- Refund pascapenerimaan tidak mengubah status pesanan `completed` dan tidak menambah stok secara otomatis.

### Aturan bisnis MVP

- Satu pesanan dipenuhi oleh satu apotek yang dipilih pelanggan; pemenuhan sebagian dan pembagian pesanan ke beberapa apotek belum didukung.
- Tidak ada penggantian produk otomatis. Perubahan isi pesanan memerlukan pesanan dan pemeriksaan baru.
- Stok yang ditawarkan online harus dipisahkan dari stok kasir atau didukung mekanisme reservasi lintas kanal yang sudah dibuktikan.
- Produk wajib resep hanya dapat dipenuhi setelah persetujuan apoteker yang berwenang. Jam layanan pemeriksaan resep dan batas reservasi harus terlihat sebelum konfirmasi.
- Masa reservasi pembayaran awal adalah 30 menit. Reservasi pesanan yang sudah dibayar tetap dijaga sampai pesanan dipenuhi atau dibatalkan melalui proses yang sah.
- Pengembalian stok setelah barang disiapkan atau diserahkan membutuhkan pemeriksaan dan pencatatan petugas; refund tidak memicu pengembalian stok otomatis.
- PRD mengecualikan konsultasi dokter, penerbitan e-resep, rekomendasi obat otomatis, asuransi/BPJS, program loyalitas, langganan, repeat refill otomatis, racikan, dan kategori narkotika/psikotropika dari MVP. Cakupan produk dan SOP tetap harus disahkan oleh pihak farmasi dan legal.

## Kesesuaian terhadap requirement

Status berikut adalah ringkasan implementasi kode. **“Tersedia” tidak berarti sudah lulus UAT, divalidasi secara hukum/farmasi, atau siap dipakai di produksi.** Rincian requirement dan keputusan terbuka ada di dokumen [PRD](requirement/01-PRD.md), [Business Spec](requirement/07-BSD-Business-Spec.md), [App Flow](requirement/03-AFD-App-Flow.md), dan [catatan progres](requirement/progres.md).

| ID | Kebutuhan | Kondisi implementasi dan hal yang masih perlu dilakukan |
| --- | --- | --- |
| PR-01 | Akun, sesi, dan verifikasi kontak | Email verifikasi pendaftaran dan reset kata sandi memakai SMTP. Pendaftaran dengan nomor telepon saja belum tersedia karena adapter SMS belum ada. Validasi deliverability SMTP production masih diperlukan. |
| PR-02 | Alamat dan metode pemenuhan | Alamat tersimpan, pilihan alamat, pengambilan, dan quote pengiriman tersedia. UAT rute dan layanan dengan akun kurir tetap diperlukan. |
| PR-03 | Katalog | Katalog, pencarian, kategori, harga indikatif, dan penanda produk wajib resep tersedia. Persetujuan kategori produk merupakan gerbang farmasi/legal. |
| PR-04 | Keranjang dan konfirmasi harga | Perubahan jumlah, pemeriksaan ulang harga/stok, quote, dan persetujuan ulang bila rincian berubah tersedia. |
| PR-05 | Pilihan apotek pelanggan | Checkout menampilkan apotek yang memenuhi stok dan wilayah layanan; pelanggan memilih apotek sebelum quote dibuat. Stok dan kelayakan diperiksa ulang saat pesanan dibuat. |
| PR-06 | Pesanan dan reservasi stok | Reservasi atomik, idempotensi, dan pelepasan reservasi yang kedaluwarsa tersedia. Pemisahan stok online dengan stok toko tetap harus dibuktikan per apotek pilot. |
| PR-07 | Resep | Upload privat, klarifikasi, dan keputusan apoteker tersedia. SOP keaslian resep, pasien, penggunaan ulang, dan resep elektronik/asli masih perlu disahkan. |
| PR-08 | Pembayaran | **Belum terintegrasi.** Adapter dan webhook pembayaran belum dipilih/dipasang; endpoint pembayaran belum dapat memproses pembayaran nyata. |
| PR-09 | Pemenuhan | Pemeriksaan pesanan, booking/pickup Komerce, label, bukti serah terima, dan status `in_delivery` tersedia di kode. Konfigurasi akun dan UAT Komerce sandbox/production belum selesai. |
| PR-10 | Pelacakan | Timeline, pemetaan status, worker polling, dan callback bertoken tersedia. Endpoint callback dan siklus status perlu diuji langsung bersama Komerce. |
| PR-11 | Pembatalan dan refund | Form pembatalan serta form refund pascapenerimaan, bukti video kurir, pembatasan akses rekening, keputusan apotek, dan pencatatan transfer manual tersedia. UAT operasional dan pengesahan kebijakan/SOP masih diperlukan. |
| PR-12 | Admin, dukungan, dan audit | Panel operasional dan pencatatan audit tersedia. UAT akses/peran serta bukti backup dan pemulihan masih diperlukan. |

### Ukuran keberhasilan pilot

Target di bawah adalah sasaran awal dari PRD untuk divalidasi setelah tersedia baseline. Angka ini bukan hasil pengukuran aplikasi saat ini.

| Metrik | Sasaran awal |
| --- | ---: |
| Pesanan dibuat dibanding sesi checkout dimulai | ≥ 60% |
| Pesanan terbayar yang selesai dalam 30 hari | ≥ 90% |
| Pembatalan pesanan terbayar karena stok | < 5% |
| Resep lengkap mendapat keputusan awal dalam 15 menit pada jam layanan | ≥ 90%, perlu validasi kapasitas pilot |
| Produk wajib resep diserahkan tanpa persetujuan valid | 0 |

## Gerbang sebelum pilot atau produksi

Jangan gunakan data pasien atau resep nyata sebelum gerbang berikut dipenuhi dan disetujui pemilik bisnis terkait:

- Pilih penyedia pembayaran; implementasikan webhook, idempotensi, rekonsiliasi, dan penanganan pembayaran terlambat.
- Konfigurasikan akun Komerce, callback pengiriman, tarif, booking, pickup, label, tracking, dan kasus kurir; jalankan UAT sandbox serta production sesuai izin.
- Sahkan perizinan, kategori produk, SOP resep dan pemenuhan, alur refund, cakupan nominal/ongkir, peran para pihak, dan kebijakan privasi/retensi bersama tim bisnis, farmasi, dan legal.
- Buktikan pemisahan stok online dari stok toko, atau siapkan integrasi POS dan prosedur reservasi lintas kanal.
- Pindahkan resep dan video unboxing ke object storage privat dan tambahkan pemindaian malware.
- Siapkan SMS bila verifikasi/pemulihan lewat nomor telepon dibutuhkan, serta worker/retry untuk notifikasi operasional.
- Jalankan 42 skenario UAT pada [Implementation Plan](requirement/08-IPD-Implementation-Plan.md), pengujian keamanan dan beban, monitoring, runbook, backup, dan uji pemulihan.

## Aplikasi dan arsitektur

| Komponen | Teknologi | Peran |
| --- | --- | --- |
| Web | React, Vite | Katalog dan alur pelanggan, workspace apotek, serta panel admin/operasional. |
| Mobile | Expo / React Native WebView | Shell mobile yang membuka aplikasi web responsif agar alur pelanggan dan staf tetap sama. Bukan implementasi UI native terpisah. |
| API | Bun, Elysia, TypeScript | API JSON `/api/v1`, autentikasi, aturan bisnis, integrasi, dan job periodik. |
| Database | PostgreSQL | Data akun, katalog, apotek, quote, stok, pesanan, resep, pengiriman, refund, dan audit. |
| Pengiriman | RajaOngkir API v2 dan Komerce Shipping Delivery | RajaOngkir menyediakan tarif; Komerce menangani booking/pickup/label/tracking. Keduanya produk dan kredensial terpisah. |
| Email | SMTP | Verifikasi kontak dan reset kata sandi. |

API adalah **modular monolith**: satu aplikasi/deployment dengan batas modul bisnis, bukan kumpulan microservice. Lihat [Arsitektur](ARCHITECTURE.md) untuk aturan modul dan transaksi.

```text
apps/
  api/       API Bun/Elysia, migration, job, unit dan integration test
  web/       aplikasi React untuk pelanggan dan workspace
  mobile/    shell Expo yang menggunakan web app melalui WebView
requirement/ PRD, aturan bisnis, alur, desain data/API, rencana, dan catatan review
```

## Menjalankan di komputer lokal

### Prasyarat

- Bun **1.4.4** (versi yang digunakan CI dan lockfile).
- Docker Compose untuk PostgreSQL lokal. Instalasi PostgreSQL yang tersedia secara lokal juga dapat digunakan.
- Untuk mobile: Expo Go dan perangkat/emulator Android atau iOS.

### API dan web

Dari direktori root repository:

```bash
cp .env.example .env
bun install
docker compose up -d db
bun run db:migrate
bun run db:seed
```

Jalankan API dan web di terminal terpisah:

```bash
bun run dev:api
bun run dev:web
```

Buka web di <http://localhost:5173>. API lokal berjalan di port `4000`; Vite meneruskan request `/api` ke API tersebut. Compose memublikasikan web di <http://localhost:8080>, menjalankan migrasi otomatis, dan memakai volume untuk database serta berkas lokal.

Untuk menjalankan seluruh stack melalui Compose:

```bash
docker compose up --build -d
```

Seed contoh secara eksplisit bila diperlukan:

```bash
docker compose exec api bun apps/api/src/interfaces/cli/seed.ts
```

Data seed hanya untuk development. Jangan menjalankan seed atau memakai resep/data pasien nyata di production.

### Akun internal

Pendaftaran publik hanya membuat akun pelanggan. Sebelum membuat akun admin, CS, finance, apoteker, atau staf apotek, isi `MFA_ENCRYPTION_KEY` dengan secret acak 32 byte. Contoh pembangkitan:

```bash
openssl rand -hex 32
```

Lalu gunakan CLI interaktif:

```bash
bun run provision:user -- "Nama Petugas" petugas@example.test admin
```

Role `pharmacist` dan `pharmacy_staff` juga memerlukan UUID apotek yang sudah ada sebagai argumen terakhir. CLI meminta kata sandi awal dan menampilkan secret TOTP serta kode pemulihan satu kali; simpan dengan aman.

## Aplikasi mobile

Mobile memakai halaman web melalui WebView. Ikuti panduan [apps/mobile/README.md](apps/mobile/README.md). Secara ringkas:

1. Salin `apps/mobile/.env.example` ke `apps/mobile/.env` dan atur `EXPO_PUBLIC_WEB_URL` ke alamat web yang bisa dijangkau perangkat.
2. Pastikan `WEB_ORIGINS` di `.env` root memuat origin yang sama agar API menerima request dari web di perangkat.
3. Jalankan `bun run dev:api`, `bun run dev:web`, lalu `bun run dev:mobile`.

Gunakan `http://10.0.2.2:5173` dari Android Emulator, `http://localhost:5173` dari iOS Simulator, atau alamat IP LAN komputer untuk perangkat fisik. Untuk penggunaan terpasang, arahkan ke origin HTTPS aplikasi yang dideploy.

## Konfigurasi integrasi

Salin `.env.example` ke `.env`. Secret API eksternal harus tetap di server; jangan menaruhnya di web atau variabel `EXPO_PUBLIC_*`.

### Email

Isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, dan `EMAIL_FROM` untuk mengirim email verifikasi dan reset kata sandi. Port 465 biasanya memakai `SMTP_SECURE=true`; port 587 biasanya memakai STARTTLS (`false`). Pastikan domain pengirim diizinkan oleh mail host serta SPF/DKIM dikonfigurasi. Link/token tidak dikembalikan dalam respons production; di development link dapat dipakai untuk pengujian. SMS belum tersedia.

### Tarif dan pemenuhan kurir

- Isi `RAJAONGKIR_API_KEY` untuk pencarian tujuan dan perhitungan tarif. Kurir yang dapat dipilih buyer dikelola melalui tabel `rajaongkir_couriers`; layanan yang muncul bergantung pada rute dan hasil RajaOngkir.
- Isi `KOMERCE_DELIVERY_API_KEY` untuk produk **Shipping Delivery**. API key ini terpisah dari key RajaOngkir. Gunakan base URL sandbox di `.env.example` untuk UAT; ganti ke host production setelah akun dan persetujuan provider tersedia.
- Atur asal apotek, kontak pengirim, serta berat dan dimensi produk sebelum menguji booking dan label. Booking/pickup dapat menimbulkan biaya pada akun Komerce.
- Buat secret webhook dengan `openssl rand -hex 32`, isi `KOMERCE_DELIVERY_WEBHOOK_TOKEN`, dan daftarkan callback Komerce: `https://<host-api>/api/v1/webhooks/shipping/komerce?token=<secret>`. Worker polling tetap berjalan sebagai jalur sinkronisasi tambahan.
- Tarif checkout dan pemenuhan kurir adalah integrasi terpisah. Pastikan layanan yang dipilih di checkout tersedia di Shipping Delivery dan hasilnya diverifikasi melalui UAT sebelum pilot.

## Tes, build, dan CI

Jalankan pemeriksaan lokal dari root:

```bash
bun run test:api
bun run test:web
bun run test:mobile
bun run typecheck:api
bun run --cwd apps/mobile typecheck
bun run build:api
bun run build:web
bun run --cwd apps/mobile bundle:ci
```

API PostgreSQL integration test memerlukan database khusus dengan nama yang mengandung `test` (contoh `farmago_test`); test menolak database yang namanya tidak menandakan database uji. Terapkan migrasi sebelum menjalankan `bun run --cwd apps/api test:integration`. Jangan arahkan integration test ke database development yang berisi data penting atau ke production.

Workflow [FarmaGO CI](.github/workflows/api-ci.yml) berjalan pada push, pull request, dan manual dispatch. Workflow memeriksa dependency lockfile, typecheck API dan integration test, unit/architecture test API, test web dan mobile, build API/web, bundle Expo Android/iOS, migrasi PostgreSQL, serta integration test API. Laporan coverage diunggah sebagai artifact.

## Dokumen proyek

- [PRD — tujuan, pengguna, cakupan, dan kriteria keberhasilan](requirement/01-PRD.md)
- [Business Spec — kebijakan dan aturan transaksi](requirement/07-BSD-Business-Spec.md)
- [App Flow — alur pelanggan, apotek, dan admin/CS](requirement/03-AFD-App-Flow.md)
- [TRD — teknologi, konsistensi, keamanan, dan operasi](requirement/02-TRD.md)
- [Design Brief](requirement/04-DBD-Design-Brief.md) dan [Database Design](requirement/05-DBD-Database-Design.md)
- [Backend Schema — kontrak API](requirement/06-BSD-Backend-Schema.md)
- [Implementation Plan — UAT, pilot gate, dan risiko](requirement/08-IPD-Implementation-Plan.md)
- [Catatan review dan keputusan terbuka](requirement/09-Review-Report.md)
- [Status implementasi](requirement/progres.md)
- [Panduan arsitektur kode](ARCHITECTURE.md)
