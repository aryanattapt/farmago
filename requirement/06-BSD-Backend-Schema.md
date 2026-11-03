# Backend Schema Document — FarmaGO MVP

**Versi:** 0.4 · **Runtime:** Bun · **Format:** REST/JSON  
**Terkait:** [TRD](02-TRD.md) · [Database Design](05-DBD-Database-Design.md) · [Business Spec](07-BSD-Business-Spec.md)

## 1. Konvensi

- Base path: `/api/v1`; waktu ISO 8601 UTC; ID UUID; jumlah uang dikirim sebagai string desimal, contoh `"45000.00"`.
- Sesi dalam cookie aman; semua endpoint nonpublik memeriksa sesi dan hak akses pada sumber daya.
- Endpoint transaksi menerima `Idempotency-Key` pada pembuatan pesanan, pembayaran, pengiriman dan refund. Reuse key dengan isi berbeda menghasilkan `409`.
- Respons sukses: `{ "data": ..., "meta": ... }`. Kesalahan: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Jangan tampilkan rahasia atau isi resep dalam pesan error.
- Status HTTP: `400` input salah, `401` belum login, `403` tidak berwenang, `404` sumber tidak ditemukan, `409` konflik status/stok, `422` aturan bisnis gagal, `429` terlalu banyak permintaan, `500/503` gangguan server/mitra.

## 2. Model API ringkas

| Model | Field utama |
|---|---|
| Product | `id`, `sku`, `name`, `description`, `sellUnit`, `requiresPrescription`, `indicativePrice` |
| Order | `id`, `customerId`, `pharmacyId`, `status`, `fulfillmentMethod`, `items`, `totals`, `expiresAt` |
| OrderItem | `id`, `productId`, `name`, `requiresPrescription`, `quantity`, `unitPrice`, `lineTotal` |
| Prescription | `id`, `orderId`, `status`, `uploadedAt`; akses file melalui endpoint terotorisasi |
| Payment | `id`, `orderId`, `amount`, `status`, `expiresAt`, `paymentInstructions` |
| Shipment | `orderId`, `method`, `status`, `trackingNumber?` |
| Refund | `id`, `paymentId`, `amount`, `status`, `reason` |

Status pesanan: `awaiting_prescription`, `awaiting_payment`, `paid`, `processing`, `ready`, `in_delivery`, `completed`, `cancelled`, `expired`. Status resep: `pending`, `clarification`, `approved`, `rejected`; pembayaran: `creating`, `pending`, `succeeded`, `failed`, `expired`, `late`; refund: `requested`, `processing`, `succeeded`, `failed`.

## 3. Endpoint

| Metode dan path | Peran | Kegunaan |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | Publik/sesi | Registrasi dan sesi. |
| `POST /auth/contact-verification`, `POST /auth/password-reset` | Publik | Verifikasi kontak dan pemulihan akses dengan token terbatas. |
| `GET /products?query=&category=&cursor=` | Publik | Cari produk aktif; pagination berdasarkan cursor. |
| `GET /products/{id}` | Publik | Detail produk aktif. |
| `GET /addresses`, `POST /addresses`, `PATCH /addresses/{id}` | Pelanggan | Kelola alamat milik sendiri. |
| `POST /checkout/quote` | Pelanggan | Validasi item, metode, dan alamat jika pengiriman; kembalikan `quoteId`, masa berlaku, apotek, opsi dan rincian biaya. Pickup tidak memerlukan alamat dan ongkir nol. Quote belum menjamin stok. |
| `POST /orders` | Pelanggan | Terima `quoteId` yang telah disetujui; validasi ulang quote dan buat pesanan serta reservasi atomik hanya bila komponen harga tidak berubah. |
| `GET /orders`, `GET /orders/{id}` | Pemilik/staf berwenang | Riwayat dan detail sesuai peran. |
| `POST /orders/{id}/prescriptions` | Pemilik | Unggah berkas privat sebagai `multipart/form-data`. |
| `GET /prescriptions/{id}/file` | Pemilik/apoteker ditugaskan | Akses file terotorisasi dan diaudit. |
| `POST /prescriptions/{id}/reviews` | Apoteker ditugaskan | Catat keputusan, daftar `orderItemIds` yang ditelaah, alasan, dan permintaan klarifikasi. Item harus berasal dari pesanan yang sama dengan resep. |
| `GET /orders/{id}/prescription-messages`, `POST /orders/{id}/prescription-messages` | Pemilik/apoteker ditugaskan | Baca atau kirim klarifikasi dan lampiran privat; respons pelanggan tidak otomatis menyetujui resep. |
| `POST /orders/{id}/payments` | Pemilik | Mulai pembuatan tagihan saat resep dan reservasi valid; status awal `creating`, lalu `pending` jika penyedia mengonfirmasi tagihan. |
| `POST /webhooks/payment/{provider}` | Penyedia terverifikasi | Terima event, verifikasi, deduplikasi, dan proses. |
| `POST /orders/{id}/fulfillment` | Petugas apotek sesuai kewenangan | Perintah `start_processing`, `mark_ready`, `handover_to_courier`, `confirm_pickup`; syarat tiap perintah ada pada bagian 7. |
| `POST /orders/{id}/fulfillment-checks` | Petugas/apoteker sesuai kewenangan | Catat pemeriksaan akhir dan lot/kedaluwarsa sebelum `ready`; pesanan resep wajib diperiksa apoteker. |
| `POST /orders/{id}/shipment-bookings` | Petugas apotek ditugaskan | Mulai booking kurir idempotent; hanya untuk pengiriman dan pesanan `ready`, hasil tidak pasti tidak boleh membuat booking kedua. |
| `POST /webhooks/shipping/{provider}` | Penyedia terverifikasi | Peta status kurir ke pemenuhan; bukti penerimaan valid dapat menyelesaikan pesanan, tanpa mempercayai input pelanggan. |
| `POST /orders/{id}/cancellation-requests` | Pemilik/CS | Ajukan pembatalan sebelum serah-terima; keputusan sesuai status dan kebijakan. |
| `GET/POST /orders/{id}/return-refund-requests` | Pemilik | Lihat kelayakan/status; kirim alasan, bank, rekening, serta video MP4/WebM untuk pesanan kurir dalam 72 jam setelah diterima. |
| `GET /pharmacy/return-refund-requests` | Apoteker/staf apotek ditugaskan | Lihat pengajuan beserta rekening dan bukti hanya untuk apotek penugasannya. |
| `POST /return-refund-requests/{id}/decision` | Apoteker/staf apotek ditugaskan | Setujui nominal atau tolak dengan alasan; persetujuan membuat refund manual dengan tenggat 7 hari. |
| `POST /return-refund-requests/{id}/manual-refund` | Apoteker/staf apotek ditugaskan | Catat referensi transfer; selesaikan pengajuan satu kali tanpa mengubah status pesanan. |
| `GET /return-refund-requests/{id}/evidence` | Pemilik/apotek ditugaskan | Akses privat ke video unboxing. |
| `POST /cancellation-requests/{id}/decision` | CS/admin berwenang | Setujui atau tolak pembatalan dengan alasan; lakukan pelepasan stok dan buat tugas refund jika berlaku. |
| `POST /orders/{id}/support-cases`, `GET /orders/{id}/support-cases` | Pemilik/CS sesuai izin | Catat dan pantau kendala; konten resep tidak tampil ke CS tanpa hak akses. |
| `PATCH /support-cases/{id}` | CS/finance/apoteker sesuai jenis kasus | Tetapkan petugas, catat penanganan dan tutup kasus; hold klinis hanya dilepas apoteker berwenang. |
| `POST /payments/{id}/refunds` | Finance/admin berwenang | Buat permintaan refund dan catat alasan. |
| `GET /admin/orders`, `PATCH /admin/products/{id}`, `PATCH /admin/pharmacies/{id}` | Admin/CS sesuai izin | Operasional dan pengelolaan master. |
| `POST /admin/products`, `POST /admin/pharmacies` | Admin berizin | Buat master produk/mitra, belum aktif sampai pemeriksaan onboarding selesai. |
| `GET /pharmacy/inventory`, `POST /pharmacy/inventory-adjustments` | Petugas apotek ditugaskan | Lihat alokasi daring; koreksi beralasan dan beraudit, tidak boleh menimpa jumlah reservasi aktif. |
| `PATCH /pharmacies/{id}/service-hours` | Admin/apotek dengan izin pengaturan | Kelola jam layanan dan pengecualian; tidak mengubah status pesanan terbayar otomatis. |

## 4. Contoh kontrak pesanan

`POST /orders` dengan header `Idempotency-Key: <uuid>`:

```json
{
  "quoteId": "47fef920-3299-482b-ab4b-a62315810321"
}
```

Respons `201` ilustratif:

```json
{
  "data": {
    "id": "f2e6f8c4-c74b-435a-87bb-c2849a0f6224",
    "status": "awaiting_prescription",
    "expiresAt": "2026-10-28T04:30:00Z",
    "totals": { "subtotal": "45000.00", "discount": "0.00", "shippingFee": "10000.00", "serviceFee": "0.00", "total": "55000.00" }
  }
}
```

Server menghitung seluruh harga; tidak menerima harga dari klien. Sebelum commit, server memvalidasi pemilik dan masa berlaku quote, apotek, alamat, layanan, stok dan jumlah. Jika harga atau ongkir berubah, respons `409` dengan kode `QUOTE_CHANGED`, tanpa pesanan; klien meminta quote baru dan persetujuan pelanggan. Jika stok tidak tersedia, respons `409` dengan kode `STOCK_UNAVAILABLE`, tanpa reservasi parsial.

## 5. Aturan transisi dan kejadian

| Dari | Ke | Syarat |
|---|---|---|
| Pembuatan | `awaiting_prescription` | Ada item wajib resep; reservasi berhasil. |
| Pembuatan | `awaiting_payment` | Tidak ada item wajib resep; reservasi berhasil. |
| `awaiting_prescription` | `awaiting_payment` | Semua item wajib resep disetujui apoteker dan reservasi belum habis. |
| `awaiting_payment` | `paid` | Pembayaran terverifikasi, waktu bayar penyedia tidak melewati batas, status aktif, dan waktu server masih sebelum batas reservasi; reservasi terus dijaga. |
| `paid` | `processing` | Apotek berwenang menerima dan memproses. |
| `processing` | `ready` | Penyiapan dan konsumsi stok dicatat. |
| `ready` | `in_delivery` atau `completed` | Serah terima kurir atau pengambilan pelanggan. |
| `in_delivery` | `completed` | Bukti/status diterima dari kurir atau prosedur operasional. |
| Status sebelum pembayaran | `expired`/`cancelled` | Batas waktu habis atau pembatalan sah; reservasi dilepas. |
| `paid`, `processing`, `ready` | `cancelled` | Keputusan sah sebelum serah terima, tidak ada booking kurir aktif/tidak pasti, dan dicatat dengan audit. Refund ditangani terpisah. |

Job kedaluwarsa dan konfirmasi pembayaran mengunci pesanan yang sama. Jika waktu server sudah melewati batas atau status sudah `expired`/`cancelled`, pembayaran yang kemudian terverifikasi dicatat `late` untuk rekonsiliasi dan refund; bahkan ketika waktu bayar pada penyedia sebelum batas waktu atau job belum berjalan. Pelanggan tidak boleh dituduh terlambat hanya karena konfirmasi penyedia tertunda. Refund dapat dilakukan terhadap dana `late` yang benar-benar diterima. Jika waktu pembayaran penyedia tidak tersedia atau tidak dapat diverifikasi, jangan otomatis tandai `paid`; buka kasus rekonsiliasi.

Saat membuat tagihan, simpan `merchant_reference` unik dan status `creating` sebelum memanggil penyedia. Respons sukses mengubahnya menjadi `pending`; time-out tidak otomatis gagal. Worker mencari hasil pada penyedia atau mencoba kembali dengan referensi/idempotensi yang sama. `creating` dan `pending` sama-sama mencegah pembuatan tagihan kedua.

Untuk setiap item wajib resep, keputusan terbaru pada `review_items` untuk `document_revision` terkini menentukan status item berdasarkan `review_sequence` server. Review membawa `expectedReviewVersion`; perubahan bersamaan menghasilkan `409 REVIEW_CONFLICT`. Upload dokumen baru menaikkan revisi dokumen dan meniadakan efektivitas persetujuan sebelumnya. `clarification` menahan tagihan; jawaban pelanggan tidak mengubah keputusan. `rejected` membatalkan pesanan sesuai SOP. Pesanan beralih ke `awaiting_payment` hanya ketika semua item wajib resep memiliki keputusan terbaru `approved` untuk jumlah penuh dan reservasi masih berlaku. Upload/review baru setelah tagihan dibuat ditolak dengan `409 REVIEW_LOCKED`; koreksi melalui kasus bantuan farmasi. Riwayat tidak dihapus.

Kejadian internal contoh `order.created`, `prescription.reviewed`, `payment.confirmed`, `order.expired`, dan `refund.updated` disimpan pada outbox bersama transaksi. Konsumen wajib idempotent. Tidak ada data resep dalam payload notifikasi atau integrasi kurir.

## 6. Validasi dan proteksi khusus

- Batasi ukuran dan tipe unggahan sesuai konfigurasi yang diuji; video unboxing menerima MP4/WebM hingga 25 MB. Simpan kunci objek privat dan cek akses pada setiap permintaan; jangan mengembalikan nomor rekening ke pembaca detail pesanan umum.
- Validasi signature webhook dan cocokkan nominal, mata uang, referensi, serta status transaksi ke penyedia; respons duplikat tidak membuat efek ulang.
- Setiap peninjauan resep harus berasal dari apoteker aktif yang ditugaskan ke apotek pesanan. Perubahan item memerlukan pesanan baru dan pemeriksaan ulang.
- Hanya satu tagihan aktif (`creating` atau `pending`) per pesanan; refund dan pemenuhan memakai kontrol konkurensi dan hak akses eksplisit.

## 7. Kontrak perintah dan invariant

| Perintah | Validasi minimum | Efek atomik |
|---|---|---|
| `mark_ready` | Pesanan `processing`, pembayaran diterima valid, semua item resep disetujui, tidak ada kasus klinis aktif yang membekukan pemenuhan, pemeriksaan akhir lulus dan lot relevan lengkap | Konsumsi reservasi, kurangi stok daring sekali, simpan status `ready` dan audit. |
| `handover_to_courier` | Metode delivery, status `ready`, booking terkonfirmasi, bukti serah terima tersedia, tidak ada pembatalan/hold | Status pesanan `in_delivery`, status kurir `in_transit`, petugas dan waktu serah terima tersimpan. |
| `confirm_pickup` | Metode pickup, status `ready`, identitas/kode pengambilan terverifikasi sesuai SOP, bukti tercatat, tidak ada hold | Pesanan `completed`, pemenuhan `picked_up`; pemanggilan ulang tidak menggandakan efek. |
| Keputusan pembatalan | Status hanya sebelum serah terima; jika booking kurir ada, pembatalan booking harus pasti terlebih dahulu | Pesanan `cancelled`; lepas reservasi jika belum dikonsumsi; pengembalian stok setelah `ready` tetap memerlukan pemeriksaan terpisah. |
| Permintaan refund | Dana diterima terverifikasi; jumlah kumulatif tidak melebihi `received_amount`. Pengajuan pascapenerimaan harus masuk dalam 72 jam, ditinjau apotek, dan transfer manual selesai maksimal 7 hari sesudah persetujuan. | Simpan alasan, rekening dan video privat, keputusan, nominal, tenggat, serta referensi transfer. Status pesanan tetap `completed`; stok tidak berubah. |

Penyedia pembayaran pilot harus mendukung satu settlement per tagihan, referensi unik, konfirmasi nominal/mata uang/waktu, serta idempotensi atau pencarian status. `payments.amount` adalah nilai tagihan yang diharapkan; `receivedAmount` adalah dana aktual terverifikasi. Jika berbeda nominal, mata uang tidak sesuai, ada dana tambahan, atau event bertentangan, buka kasus rekonsiliasi dan jangan tambah hak pemenuhan. Kuota refund berdasarkan dana aktual dan statusnya tidak diturunkan oleh event usang.

Refund time-out tetap `processing`; jangan melaporkan `failed` atau membebaskan kuota sebelum kegagalan definitif. Booking kurir memakai `shipment_attempts`; timeout tetap `creating`, sedangkan status logis shipment dapat `exception` jika perlu penanganan. Event dari percobaan booking lama tidak boleh mengubah percobaan aktif tanpa rekonsiliasi.

## 8. Matriks kewenangan minimum

| Tindakan | Customer | Pharmacy staff | Pharmacist | CS | Finance | Admin |
|---|---|---|---|---|---|---|
| Data pesanan | Milik sendiri | Apotek ditugaskan | Apotek ditugaskan | Data minimum | Data keuangan minimum | Sesuai izin operasional |
| Berkas/keputusan resep | Baca/unggah milik sendiri sesuai tahap | Tidak | Apotek ditugaskan | Tidak | Tidak | Tidak otomatis |
| Persetujuan akhir pesanan resep | Tidak | Tidak | Apotek ditugaskan | Tidak | Tidak | Tidak |
| Penyiapan dan serah terima | Tidak | Apotek ditugaskan | Apotek ditugaskan | Tidak | Tidak | Tidak otomatis |
| Keputusan pembatalan pascabayar | Tidak | Tidak | Rekomendasi klinis | Izin eksplisit | Tidak otomatis | Izin eksplisit |
| Eksekusi refund | Tidak | Tidak | Tidak | Mengajukan | Izin eksplisit | Izin eksplisit |
| Mengelola peran internal/katalog/mitra | Tidak | Tidak | Tidak otomatis | Tidak | Tidak | Izin eksplisit dan audit |

Peran internal dapat digabung hanya lewat penugasan resmi; nama peran admin tidak mengabaikan kontrol akses resep. Pelanggan tidak dapat mengirim `role` untuk memperoleh hak internal pada registrasi.
