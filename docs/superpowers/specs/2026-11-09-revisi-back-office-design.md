# Revisi Back-Office Toko Budiannor: Spesifikasi Desain Sistem

Tanggal: 2026-11-09. Status: Draf disetujui untuk Tahap 1. Cakupan: Modul Web Back-Office (`#/bo`).
Acuan utama:

1. `docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf` (arsitektur Back-Office web, multi-gudang, multi-satuan, HPP average, akuntansi otomatis, logistik/surat jalan, dan hak akses).
2. Tangkapan layar antarmuka `docs/img/bo/`:
   - `bo-menu.png` (struktur menu & widget)
   - `dashboard.png` (dashboard 3 baris widget)
   - `data-barang.png` (master data barang split interface)
   - `daftar-penjualan-pembelian.png`
   - `form-penjualan.png` & `forn-surat-jalan-ekspedisi.png`
   - `form-pembelian.png`
   - `form-daftar-saldo-piutang.png` (saldo hutang piutang & pelunasan)
   - `form-akuntansi.png` (jurnal otomatis)
   - `form-akuntansi1.png` (beban operasional)
   - `form-akuntansi-arus-kas.png` (arus kas langsung)
   - `laporan-laba-rugi.png` & `neraca.png` (neraca seimbang)
3. Contoh data import: `docs/item-import apk.xlsx`.
4. Standar desain & token: Mengikuti POS (6 pilihan tema warna, mode terang/gelap otomatis, font IBM Plex Sans, WCAG AA, target sentuh 48px).

---

## 1. Fondasi Tampilan & Penyelarasan Tema POS

### 1.1 Enam Palet Warna & Mode Terang/Gelap

Back-Office menyelaraskan sistem tema dengan POS:

- 6 palet warna: **Oranye** (`#B94F00`), **Terakota** (`#B4472B`), **Teal** (`#0F766E`), **Biru Safir** (`#1D4ED8`), **Hijau Hutan** (`#15803D`), dan **Ungu Indigo** (`#6D28D9`).
- Mode tampilan: `otomatis` (mengikuti preferensi sistem OS), `terang`, dan `gelap`.
- Penyimpanan tema di `localStorage` kunci `toko-budiannor-tema-pos` dan mode di `toko-budiannor-mode-pos` agar serasi antar aplikasi.
- Variabel CSS token yang dibangkitkan `build-tokens` diperluas mencakup `[data-app='bo']`.

### 1.2 Skala & Kenyamanan Visual

- Mengikuti arahan: **rapi, enak dilihat, jelas, dan jangan terlalu kecil**.
- Ukuran teks navigasi dan body disesuaikan ke 14px-16px yang nyaman dibaca, dengan kontras tinggi.
- Item menu memiliki tinggi minimal target sentuh 44px-48px dengan padding yang lega dan radius sudut standar POS (8px).
- Status aktif menggunakan latar aksen lembut (`var(--color-accent-soft)`) dengan border indikator tebal (`4px`) di tepi kiri dan warna teks aksen.

---

## 2. Struktur Menu Back-Office (`bo-menu.png`)

Navigasi sidebar mengelompokkan 8 grup menu utama dengan submenu yang dapat dilipat/dibuka (collapsible accordion) atau langsung diakses:

1. **Dashboard** (`/bo/dashboard`)
   - Tampilan Dashboard Owner & Staff
2. **Master Data**
   - Data Barang (`/bo/barang`)
   - Kategori Barang (`/bo/master/kategori`)
   - Merk Barang (`/bo/master/merk`)
   - Pemasok (`/bo/master/pemasok`)
   - Pelanggan (`/bo/master/pelanggan`)
   - Sales (`/bo/master/sales`)
   - Ekspedisi (`/bo/master/ekspedisi`)
   - No Rekening (`/bo/master/rekening`)
3. **Transaksi**
   - PO Pembelian (`/bo/transaksi/po-pembelian`)
   - Faktur Pembelian (`/bo/pembelian`)
   - Retur Pembelian (`/bo/transaksi/retur-pembelian`)
   - SO Penjualan (`/bo/transaksi/so-penjualan`)
   - Faktur Penjualan (`/bo/penjualan`)
   - Retur Penjualan (`/bo/transaksi/retur-penjualan`)
   - Deposit Pelanggan (`/bo/transaksi/deposit-pelanggan`)
4. **Mutasi Stok**
   - Daftar Stok Minim (`/bo/stok?filter=minimum`)
   - Transfer Stok (`/bo/mutasi`)
   - Koreksi Stok (`/bo/mutasi/koreksi`)
   - Stok Opname (`/bo/opname`)
5. **Hutang Piutang**
   - Saldo Hutang (`/bo/hutang-piutang/saldo-hutang`)
   - Pembayaran Hutang (`/bo/hutang-piutang/bayar-hutang`)
   - Saldo Piutang (`/bo/hutang-piutang/saldo-piutang`)
   - Pembayaran Piutang (`/bo/hutang-piutang/bayar-piutang`)
6. **Akuntansi**
   - Jurnal Otomatis (`/bo/akuntansi/jurnal`)
   - Beban Operasional (`/bo/akuntansi/beban`)
   - Arus Kas (`/bo/akuntansi/arus-kas`)
   - Neraca (`/bo/akuntansi/neraca`)
   - Laba Rugi (`/bo/akuntansi/laba-rugi`)
7. **Laporan**
   - Laba Rugi (`/bo/laporan/laba-rugi`)
   - Penjualan (`/bo/laporan/penjualan`)
   - Pembelian (`/bo/laporan/pembelian`)
   - Hutang Piutang (`/bo/laporan/hutang-piutang`)
   - Stok (`/bo/laporan/stok`)
   - Pricelist (`/bo/harga`)
8. **Pengaturan**
   - Profil Toko (`/bo/pengaturan/profil`)
   - Pengguna (`/bo/pengaturan/pengguna`)
   - Hak Akses (`/bo/pengaturan/hak-akses`)
   - Log Aktivitas (`/bo/pengaturan/audit-log`)
   - Cetak Barcode (`/bo/pengaturan/barcode`)
   - Tampilan / Tema (`/bo/pengaturan/tema`)
   - Lainnya (`/bo/pengaturan/lainnya`)

---

## 3. Komponen Shell & Topbar

Topbar memuat:

- Brand Logo Toko Budiannor + Sub-label Back-Office.
- Judul Layar & Breadcrumb aktif.
- Indikator Tanggal operasional sistem ("17 Okt 2026").
- Ikon Notifikasi (peringatan stok minim, piutang jatuh tempo, batas HPP).
- Quick Theme & Mode Selector (ganti 6 palet warna & dark mode langsung).
- Info Akun Pengguna (Avatar, Nama, Peran) + Tombol Keluar.
