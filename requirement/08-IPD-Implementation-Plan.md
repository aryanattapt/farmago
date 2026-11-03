# Implementation Plan Document — FarmaGO MVP

**Versi:** 0.4 · **Status:** estimasi awal ditinjau, belum menjadi komitmen jadwal  
**Terkait:** [PRD](01-PRD.md) · [TRD](02-TRD.md) · [Business Spec](07-BSD-Business-Spec.md)

## 1. Tujuan dan prasyarat

Membangun web responsif React JS dan backend Bun untuk pilot terbatas bersama apotek terpilih. Pilot hanya dimulai setelah kesiapan operasional, pengujian, izin dan persetujuan yang relevan selesai. Rencana memperkirakan 16 minggu dengan tim tersedia; pemilihan mitra dan proses izin dapat menjadi jalur kritis.

## 2. Jadwal usulan

| Minggu | Fokus | Hasil dan dependensi |
|---|---|---|
| 1–2 | Discovery, legal, farmasi, dan operasional | Wilayah pilot, peran, SOP, keputusan awal produk, pemetaan izin dan integrasi. |
| 3–4 | UX dan arsitektur | Wireframe/prototipe, desain API dan database, pilihan penyedia, rencana keamanan. |
| 5–7 | Fondasi dan katalog | Repo/CI, auth, pengguna, alamat, katalog, apotek dan stok. |
| 8–10 | Pesanan dan resep | Checkout, reservasi atomik, unggah resep, antrean dan keputusan apoteker. |
| 11–12 | Pembayaran dan pemenuhan | Integrasi gateway, webhook, kurir/pickup, refund, notifikasi. |
| 13–14 | Pengujian menyeluruh | Uji integrasi, transaksi bersamaan, keamanan, pemulihan, dan perbaikan. |
| 15 | UAT dan persiapan pilot | UAT pelanggan/apotek/CS, pelatihan, katalog dan data operasional. |
| 16 | Pilot terbatas | Peluncuran bertahap, pemantauan harian, evaluasi dan keputusan lanjut. |

Pekerjaan dapat tumpang tindih setelah dependensi siap; integrasi produksi dan legal harus dimulai sejak awal.

## 3. Tim dan tanggung jawab

| Peran | Tanggung jawab |
|---|---|
| Product owner / BA | Prioritas, keputusan lingkup, metrik dan penerimaan. |
| UI/UX designer | Alur, prototipe, aksesibilitas, handoff. |
| Frontend React developer | Web pelanggan, panel apotek, panel admin. |
| Backend Bun developer | API, transaksi, keamanan, integrasi dan worker. |
| QA | Skenario uji dan pelaksanaan UAT/tes regresi. |
| DevOps/security | Infrastruktur, CI, observabilitas, backup, keamanan. |
| Apoteker penanggung jawab | Persetujuan alur resep, produk dan SOP. |
| Legal/compliance | Perizinan, privasi, kontrak, dan pemetaan kewajiban integrasi. |
| Operasional/CS/finance | Kesiapan apotek, penanganan kendala dan refund. |

## 4. Backlog berurutan

1. Putuskan wilayah pilot, apotek, jam layanan, kategori produk, serta SOP dan persyaratan legal.
2. Siapkan repositori, CI, lingkungan terpisah, secret, observabilitas, dan data uji sintetis.
3. Implementasikan auth dan RBAC per apotek, alamat, katalog, dan stok.
4. Bangun quote, pesanan, snapshot harga, reservasi atomik, job kedaluwarsa, dan histori status.
5. Bangun penyimpanan resep privat, akses teraudit, antrean dan keputusan apoteker.
6. Integrasikan pembayaran, webhook idempotent, rekonsiliasi, refund dan notifikasi.
7. Bangun penyiapan, serah terima, pengiriman/pickup dan penanganan kendala.
8. Jalankan pengujian, pelatihan, uji pemulihan, UAT dan pilot terukur.

## 5. Uji penerimaan minimum

| ID | Skenario | Hasil lulus |
|---|---|---|
| UAT-01 | Pembelian tanpa resep | Pesanan berhasil dipesan, dibayar, dipenuhi, dan diselesaikan. |
| UAT-02 | Pembelian wajib resep | Tagihan tidak dibuat sebelum persetujuan; produk tidak diserahkan tanpa persetujuan valid. |
| UAT-03 | Resep ditolak atau butuh klarifikasi | Status dan alasan sesuai; pesanan tidak dipenuhi dan reservasi dilepas ketika dibatalkan. |
| UAT-04 | Dua pelanggan memesan stok terakhir | Hanya satu reservasi berhasil; tidak ada stok negatif. |
| UAT-05 | Webhook pembayaran berulang | Satu pembayaran dan satu efek bisnis tercatat. |
| UAT-06 | Pembayaran sesudah kedaluwarsa | Pesanan tetap kedaluwarsa; transaksi masuk rekonsiliasi/refund. |
| UAT-07 | Petugas apotek lain membuka resep | Akses ditolak dan percobaan tercatat. |
| UAT-08 | Kurir gagal atau stok fisik tidak cocok | Penyiapan/pengiriman berhenti dan kasus dapat ditangani CS. |
| UAT-09 | Refund parsial dan permintaan berulang | Tidak melebihi pembayaran dan tidak menggandakan refund. |
| UAT-10 | Pemulihan backup | Pemulihan berhasil dan waktu aktual dibandingkan dengan sasaran RPO/RTO. |
| UAT-11 | Job kedaluwarsa berjalan setelah pesanan terbayar | Reservasi pesanan terbayar tetap terjaga dan tidak dapat dijual dua kali. |
| UAT-12 | Webhook bersamaan dengan job kedaluwarsa | Hanya satu transisi menang; stok tidak dilepas jika pesanan menjadi terbayar; jika kedaluwarsa menang, dana masuk rekonsiliasi. |
| UAT-13 | Harga/ongkir berubah setelah quote | Sistem menolak pembuatan pesanan dan pelanggan harus menyetujui quote baru. |
| UAT-14 | Klarifikasi dijawab pelanggan | Apoteker dapat membaca jawaban; tagihan tetap tertahan sampai semua item wajib resep disetujui. |
| UAT-15 | Pembatalan setelah stok dikonsumsi | Stok tidak bertambah otomatis; pengembalian stok memerlukan pemeriksaan dan pencatatan berwenang. |
| UAT-16 | Pembayaran tercatat di penyedia sebelum batas waktu tetapi konfirmasi tiba setelah pelepasan stok | Pesanan tetap kedaluwarsa dan dana direkonsiliasi; pelanggan tidak dianggap bersalah atas keterlambatan konfirmasi. |
| UAT-17 | Pilih ambil di apotek tanpa alamat pengiriman | Quote dan pesanan dapat dibuat; ongkir nol, apotek dan metode pengambilan tersimpan dengan benar. |
| UAT-18 | Penyedia tagihan mengalami time-out setelah permintaan dikirim | Tagihan tetap `creating`, tidak ada tagihan kedua, dan status diperiksa dengan referensi yang sama. |
| UAT-19 | Salah satu dari beberapa item wajib resep belum disetujui atau butuh klarifikasi | Tagihan tidak dapat dibuat sebelum seluruh keputusan terbaru valid adalah `approved`. |
| UAT-20 | Resep dibutuhkan saat layanan apotek tutup | Pesanan tidak dibuat; pelanggan melihat informasi jam layanan yang tersedia. |
| UAT-21 | Dua permintaan memakai quote yang sama dengan kunci idempotensi berbeda | Paling banyak satu pesanan tercipta untuk quote tersebut. |
| UAT-22 | Waktu pembayaran tidak dapat diverifikasi | Pesanan tidak otomatis menjadi `paid`; transaksi dicatat untuk rekonsiliasi. |
| UAT-23 | Keputusan pembatalan bersamaan dengan serah terima | Hanya satu tindakan sah pada status terkunci; pesanan yang sudah diserahkan tidak menjadi `cancelled`. |
| UAT-24 | Refund time-out lalu diminta lagi | Kuota tetap tertahan dan penyedia diperiksa menggunakan referensi sama; tidak ada pengembalian dana ganda. |
| UAT-25 | Event pending/gagal tiba sesudah pembayaran berhasil | Status dana diterima tidak diturunkan dan pemenuhan tidak dipicu ulang. |
| UAT-26 | Nominal/mata uang berbeda atau dana tambahan | Pesanan tidak memperoleh hak pemenuhan tambahan; dana aktual tercatat dan kasus rekonsiliasi dibuka. |
| UAT-27 | Dokumen baru diunggah sebelum tagihan setelah ada persetujuan | Revisi bertambah dan persetujuan lama tidak cukup untuk membuat tagihan. |
| UAT-28 | Dua apoteker meninjau versi yang sama | Salah satu perubahan yang konflik ditolak dengan `REVIEW_CONFLICT`; urutan keputusan deterministik. |
| UAT-29 | Upload atau review dicoba setelah tagihan dibuat | Ditolak dengan `REVIEW_LOCKED`; koreksi diarahkan ke jalur bantuan farmasi. |
| UAT-30 | Staf/CS/admin tanpa peran farmasi membuka resep atau menyetujui pesanan resep | Akses/tindakan ditolak; registrasi publik juga tidak dapat memberi peran internal. |
| UAT-31 | Produk tidak sesuai satuan, lot/kedaluwarsa tidak lengkap, atau pemeriksaan gagal | Pesanan tidak dapat menjadi `ready`; stok/pemenuhan tidak dikonsumsi secara tidak sah. |
| UAT-32 | Booking kurir time-out atau event booking lama datang | Hasil diperiksa lebih dahulu; tidak ada booking ganda atau perubahan pemenuhan dari referensi yang salah. |
| UAT-33 | Pickup tanpa bukti/kode valid atau notifikasi gagal terkirim | Pickup tidak dapat diselesaikan tanpa bukti; notifikasi gagal tidak membatalkan transaksi yang valid. |
| UAT-34 | Kasir toko memakai stok daring atau alokasi tidak bisa dijamin | Apotek belum memenuhi gerbang pilot sampai pemisahan stok atau integrasi POS terbukti. |
| UAT-35 | Registrasi, verifikasi kontak, reset sandi dan login internal | Kontak belum terverifikasi tidak dapat bertransaksi; reset token sekali pakai; perubahan kontak memerlukan verifikasi ulang; akun internal memerlukan MFA. |
| UAT-36 | Perubahan stok, keputusan resep, pembatalan, refund dan serah terima | Setiap tindakan dapat ditelusuri ke pelaku/waktu/referensi; log umum tidak memuat resep atau token. |
| UAT-37 | Resep yang pernah dipenuhi atau tidak jelas riwayatnya diajukan kembali | Tidak memperoleh persetujuan otomatis; apoteker menelaah riwayat dan SOP, serta mencatat keputusan dan alasan. |
| UAT-38 | Isi alamat diganti setelah quote dengan total ongkir yang sama | Pesanan tidak diam-diam memakai alamat baru; pelanggan harus membuat dan menyetujui quote baru. |
| UAT-39 | Pengajuan refund setelah barang diterima | Form menerima pengajuan sampai 3 hari setelah waktu penerimaan dan menolak pengajuan setelah batas; pesanan tetap `completed`. |
| UAT-40 | Bukti video unboxing | Pengiriman kurir wajib menyertakan video MP4/WebM valid; berkas invalid/terlalu besar ditolak dan video pickup tidak diwajibkan. |
| UAT-41 | Rekening dan akses pengajuan refund | Bank, nama pemilik dan nomor rekening tercatat; hanya pelanggan dan apotek yang ditugaskan dapat melihat rekening/video; apotek menolak dengan alasan atau menyetujui nominal yang tidak melebihi sisa dana diterima. |
| UAT-42 | Transfer refund manual | Pengajuan disetujui memiliki tenggat 7 hari; apotek mencatat referensi transfer, status refund menjadi ditransfer satu kali, dan status order tetap `completed`. |

Tambahkan uji kerentanan, unggah berbahaya, otorisasi, validasi webhook, serta performa berdasarkan beban pilot. Data uji tidak menggunakan resep asli.

## 6. Gerbang pilot dan rencana operasional

- Legal dan farmasi menyetujui perizinan, cakupan produk, resep, privasi, penyerahan dan integrasi yang berlaku.
- UAT kritis lulus, temuan keamanan kritis ditutup, dan pemilik menerima risiko tersisa.
- Katalog, stok, staf, jam layanan, SOP, pelatihan, dukungan dan mitra pilot siap.
- Satuan jual, kapabilitas produk, pemeriksaan lot/kedaluwarsa, bukti serah terima dan pemeriksaan penggunaan resep berulang divalidasi apoteker. Pemetaan stok daring versus toko terbukti tidak menjual unit yang sama dua kali.
- Pembayaran, refund, pengiriman, monitoring, backup, pemulihan dan eskalasi telah diuji.
- Lakukan peluncuran terbatas; pantau pembatalan stok, antrean resep, error pembayaran, dan keluhan setiap hari. Hentikan penerimaan pesanan baru jika keselamatan pasien, keamanan data, atau integritas pembayaran tidak dapat dijaga; ikuti runbook insiden dan selesaikan pesanan aktif secara terkontrol.

## 7. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Izin atau integrasi wajib belum siap | Pilot tertunda | Pemetaan dan komunikasi dengan pihak berwenang sejak discovery. |
| Stok tidak akurat | Pembatalan/refund | Reservasi atomik, rekonsiliasi stok dan pelatihan apotek. |
| Antrean resep lambat | Reservasi kedaluwarsa | Kapasitas, jam layanan jelas, metrik dan penyesuaian parameter setelah evaluasi. |
| Kebocoran data | Dampak pada pelanggan dan kepercayaan | Kontrol akses, enkripsi, audit, uji keamanan dan rencana respons. |
| Kegagalan pembayaran/kurir | Transaksi atau pengiriman tertunda | Idempotensi, retry, rekonsiliasi dan proses manual terkendali. |

## 8. Keputusan pemilik sebelum pengembangan

Tetapkan product owner, wilayah dan jumlah apotek, penyedia pembayaran/kurir, volume pilot, SLA, kebijakan refund, jangka waktu dan metode retensi, serta estimasi sumber daya dan anggaran. Target dan jadwal disesuaikan setelah discovery.

## 9. Keterlacakan kebutuhan

| Kebutuhan PRD | Komponen/kontrak | UAT utama |
|---|---|---|
| PR-01 | Auth, sesi, verifikasi kontak dan RBAC | UAT-07, UAT-30, UAT-35 |
| PR-02–PR-05 | Katalog, alamat, quote dan satuan jual | UAT-01, UAT-13, UAT-17, UAT-21, UAT-38 |
| PR-06 | Reservasi, stok daring dan kedaluwarsa | UAT-04, UAT-11, UAT-12, UAT-34 |
| PR-07 | Revisi dokumen, review per item dan klarifikasi | UAT-02, UAT-03, UAT-14, UAT-19, UAT-20, UAT-27–UAT-30, UAT-37 |
| PR-08 | Payment adapter, webhook dan rekonsiliasi | UAT-05, UAT-06, UAT-16, UAT-18, UAT-22, UAT-25, UAT-26 |
| PR-09 | Pemeriksaan akhir, booking dan serah terima | UAT-01, UAT-08, UAT-23, UAT-31–UAT-33 |
| PR-10 | Status pesanan dan notifikasi | UAT-01, UAT-08, UAT-33 |
| PR-11 | Pembatalan, kasus bantuan dan refund | UAT-09, UAT-15, UAT-23, UAT-24, UAT-39–UAT-42 |
| PR-12 | Admin, peran, audit dan pemulihan | UAT-07, UAT-10, UAT-30, UAT-36 |

Detail terbuka, keterbatasan review dan keputusan gerbang tercatat di [Catatan review](09-Review-Report.md). Daftar UAT merupakan rencana pengujian; belum ada bukti eksekusi UAT provider, keamanan, beban, dan operasional.
