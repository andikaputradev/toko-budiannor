# Revisi Back-Office Toko Budiannor - Tahap 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fondasi navigasi, menu sidebar lengkap 8 modul sesuai proposal & `bo-menu.png`, topbar modern dengan info pengguna dan pemilih tema, serta integrasi 6 palet warna + mode terang/gelap POS pada Back-Office dengan tampilan yang rapi, jelas, dan tidak terlalu kecil.

**Architecture:** Memanfaatkan token CSS yang diperluas ke `[data-app='bo']`, memindahkan utilitas tema ke modul bersama (`src/shared/theme.ts`), merestrukturisasi navigasi `menu.ts` menjadi 8 grup menu berhierarki, memperbarui `shell.ts` dengan topbar modern dan sidebar yang lega, serta mendaftarkan rute di `index.ts`.

**Tech Stack:** TypeScript, CSS Tokens, DOM helpers, Lucide icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-revisi-back-office-design.md`

## Global Constraints

- Mengikuti standar desain dan ukuran komponen POS (target sentuh min 44px-48px, kontras WCAG AA, font IBM Plex Sans).
- Tidak menggunakan inline styles atau `innerHTML`.
- Teks antarmuka menggunakan fungsi `label()` dari `src/shared/messages.ts` dan dicatat di `docs/teks-baru.md`.
- Menjaga kebersihan typecheck (`tsc --noEmit`), kontras (`npm run kontras`), teks (`npm run lint:teks`), dan uji vitest (`npm test`).

## Review Focus

1. Tampilan sidebar pada layar desktop lebar maupun layar sedang (min-width tetap nyaman dan tidak terpotong).
2. Status menu aktif (`aria-current="page"`) memiliki kontras jelas dengan border aksen dan latar aksen lembut.
3. Pergantian 6 tema warna (Oranye, Terakota, Teal, Biru, Hijau, Ungu) dan mode terang/gelap bekerja seketika di Back-Office.
4. Klik pada submenu membuka rute yang tepat tanpa galat/error 404.
5. Aksesibilitas keyboard dan navigasi skip-link tetap berfungsi sempurna.

---

### Task 1: Integrasi Tema Warna & Mode POS ke Back-Office

**Files:**

- Modify: `scripts/build-tokens.mjs`
- Create: `src/shared/theme.ts`
- Modify: `src/apps/pos/theme.ts`
- Output: `src/styles/tokens.css`
- Test: `tests/unit/bo/theme.test.ts`

- [x] **Step 1: Tulis unit test untuk verifikasi tema di Back-Office**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Perbarui `build-tokens.mjs` untuk mendukung `[data-app='bo']`, jalankan `npm run tokens`**
- [x] **Step 4: Pindahkan logika tema ke `src/shared/theme.ts` dan re-ekspor dari `src/apps/pos/theme.ts`**
- [x] **Step 5: Jalankan test dan pastikan lolos**

### Task 2: Struktur Data Menu & Pesan Label

**Files:**

- Modify: `src/shared/messages.ts`
- Modify: `docs/teks-baru.md`
- Modify: `src/apps/bo/domain/menu.ts`
- Test: `tests/unit/bo/menu.test.ts`

- [x] **Step 1: Tulis unit test untuk struktur 8 grup menu dan submenunya**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Daftarkan label menu baru di `src/shared/messages.ts` dan catat di `docs/teks-baru.md`**
- [x] **Step 4: Implementasikan struktur `MENU_GROUPS` dan `MENU_ENTRIES` di `src/apps/bo/domain/menu.ts`**
- [x] **Step 5: Jalankan test dan pastikan lolos**

### Task 3: Komponen Shell & Desain Topbar serta Sidebar Baru

**Files:**

- Modify: `src/apps/bo/shell.ts`
- Modify: `src/styles/bo.css`
- Test: `tests/unit/bo/menu.test.ts`

- [x] **Step 1: Tulis unit test untuk render Shell Back-Office baru (brand, menu grup, user status, theme selector)**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Implementasikan markup shell baru di `src/apps/bo/shell.ts`**
- [x] **Step 4: Perbarui gaya tampilan di `src/styles/bo.css` (ukuran nyaman, spacing lega, warna tema, kontras tinggi)**
- [x] **Step 5: Jalankan test dan pastikan lolos**

### Task 4: Router Back-Office & Layar Placeholder Modul Baru

**Files:**

- Modify: `src/apps/bo/index.ts`
- Create: `src/apps/bo/screens/placeholder.ts`
- Test: `tests/unit/bo/routes.test.ts`

- [x] **Step 1: Tulis test verifikasi navigasi rute-rute baru di Back-Office**
- [x] **Step 2: Jalankan test dan pastikan gagal**
- [x] **Step 3: Buat `placeholder.ts` untuk menampilkan preview rapi bagi submenu yang akan dikerjakan di tahap berikutnya**
- [x] **Step 4: Daftarkan semua rute di `src/apps/bo/index.ts` dan hubungkan inisialisasi tema saat mount**
- [x] **Step 5: Jalankan test dan pastikan lolos**

### Task 5: Verifikasi Menyeluruh

- [x] **Step 1: Jalankan `npm run kontras` untuk memastikan kontras WCAG AA lolos**
- [x] **Step 2: Jalankan `npm run lint:teks` untuk memastikan tidak ada pelanggaran tanda baca**
- [x] **Step 3: Jalankan `npm run typecheck` untuk memastikan zero type errors**
- [x] **Step 4: Jalankan `npm test` untuk memastikan semua tes unit lulus**
