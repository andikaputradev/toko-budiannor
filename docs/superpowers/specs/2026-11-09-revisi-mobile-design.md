# Revisi Mobile Toko Budiannor: Spesifikasi Desain

Tanggal: 2026-11-09. Cakupan: aplikasi mobile Owner (`#/owner`) dan Sales Lapangan (`#/sales`). Target serah: Selasa, 10 November 2026.

Acuan:

1. `docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf`, bagian II.C dan gambar "Aplikasi Mobile" (4 layar: Dashboard, Stok Barang, Transaksi, Laporan).
2. Catatan revisi klien 30 Oktober (draf revisi poin C: OWN-02 sampai OWN-06, SALES-01 sampai SALES-05) dan 6 November (poin Mobile dan tema).
3. Standar POS: enam palet warna, mode terang/gelap/otomatis, IBM Plex Sans, target sentuh 48 px, ukuran tidak terlalu kecil.

## 1. Kebutuhan klien yang dicakup

| No  | Kebutuhan                                                                   | Layar                               |
| --- | --------------------------------------------------------------------------- | ----------------------------------- |
| M1  | Enam pilihan warna (dan mode) seperti POS                                   | Owner, Sales                        |
| M2  | Gambar barang di katalog, dapat diperbesar                                  | Sales Katalog, Owner Stok           |
| M3  | Harga bertingkat (Eceran, Grosir, Kontraktor) dan stok semua gudang         | Sales Katalog, Owner Stok           |
| M4  | Info piutang pelanggan dan info hutang supplier                             | Owner Dashboard, Piutang dan Hutang |
| M5  | Invoice dapat diklik: rincian transaksi dan detail barang                   | Owner Piutang dan Hutang            |
| M6  | Bill dapat diklik: rincian transaksi lengkap                                | Owner Transaksi                     |
| M7  | Grafik dan data laporan lengkap untuk memantau toko                         | Owner Dashboard, Laporan            |
| M8  | Menu SO/PO: harga dapat diubah                                              | Owner Input SO/PO, Sales Order      |
| M9  | Owner: input SO/PO, bayar hutang dan piutang, approval, notifikasi, mutasi  | Owner Transaksi, Stok               |
| M10 | Sales: katalog, validasi piutang, offline, kirim PDF SO lewat WA            | Sales                               |
| M11 | Tampilan mengikuti gambar proposal; rapi, enak dilihat, tidak terlalu kecil | Semua                               |

## 2. Fondasi bersama

### 2.1 Tema

- Atribut pada elemen `html`: `data-app` (`owner` atau `sales`), `data-pos-theme` (oranye, terakota, teal, biru, hijau, ungu), `data-pos-mode` (otomatis, terang, gelap), `data-pos-scheme` (terang atau gelap hasil resolusi).
- Kunci penyimpanan dan fungsi dari `src/shared/theme.ts` dipakai ulang, sehingga pilihan sama dengan POS dan BO.
- `scripts/build-tokens.mjs` mengeluarkan blok palet dan blok gelap untuk `owner` dan `sales` (sebelumnya `pos` dan `bo`). Blok gelap berbasis media query lama pada Owner hanya berlaku bila `data-pos-mode` belum ada.
- Pemilih tema: `openAppearanceSheet()` di `src/shared/ui/appearance.ts`, dibuka dari avatar di header. Berisi enam kotak warna (nama dan contoh warna) dan tiga mode. Tombol berukuran minimal 48 px.

### 2.2 Bahasa visual (mengikuti gambar proposal)

- Dashboard: pita header berwarna aksen (salam, avatar inisial, status sinkron, lonceng) dan kartu putih yang menimpa pita. Layar lain: bilah atas ringkas berjudul aksen, tombol kembali bila layar detail.
- Kartu: sudut 16 px, bayangan halus. Kartu pastel bernada: sukses (laba), peringatan (stok minim, hutang), info (piutang).
- Tipografi: isi 16 px, label 14 px (tidak ada teks di bawah 13 px kecuali lencana), angka kunci 28 px tebal, judul kartu 17 px semibold.
- Nav bawah 4 tab (Owner: Dashboard, Stok, Transaksi, Laporan; Sales: Katalog, Order, Riwayat), tinggi 68 px, ikon 24 px, label 13 px.
- Layar lebar dari 600 px: aplikasi tampil sebagai bingkai ponsel 400 px di tengah (sudut 32 px, bayangan), tinggi maksimal 880 px.
- Semua warna lewat token; tidak ada atribut `style` berupa string (CSP). Kontras lolos 4,5 : 1 pada 6 palet dan 2 mode.

### 2.3 Komponen bersama baru (`src/shared/ui/`)

| Berkas             | API                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `area-chart.ts`    | `createAreaChart({ title, data: {label,value,caption}[], axisLabel, selectedIndex?, onSelect?, width?, height? })` grafik area bergaris, titik dapat diketuk, ada tabel tersembunyi untuk pembaca layar |
| `rank-list.ts`     | `createRankList({ items: {name, caption, percent, tone?}[] })` daftar bar horizontal berperingkat                                                                                                       |
| `product-photo.ts` | `createProductPhoto(product, size, { zoom? })` foto barang (foto sendiri, lalu kategori, lalu placeholder); `zoom` membuatnya tombol yang membuka penampil                                              |
| `image-viewer.ts`  | `openPhotoViewer({ title, product, tier, unitRows })` modal foto besar dengan tombol perbesar/perkecil dan rincian                                                                                      |
| `appearance.ts`    | `openAppearanceSheet()`                                                                                                                                                                                 |
| `mobile-card.ts`   | `createMobCard({ tone?, title?, action?, body })`, `createAvatar(initials)`, `createMobBadge(text, tone)`                                                                                               |

CSS bersama di `src/styles/mobile.css` dengan awalan `mob-`. Aliran memakai awalan sendiri: `dash-` (A), `trx-` (B), `sls-` (C), masing-masing di berkas CSS sendiri.

### 2.4 Label

Teks baru ditaruh di `src/shared/labels/mobile.ts` (fondasi), `owner-dashboard.ts` (A), `owner-transaksi.ts` (B), `sales.ts` (C), digabung pada objek `labels` di `src/shared/messages.ts`. Pencatatan ke `docs/teks-baru.md` dilakukan satu kali pada tahap gabung oleh skrip (uji `messages.test.ts` mewajibkan setiap label tercatat). Tidak ada tanda pisah en/em dash.

## 3. Owner (4 tab)

Rute tetap: `/owner/ringkasan`, `/owner/stok`, `/owner/transaksi`, `/owner/laporan`, `/owner/piutang`. Layar detail memakai parameter kueri agar tombol kembali peramban bekerja.

### 3.1 Dashboard (OWN-02)

Urutan kartu seperti gambar: Omzet Live (toggle Harian/Bulanan, grafik area per jam atau per hari, perbandingan dengan pembanding, "Diperbarui", muat ulang otomatis 60 detik, tarik ke bawah), Laba Rugi (Pendapatan, Beban, Laba), Stok Minim (5 barang, "sisa"), Produk Terlaris (Hari ini/Bulan ini), Monitoring HPP (3 barang dengan persen terhadap harga, batas 90%), Piutang Jatuh Tempo (total dan jumlah pelanggan, membuka `/owner/piutang`), Hutang Supplier (total dan jumlah faktur, membuka `/owner/piutang?tab=hutang`). Angka dihitung dari dataset yang sama dengan Back-Office.

### 3.2 Stok (OWN-03)

Kolom cari "Cari kode / nama barang", chip gudang dan "Di bawah minimum". Kartu: foto di kanan, nama dan kode, STOK TOKO (Display) dan STOK GUDANG (Besar) berwarna hijau, kuning, atau merah menurut status, harga Eceran/Grosir/Kontraktor per satuan jual dengan konversi satuan. Ketuk kartu: lembar Detail Barang (foto besar yang dapat diperbesar, tabel satuan x tier, stok per gudang, HPP, Buat Mutasi, Buat PO).

### 3.3 Transaksi (OWN-06)

"Buat Transaksi": empat tombol besar (Input Sales Order, Input Purchase Order, Bayar Hutang, Bayar Piutang), masing-masing membuka lembar layar penuh. "Approval Menunggu (N)" dengan tombol Review (alasan dan PIN Owner). "Bill dan Faktur": bill ditahan dan transaksi terbaru; ketuk baris membuka Detail Transaksi (nomor, waktu, kasir atau sales, pelanggan, barang x satuan x harga x diskon, total, pembayaran, sisa). Catatan "Semua transaksi akan tercatat otomatis ke Laba Rugi". Notifikasi dibuka dari lonceng (`?tab=notifikasi`).

Input SO dan PO: harga setiap baris dapat diubah (kolom Harga; harga asli tampil dengan lencana "Harga diubah"). Owner tidak perlu persetujuan. Bayar Piutang memilih pelanggan; Bayar Hutang memilih supplier lalu faktur.

### 3.4 Laporan (OWN-04)

Chip koneksi (Offline Mode atau Online) dan enam kartu laporan dengan titik status (hijau: data segar; kuning: data dari penyimpanan lokal, perlu dimuat ulang): Penjualan, Laba Rugi, Neraca, Biaya, Produk Terlaris, Penjualan Per Penjual. Ketuk kartu membuka laporan (`?jenis=...`) dengan filter Hari ini/Bulan ini/Pilih tanggal, grafik, dan tabel. Ekspor tetap di Back-Office.

Neraca: Aset (Kas dan Bank, Piutang Usaha, Persediaan = jumlah stok x HPP) sama dengan Kewajiban (Hutang Usaha dari faktur pembelian) ditambah Ekuitas (selisih), selalu seimbang.

### 3.5 Piutang dan Hutang (OWN-05)

Segmen Piutang | Hutang. Piutang: total, kartu pelanggan, ketuk pelanggan membuka daftar invoice, ketuk invoice membuka Detail Invoice (rincian, detail barang, riwayat bayar) dengan aksi Catat Bayar Piutang, Kirim Tagihan WA (PDF), Hubungi. Hutang: total, kartu supplier, daftar faktur pembelian, Detail Faktur (barang) dan Bayar Hutang. Rincian barang per invoice dibangkitkan deterministik dari katalog (jumlah baris 2 sampai 4, total sama dengan nilai invoice).

## 4. Sales (SALES-01 sampai SALES-05)

- Katalog: kartu dengan foto di kanan (ketuk untuk memperbesar), harga bertingkat tiga tier per satuan dengan tier pelanggan disorot, stok Display dan Besar, Tambah ke Order. Pilih pelanggan dan tier di atas.
- Order: stepper jumlah, satuan, dan harga per baris dapat diubah. Harga di bawah harga tier memerlukan persetujuan Owner (PIN, alur SALES-04 yang ada). Validasi piutang, DP/Piutang/Tunai/QRIS/Transfer, antrean offline tetap.
- Riwayat: kartu SO, Kirim Salinan SO (PDF) via WA, Cetak Bluetooth (simulasi).
- Header dan tema sama dengan Owner.

## 5. Data dan logika baru

- `OrderLineDraft` mendapat `price?: string` (harga ubah). `checkSalesOrder` memakai harga itu bila ada dan menyimpan harga asli pada `BillLine.listPrice`; hasil menyertakan `belowList: boolean`.
- `Supplier.invoices?: PayableInvoice[]` (id, tanggal, jatuh tempo, jumlah, terbayar, baris barang), dibangkitkan deterministik; `store.saveSupplier`. Total `payable` supplier diturunkan dari faktur.
- Modul domain murni dengan uji unit: dashboard Owner (omzet seri, produk terlaris, penjual, monitoring HPP, stok minim), neraca, rincian invoice, hutang dan pembayarannya, harga diubah.

## 6. Pengujian dan kriteria

- Uji unit untuk setiap modul domain baru; `npm run test`, `npm run typecheck`, `npm run lint`, `npm run lint:teks`, `npm run build`, `npm run budget`, `npm run kontras` hijau.
- E2E Owner dan Sales diperbarui ke tampilan baru; axe, target sentuh, dan responsif tetap lolos.
- Pengecekan visual pada 390 x 844 untuk setiap layar pada tema oranye dan satu tema lain, mode terang dan gelap.

## 7. Asumsi (dicatat di `docs/asumsi.md`)

- K-03 diperbarui: Owner 4 tab sesuai gambar proposal; Piutang dan Hutang dibuka dari kartu dashboard dan layar Transaksi.
- Titik hijau/kuning pada Laporan berarti data segar atau dari penyimpanan lokal.
- Sales boleh mengubah harga SO; di bawah harga tier perlu persetujuan Owner.
- "Bill" berarti bill POS (ditahan dan nota penjualan).
- Kas pada Neraca adalah angka dasar fiktif ditambah penerimaan tunai dikurangi biaya bulan ini.
- Tidak ada aset baru dari internet selain ikon Lucide tambahan (lisensi ISC) dari paket `lucide-static` yang sudah terpasang.
