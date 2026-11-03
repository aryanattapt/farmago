# Business Spec Document — FarmaGO MVP

**Versi:** 0.4 · **Status:** ditinjau; menunggu persetujuan bisnis, farmasi, dan legal  
**Terkait:** [PRD](01-PRD.md) · [App Flow](03-AFD-App-Flow.md) · [Implementation Plan](08-IPD-Implementation-Plan.md)

## 1. Model layanan

Platform menghubungkan pelanggan dengan apotek mitra aktif. Apotek menyiapkan dan menyerahkan produk sesuai kewenangan dan SOP; platform mengoordinasikan transaksi, pembayaran, status, serta layanan pelanggan. Penyedia pembayaran dan kurir adalah mitra terpisah. Model ini harus disesuaikan dengan izin dan perjanjian yang berlaku.

## 2. Aturan bisnis MVP

| ID | Aturan | Penanggung jawab keputusan |
|---|---|---|
| BR-01 | Hanya apotek aktif dan telah disetujui yang menerima pesanan. | Operasional/legal |
| BR-02 | Satu apotek memenuhi seluruh item; pemisahan pesanan belum didukung. Alamat pengiriman hanya wajib untuk metode pengiriman; pengambilan langsung tidak dikenai ongkir. | Product |
| BR-03 | Kategori, label wajib resep, dan produk yang dikecualikan disetujui penanggung jawab farmasi. Narkotika dan psikotropika dikecualikan dari MVP sebagai kebijakan produk. | Farmasi/legal |
| BR-04 | Produk wajib resep hanya dipenuhi setelah apoteker berwenang menyetujui resep untuk item terkait. | Apoteker |
| BR-05 | Tidak ada penggantian produk otomatis. Perubahan item mengharuskan pesanan baru dan, bila relevan, pemeriksaan resep baru. | Farmasi/product |
| BR-06 | Harga, ongkir, diskon, biaya, dan total ditampilkan sebelum konfirmasi. Perubahan harga atau ongkir sebelum pembuatan pesanan memerlukan persetujuan ulang pelanggan. | Bisnis |
| BR-07 | Stok direservasi selama 30 menit sebelum pembayaran sebagai asumsi awal; waktu dapat dikonfigurasi. Setelah kedaluwarsa, pelanggan membuat pesanan baru. Untuk pesanan yang sudah terbayar, stok tetap dicadangkan sampai dipenuhi atau dibatalkan secara sah. | Operasional/product |
| BR-08 | Pesanan diproses setelah pembayaran terkonfirmasi dan persyaratan resep terpenuhi. | Operasional/farmasi |
| BR-09 | Jika stok tidak sesuai setelah pembayaran, penyiapan dihentikan dan CS menawarkan penyelesaian, termasuk refund sesuai keputusan dan kebijakan. | Apotek/CS |
| BR-10 | Pembatalan biasa hanya sebelum serah terima. Setelah kurir/pelanggan menerima barang, status pesanan tetap `completed`; pengajuan refund pascapenerimaan dicatat terpisah dan tidak mengembalikan stok otomatis. Booking kurir aktif/tidak pasti harus diselesaikan sebelum pembatalan pesanan. | CS/apotek |
| BR-11 | Kurir hanya menerima data minimum untuk pengiriman; resep tidak dibagikan kepada kurir. | Privasi/operasional |
| BR-12 | Keputusan resep, koreksi stok, pembatalan, dan refund memiliki pelaku, waktu, dan jejak audit. | Operasional |
| BR-13 | Pesanan yang memerlukan resep hanya dapat dibuat saat layanan pemeriksaan resep apotek buka. Jam layanan dan masa reservasi ditampilkan sebelum konfirmasi; waktu respons tidak dijanjikan tanpa kapasitas yang terbukti. | Farmasi/operasional |
| BR-14 | Stok daring adalah alokasi terpisah yang tidak dijual melalui kasir toko. Jika pemisahan tidak bisa dijamin, integrasi POS/reservasi lintas kanal wajib siap untuk apotek tersebut. | Apotek/operasional |
| BR-15 | Satu SKU mempunyai satu satuan jual utuh. Sebelum `ready`, produk, jumlah, kondisi, lot bila relevan dan kedaluwarsa diperiksa. Pesanan resep memerlukan pemeriksaan akhir apoteker. | Farmasi/apotek |
| BR-16 | Resep harus ditelaah untuk pasien dan jumlah yang sesuai; unggahan tidak otomatis sah untuk penggunaan berulang. Repeat refill, racikan, pemenuhan sebagian dan pecahan satuan tidak termasuk MVP. | Farmasi/product |
| BR-17 | Registrasi publik hanya memberi peran pelanggan. Admin/CS tidak otomatis memiliki akses berkas resep atau kewenangan keputusan klinis. | Product/keamanan |
| BR-18 | Form refund pascapenerimaan harus diajukan paling lambat 3 hari sejak barang diterima dan memuat alasan, bank, nama pemilik rekening, serta nomor rekening. Pesanan kurir wajib menyertakan video unboxing. Apotek memutuskan pengajuan dan melakukan transfer manual maksimal 7 hari setelah persetujuan. Refund dicatat terpisah, nominal kumulatif tidak melebihi dana diterima, dan akses rekening/video dibatasi ke pelanggan serta apotek yang ditugaskan. | Apotek/product/finance |

## 3. Perhitungan

```text
subtotal = jumlah seluruh (harga satuan × kuantitas)
total = subtotal - diskon + ongkos kirim + biaya layanan
```

Semua nilai ditetapkan server dan ditampilkan dalam rupiah. Fitur promo belum termasuk MVP sehingga diskon nol; biaya layanan default nol sampai kebijakannya disetujui. Nilai refund yang diminta, diproses, dan berhasil secara kumulatif tidak boleh melebihi dana yang benar-benar diterima, termasuk pembayaran yang masuk rekonsiliasi. Refund yang hasilnya belum pasti tetap menahan kuota. Komisi, biaya layanan final, dan cakupan refund ongkir belum diputuskan. Kebijakan awal menetapkan jendela pengajuan 3 hari sejak penerimaan dan transfer manual maksimal 7 hari setelah persetujuan; kelayakan produk, dasar nominal refund, serta persetujuan legal/farmasi tetap harus disahkan sebelum pilot.

## 4. SOP pengecualian

| Kondisi | Tindakan |
|---|---|
| Resep tidak terbaca | Apoteker meminta klarifikasi atau dokumen yang lebih jelas sebelum batas reservasi. |
| Layanan resep tutup | Tidak menerima pesanan yang memerlukan resep; tampilkan jam layanan berikutnya bila tersedia. Pelanggan dapat membuat pesanan produk lain dalam keranjang terpisah. |
| Resep ditolak | Apoteker mencatat alasan yang sesuai; pesanan dibatalkan dan reservasi dilepas. |
| Reservasi habis | Pesanan kedaluwarsa; pelanggan dapat membuat pesanan baru dengan pemeriksaan ulang. |
| Konfirmasi pembayaran diterima setelah pesanan berakhir | Jangan aktifkan pesanan kembali; prioritaskan rekonsiliasi dan penanganan dana, termasuk jika pelanggan telah membayar sebelum batas waktu. |
| Pembuatan tagihan tidak mendapat respons | Tahan pembuatan tagihan kedua; operasional memeriksa status pada penyedia menggunakan referensi yang sama. |
| Stok fisik tidak cocok | Hentikan penyiapan dan penjualan produk terkait; eskalasi ke CS, selesaikan dampak pada reservasi, lalu koreksi stok secara berwenang. |
| Pembatalan setelah stok dikeluarkan | Apotek memeriksa kondisi dan kelayakan produk; stok hanya dikembalikan melalui proses resmi bila SOP mengizinkan. |
| Kurir gagal | Catat kendala, koordinasikan opsi pengiriman berikutnya, dan beritahu pelanggan. |
| Keluhan produk / pengajuan refund setelah diterima | Pelanggan mengisi alasan, bank, nama pemilik rekening, dan nomor rekening dalam 3 hari sejak penerimaan. Pesanan kurir memerlukan video unboxing. Apotek menyetujui atau menolak dengan alasan; bila disetujui, transfer manual maksimal 7 hari sejak persetujuan dan dicatat dengan referensi. Status order tetap `completed`; stok tidak bertambah otomatis. |
| Status pembayaran/kurir datang tidak berurutan | Jangan mundurkan status dana atau pemenuhan yang sudah terverifikasi. Cocokkan referensi, tahap fisik dan bukti ke penyedia, lalu catat kasus jika konflik. |
| Refund time-out | Pertahankan status diproses dan kuota tertahan; cek penyedia dengan referensi sama sebelum retry atau gagal definitif. |
| Dokumen resep berubah | Sebelum tagihan: revisi baru meniadakan efektivitas persetujuan lama dan memerlukan review ulang. Sesudah tagihan: perubahan lewat endpoint biasa ditolak dan diarahkan ke apoteker melalui bantuan. |

## 5. Perizinan, privasi, dan ketentuan kesehatan

Data dan informasi kesehatan termasuk data pribadi yang bersifat spesifik menurut [UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022). [Permenkes No. 5 Tahun 2026 tentang Perbekalan Kesehatan](https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-5-tahun-2026) memuat pengaturan relevan untuk perbekalan kesehatan. Tautan sumber diperiksa kembali pada 28 Oktober 2026; pemeriksaan ini bukan telaah hukum menyeluruh. Tinjau juga ketentuan, izin, standar layanan farmasi, dan kewajiban integrasi sistem kesehatan yang berlaku untuk model usaha dan mitra yang benar-benar dipilih.

Sebelum pilot, legal dan penanggung jawab farmasi menyetujui model perizinan, cakupan produk, validitas dan penanganan resep, data sharing, retensi, respons insiden, dan SOP penyerahan. Dokumen ini belum merupakan pendapat hukum atau sertifikasi kepatuhan.

## 6. Keputusan terbuka

Wilayah dan jam layanan; daftar apotek pilot; cara sinkronisasi stok; pilihan payment gateway dan kurir; biaya dan komisi; masa refund; prosedur resep asli atau elektronik; persetujuan komunikasi; kebijakan retensi; serta kebutuhan integrasi wajib. Setiap keputusan harus dicatat oleh pemilik terkait sebelum rilis.

Keputusan ini ditata dalam register dengan pemilik dan tenggat di [Catatan review](09-Review-Report.md). Parameter 30 menit, pemisahan stok daring, pengecualian penanganan khusus, dan jam layanan merupakan asumsi rancangan yang perlu divalidasi dalam discovery; bukan fakta operasional K24Klik.
