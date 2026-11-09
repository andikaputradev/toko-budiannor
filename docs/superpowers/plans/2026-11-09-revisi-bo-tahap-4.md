# Revisi Back-Office Toko Budiannor - Tahap 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun seluruh modul Transaksi Back-Office sesuai dokumen proposal dan tangkapan layar `form-penjualan.png`, `form-pembelian.png`, `forn-surat-jalan-ekspedisi.png`, dan `daftar-penjualan-pembelian.png` dengan desain rapi standar POS, font jelas, kalkulasi diskon bertingkat 5+5, info limit piutang, pencarian SO/PO pending, packing koli ekspedisi, serta daftar nota komprehensif.

**Architecture:**

- Domain logika modular dan pure: `discount.ts` (kalkulasi diskon bertingkat dan nominal), `sales-transaction.ts` (manajemen draft penjualan & SO pending), `purchase-transaction.ts` (manajemen pembelian & PO pending), `expedition.ts` (manajemen packing koli ekspedisi), `transaction-list.ts` (manajemen daftar nota gabungan penjualan & pembelian).
- Antarmuka layar berbasis DOM helper dan POS design tokens: `sales-form.ts`, `purchase-form.ts`, `expedition-form.ts`, `transaction-list.ts`.
- Terintegrasi penuh ke sistem tema (6 palet warna + mode terang/gelap), router back-office di `index.ts`, dan store `Dataset`.

**Tech Stack:** TypeScript, CSS Tokens, DOM helpers, Lucide icons, Vitest.

**Spec & Assets:**

- `docs/img/bo/form-penjualan.png`
- `docs/img/bo/form-pembelian.png`
- `docs/img/bo/forn-surat-jalan-ekspedisi.png`
- `docs/img/bo/daftar-penjualan-pembelian.png`
- `docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf`

## Global Constraints

- Mengikuti standar desain dan ukuran komponen POS (target sentuh min 44px-48px, kontras WCAG AA, font IBM Plex Sans).
- Tidak menggunakan inline styles atau `innerHTML`.
- Teks antarmuka menggunakan fungsi `label()` dari `src/shared/messages.ts` dan dicatat di `docs/teks-baru.md`.
- Larangan keras tanda baca en-dash atau em-dash (gunakan ASCII hyphen `-`).
- Menjaga kebersihan typecheck (`tsc --noEmit`), kontras (`npm run kontras`), teks (`npm run lint:teks`), dan uji vitest (`npm test`).

## Review Focus

1. Form Faktur Penjualan: Pencarian SO pending mengimpor data pelanggan & barang, info credit limit & piutang tampil jelas dengan badge status, kalkulasi diskon bertingkat 5+5 akurat, tombol modal cetak faktur/SJ/DO dan kirim WhatsApp berfungsi.
2. Form Faktur Pembelian: Pencarian PO pending mengimpor pemasok & barang, info hutang jatuh tempo tampil akurat, alokasi stok toko vs gudang, dan penambahan biaya ekspedisi ke total.
3. Form Surat Jalan Ekspedisi: Pengelompokan barang ke dalam koli (Koli 1, Koli 2, Barang Campur), akumulasi total koli dan berat, serta pratinjau cetak surat jalan logistik dengan 3 tanda tangan.
4. Daftar Nota Penjualan & Pembelian: Tab switcher penjualan vs pembelian, filter tanggal, filter status pembayaran, umur nota (hari), dan tombol aksi cepat.

---

### Task 1: Domain Logika Diskon Bertingkat & Uji Unit

**Files:**

- Create: `src/apps/bo/domain/discount.ts`
- Create: `tests/unit/bo/discount.test.ts`

- [x] **Step 1: Tulis unit test untuk kalkulasi diskon bertingkat (5+5, 3+2.5, persen tunggal, nominal rupiah, format invalid)**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Implementasikan fungsi `parseDiscount` dan `calculateTieredDiscount` di `discount.ts`**
- [x] **Step 4: Jalankan test dan pastikan lolos**

### Task 2: Domain Form Penjualan, Pembelian, Ekspedisi, & Daftar Nota

**Files:**

- Create: `src/apps/bo/domain/sales-transaction.ts`
- Create: `src/apps/bo/domain/purchase-transaction.ts`
- Create: `src/apps/bo/domain/expedition.ts`
- Create: `src/apps/bo/domain/transaction-list.ts`
- Create: `tests/unit/bo/transactions.test.ts`

- [x] **Step 1: Tulis unit test untuk pembuatan transaksi penjualan (termasuk SO pending & credit limit), pembelian (PO pending & hutang), ekspedisi koli, dan daftar nota**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Implementasikan domain module `sales-transaction.ts`, `purchase-transaction.ts`, `expedition.ts`, dan `transaction-list.ts`**
- [x] **Step 4: Jalankan test dan pastikan lolos**

### Task 3: Registrasi Pesan & Label Antarmuka Tahap 4

**Files:**

- Modify: `src/shared/messages.ts`
- Modify: `docs/teks-baru.md`

- [x] **Step 1: Daftarkan semua kunci label baru untuk Form Penjualan, Pembelian, Ekspedisi Koli, dan Daftar Nota di `src/shared/messages.ts`**
- [x] **Step 2: Dokumentasikan pasangan ID dan teks baru di `docs/teks-baru.md` tanpa en-dash/em-dash**
- [x] **Step 3: Verifikasi dengan `npm run lint:teks`**

### Task 4: Antarmuka Form Faktur Penjualan & Modal Cetak/WA

**Files:**

- Create: `src/apps/bo/screens/sales-form.ts`
- Modify: `src/styles/bo.css`

- [x] **Step 1: Implementasikan komponen Form Faktur Penjualan lengkap (topbar aksi, metadata faktur, kartu credit limit & piutang, tabel item barang dengan pilihan stok toko/gudang & diskon 5+5, ringkasan subtotal & ongkir)**
- [x] **Step 2: Implementasikan modal cetak 4 dokumen (Faktur, SJ, SO, DO) dengan opsi kertas besar/tanpa header/no rekening dan tombol WhatsApp**
- [x] **Step 3: Styling rapi di `src/styles/bo.css` mengikuti desain POS**

### Task 5: Antarmuka Form Faktur Pembelian

**Files:**

- Create: `src/apps/bo/screens/purchase-form.ts`
- Modify: `src/styles/bo.css`

- [x] **Step 1: Implementasikan komponen Form Faktur Pembelian (topbar aksi, metadata pembelian, pencarian PO pending, info hutang jatuh tempo pemasok, tabel item pembelian dengan alokasi stok gudang/toko, biaya ekspedisi)**
- [x] **Step 2: Styling rapi di `src/styles/bo.css`**

### Task 6: Antarmuka Form Surat Jalan Ekspedisi Koli

**Files:**

- Create: `src/apps/bo/screens/expedition-form.ts`
- Modify: `src/styles/bo.css`

- [x] **Step 1: Implementasikan komponen Surat Jalan Ekspedisi Koli (data armada & supir, manajemen penambahan koli, rincian barang campur per koli, total berat & koli)**
- [x] **Step 2: Implementasikan pratinjau cetak surat jalan logistik standar ekspedisi dengan 3 tanda tangan**
- [x] **Step 3: Hubungkan tombol `[ISI SJ EKSPEDISI]` dari Form Penjualan langsung ke form ini**

### Task 7: Antarmuka Daftar Nota Penjualan & Pembelian

**Files:**

- Create: `src/apps/bo/screens/transaction-list.ts`
- Modify: `src/styles/bo.css`

- [x] **Step 1: Implementasikan tab switcher `[PENJUALAN]` vs `[PEMBELIAN]`**
- [x] **Step 2: Implementasikan filter bar (tanggal, status pembayaran, pencarian) dan kartu ringkasan omset/hutang/piutang**
- [x] **Step 3: Implementasikan tabel nota lengkap dengan kolom No Faktur, Tanggal, Pelanggan/Pemasok, Pembayaran, Status warna-warni, Umur Nota, Total, dan Aksi cepat (buka form, cetak, WA, lunas)**

### Task 8: Integrasi Router, Menu, & Verifikasi Penuh

**Files:**

- Modify: `src/apps/bo/index.ts`
- Modify: `src/apps/bo/domain/menu.ts`

- [x] **Step 1: Hubungkan seluruh rute transaksi di `src/apps/bo/index.ts` (`/bo/penjualan`, `/bo/pembelian`, `/bo/transaksi/surat-jalan`, `/bo/transaksi/daftar-nota`, `/bo/transaksi/po-pembelian`, `/bo/transaksi/so-penjualan`)**
- [x] **Step 2: Jalankan `npm run typecheck` dan perbaiki jika ada tipe bermasalah**
- [x] **Step 3: Jalankan `npm run lint:teks`**
- [x] **Step 4: Jalankan `npm run kontras`**
- [x] **Step 5: Jalankan `npm test` untuk memastikan semua uji lolos**
- [x] **Step 6: Jalankan `npm run build`**
- [x] **Step 7: Sajikan hasil Tahap 4 kepada pengguna untuk direview**
