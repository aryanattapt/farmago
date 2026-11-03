# Catatan Review — Paket Dokumentasi FarmaGO MVP

**Versi paket:** 0.4  
**Tanggal review:** 28 Oktober 2026  
**Cakupan:** delapan dokumen perencanaan MVP, React JS frontend dan Bun backend  
**Kesimpulan:** dapat digunakan untuk discovery, estimasi dan perancangan implementasi. Belum menjadi spesifikasi produksi yang seluruh keputusannya final.

## 1. Cara membaca hasil

Review ini memeriksa konsistensi kebutuhan, alur, data, API, aturan bisnis dan rencana uji. Status “diperbaiki dalam spesifikasi” berarti ketentuan dokumennya sudah diperjelas; bukan bukti bahwa aplikasi telah menerapkannya. Belum ada aplikasi, migration database, integrasi penyedia, prototipe teruji atau hasil UAT dalam paket ini.

## 2. Temuan dan perbaikan versi 0.4

| ID | Prioritas | Temuan pada versi 0.3 dan dampak | Perbaikan dalam spesifikasi | Bukti penerimaan yang direncanakan |
|---|---|---|---|---|
| R-01 | P1 | Pembatalan dari “status terbayar” terlalu luas; dapat ditafsirkan boleh setelah paket diserahkan. | Hanya tahap sampai `ready` dan belum serah terima; booking aktif/tidak pasti harus diselesaikan. Setelah itu gunakan kasus bantuan. | UAT-23; [kontrak backend](06-BSD-Backend-Schema.md) bagian 7 |
| R-02 | P1 | Refund time-out dapat dianggap gagal dan kuotanya dipakai kembali, berisiko refund ganda. | Referensi refund unik; hasil tidak pasti tetap diproses dan menahan kuota sampai ada hasil definitif. | UAT-24; [TRD](02-TRD.md) bagian 9 |
| R-03 | P1 | Webhook tidak berurutan, dana tambahan dan nominal berbeda belum memiliki aturan lengkap. | Status dana terverifikasi tidak diturunkan; nominal tagihan dipisah dari dana aktual, satu hak pemenuhan per pesanan, selisih direkonsiliasi. | UAT-25–UAT-26; [database](05-DBD-Database-Design.md) |
| R-04 | P1 | Persetujuan resep lama dapat tetap dipakai setelah dokumen berubah, atau dua apoteker menimpa keputusan. | Revisi dokumen dan versi review, urutan keputusan server, persetujuan ulang setelah upload, serta penguncian perubahan saat tagihan sudah dibuat. | UAT-27–UAT-29; [backend](06-BSD-Backend-Schema.md) bagian 5 |
| R-05 | P1 | Stok platform belum dibedakan dari kasir toko; reservasi platform saja tidak mencegah penjualan unit yang sama lintas kanal. | Asumsi pilot memakai alokasi daring terpisah; jika tidak dapat dipenuhi, integrasi POS menjadi prasyarat apotek terkait. | UAT-34; validasi operasional tetap terbuka pada D-01 |
| R-06 | P1 | Belum ada satuan jual tegas, pemeriksaan akhir, lot/kedaluwarsa dan bukti serah terima dalam kontrak data. | Satuan jual SKU utuh; pemeriksaan sebelum `ready`, catatan lot bila relevan, kewenangan akhir apoteker untuk resep, dan bukti serah terima. | UAT-31, UAT-33; [database](05-DBD-Database-Design.md) |
| R-07 | P1 | Alur admin “mengelola status resep” berpotensi memberi akses/keputusan klinis yang terlalu luas. | Admin mengelola label katalog sesuai keputusan farmasi, bukan keputusan resep pelanggan; matriks akses eksplisit dan registrasi publik hanya peran pelanggan. | UAT-30, UAT-35; [App Flow](03-AFD-App-Flow.md) bagian 4 |
| R-08 | P2 | Satu shipment per pesanan belum menjelaskan percobaan booking gagal atau hasil tidak pasti. | Pemenuhan logis dipisah dari percobaan booking, satu percobaan aktif, rekonsiliasi sebelum booking ulang. | UAT-32 |
| R-09 | P2 | Perubahan alamat setelah quote dapat terjadi tanpa persetujuan baru bila ongkir tetap sama. | Quote menyimpan snapshot alamat; perubahan alamat/metode/item memerlukan quote baru meski total tidak berubah. | UAT-38 |
| R-10 | P2 | Promo, produk penanganan khusus, refill dan pemenuhan sebagian belum mempunyai batas MVP yang tegas. | Promo dinonaktifkan, diskon nol, produk khusus default nonaktif; refill, racikan, pecahan dan pemenuhan sebagian dikecualikan. | [PRD](01-PRD.md) bagian 8; UAT-37 dan validasi D-03 |
| R-11 | P2 | Tautan UU PDP memakai slug judul yang tidak sesuai, dan kebutuhan belum dilacak sampai uji. | Tautan dikoreksi dan diperiksa ke sumber resmi; ditambahkan matriks PRD–komponen–UAT. | Pemeriksaan tautan; [IPD](08-IPD-Implementation-Plan.md) bagian 9 |

## 3. Keputusan terbuka dan pemiliknya

Ini adalah keputusan perencanaan yang belum disahkan pengguna/pemilik proyek, bukan hasil observasi operasional K24Klik.

| ID | Keputusan / risiko tersisa | Pemilik yang perlu ditunjuk | Tenggat keputusan | Dampak bila belum selesai |
|---|---|---|---|---|
| D-01 | Pemisahan alokasi stok daring atau integrasi POS; apotek pilot dan prosedur koreksi stok. | Operasional apotek + backend lead | Sebelum desain inventori dikunci | Stok tidak dapat dijamin; apotek terkait belum siap pilot. |
| D-02 | Apakah reservasi 30 menit realistis untuk pemeriksaan resep dan pembayaran; jam layanan, kapasitas serta penanganan konfirmasi terlambat. | Product owner + apoteker + operasional | Sebelum flow checkout dan parameter dikunci | Risiko pesanan valid kedaluwarsa dan dana perlu refund. |
| D-03 | Kategori produk, satuan, pemeriksaan lot/kedaluwarsa, pasien dan penggunaan resep ulang/asli/elektronik. | Apoteker penanggung jawab + legal | Sebelum workflow farmasi dan katalog pilot disetujui | Proses resep dan penyerahan belum tervalidasi. Hash dokumen tidak cukup untuk membuktikan keaslian atau mencegah penyalahgunaan. |
| D-04 | Penyedia pembayaran/kurir, kemampuan idempotensi, settlement tunggal, data verifikasi dan rekonsiliasi. | Backend lead + finance + operasional | Sebelum kontrak adapter penyedia dikunci | Kontrak belum dapat dinyatakan kompatibel dengan vendor nyata. |
| D-05 | Jendela pengajuan 3 hari dan transfer refund manual maksimal 7 hari setelah persetujuan telah ditetapkan sebagai kebijakan awal; kelayakan produk/retur, nominal dan cakupan ongkir, otoritas persetujuan serta pengesahan legal/farmasi tetap perlu diputuskan. | Product owner + finance + legal + farmasi | Sebelum UAT bisnis | CS/apotek belum mempunyai SOP final untuk setiap kondisi. |
| D-06 | Model izin, peran pengendali/prosesor data, retensi, hak subjek, insiden, integrasi wajib dan perjanjian apotek. | Legal + farmasi + penanggung jawab privasi | Sebelum pilot | Paket tidak menjadi bukti kepatuhan hukum. |
| D-07 | Wilayah, volume, anggaran, personel, SLA, framework backend dan profil beban uji. | Product owner + technical lead | Sebelum komitmen estimasi dan sprint | Jadwal 16 minggu dan target kinerja masih estimasi. |

React JS dan Bun adalah pilihan pengguna. Hono, PostgreSQL, penyimpanan objek dan rincian arsitektur lain merupakan usulan rancangan. Keputusan teknis dapat difinalkan tim saat perencanaan implementasi dengan mencatat alasannya.

## 4. Kelengkapan dan batas pemeriksaan

- Delapan dokumen inti diselaraskan menjadi versi 0.4; catatan ini merupakan dokumen review tambahan.
- Keterlacakan kebutuhan PR-01 sampai PR-12 ditambahkan ke IPD; daftar rencana uji berjumlah 42 skenario.
- Pemeriksaan otomatis terbatas pada versi, keberadaan tautan lokal, pasangan fence Markdown dan sintaks contoh JSON. Pemeriksaan ini bukan validasi semantik Mermaid atau eksekusi alur aplikasi.
- Belum ada OpenAPI lengkap, DDL/migration siap eksekusi, angka kapasitas nyata, kontrak vendor final, bukti pemulihan, pengujian keamanan atau hasil penerimaan pengguna. Itu adalah hasil kerja implementasi yang masih harus dihasilkan.

## 5. Sumber regulasi yang diperiksa

- [UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi — JDIH BPK](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022).
- [Permenkes No. 5 Tahun 2026 tentang Perbekalan Kesehatan — JDIH Kementerian Kesehatan](https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-5-tahun-2026).

Pemeriksaan halaman sumber dilakukan 28 Oktober 2026. Daftar ini membantu penelusuran; penerapan pasal, aturan pelaksana, status perubahan lain, izin dan kewajiban spesifik masih memerlukan telaah pihak berwenang pada D-06.
