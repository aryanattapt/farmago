# Progres Implementasi FarmaGO

**Pembaruan:** 3 November 2026  
**Status umum:** Implementasi awal tersedia; belum siap untuk pilot atau produksi.

Dokumen ini mencatat kondisi kode saat ini. Status fitur tidak berarti fitur sudah melewati UAT atau validasi operasional.

## Sudah dikerjakan

- Fondasi proyek React + Vite, API Bun, skema PostgreSQL, Docker Compose, contoh konfigurasi lingkungan, dan panduan menjalankan lokal.
- Katalog produk, pencarian dan kategori, keranjang, akun pelanggan, sesi, alamat, checkout ambil di apotek, riwayat dan detail pesanan.
- Quote menyimpan snapshot item dan harga. API memeriksa ulang harga dan stok saat pesanan dibuat, membuat reservasi stok dalam transaksi, dan mendukung kunci idempotensi.
- Unggah resep privat pada penyimpanan lokal, antrean peninjauan apoteker, persetujuan/penolakan, permintaan klarifikasi, dan balasan pelanggan.
- Panel apotek untuk antrean, koreksi alokasi stok daring, penyiapan dan pemeriksaan akhir, serta konfirmasi pengambilan dengan kode dan bukti.
- Pencatatan lot dan tanggal kedaluwarsa untuk produk yang memerlukannya. Jumlah lot harus sesuai pesanan; lot kedaluwarsa ditolak. Pemeriksaan gagal membuka kasus operasional untuk CS.
- Panel admin/operasional untuk katalog, stok dan harga, onboarding/status apotek, pesanan, permintaan pembatalan, dan kasus bantuan.
- Sesi cookie HttpOnly, proteksi CSRF, otorisasi berbasis peran dan penugasan apotek, MFA TOTP untuk akun internal, audit, serta pembatasan jenis dan ukuran unggahan resep.
- Batas ukuran seluruh body request API mengikuti batas unggahan resep dan diterapkan sebelum parsing.
- Suite integration API berbasis PostgreSQL ditambahkan untuk reservasi/idempotensi stok, race pada stok terakhir, perubahan harga quote, otorisasi dan konkurensi review resep, serta pemenuhan pickup; CI menyiapkan database khusus dan menjalankan migrasi.
- Bucket rate limit yang kedaluwarsa dibersihkan berkala agar memori API tidak terus tumbuh.
- Temuan review awal diperbaiki: klasifikasi dan aktivasi katalog dibatasi ke apoteker; order mengunci status apotek saat dibuat; referensi bukti pickup tersimpan lewat migrasi; file resep dibersihkan jika transaksi gagal.
- Registrasi dan verifikasi kontak berjalan dalam transaksi; email verifikasi pendaftaran serta reset kata sandi production dikirim lewat SMTP. Login membatasi kata sandi maksimum 128 karakter.
- Checkout menampilkan daftar apotek yang memenuhi stok/alamat agar buyer memilih apotek sebelum rincian quote dibuat.
- Detail order menampilkan status dan timeline AWB Komerce; worker API menyinkronkan maksimal 25 resi aktif setiap 10 menit. Status kurir dipetakan ke siklus pesanan, callback Komerce memakai token dan aman terhadap pengiriman ulang, serta kendala kurir membuka kasus bantuan.
- Validasi jam layanan menolak jam, tanggal, timezone, dan jadwal ganda yang tidak valid; seed menolak environment production.
- Alur alamat pengiriman baru memakai alamat hasil simpan; panel katalog apoteker menampilkan kontrol buat dan aktivasi produk.
- README menjelaskan cara menjalankan aplikasi dan batas kesiapan integrasi.

## Status kebutuhan PRD

| Kebutuhan | Status | Catatan |
|---|---|---|
| PR-01 Akun dan sesi | Sebagian | Email verifikasi pendaftaran dan reset kata sandi production dikirim lewat SMTP; pengiriman ulang verifikasi tersedia. SMS belum terhubung sehingga pendaftaran dengan nomor telepon saja dinonaktifkan di production. |
| PR-02 Alamat dan pengambilan | Sebagian | Alamat, pickup, alamat tujuan RajaOngkir, quote pengiriman, dan pilihan kurir buyer tersedia; UAT Komerce untuk pemenuhan produksi masih diperlukan. |
| PR-03 Katalog | Dikerjakan | Katalog, pencarian, kategori, harga indikatif, dan penanda resep tersedia. |
| PR-04 Keranjang dan pemeriksaan ulang | Dikerjakan | Harga/stok diperiksa kembali; perubahan quote memerlukan persetujuan ulang. |
| PR-05 Pemilihan apotek | Dikerjakan | Checkout menampilkan apotek yang memenuhi stok dan alamat; buyer memilih apotek sebelum quote. Ketersediaan tetap diperiksa saat quote dan pesanan dibuat. |
| PR-06 Pesanan dan stok | Dikerjakan | Reservasi stok atomik, pembatasan stok, kedaluwarsa reservasi belum dibayar, dan idempotensi tersedia. |
| PR-07 Resep | Sebagian | Unggah, klarifikasi dan keputusan apoteker tersedia; SOP keaslian, pasien, resep elektronik/asli dan penggunaan ulang belum disahkan. |
| PR-08 Pembayaran | Belum selesai | Adapter pembayaran dan webhook belum dipilih/dipasang; tagihan mengembalikan `503`. |
| PR-09 Pemenuhan | Sebagian | Pemeriksaan, lot, booking/pickup, label, konfirmasi serah-terima dengan referensi bukti, status `in_delivery`, dan kasus saat kurir terkendala tersedia; konfigurasi serta UAT Komerce sandbox/production masih diperlukan. |
| PR-10 Pelacakan | Sebagian | Polling dan webhook Komerce mengubah status pesanan (`in_delivery`/`completed`), menyimpan timeline, dan menghindari transisi ulang; webhook memerlukan token callback. Konfigurasi endpoint dan UAT provider sandbox/production masih diperlukan. |
| PR-11 Pembatalan dan refund | Sebagian | Permintaan dan keputusan pembatalan tersedia; refund ke penyedia belum terhubung dan kebijakan final belum disetujui. |
| PR-12 Admin dan audit | Sebagian | Alur admin dan pencatatan tindakan tersedia; validasi peran, audit dan UAT masih perlu dilakukan. |

## Belum dikerjakan atau masih menunggu keputusan

- Pilih serta integrasikan penyedia pembayaran, webhook pembayaran, rekonsiliasi, dan refund; konfigurasi URL webhook pengiriman dengan token `KOMERCE_DELIVERY_WEBHOOK_TOKEN`; validasi koneksi tarif/booking/pickup, label, tracking, status serah-terima dan kasus kurir dengan akun Komerce sandbox dan production.
- Hubungkan penyedia SMS untuk verifikasi nomor telepon dan pemulihan akun; validasi deliverability SMTP di production.
- Pindahkan berkas resep ke object storage privat dan tambahkan pemindaian malware.
- Sahkan kebijakan refund, ongkir/biaya, retensi, izin, peran pemrosesan data, SOP resep, kategori produk, dan prosedur pilot.
- Tentukan apotek/wilayah pilot dan buktikan pemisahan stok daring dari stok kasir atau siapkan integrasi POS.
- Siapkan backup dan pemulihan, monitoring/alert, pelatihan operasional, serta runbook insiden.
- Jalankan UAT 38 skenario di IPD, uji keamanan/unggahan, uji beban, dan verifikasi pemulihan. Suite integration PostgreSQL mencakup subset alur API dan bukan pengganti UAT.

## Keputusan terbuka pada `09-Review-Report.md`

- **D-01–D-03:** model stok, waktu reservasi/jam layanan, serta kategori dan SOP farmasi.
- **D-04–D-05:** penyedia pembayaran/kurir dan kebijakan refund/biaya.
- **D-06–D-07:** izin, privasi/retensi, wilayah pilot, anggaran, tim, SLA dan profil beban.

## Pemeriksaan yang sudah dilakukan

- Bundel API dan web berhasil dibuat dengan Bun setelah perbaikan review.
- Pemeriksaan bundel tidak menjalankan migrasi pada PostgreSQL dan bukan bukti lulus UAT.

- GitHub Actions run #17 lulus: API unit/architecture 68/68, web 38/38, PostgreSQL integration 5/5; migrasi 001–002 diterapkan dan build API/web berhasil. [Log run](https://github.com/aryanattapt/farmago/actions/runs/41378630523).
