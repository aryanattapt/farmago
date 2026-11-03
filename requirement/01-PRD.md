# Product Requirements Document — FarmaGO MVP

**Versi:** 0.4 (draf ditinjau)  
**Tanggal:** 28 Oktober 2026  
**Status:** untuk validasi product owner, apoteker, operasional, dan legal  
**Acuan teknis:** [TRD](02-TRD.md) · [App Flow](03-AFD-App-Flow.md) · [Business Spec](07-BSD-Business-Spec.md)

## 1. Ringkasan

FarmaGO adalah platform pembelian produk kesehatan dan penebusan resep yang menghubungkan pelanggan dengan apotek mitra. MVP mencakup aplikasi pelanggan, panel apotek, dan panel administrator. Setiap pesanan dipenuhi oleh satu apotek yang memenuhi wilayah layanan dan ketersediaan seluruh item.

Rancangan ini terinspirasi oleh fungsi publik K24Klik, bukan spesifikasi internal K24Klik atau afiliasi dengannya. Referensi: [FAQ K24Klik](https://www.k24klik.com/faq/index) dan [panduan pembelian](https://www.k24klik.com/cara-membeli-obat-online).

## 2. Masalah dan tujuan

Pelanggan perlu mengetahui produk yang tersedia dan status penebusan resep; apotek memerlukan antrean kerja, stok, dan pencatatan keputusan; pengelola memerlukan visibilitas transaksi dan penyelesaian kendala.

Tujuan MVP: membuktikan bahwa pelanggan dapat menyelesaikan pembelian dengan aman, apotek dapat memenuhi pesanan, dan tim operasional dapat menangani pembayaran serta keluhan pada wilayah pilot.

## 3. Pengguna dan hasil yang diharapkan

| Pengguna | Hasil yang diharapkan |
|---|---|
| Pelanggan | Menemukan produk, mengunggah resep bila diperlukan, membayar, dan memantau pesanan. |
| Apoteker | Memeriksa resep dan mencatat keputusan berdasarkan kewenangan profesional. |
| Staf apotek | Mengelola ketersediaan dan menyiapkan serta menyerahkan pesanan. |
| Admin/CS | Mengelola mitra dan katalog, meninjau kendala, serta memproses refund sesuai kewenangan. |

## 4. Lingkup dan prioritas

| ID | Kebutuhan MVP | Kriteria penerimaan |
|---|---|---|
| PR-01 | Akun dan sesi | Pengguna dapat mendaftar, masuk, keluar, dan memulihkan akses. Identitas kontak diverifikasi sebelum transaksi. |
| PR-02 | Alamat dan pengambilan | Untuk pengiriman, pelanggan dapat menyimpan dan memilih alamat dalam wilayah layanan. Untuk pengambilan, pelanggan memilih apotek tanpa wajib memasukkan alamat pengiriman. |
| PR-03 | Katalog | Pelanggan mencari produk, membuka detail, dan melihat indikasi wajib resep serta harga indikatif. |
| PR-04 | Keranjang | Pelanggan menambah, mengubah jumlah, dan menghapus produk; sistem memeriksa ulang harga dan ketersediaan sebelum pesanan. Jika total berubah, pelanggan harus melihat dan menyetujui rincian terbaru sebelum pesanan dibuat. |
| PR-05 | Pemilihan apotek | Sistem menawarkan apotek aktif yang dapat memenuhi seluruh item berdasarkan stok tersedia; untuk pengiriman, apotek juga harus melayani alamat. Setiap pesanan menggunakan satu apotek. |
| PR-06 | Pesanan dan stok | Saat pesanan dibuat sistem membuat reservasi stok atomik; kegagalan reservasi menghasilkan pesan yang dapat ditindaklanjuti. |
| PR-07 | Resep | Pelanggan mengunggah resep dan menjawab klarifikasi; apoteker berwenang memeriksa, meminta klarifikasi, menyetujui, atau menolak setiap item terkait. Semua item wajib resep harus disetujui sebelum tagihan dibuat atau pesanan dipenuhi. |
| PR-08 | Pembayaran | Tagihan tersedia setelah persyaratan resep terpenuhi dan stok masih valid; pembayaran dikonfirmasi oleh penyedia. |
| PR-09 | Pemenuhan | Apotek menerima dan menyiapkan pesanan, mencatat pemeriksaan kesesuaian produk/jumlah, kondisi dan kedaluwarsa, lalu menyerahkannya untuk pengiriman atau pengambilan dengan bukti serah terima. Untuk pesanan resep, pemeriksaan akhir memerlukan apoteker berwenang. |
| PR-10 | Pelacakan | Pelanggan dapat melihat riwayat serta status pesanan, pembayaran, dan pengiriman. |
| PR-11 | Pembatalan dan refund | Sebelum serah terima, pelanggan dapat meminta pembatalan untuk diputuskan petugas berwenang. Setelah barang diterima, pelanggan dapat mengajukan refund lewat form dalam 3 hari, dengan alasan, bank dan rekening penerima, serta video unboxing untuk pesanan kurir. Apotek memutuskan pengajuan; refund manual ditransfer maksimal 7 hari setelah disetujui, tidak melebihi dana diterima, dan tidak mengubah status pesanan selesai atau stok otomatis. |
| PR-12 | Admin dan audit | Admin mengelola katalog dan mitra; tindakan penting tercatat dengan pelaku dan waktu. |

Di luar MVP: konsultasi dokter, penerbitan e-resep, rekomendasi obat otomatis, pesanan multi-apotek, asuransi/BPJS, loyalitas, langganan, dan janji waktu pengiriman tertentu. Integrasi nasional dijadikan dependensi kepatuhan yang harus ditelaah, bukan diasumsikan tidak diperlukan.

## 5. Ukuran keberhasilan pilot

Angka berikut adalah target awal untuk divalidasi setelah baseline tersedia, bukan klaim kemampuan produk.

| Metrik | Definisi | Target usulan |
|---|---|---|
| Konversi checkout | Pesanan dibuat / sesi checkout dimulai | ≥ 60% |
| Pemenuhan | Pesanan yang selesai dalam 30 hari / pesanan yang terbayar dalam cohort yang sama; hanya cohort yang telah berusia 30 hari dihitung | ≥ 90% |
| Pembatalan karena stok | Pesanan terbayar dibatalkan karena stok / seluruh pesanan terbayar | < 5% |
| Tinjauan resep | Persentase resep lengkap yang mendapat keputusan awal dalam 15 menit selama jam layanan | Target awal ≥ 90%; perlu divalidasi pada pilot |
| Keselamatan resep | Produk wajib resep diserahkan tanpa persetujuan yang valid | 0 |

## 6. Persyaratan kualitas

- Ketersediaan target pilot 99,5% per bulan, tidak termasuk pemeliharaan terjadwal.
- P95 API katalog ≤ 2 detik pada beban pilot yang akan ditetapkan; target bukan hasil pengujian.
- Data kesehatan bersifat sensitif: akses berdasarkan peran, penugasan dan kebutuhan kerja; koneksi dan penyimpanan dienkripsi.
- Tindakan transaksi tahan terhadap permintaan dan webhook berulang; perubahan stok konsisten.
- Desain responsif untuk layar mobile serta pesan kesalahan jelas dan dapat ditindaklanjuti.

## 7. Asumsi dan keputusan terbuka

- Wilayah pilot, jam layanan, jumlah apotek, volume, penyedia pembayaran dan kurir belum ditentukan.
- Saluran MVP adalah web responsif React; aplikasi native belum termasuk.
- Harga final ditetapkan saat checkout; pembatasan kategori dan SOP resep ditentukan apoteker dan legal.
- Masa reservasi sebelum pembayaran 30 menit adalah parameter awal, bukan janji bahwa pemeriksaan pasti selesai. Jam layanan resep dan waktu yang tersisa harus terlihat sebelum pesanan dibuat. Jika layanan resep tutup, pesanan yang membutuhkan resep tidak dapat dibuat; pelanggan dapat mencoba kembali ketika layanan tersedia. Jika reservasi habis, pelanggan membuat pesanan baru dengan pemeriksaan ulang. Setelah pembayaran diterima dan pesanan berstatus terbayar, reservasi tidak dilepas oleh job kedaluwarsa biasa dan tetap berlaku sampai pemenuhan atau pembatalan yang sah.
- Perizinan, tata kelola resep, integrasi sistem kesehatan nasional, retensi, dan kategori produk harus disahkan sebelum pilot.

## 8. Batas operasional MVP

- Stok yang dijanjikan platform adalah alokasi khusus kanal daring yang dipisahkan secara operasional dari stok penjualan langsung. Penjualan langsung tidak boleh mengambil alokasi daring. Bila apotek tidak dapat memenuhi pemisahan tersebut, integrasi POS dan prosedur reservasi lintas kanal menjadi prasyarat pilot apotek tersebut.
- Produk dijual dalam satuan jual SKU yang jelas (misalnya satu kotak atau satu botol). MVP tidak mendukung pecahan satuan, racikan, penggantian item atau pemenuhan sebagian. Kategori dengan kebutuhan rantai dingin atau penanganan khusus hanya boleh diaktifkan setelah kapabilitas mitra dan SOP divalidasi; default tidak aktif.
- Resep yang sama tidak otomatis memberi hak pembelian berulang. MVP tidak menyediakan repeat refill; pemeriksaan keaslian, pasien, jumlah, riwayat pemenuhan dan penanganan resep asli/elektronik berada pada SOP apoteker, dengan dukungan catatan pemenuhan sistem.
- Fitur promo belum termasuk MVP: `discount = 0`; biaya layanan default nol sampai nominal dan cara pengungkapannya disetujui bisnis. Kolom nilai tetap tersedia agar struktur transaksi tidak perlu diubah.
- Daftar keputusan dan status review paket ada di [Catatan review](09-Review-Report.md). Definisi dan invariant API berada pada Backend Schema; aturan bisnis berada pada Business Spec.
