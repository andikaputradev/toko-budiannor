# Revisi Back-Office Toko Budiannor - Tahap 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul Manajemen Hutang Piutang & Pembayaran sesuai tangkapan layar `form-daftar-saldo-piutang.png` dan dokumen proposal (Daftar Saldo Piutang/Hutang, Rincian Tagihan & Cetak TTD Nota, serta Form Pembayaran Piutang/Hutang) dengan tampilan rapi standar POS, font jelas, kalkulasi alokasi pembayaran akurat, dan format cetak tanda terima nota resmi.

**Architecture:**

- Domain logika modular: `src/apps/bo/domain/receivable-payable.ts` (manajemen saldo pelanggan/pemasok, alokasi pembayaran FIFO & manual, kalkulasi umur jatuh tempo, generator pesan WhatsApp tagihan).
- Antarmuka terpadu: `src/apps/bo/screens/receivable-payable.ts` (tampilan split 3 panel sesuai `form-daftar-saldo-piutang.png`: Daftar Saldo, Cetak Tagihan & TTD Nota, serta Form Bayar).
- Terintegrasi penuh ke sistem tema POS (6 warna + mode gelap/terang), CSS tokens, router back-office di `index.ts`, dan store `Dataset`.

**Tech Stack:** TypeScript, CSS Tokens, DOM helpers, Lucide icons, Vitest.

**Spec & Assets:**

- `docs/img/bo/form-daftar-saldo-piutang.png`
- `docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf` (halaman 7)

## Global Constraints

- Mengikuti standar desain dan ukuran komponen POS (target sentuh min 44px-48px, kontras WCAG AA, font IBM Plex Sans).
- Tidak menggunakan inline styles atau `innerHTML`.
- Teks antarmuka menggunakan fungsi `label()` dari `src/shared/messages.ts` dan dicatat di `docs/teks-baru.md`.
- Larangan keras tanda baca en-dash atau em-dash (gunakan ASCII hyphen `-`).
- Menjaga kebersihan typecheck (`tsc --noEmit`), kontras (`npm run kontras`), teks (`npm run lint:teks`), dan uji vitest (`npm test`).

## Review Focus

1. Daftar Saldo Piutang & Hutang: Menampilkan saldo per pelanggan / pemasok (mis. `CV Laut Mas Rp 29.000.000`, `Pak Wahyudi Rp 10.000.000`, total `Rp 52.270.000`), filter pencarian cepat, baris aktif terpilih.
2. Form Cetak Tagihan & TTD Nota: Rincian nota belum lunas untuk pelanggan terpilih (No Nota, Tanggal Nota, Nilai Nota, Sisa Bayar), tombol cetak lembar tagihan resmi dengan 2 kolom tanda tangan (Penerima & Kasir Toko), serta tombol kirim WA rincian tagihan.
3. Form Pembayaran Piutang / Hutang: Tanggal bayar, pilihan cara bayar (Kas/Tunai, Transfer Bank, Giro/Cek, Saldo Deposit), keterangan, tabel alokasi pembayaran per faktur (otomatis FIFO atau manual), kalkulasi sisa saldo, tombol simpan pembayaran & cetak kuitansi.

---

### Task 1: Domain Logika Hutang Piutang & Pembayaran

**Files:**

- Create: `src/apps/bo/domain/receivable-payable.ts`
- Create: `tests/unit/bo/receivable-payable.test.ts`

- [ ] **Step 1: Tulis unit test untuk perhitungan saldo piutang/hutang, daftar nota tagihan, alokasi pembayaran, dan pembuatan pesan WhatsApp**
- [ ] **Step 2: Jalankan test dan pastikan gagal**
- [ ] **Step 3: Implementasikan fungsi-fungsi domain di `receivable-payable.ts`**
- [ ] **Step 4: Jalankan test dan pastikan lolos**

### Task 2: Registrasi Pesan & Label Antarmuka Tahap 5

**Files:**

- Modify: `src/shared/messages.ts`
- Modify: `docs/teks-baru.md`

- [ ] **Step 1: Daftarkan semua kunci label baru untuk Daftar Saldo, Cetak Tagihan TTD Nota, dan Form Bayar di `src/shared/messages.ts`**
- [ ] **Step 2: Dokumentasikan pasangan ID dan teks baru di `docs/teks-baru.md` tanpa en-dash/em-dash**
- [ ] **Step 3: Verifikasi dengan `npm run lint:teks`**

### Task 3: Antarmuka Terpadu Saldo Piutang, Tagihan TTD Nota, & Form Bayar

**Files:**

- Create: `src/apps/bo/screens/receivable-payable.ts`
- Modify: `src/styles/bo.css`

- [ ] **Step 1: Implementasikan tab switcher Piutang Pelanggan vs Hutang Pemasok & ringkasan metrik saldo total**
- [ ] **Step 2: Implementasikan Panel Kiri (Daftar Saldo Entitas dengan pencarian dan pemilihan baris aktif)**
- [ ] **Step 3: Implementasikan Panel Kanan (Rincian Nota Belum Lunas, Tombol Cetak TTD Nota, dan Tombol Kirim WA Tagihan)**
- [ ] **Step 4: Implementasikan Panel Bawah (Form Bayar Piutang/Hutang dengan alokasi otomatis/manual per nota, input cara bayar, dan sisa saldo)**
- [ ] **Step 5: Implementasikan Modal Cetak Tagihan & Tanda Terima Nota (TTD) serta Kuitansi Pelunasan**
- [ ] **Step 6: Styling rapi di `src/styles/bo.css` mengikuti desain POS**

### Task 4: Integrasi Router & Menu Back-Office

**Files:**

- Modify: `src/apps/bo/index.ts`

- [ ] **Step 1: Daftarkan rute `/bo/hutang-piutang/saldo-piutang`, `/bo/hutang-piutang/saldo-hutang`, `/bo/hutang-piutang/bayar-piutang`, `/bo/hutang-piutang/bayar-hutang`, dan `/bo/laporan/hutang-piutang` di `src/apps/bo/index.ts`**
- [ ] **Step 2: Verifikasi navigasi antar submenu grup hutang piutang**

### Task 5: Verifikasi Menyeluruh & Uji Kualitas

- [ ] **Step 1: Jalankan `npm run typecheck`**
- [ ] **Step 2: Jalankan `npm run lint:teks`**
- [ ] **Step 3: Jalankan `npm run kontras`**
- [ ] **Step 4: Jalankan `npm test` untuk memastikan seluruh 70+ test file lulus**
- [ ] **Step 5: Jalankan `npm run build`**
- [ ] **Step 6: Sajikan hasil Tahap 5 kepada pengguna untuk direview**
