# Revisi POS Toko Budiannor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POS mockup (`#/pos`) yang tampil dan berjalan seperti gambar referensi klien: shift dan modal awal, layar jual dengan dropdown kategori dan kartu harga per satuan, Split Payment, piutang dengan tempo dan DP, Cetak Struk atau Kirim WA, retur dari riwayat, dan empat tema warna, dengan data dari proposal.

**Architecture:** Vanilla TypeScript tanpa kerangka kerja; logika murni di `src/apps/pos/domain/`, layar di `src/apps/pos/screens/`, status sesi di `pos-session.ts`. Tema memakai token CSS yang dibangkitkan `scripts/build-tokens.mjs` dari `tokens/tokens.json` dan dipasang lewat atribut `data-pos-theme`, tanpa gaya inline. Data proposal ditambahkan ke akhir dataset bangkitan (`withProposalData`) dan POS menampilkannya di depan.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 5 (lingkungan node), Playwright 1.64 (Chromium), tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-07-revisi-pos-design.md`. Plan ini mengubah satu hal dari spec: data proposal ditambahkan di **akhir** `Dataset.products` dan `Dataset.customers` (bukan di depan) supaya uji dan layar BO yang bergantung pada indeks 0 tidak bergeser; POS menampilkannya di depan lewat penanda `pinned`. Spec diperbarui agar sama.

## Global Constraints

- Node >=22.12; semua versi paket dikunci persis; tidak menambah dependensi.
- Dilarang `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`; atribut `style` berupa string dilarang (CSP `style-src 'self'`); pakai kelas CSS atau `style.setProperty`.
- Dilarang tanda pisah panjang (en dash, em dash) di semua teks proyek (`npm run lint:teks`).
- Kontrol interaktif POS minimal 48 x 48 px dengan jarak 8 px; axe tanpa pelanggaran (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa).
- Kontras: teks biasa 4,5 : 1, teks utama POS 7 : 1, non-teks 3 : 1, berlaku untuk keempat tema.
- Anggaran per aplikasi: JS awal 70 KB gzip, CSS awal 25 KB gzip (`npm run budget`).
- Teks antarmuka baru masuk katalog `labels` di `src/shared/messages.ts` dan dicatat di `docs/teks-baru.md`. 120 `systemMessages` Lampiran C tidak diubah dan tidak ditambah; `PERMISSION_ROWS` di `src/shared/permissions.ts` tidak ditambah (uji izin mengunci 148 aturan).
- Uji e2e POS hanya berjalan pada viewport selebar 1000 px atau lebih (`test.skip` seperti `tests/e2e/pos.spec.ts`).
- Semua login POS di e2e lewat `loginPos` di `tests/e2e/helpers/routes.ts` (setelah Task 4 fungsi itu juga memulai shift); fungsi `login` lokal di `pos.spec.ts` dan `pos-lanjut.spec.ts` memanggilnya.
- Data tidak dikarang: angka barang dan pelanggan hanya dari spec bagian 3; asumsi di spec bagian 11.
- Jangan sentuh `src/apps/owner/domain/order.ts` (kosong di working tree, bukan bagian pekerjaan ini).
- Langkah commit di bawah dijalankan hanya setelah pengguna mengizinkan commit. Staging memakai daftar berkas eksplisit, bukan `git add -A`.

## Review Focus

1. Nominal tidak wajar: DP lebih besar dari total, nominal retur 0 atau melebihi nilai barang, isian bukan angka. Diharapkan DP dibatasi sebesar total, sedangkan nominal retur dan isian yang tidak sah ditolak dengan pesan; saldo dan stok tidak berubah salah. (Task 7, Task 10)
2. Pergantian pengguna saat shift terbuka, Frontliner tanpa shift, dan atur ulang data saat shift terbuka. Diharapkan shift milik perangkat, Frontliner tidak terhalang, atur ulang menutup shift. (Task 3, Task 4)
3. `localStorage` melempar galat atau berisi nilai tema yang tidak dikenal. Diharapkan tema Oranye dan tidak ada galat. (Task 2)
4. Transaksi bawaan lama tanpa `payments` pada riwayat, struk, dan retur. Diharapkan tetap tampil memakai `payment` dan `paid`. (Task 10, Task 11)
5. Pelanggan tanpa nomor telepon (Pak Wahyudi) atau Pelanggan Umum pada Kirim WA. Diharapkan kolom kosong dan pesan validasi, tanpa galat. (Task 9)

---

## Fase 1: Dasar

### Task 1: Data proposal dan foto

**Files:**

- Create: `src/shared/data/proposal.ts`, `tests/unit/proposal.test.ts`, `public/produk/*.webp` (7 berkas)
- Modify: `src/shared/data/types.ts`, `src/shared/store/store.ts:209`, `tests/unit/owner/store-owner.test.ts:54`, `tests/unit/store-stock.test.ts:63`, `tests/e2e/bo.spec.ts:246`

**Interfaces:**

- Produces (`types.ts`): `Product.incoming?: number | undefined`, `Product.photoUrl?: string | undefined` (relatif terhadap `BASE_URL`, mis. `produk/semen-gresik-40kg.webp`), `Product.pinned?: boolean | undefined`, `Customer.pinned?: boolean | undefined`.
- Produces (`proposal.ts`): `PROPOSAL_PRODUCTS: readonly Product[]` (7), `PROPOSAL_CUSTOMERS: readonly Customer[]` (7), `ASSUMED_CREDIT_LIMIT = 50_000_000`, `PROPOSAL_RECEIVABLE_TOTAL = 52_270_000`, `withProposalData(dataset: Dataset): Dataset` (menambahkan di akhir, tidak mengubah isi lain, tidak menambah dua kali bila dipanggil ulang).

- [ ] **Step 1: Buat cabang kerja** `git switch -c revisi-pos` (perubahan `order.ts` ikut terbawa, jangan di-stage).
- [ ] **Step 2: Tulis uji gagal `tests/unit/proposal.test.ts`.** Uji: (a) tabel spec 3.2 sebagai data uji: tiap barang punya kode satuan, isi, harga Eceran per satuan, stok `display`/`besar`/`incoming` persis spec (Semen SAK 70000 stok 28/800/undefined; Lem Fox KLG 10000, LSN 12 = 105000, DOS 72 = 600000, stok 78/144/72; Pylox KLG 30000, DOS 12 = 345000, stok 7/48/undefined; Knee PVC PCS 2000, DOS 100 = 175000, stok 220/0/300; Kabel NYM MTR 10000, ROL 100 = 900000, stok 115/0/undefined; Gembok PCS 20000, LSN 12 = 225000, DOS 120 = 2150000, stok 0/0/240; Engsel PSG 65000, LSN 12 = 720000, DOS 120 = 7000000, stok 66/0/0, kode `1059`, barcode `10005286`, hpp 45550, `minStock` 24, `minByWarehouse.display` 12). (b) Grosir: Engsel 55000/630000/6000000, barang lain Grosir sama dengan Eceran; Kontraktor sama dengan Grosir. (c) jumlah sisa seluruh faktur ketujuh pelanggan sama dengan `PROPOSAL_RECEIVABLE_TOTAL`. (d) `checkReceivable(pakWahyudi, 100000, new Date(REFERENCE_DATE))` mengembalikan `{ ok: false, messageId: 'MSG-036' }` dan hasil untuk `Bu Sherly` dengan 1_000_000 adalah `ok: true`. (e) pada `withProposalData(generateDataset())`: 3607 barang, 67 pelanggan, id, kode, dan nama tidak ada yang ganda, barcode tidak kosong tidak ada yang ganda, semua `pinned` ada di akhir, dan pemanggilan kedua tidak menambah. (f) `createStore().getState().data.products` berjumlah 3607.
- [ ] **Step 3: Jalankan** `npx vitest run tests/unit/proposal.test.ts`. Harapan: GAGAL (modul belum ada).
- [ ] **Step 4: Implement `proposal.ts` dan tipe baru.** Id barang `P-01`..`P-07`, kode `P001`.. kecuali Engsel `1059`, barcode `''` kecuali Engsel. Kategori: Engsel `Door & Window`; enam lainnya dipetakan ke kategori bangkitan terdekat (baca `FAMILIES` di `catalog.ts`). `allowDecimal: true` hanya Kabel NYM. HPP dan `minStock` 0 kecuali Engsel. Pelanggan `C-061`..`C-067`, kode `C0061`.. kecuali Kevin `PL387`, semua `tier: 'eceran'`, `limit: ASSUMED_CREDIT_LIMIT`, `dueDays: 30`. Pak Wahyudi memakai empat faktur spec 3.3 (id nomor faktur, `issuedAt` dan `dueAt` pukul `03:00:00.000Z` pada tanggal proposal); pelanggan lain satu faktur `SALDO-AWAL-<kode>` terbit `REFERENCE_DATE`, jatuh tempo 30 hari kemudian; Kevin tanpa faktur. Bu Sherly: alamat `Jl. Rajawali No 17`, telepon `0811230988`; pelanggan lain telepon `''`. Ubah `store.ts:209` menjadi `options.dataset ?? withProposalData(generateDataset())`.
- [ ] **Step 5: Foto.** Ekstrak gambar: `pdfimages -f 3 -l 5 -png ../docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf <folder-sementara>/p` (poppler ada di PATH). `p-000.png` adalah sketsa POS (hal. 3), `p-004.png` Form Data Barang (hal. 5); buka keduanya untuk memastikan. Potong dengan Pillow (satu kali pakai, skrip tidak masuk repositori), `thumbnail((320, 320))`, simpan WebP kualitas 85 (target di bawah 40 KB) ke `public/produk/`:

  | Berkas                     | Sumber | Kotak (kiri, atas, kanan, bawah) |
  | -------------------------- | ------ | -------------------------------- |
  | `semen-gresik-40kg.webp`   | p-000  | 8, 86, 230, 304                  |
  | `lem-fox-70gr.webp`        | p-000  | 237, 86, 460, 304                |
  | `cat-spray-pylox-109.webp` | p-000  | 467, 86, 696, 304                |
  | `knee-pvc-3-4.webp`        | p-000  | 8, 392, 230, 608                 |
  | `kabel-nym-2x1-5.webp`     | p-000  | 237, 392, 460, 608               |
  | `gembok-kodai-30.webp`     | p-000  | 467, 392, 696, 608               |
  | `engsel-bellucci-sn5.webp` | p-004  | 22, 143, 484, 274                |

  Isi `photoUrl` tiap barang dengan nama berkasnya. Periksa hasil potongan dengan membukanya.

- [ ] **Step 6: Jalankan** `npx vitest run tests/unit/proposal.test.ts`. Harapan: LULUS.
- [ ] **Step 7: Perbaiki uji yang bergantung pada angka lama.** Jalankan `npm test`; ubah `toHaveLength(60)` menjadi `67` pada dua berkas di atas bila memakai store bawaan, dan `3.600 barang` menjadi `3.607 barang` di `bo.spec.ts:246`. Harapan: `npm test` dan `npm run typecheck` hijau.
- [ ] **Step 8: Commit** `git add src/shared/data/proposal.ts src/shared/data/types.ts src/shared/store/store.ts public/produk tests/unit/proposal.test.ts tests/unit/owner/store-owner.test.ts tests/unit/store-stock.test.ts tests/e2e/bo.spec.ts` lalu `git commit -m "Tambah data barang dan pelanggan dari proposal"`.

### Task 2: Tema

**Files:**

- Create: `scripts/lib/contrast.mjs`, `src/apps/pos/theme.ts`, `tests/unit/theme.test.ts`, `tests/unit/theme-tokens.test.ts`
- Modify: `tokens/tokens.json`, `scripts/lib/tokens.mjs`, `scripts/build-tokens.mjs`, `scripts/check-contrast.mjs`, `src/apps/pos/index.ts`

**Interfaces:**

- Produces (`scripts/lib/contrast.mjs`): `luminance(hex: string): number`, `contrast(a: number, b: number): number` (dipindah dari `check-contrast.mjs`).
- Produces (`scripts/lib/tokens.mjs`): `withThemeOverrides(tokens: Map<string, Token>, overrides: Record<string, { $value?: string; $dark?: string }>): Map<string, Token>` (salinan dengan nilai terang dan gelap token yang ditimpa).
- Produces (`theme.ts`): `POS_THEMES = ['oranye', 'terakota', 'teal', 'gelap'] as const`, `type PosTheme`, `DEFAULT_THEME: PosTheme = 'oranye'`, `THEME_KEY = 'toko-budiannor-tema-pos'`, `parseTheme(raw: string | null): PosTheme`, `loadTheme(storage?: Pick<Storage, 'getItem'>): PosTheme`, `saveTheme(theme: PosTheme, storage?: Pick<Storage, 'setItem'>): void`, `applyTheme(root: HTMLElement, theme: PosTheme): void` (menyetel `root.dataset['posTheme']`).
- Produces (tokens.json): token semantik baru `semantic.color.accent.soft` (latar baris terpilih dan chip lembut), primitif `orange`, `teal`, dan blok tingkat atas `$themes` berbentuk `{ oranye: {...}, terakota: {}, teal: {...}, gelap: {...} }` yang menimpa `semantic.color.accent.default`, `.pressed`, dan `.soft` dengan `$value` (terang) dan `$dark` (permukaan gelap). `terakota` kosong berarti palet bawaan.

- [ ] **Step 1: Tulis uji gagal `tests/unit/theme.test.ts`.** `parseTheme(null)`, `parseTheme('ungu')`, dan `parseTheme('<script>')` menghasilkan `'oranye'`; `parseTheme('teal')` menghasilkan `'teal'`; `loadTheme` dengan `getItem` yang melempar galat menghasilkan `'oranye'`; `saveTheme` dengan `setItem` yang melempar tidak melempar; `saveTheme('gelap', fake)` menulis kunci `THEME_KEY`.
- [ ] **Step 2: Tulis uji gagal `tests/unit/theme-tokens.test.ts`.** Muat `tokens.json` dengan `loadTokenDocument`, `flatten`, lalu untuk setiap tema di `$themes` panggil `withThemeOverrides` dan evaluasi pasangan bertanda `"themed": true` memakai `luminance` dan `contrast`: setiap pasangan memenuhi batas kelasnya (`document.contrast.limits`); sertakan pasangan baru "Teks utama pada latar aksen lembut" (terang dan gelap, kelas `primary-pos`). Uji kedua membaca `src/styles/tokens.css` dan memastikan memuat `[data-pos-theme='teal']`, `[data-pos-theme='gelap']`, dan `[data-pos-surface='dark']`, serta tidak memuat blok untuk `terakota`.
- [ ] **Step 3: Jalankan** `npx vitest run tests/unit/theme.test.ts tests/unit/theme-tokens.test.ts`. Harapan: GAGAL.
- [ ] **Step 4: Implement `contrast.mjs` dan `withThemeOverrides`; ubah `check-contrast.mjs`** agar memakai `contrast.mjs` dan, setelah bagian B, mencetak bagian "C. Tema POS" yang mengevaluasi pasangan bertanda `themed` untuk tiap tema (konteks terang dengan `$value`, konteks gelap dengan `$dark`); pasangan tema tidak punya kolom spek 4.2, dan satu pasangan gagal membuat `process.exitCode = 1`. Tandai pasangan yang merujuk `semantic.color.accent.*` atau `component.button.primary-*` dengan `"themed": true` dan tambahkan pasangan lembut.
- [ ] **Step 5: Isi `$themes` dan primitif.** Nilai awal (disesuaikan sampai `npm run kontras` hijau): Oranye `default #B94F00`/`$dark #F0A15C`, `pressed #8F3C00`, `soft #FBE9D9`/`$dark #3A2A1E`; Teal `default #0F766E`/`$dark #5CC8BE`, `pressed #0B5A54`, `soft #D9F0EE`/`$dark #1E3331`; Gelap memakai aksen gelap pada kedua konteks (`default #E8836A`, `soft #2B2E33`). Bawaan `accent.soft` (palet Terakota) `#F5E3DD`/`$dark #3A2823`. Teks putih pada `default` terang harus minimal 4,5 : 1; teks `#16181B` pada `$dark` minimal 4,5 : 1.
- [ ] **Step 6: Ubah `build-tokens.mjs`** agar mengeluarkan, setelah blok yang ada dan berurutan: (1) set gelap paksa untuk `[data-app='pos'][data-pos-surface='dark']` ditambah `color-scheme: dark`; (2) per tema non-kosong, deklarasi terang untuk `[data-pos-theme='X'][data-app='pos'], [data-pos-theme='X'] [data-app='pos']`; (3) per tema, deklarasi `$dark` untuk `[data-pos-theme='X'] [data-app='pos'][data-pos-surface='dark']`, dan untuk tema `gelap` set gelap paksa lengkap pada selektor tema itu. Berkas Dart tidak berubah. Jalankan `npm run tokens`.
- [ ] **Step 7: Implement `theme.ts`** dan panggil `applyTheme(document.documentElement, loadTheme())` di awal `mount` pada `src/apps/pos/index.ts`.
- [ ] **Step 8: Jalankan** `npm run tokens && npm run kontras && npx vitest run tests/unit/theme.test.ts tests/unit/theme-tokens.test.ts`. Harapan: `Ringkasan` tanpa gagal, uji LULUS.
- [ ] **Step 9: Commit** (berkas Task 2 yang tercantum di Files, ditambah `src/styles/tokens.css`).

### Task 3: Shift dan saldo laci (domain dan sesi)

**Files:**

- Create: `src/apps/pos/domain/shift.ts`, `src/apps/pos/failure.ts`, `tests/unit/pos/shift.test.ts`
- Modify: `src/shared/data/types.ts`, `src/apps/pos/pos-session.ts`, layar yang memakai `message(result.messageId...)` (ditunjukkan `tsc`), `src/apps/pos/domain/forms.ts`, `src/apps/pos/index.ts`, `src/shared/messages.ts`, `tests/unit/pos/session-lanjut.test.ts`

**Interfaces:**

- Produces (`types.ts`): `SalePayment = { readonly method: PaymentMethod; readonly amount: number; readonly via?: PaymentMethod | undefined }`, `Sale.payments?: readonly SalePayment[] | undefined`, `RefundMethod = 'tunai' | 'qris' | 'edc' | 'transfer'`.
- Produces (`domain/shift.ts`): `Shift = { userId: string; startedAt: string; openingCash: number }`, `ShiftSummary = { openingCash: number; cashSales: number; expenses: number; cashReturns: number; closingCash: number }`, `REVIEW_OPENING_CASH = 500_000`, `cashFromSale(sale: Sale): number` (baris `tunai` dan `dp` dengan `via === 'tunai'`, dikurangi kembalian `max(0, jumlah baris terbayar - total)`, minimal 0; 0 bila `payments` kosong), `summarizeShift(shift: Shift, sales: readonly Sale[], deviceSales: readonly string[], expenses: readonly { amount: number }[], returns: readonly { refund?: { method: RefundMethod; amount: number } | undefined }[]): ShiftSummary` (hanya penjualan di `deviceSales` yang `createdAt >= shift.startedAt`), `needsShift(role: Role, shift: Shift | undefined): boolean` (benar bila bukan `frontliner` dan `shift === undefined`), `applyMoneyKey(current: number, key: MoneyKey): number` dengan `MoneyKey = '0'..'9' | '000' | 'C' | 'Backspace'` dibatasi 12 digit.
- Produces (`PosSession`): `state().shift: Shift | undefined`, `startShift(openingCash: number | undefined): ShiftResult`, `endShift(): ShiftSummary | undefined`, `shiftSummary(): ShiftSummary | undefined`, `cashBalance(): number` (0 tanpa shift; modal + tunai bersih - biaya - retur tunai). `ShiftResult = { ok: true } | { ok: false; labelKey: LabelKey }`. `FlowResult` dan `ReturnResult` melebar dengan varian `{ ok: false; labelKey: LabelKey }`; fungsi `failureText(result: Exclude<FlowResult, { ok: true }>): string` di `src/apps/pos/failure.ts` (memakai `message(...)` atau `label(...)`). `tsc` menunjukkan semua pemanggil `message(result.messageId...)` yang harus diganti `failureText`.
- Label baru (tambahkan ke `labels`): `modalWajib`, `shiftSudahBerjalan`, `butuhShift`.

- [ ] **Step 1: Tulis uji gagal `tests/unit/pos/shift.test.ts`** (memakai pola `setup()` pada `session.test.ts`; `createStore({ dataset: withProposalData(generateDataset()) })`). Uji: `applyMoneyKey(0,'1')` = 1, `(1,'000')` = 1000, `(1234,'Backspace')` = 123, `('C')` = 0, 13 digit dibatasi 12; `startShift(undefined)` gagal `modalWajib`, `startShift(0)` berhasil, panggilan kedua gagal `shiftSudahBerjalan`; saldo laci = modal + total setelah penjualan tunai pas (`addProduct`, `exactAmount`, `finish`); bayar tunai lebih Rp 20.000 menambah laci hanya sebesar total; penjualan QRIS tidak menambah laci; `saveExpense` mengurangi laci, gagal `butuhShift` tanpa shift dan memberi `MSG-041` bila melebihi saldo; `endShift()` mengembalikan ringkasan, menutup shift, dan `cashBalance()` menjadi 0; `store.resetData()` menutup shift; `logout()` lalu `attemptLogin` pengguna lain tidak menutup shift (pembuka tetap); `needsShift('frontliner', undefined)` salah dan `needsShift('kasir', undefined)` benar; `cashFromSale` untuk penjualan tanpa `payments` = 0.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/pos/shift.test.ts`. Harapan: GAGAL.
- [ ] **Step 3: Implement.** Tambah `shift` ke `PosState` (awal `undefined`, tidak direset `logout`); `finish()` mengisi `Sale.payments` dari `state.rows` (`via` diisi Task 7); `cashBalance` dan `saveExpense` memakai `summarizeShift(...).closingCash`; hapus konstanta `OPENING_CASH` dari `forms.ts`. Di `index.ts` Mode Tinjau, setelah `attemptLogin('U-3', '2468')` panggil `active.startShift(REVIEW_OPENING_CASH)` bila belum ada shift.
- [ ] **Step 4: Perbaiki uji lama.** Di `session-lanjut.test.ts` mulai shift pada `setup()`; jalankan `npm test` dan `npm run typecheck`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 3).

### Task 4: Layar shift (belum mulai, modal, ringkasan)

**Files:**

- Create: `src/apps/pos/screens/shift.ts`, `src/shared/ui/illustration.ts`, `tests/e2e/pos-revisi.spec.ts`
- Modify: `src/apps/pos/numpad.ts`, `src/apps/pos/screens/sell.ts`, `src/apps/pos/screens/expense.ts`, `src/styles/pos.css`, `src/shared/messages.ts`, `tests/e2e/helpers/routes.ts`, `tests/e2e/pos.spec.ts`, `tests/e2e/pos-lanjut.spec.ts`

**Interfaces:**

- Consumes: `needsShift`, `applyMoneyKey`, `startShift`, `endShift`, `shiftSummary` (Task 3).
- Produces (`numpad.ts`): `createMoneyPad(onKey: (key: MoneyKey) => void): { element: HTMLDivElement }` (tombol 1 sampai 9, `000`, `0`, `C`, hapus; semua minimal 48 px).
- Produces (`illustration.ts`): `createIllustration(kind: 'kasir' | 'keranjang'): SVGSVGElement` (bentuk sederhana, warna dari token, `aria-hidden`).
- Produces (`screens/shift.ts`): `createShiftGate(session: PosSession, onStarted: () => void): HTMLElement`, `openOpeningCashModal(session: PosSession, onStarted: () => void): void`, `openShiftSummary(session: PosSession, onEnded: () => void): void`.
- Produces (`tests/e2e/helpers/routes.ts`): `loginPosRaw(page, name = 'Dewi')` (pilih pengguna, ketik PIN yang dibaca dari `FICTIONAL_USERS` di `src/shared/data/generator`, tekan `Masuk`); `loginPos(page, name = 'Dewi')` yang memanggil `loginPosRaw` lalu, kecuali untuk Frontliner, menekan "Mulai Shift", mengisi modal 500000, menekan "Lanjut", dan menunggu teks "Shift Dimulai"; helper `startShift(page, amount)`.
- Teks (persis): judul gerbang `Belum Mulai Shift`, petunjuk `Tekan tombol "Mulai Shift" untuk memulai pekerjaan Anda`, tombol `Mulai Shift`, judul modal `Masukkan Modal`, kolom `Masukkan Modal`, tombol `Lanjut`, ringkasan `Selesai Shift` dengan tombol `Akhiri Shift`.

- [ ] **Step 1: Tulis uji e2e gagal di `tests/e2e/pos-revisi.spec.ts`** (`beforeEach` skip di bawah 1000 px). Uji `shift`: `loginPosRaw` Dewi, `/pos/jual` menampilkan `Belum Mulai Shift`; menekan `Lanjut` dengan kolom kosong menampilkan teks `modalWajib`; menekan `1`, `000`, `Lanjut` menghasilkan kolom `Rp 1.000` lalu gerbang hilang dan kartu barang tampil; layar Biaya tanpa shift menampilkan gerbang yang sama; Frontliner (Agus) langsung melihat kartu barang tanpa gerbang.
- [ ] **Step 2: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts --project=tablet-1280x800`. Harapan: GAGAL.
- [ ] **Step 3: Implement** modul di atas. `renderSell` dan `renderExpense` menampilkan `createShiftGate` menggantikan isi utama (bilah atas tetap) saat `needsShift(role, session.state().shift)`; setelah `onStarted` layar digambar ulang. Modal memakai `openModal` dengan papan `createMoneyPad`; kolom berupa `output` bergaya kolom input yang menampilkan `formatRupiah`.
- [ ] **Step 4: Perbarui helper dan uji lama.** `loginPos` dan fungsi `login` lokal memakai alur baru; sesuaikan `pos-lanjut.spec.ts:214` ke teks saldo dari modal yang dipakai (hitung dari angka modal pada uji itu).
- [ ] **Step 5: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts tests/e2e/pos.spec.ts tests/e2e/pos-lanjut.spec.ts --project=tablet-1280x800` dan `npm run typecheck`. Harapan: hijau.
- [ ] **Step 6: Commit** (berkas Task 4).

### Task 5: Kerangka (bilah atas, menu samping, pemilih tema, login)

**Files:**

- Create: `src/apps/pos/screens/drawer.ts`
- Modify: `src/apps/pos/topbar.ts`, `src/apps/pos/screens/login.ts`, `src/shared/ui/modal.ts`, `src/shared/icons.ts`, `scripts/copy-assets.mjs`, `src/styles/pos.css`, `src/styles/pos-lanjut.css`, `src/shared/messages.ts`, `tests/e2e/pos-revisi.spec.ts`, `tests/e2e/helpers/routes.ts`, e2e yang menekan tautan bilah atas
- Test: `tests/e2e/pos-revisi.spec.ts`, `tests/e2e/target-sentuh.spec.ts`

**Interfaces:**

- Consumes: `openShiftSummary` (Task 4), `POS_THEMES`, `saveTheme`, `applyTheme` (Task 2).
- Produces: `createTopbar(session, title)` (tanda tangan tetap): kiri tombol `Menu` (hanya saat masuk) dan judul, tengah chip `Shift Dimulai` (hanya saat shift berjalan; bila pengguna masuk berbeda dari pembuka shift, chip menambahkan nama pembuka, mis. `Shift Dimulai (Dewi)`), kanan chip Online/Offline yang ada dan ikon Bill dengan lencana jumlah `heldBills` (tautan ke `#/pos/bill`). `openDrawer(session: PosSession, go: (path: string) => void): void`. `ModalOptions.variant?: 'center' | 'drawer'` (menambah kelas `modal--drawer`, logika inert, jebakan fokus, dan Esc tetap). Ikon baru di `ICON_NAMES` dan `ICONS` (`menu`, `ellipsis-vertical`, `scan-barcode`, `user-round`, `receipt`, `log-out`, `minus`, `delete`); jalankan `npm run assets`.
- Isi menu samping (tautan `<a href>` kecuali tombol): Pesanan Baru `/pos/jual` (POS-02), Open Bill `/pos/bill` (POS-05), Riwayat Penjualan `/pos/riwayat` (POS-06), Biaya `/pos/biaya` (POS-07), Pelanggan `/pos/pelanggan-baru` (POS-08), Status Sinkronisasi `/pos/status` (POS-09); hanya yang lolos `canOpenScreen(role, id)`. Lalu radiogroup `Tema` berisi empat pilihan (Oranye, Terakota, Teal, Gelap), tombol `Selesai Shift` (tidak untuk Frontliner, memanggil `openShiftSummary`), dan tombol `Keluar` (`session.logout()` lalu `go('/pos')`).
- Login: kartu pengguna avatar (inisial pada lingkaran, nama, peran) tetap `role="radio"`; akar layar memakai `data-app="pos" data-pos-surface="dark"`; judul label `judulPilihKasir` menjadi `Pilih Pengguna`; papan PIN bundar dengan 6 titik (CSS saja).

- [ ] **Step 1: Tulis uji e2e gagal.** Tambahkan ke `pos-revisi.spec.ts`: tombol `Menu` membuka dialog dengan tautan `Riwayat Penjualan`, mengklik tautan itu menuju `#/pos/riwayat`; Frontliner tidak melihat `Riwayat Penjualan`, `Biaya`, dan `Selesai Shift`; memilih tema `Teal` mengubah `document.documentElement.dataset.posTheme` menjadi `teal` dan nilai `localStorage` `toko-budiannor-tema-pos`; muat ulang mempertahankan tema; `Selesai Shift` menampilkan ringkasan dengan modal awal, `Akhiri Shift` kembali ke `Belum Mulai Shift`; `Keluar` menuju `#/pos`; setelah Dewi memulai shift lalu `Keluar` dan `loginPosRaw(page, 'Rizal')`, kartu barang langsung tampil (tanpa gerbang) dan chip berbunyi `Shift Dimulai (Dewi)`; layar login memiliki elemen `[data-pos-surface="dark"]`.
- [ ] **Step 2: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts --project=tablet-1280x800`. Harapan: GAGAL.
- [ ] **Step 3: Implement** modul di atas dan CSS. Ikon dan label baru lewat `messages.ts`.
- [ ] **Step 4: Perbarui uji lama** yang memakai tautan bilah atas (`grep -n "navRiwayat\|getByRole('link'" tests/e2e/*.ts`): ganti dengan helper `openDrawerItem(page, name)` di `routes.ts` (membuka `Menu`, menekan tautan).
- [ ] **Step 5: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts tests/e2e/pos.spec.ts tests/e2e/pos-lanjut.spec.ts tests/e2e/target-sentuh.spec.ts tests/e2e/urutan-tab.spec.ts --project=tablet-1280x800`. Harapan: hijau (target sentuh 48 px dan urutan tab termasuk).
- [ ] **Step 6: Commit** (berkas Task 5).

### Task 6: Layar jual

**Files:**

- Create: `src/apps/pos/domain/catalog-view.ts`, `src/shared/ui/dropdown.ts`, `src/shared/ui/menu.ts`, `src/apps/pos/screens/customer-picker.ts`, `tests/unit/pos/catalog-view.test.ts`
- Modify: `src/apps/pos/screens/sell.ts`, `src/styles/pos.css`, `src/shared/messages.ts`, `tests/e2e/pos-revisi.spec.ts`, `tests/e2e/helpers/routes.ts`, `tests/e2e/pos.spec.ts`, `tests/e2e/pos-lanjut.spec.ts`, `tests/e2e/flows.spec.ts`

**Interfaces:**

- Produces (`catalog-view.ts`): `proposalFirst<T extends { readonly pinned?: boolean | undefined }>(items: readonly T[]): T[]` (stabil, `pinned` lebih dulu), `categoriesOf(products: readonly Product[]): string[]` (unik, urutan kemunculan setelah `proposalFirst`), `StockLine = { readonly key: 'toko' | 'gudang' | 'po'; readonly quantity: number | undefined; readonly unit: string }`, `stockLines(product: Product): readonly [StockLine, StockLine, StockLine]` (toko = `stock.display`, gudang = `stock.besar`, po = `incoming`; satuan dasar), `customerLabel(customer: Customer | undefined): string` (`PL387 - KEVIN WAHYUDI (RETAIL)`; tier `eceran` tertulis `RETAIL`, `grosir` `GROSIR`, `kontraktor` `KONTRAKTOR`; tanpa pelanggan: label `pelangganUmum`).
- Produces (`dropdown.ts`): `createDropdown(options: { labelText: string; options: readonly { value: string; text: string }[]; value: string; onChange: (value: string) => void }): { element: HTMLElement; setOptions(options: readonly { value: string; text: string }[], value: string): void }` (tombol `aria-haspopup="listbox"` dan `aria-expanded`, daftar `role="listbox"` dengan `role="option"` minimal 48 px dan `aria-selected`, panah, Home, End, Enter, Esc, klik luar menutup).
- Produces (`menu.ts`): `createMenuButton(options: { labelText: string; items: readonly { text: string; icon?: IconName; onSelect: () => void }[] }): HTMLElement` (tombol ikon `ellipsis-vertical`, popup `role="menu"` dengan `role="menuitem"`).
- Produces (`customer-picker.ts`): `openCustomerPicker(session: PosSession, onPicked: () => void, go: (path: string) => void): void` (modal: kolom cari, baris `.pos-customers__row` berisi inisial, `[kode] - nama`, tier, sisa limit; opsi Pelanggan Umum; tombol `+ Tambah Pelanggan` menuju `/pos/pelanggan-baru`; urutan `proposalFirst`).
- Teks (persis): `Semua Kategori`, `Masukkan kode / nama barang`, `Pesanan ({jumlah})`, `Belum ada barang yang dipilih`, `Tahan Bill`, `Panggil Bill`, `Cetak Struk Draf`, `Bayar {jumlah}`, `Subtotal`, `Toko`, `Gudang`, `PO`, `Pindai`, `Tambah Pelanggan`.

- [ ] **Step 1: Tulis uji unit gagal `catalog-view.test.ts`.** `proposalFirst` mempertahankan urutan relatif; `categoriesOf` unik; `stockLines(semen)` = toko 28, gudang 800, po `undefined`, satuan `SAK`; `stockLines(gembok)` = 0, 0, 240 `PCS`; `customerLabel(kevin)` sama dengan `PL387 - KEVIN WAHYUDI (RETAIL)`; `customerLabel(undefined)` sama dengan `label('pelangganUmum')`.
- [ ] **Step 2: Tulis uji e2e gagal** di `pos-revisi.spec.ts`: kartu pertama adalah `SEMEN GRESIK 40KG` dengan baris `SAK` `Rp 70.000` dan stok Toko 28, Gudang 800; mengetuk baris `DOS` pada kartu Lem Fox menambah satu `DOS` dengan harga `Rp 600.000`; dropdown `Semua Kategori` dibuka lalu satu kategori dipilih mengurangi jumlah kartu dan Esc menutup; tombol pelanggan memuat `Pelanggan Umum`, memilih `Kevin` mengubah labelnya menjadi `PL387 - KEVIN WAHYUDI (RETAIL)`; panel kanan menampilkan `Belum ada barang yang dipilih` lalu `Pesanan (1)` dan `QTY : 3 X 70.000` setelah tiga kali ketuk; menu titik tiga berisi `Tahan Bill`, menekannya menaikkan lencana Bill; Frontliner tidak punya tombol `Bayar` dan melihat `Cetak Struk Draf` di menu.
- [ ] **Step 3: Jalankan** unit dan e2e. Harapan: GAGAL.
- [ ] **Step 4: Implement.** `renderSell`: baris alat (dropdown, formulir cari dengan tombol `Pindai` yang memfokuskan kolom cari dan menampilkan petunjuk, tombol pelanggan), grid tiga kolom dengan kartu `article.pos-card` berisi tombol utama (foto dari `${import.meta.env.BASE_URL}${photoUrl}` atau kotak placeholder, nama; ketuk panjang dan Shift+Enter membuka `openUnitModal`) dan satu tombol per satuan (satuan dan harga menurut tier) di samping blok stok `stockLines` (PO kosong tertulis `-`, satuan dasar), panel kanan sesuai spec 5. Hapus chip kategori, panel pelanggan lama, dan blok `.pos-actions`. Pintasan F2, F4, F6, F9 dan penolakan MSG-025 dan MSG-028 tetap.
- [ ] **Step 5: Perbarui uji lama** yang memakai `.pos-actions`, chip kategori, dan teks lama (`grep -n "pos-actions\|pos-categories\|Tahan Bill" tests/e2e/*.ts`), termasuk `OVERLAYS` POS-10 di `routes.ts` (pilih pelanggan lewat tombol pelanggan). Jalankan `npm run typecheck`, `npx vitest run tests/unit/pos`, dan `npx playwright test tests/e2e/pos*.spec.ts tests/e2e/flows.spec.ts tests/e2e/target-sentuh.spec.ts tests/e2e/audit.spec.ts --project=tablet-1280x800`. Harapan: hijau.
- [ ] **Step 6: Commit** (berkas Task 6).

---

## Fase 2: Pembayaran

### Task 7: Domain pembayaran, tempo, dan DP (sesi)

**Files:**

- Create: `src/apps/pos/domain/terms.ts`, `tests/unit/pos/terms.test.ts`
- Modify: `src/shared/data/types.ts`, `src/apps/pos/domain/payment.ts`, `src/apps/pos/pos-session.ts`, `src/shared/messages.ts`, `tests/unit/pos/payment.test.ts`, `tests/unit/pos/session-lanjut.test.ts`, serta berkas BO, Owner, dan Sales yang ditunjukkan `tsc`

**Interfaces:**

- Produces (`types.ts`): `PaymentMethod = 'tunai' | 'qris' | 'edc' | 'transfer' | 'dp' | 'piutang'`, `PaidMethod = Exclude<PaymentMethod, 'dp' | 'piutang'>`, `SaleTerms = { readonly dueDays: number; readonly dueDate: string }`, `Sale.terms?: SaleTerms | undefined`, `Sale.dp?: number | undefined`.
- Produces (`payment.ts`): `PaymentRow = { method: PaymentMethod; amount: number; via?: PaidMethod | undefined }`, `METHODS` dan himpunan terbayar memuat `edc`, `CASH_METHODS: readonly PaidMethod[] = ['tunai', 'qris', 'edc', 'transfer']`, `withDownPayment(rows: readonly PaymentRow[], amount: number, via: PaidMethod): readonly PaymentRow[]` (amount 0 menghapus baris `dp`), `maxAmount(method: PaidMethod, total: number, rows: readonly PaymentRow[]): number | undefined` (`undefined` untuk `tunai`; selain itu `remainingDue(total, rows, method)`).
- Produces (`terms.ts`): `TERM_CHOICES = [7, 30, 45] as const`, `dueDateOf(now: Date, days: number): string` (ISO, `now` ditambah `days` x 86.400.000 ms), `parseTermDays(raw: string, fallback: number): number | undefined` (kosong memberi `fallback`; sah 0 sampai 365 seperti `parseDueDays`).
- Produces (`PosSession`): `state().terms: { dueDays: number } | undefined` (ikut `EMPTY_PAYMENT`), `setTerms(days: number): void`, `setDownPayment(amount: number, via: PaidMethod): void`; `chooseReceivable('piutang')` dan `setCustomer` mengisi `terms.dueDays` dari `customer.dueDays ?? 30`; `finish()` mengisi `Sale.payments` (semua baris dengan `via`), `Sale.dp`, dan `Sale.terms` (hanya bila ada baris `piutang`).
- Label baru: `metodeEdc`.

- [ ] **Step 1: Tulis uji gagal.** `payment.test.ts`: `edc` dihitung terbayar; `withDownPayment(rows, 20000, 'qris')` menyimpan `via` dan `withDownPayment(rows, 0, 'qris')` menghapus baris; `maxAmount('qris', 100000, [{tunai 60000}])` = 40000 dan `maxAmount('tunai', ...)` = `undefined`; split tunai 60000 + QRIS 40000 untuk total 100000 berstatus `ready` dengan kembalian 0. `terms.test.ts`: `dueDateOf(new Date('2026-10-19T03:00:00Z'), 30)` = `'2026-11-18T03:00:00.000Z'`, `parseTermDays('', 30)` = 30, `'366'` dan `'abc'` dan `'-1'` = `undefined`, `'0'` = 0. `session-lanjut.test.ts` (dataset proposal): piutang untuk Bu Sherly dengan DP 20000 via QRIS menghasilkan `Sale.dp` 20000, `Sale.terms.dueDays` 30, `Sale.payments` memuat baris `dp` dengan `via: 'qris'` dan baris `piutang` 50000 untuk satu Sak Semen; DP melebihi total dibatasi sebesar total dan DP bukan angka (`NaN`) tidak mengubah baris; piutang untuk Pak Wahyudi tetap `blocked` dengan `MSG-036`.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/pos`. Harapan: GAGAL.
- [ ] **Step 3: Implement** sesuai Interfaces. `setDownPayment` membulatkan ke bilangan bulat, membatasi 0 sampai total, dan mengabaikan nilai tidak terhingga. Lengkapi `edc` pada setiap tabel label atau `switch` yang ditunjukkan `npm run typecheck` (BO, Owner, Sales, `receipt-preview.ts`); hanya melengkapi, jangan merombak.
- [ ] **Step 4: Jalankan** `npm run typecheck && npm test`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 7).

### Task 8: Layar bayar (syarat bayar, Split Payment, piutang)

**Files:**

- Modify: `src/apps/pos/screens/pay.ts`, `src/styles/pos.css`, `src/shared/messages.ts`, `tests/e2e/pos-revisi.spec.ts`, `tests/e2e/pos.spec.ts`, `tests/e2e/pos-lanjut.spec.ts`, `tests/e2e/flows.spec.ts`, `tests/e2e/helpers/routes.ts`

**Interfaces:**

- Consumes: `withDownPayment`, `maxAmount`, `CASH_METHODS`, `TERM_CHOICES`, `parseTermDays`, `dueDateOf`, `setTerms`, `setDownPayment`, `chooseReceivable`, `setAmount`, `exactAmount` (Task 7).
- Teks (persis): grup `Syarat Bayar` dengan pilihan `Tunai` dan `Piutang`; saklar `Split Payment` (`role="switch"`); cara bayar `Tunai`, `QRIS`, `EDC`, `Transfer`; tombol `Tambah Pembayaran`; baris ringkasan `Sisa`, `Kembalian`; piutang: `Tempo` (tombol `7 hari`, `30 hari`, `45 hari`, dan kolom `Hari lainnya`), `DP`, `Cara bayar DP`, `Sisa Tagihan`, `Jatuh Tempo`; tombol utama `Bayar`.

- [ ] **Step 1: Tulis uji e2e gagal** (`pos-revisi.spec.ts`, setelah shift dimulai dan barang `P-01` ditambah): (a) Tunai: `Uang Pas` lalu `Bayar` menyimpan transaksi (toast `Transaksi T-000141 tersimpan.`). (b) QRIS: memilih `QRIS` mengisi jumlah sebesar total dan `Bayar` aktif. (c) Split: saklar `Split Payment` aktif; `Tunai` 30000 ditambah; `Sisa` tampil `Rp 40.000` (total Rp 70.000); `QRIS` tidak bisa diisi melebihi sisa (kolom dibatasi); `Bayar` nonaktif sampai `Sisa` 0, aktif setelah QRIS 40000. (d) Piutang: tanpa pelanggan tampil MSG-034; dengan Bu Sherly, `30 hari` terpilih bawaan, `Jatuh Tempo` tampil `18 Nov 2026`, DP 20000 via `QRIS` memberi `Sisa Tagihan` `Rp 50.000` dan `Bayar` menyimpan; `Hari lainnya` bernilai `366` menampilkan kesalahan. (e) Pak Wahyudi: pilihan Piutang menampilkan MSG-036 dan tombol `Minta Otorisasi Owner`. (f) Pintasan tetap: tombol 1 sampai 4 memilih Tunai, QRIS, EDC, Transfer saat fokus bukan di kolom isian, Enter atau F4 menyelesaikan, Esc kembali.
- [ ] **Step 2: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts --project=tablet-1280x800`. Harapan: GAGAL.
- [ ] **Step 3: Implement ulang `renderPay`** memakai API Task 7. Mode normal: satu cara bayar; Tunai memakai jumlah diterima dan tombol cepat `QUICK_AMOUNTS`; selain Tunai langsung sebesar total. Mode Split: daftar baris yang bisa dihapus, pemilih cara bayar dan nominal dibatasi `maxAmount`. Piutang: panel tempo, DP, ringkasan, dan banner limit yang ada (blokir dan otorisasi memakai `openAuthorizeModal`). Hasil `finish()` sementara tetap memunculkan toast dan kembali ke `/pos/jual`; Task 9 menggantinya dengan modal.
- [ ] **Step 4: Perbarui uji lama** untuk nama tombol, label, dan urutan baru (`grep -n "Selesaikan dan Cetak Struk\|Uang Pas\|'Piutang'" tests/e2e/*.ts`); F-01 tetap 3 ketukan setelah barang terakhir (`Bayar`, `Uang Pas`, `Bayar`). Jalankan `npx playwright test tests/e2e/pos*.spec.ts tests/e2e/flows.spec.ts tests/e2e/audit.spec.ts tests/e2e/target-sentuh.spec.ts --project=tablet-1280x800`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 8).

### Task 9: Pembayaran Berhasil, Cetak Struk, Kirim WA

**Files:**

- Create: `src/apps/pos/screens/payment-done.ts`, `src/apps/pos/screens/share-receipt.ts`
- Modify: `src/apps/pos/screens/pay.ts`, `src/apps/pos/screens/receipt-preview.ts`, `src/shared/messages.ts`, `src/styles/pos.css`, `tests/e2e/pos-revisi.spec.ts`, `tests/e2e/pos.spec.ts`, `tests/e2e/pos-lanjut.spec.ts`, `tests/e2e/flows.spec.ts`

**Interfaces:**

- Produces (`share-receipt.ts`): `openShareReceipt(options: { session: PosSession; title: string; reference: string; amountText: string; customerName: string; phone: string; sentLabel: LabelKey }): void` (modal berjudul `title`, kolom `Nomor WhatsApp` terisi `phone`, tombol `Kirim` memakai `isValidPhone` dari `domain/forms.ts`; tidak sah menampilkan `message('MSG-044')`, sah menampilkan toast `label(sentLabel)` dan menutup; tanpa permintaan jaringan dan tanpa tautan keluar).
- Produces (`payment-done.ts`): `openPaymentDone(session: PosSession, sale: Sale, go: (path: string) => void): void` (modal `Pembayaran Berhasil`: nomor transaksi, total, `Kembalian` bila ada, nama pelanggan; tombol `Cetak Struk` membuka `openReceiptPreview` dengan `saleReceipt(session, sale, 'sale', width)`, `Kirim WA` membuka `openShareReceipt`, `Selesai` menutup dan `go('/pos/jual')`).
- `saleReceipt` memakai `sale.payments` bila ada (nama cara bayar dari label; baris `piutang` tertulis `Piutang`, kembalian dihitung dari jumlah baris terbayar dikurangi total), selain itu perilaku lama (`payment` dan `paid`).
- Label baru: `pembayaranBerhasil`, `strukTerkirimWa`, `nomorWhatsapp`, `kirimWa`.

- [ ] **Step 1: Tulis uji e2e gagal.** (a) Bayar tunai lebih Rp 20.000 menampilkan dialog `Pembayaran Berhasil` dengan `Kembalian Rp 20.000` dan nomor `T-000141`. (b) `Cetak Struk` membuka pratinjau yang memuat nomor transaksi; dengan printer terputus (panel simulasi) pesan MSG-040 tampil seperti sebelumnya. (c) `Kirim WA` untuk Pak Wahyudi (tanpa telepon): kolom kosong, `Kirim` menampilkan `Nomor telepon tidak valid. Gunakan 9 sampai 14 angka.` tanpa galat konsol; untuk Bu Sherly kolom terisi `0811230988` dan `Kirim` menampilkan toast dan menutup; Pelanggan Umum: kolom kosong, validasi sama. (d) `Selesai` kembali ke `/pos/jual` dengan `Belum ada barang yang dipilih`. (e) Pemeriksaan jaringan: tidak ada permintaan baru saat `Kirim` (`page.on('request')`).
- [ ] **Step 2: Jalankan** `npx playwright test tests/e2e/pos-revisi.spec.ts --project=tablet-1280x800`. Harapan: GAGAL.
- [ ] **Step 3: Implement** modul dan hubungkan ke `pay.ts` (`finish()` lalu `openPaymentDone`). Banner `MSG-018` dan tombol `Cetak Ulang` pada layar jual tetap bila printer terputus.
- [ ] **Step 4: Perbarui uji lama** yang mengharapkan toast dan kembali otomatis (F-01: toast `Transaksi T-000141 tersimpan.` sekarang berada bersama dialog; hitungan ketukan berhenti saat transaksi tersimpan). Jalankan `npx playwright test tests/e2e/pos*.spec.ts tests/e2e/flows.spec.ts tests/e2e/jaringan.spec.ts tests/e2e/audit.spec.ts --project=tablet-1280x800` dan `npm run typecheck`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 9).

---

## Fase 3: Riwayat dan retur

### Task 10: Domain retur (sesi)

**Files:**

- Create: `src/apps/pos/domain/retur.ts`, `tests/unit/pos/retur.test.ts`
- Modify: `src/apps/pos/pos-session.ts`, `src/shared/data/types.ts` (hanya bila `RefundMethod` belum ada), `src/shared/messages.ts`, `tests/unit/pos/session-lanjut.test.ts`

**Interfaces:**

- Produces (`retur.ts`): `REFUND_METHODS: readonly RefundMethod[] = ['tunai', 'qris', 'edc', 'transfer']`, `RETUR_REASONS = ['barang', 'batal', 'salah-bayar', 'lainnya'] as const` dan `type ReturReason`, `ReturnInput = { items: readonly { index: number; quantity: number }[]; reason: ReturReason; note: string; refund: { method: RefundMethod; amount: number } | undefined; photoName?: string | undefined }`, `itemsValue(sale: Sale, items: ReturnInput['items']): number` (jumlah dari `Math.round(quantity * unitPrice)`), `defaultRefundMethod(sale: Sale): RefundMethod` (cara bayar utama dari `payments` bila termasuk `REFUND_METHODS`; tanpa `payments` memakai `sale.payment`; selain itu `'tunai'`), `validateRefundAmount(amount: number, value: number): 'ok' | 'not-positive' | 'too-high'`.
- Produces (`PosSession`): `returnItems(saleNumber: string, input: ReturnInput): ReturnResult` (implementasi tunggal; urutan pemeriksaan: hak akses `MSG-003`, transaksi dan barang `MSG-084`, jumlah `MSG-029` dan `MSG-085`, alasan `lainnya` tanpa catatan `MSG-086`, nominal `labelKey: 'nominalMelebihi'` atau `MSG-029`, retur tunai tanpa shift `labelKey: 'butuhShift'`, retur tunai melebihi saldo laci `MSG-041` dengan `{ saldo }`); `returnSale(saleNumber, items, reason: string): ReturnResult` tetap, memanggil `returnItems` dengan `reason: 'lainnya'`, `note: reason`, `refund: undefined`. `ReturnRecord` bertambah `refund?: { method: RefundMethod; amount: number }`, `reasonKind?: ReturReason`, `photoName?: string`; `value` tetap nilai barang.
- Label baru: `nominalMelebihi`.

- [ ] **Step 1: Tulis uji gagal `retur.test.ts`.** `itemsValue` untuk 2 Sak Semen = 140000; `defaultRefundMethod` untuk penjualan QRIS = `'qris'`, untuk piutang murni = `'tunai'`, untuk penjualan bawaan lama tanpa `payments` bermetode `transfer` = `'transfer'` dan bermetode `dp` = `'tunai'`; `validateRefundAmount(0, 100)` = `'not-positive'`, `(101, 100)` = `'too-high'`, `(100, 100)` = `'ok'`. Sesi (peran Supervisor, shift dimulai 100000, penjualan tunai Rp 70.000): retur tunai Rp 70.000 mengurangi `cashBalance()` sebesar 70000 dan menambah stok Display; retur QRIS tidak mengubah laci; retur tunai tanpa shift gagal `butuhShift`; nominal 1 melebihi nilai gagal `nominalMelebihi`; nominal 0 gagal `MSG-029`; alasan `lainnya` dengan catatan kosong gagal `MSG-086`; jumlah melebihi sisa gagal `MSG-085`; peran Kasir gagal `MSG-003`; `returnSale` lama pada `T-000101` tetap berhasil seperti uji yang ada.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/pos/retur.test.ts`. Harapan: GAGAL.
- [ ] **Step 3: Implement** sesuai Interfaces; `summarizeShift` menghitung `cashReturns` dari catatan `refund.method === 'tunai'`. Log aktivitas mencatat `Retur penjualan` dengan nomor, cara kembali, dan nominal.
- [ ] **Step 4: Jalankan** `npm run typecheck && npm test`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 10).

### Task 11: Riwayat dua panel dan Share Struk

**Files:**

- Modify: `src/apps/pos/screens/history.ts`, `src/apps/pos/domain/history.ts`, `src/styles/pos.css`, `src/styles/pos-lanjut.css`, `src/shared/messages.ts`, `tests/unit/pos/history.test.ts`, `tests/e2e/pos-lanjut.spec.ts`, `tests/e2e/pos-revisi.spec.ts`

**Interfaces:**

- Consumes: `openShareReceipt` dan `saleReceipt` (Task 9); tombol `Retur` tetap memanggil `openReturnModal(session, sale, render)` yang ada.
- Produces (`domain/history.ts`): `groupByDay(sales: readonly Sale[]): readonly { readonly day: string; readonly sales: readonly Sale[] }[]` (terbaru dulu, kunci `dayOf`), `paymentKeyOf(sale: Sale): 'split' | PaymentMethod` (`'split'` bila `payments` memuat lebih dari satu baris terbayar; tanpa `payments` memakai `sale.payment`), `receivableInfo(sale: Sale): { sisa: number; dueDate: string | undefined } | undefined` (ada bila `total - paid > 0`).
- Susunan layar: kiri kolom cari, filter yang ada, dan daftar per hari (`Hari Ini` dan seterusnya) berisi nomor, total, jam, cara bayar (`Split` bila lebih dari satu), kasir; kanan detail transaksi terpilih (terbaru terpilih otomatis) dengan tombol `Retur` (hanya peran berhak), `Share Struk`, `Cetak Struk`, bagian `Informasi Penjualan`, `Informasi Penerimaan` (Total Penerimaan, Total Bayar, Kembali, riwayat per cara bayar, serta Tempo, Jatuh Tempo, Sisa Tagihan untuk piutang), dan `Barang & Jasa`. Pencarian nomor persis lewat Enter, cetak ulang bertanda SALINAN, aturan offline (E-05), dan status (E-04) tetap. `pageCount` dan `pageSlice` tetap diekspor dan diuji.

- [ ] **Step 1: Tulis uji unit gagal** di `history.test.ts`: `groupByDay` mengelompokkan dan mengurutkan terbaru dulu; `paymentKeyOf` untuk `payments` tunai + QRIS = `'split'`, untuk transaksi bawaan lama (`payment: 'qris'`, tanpa `payments`) = `'qris'`; `receivableInfo` untuk total 100000 dibayar 30000 memberi `sisa` 70000 dan untuk lunas `undefined`.
- [ ] **Step 2: Tulis uji e2e gagal.** Riwayat memuat dua panel; memilih baris lain mengganti detail; transaksi split baru menampilkan `Split` pada daftar dan dua baris pada `Riwayat Penerimaan`; transaksi piutang menampilkan `Jatuh Tempo` dan `Sisa Tagihan`; transaksi bawaan lama (mis. `T-000101`) tetap tampil lengkap dan `Cetak Struk` membuka pratinjau bertanda `SALINAN`; `Share Struk` membuka modal `Nomor WhatsApp`; Kasir tidak melihat tombol `Retur`.
- [ ] **Step 3: Jalankan** unit dan e2e. Harapan: GAGAL.
- [ ] **Step 4: Implement** fungsi domain dan susun ulang `renderHistory`. `Share Struk` memanggil `openShareReceipt` dengan `sentLabel: 'strukTerkirimWa'` dan telepon pelanggan transaksi itu; `Cetak Struk` memakai `saleReceipt(session, sale, 'copy', width)`.
- [ ] **Step 5: Jalankan** `npx vitest run tests/unit/pos` dan `npx playwright test tests/e2e/pos*.spec.ts tests/e2e/audit.spec.ts tests/e2e/target-sentuh.spec.ts --project=tablet-1280x800`. Harapan: hijau.
- [ ] **Step 6: Commit** (berkas Task 11).

### Task 12: Modal Retur, Retur Berhasil, struk retur

**Files:**

- Create: `src/shared/ui/stepper.ts`
- Modify: `src/apps/pos/screens/retur-modal.ts`, `src/apps/pos/domain/receipt.ts`, `src/apps/pos/screens/receipt-preview.ts`, `src/apps/pos/screens/history.ts`, `src/styles/pos-lanjut.css`, `src/shared/messages.ts`, `tests/unit/pos/receipt.test.ts`, `tests/e2e/pos-lanjut.spec.ts`, `tests/e2e/pos-revisi.spec.ts`

**Interfaces:**

- Consumes: `returnItems`, `REFUND_METHODS`, `RETUR_REASONS`, `itemsValue`, `defaultRefundMethod` (Task 10), `openShareReceipt` (Task 9).
- Produces (`stepper.ts`): `createStepper(options: { labelText: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }): { element: HTMLElement; setValue(value: number): void; setMax(max: number): void }` (tombol `-` dan `+` serta kolom angka, minimal 48 px, `aria-label` memakai `labelText`).
- Produces (`receipt.ts`): `ReceiptKind` bertambah `'retur'` (judul `BUKTI RETUR` di tengah memakai label `judulBuktiRetur`; item adalah barang yang diretur; total adalah nominal dikembalikan; baris pembayaran memuat nama cara kembali; tanpa kembalian). `returnReceipt(session: PosSession, record: ReturnRecord, width: PaperWidth): ReceiptInput` di `receipt-preview.ts`; `SUCCESS_LABELS` mencakup `'retur'`.
- Susunan modal (urut): `Pilih Semua` dan satu baris per barang (kotak centang, nama, jumlah dibeli dan satuan, stepper jumlah dibatasi sisa yang belum diretur), `Pembayaran Dikembalikan` dengan kolom `Jumlah Dikembalikan` (bawaan `itemsValue`), grup `Metode Pengembalian` (`Tunai`, `QRIS`, `EDC`, `Transfer`; bawaan `defaultRefundMethod`), grup `Alasan Retur` (`Pengembalian Barang`, `Pembatalan Transaksi`, `Kesalahan Pembayaran`, `Lainnya` dengan kolom `Keterangan` wajib), `Foto Bukti Retur (Opsional)` (`<input type="file" accept="image/*">` hanya mencatat nama), pengaki `Total Retur` dan `Dari {n} Kuantitas` serta tombol `Retur`. Hasil: modal `Retur Berhasil` dengan `Dikembalikan {nominal}`, nama pelanggan, tombol `Cetak Bukti Retur`, `Kirim Bukti Retur`, `Selesai`.

- [ ] **Step 1: Tulis uji gagal.** `receipt.test.ts`: `buildReceipt({ kind: 'retur', ... })` memuat `BUKTI RETUR`, tidak memuat `Kembalian`, dan setiap baris tidak melebihi lebar 32 dan 48 karakter. e2e di `pos-revisi.spec.ts` (login Ibu Sinta sebagai Supervisor, shift dimulai, transaksi tunai 3 Sak Semen dibuat, buka Riwayat): tombol `Retur` membuka modal; `Retur` tanpa barang menampilkan `Pilih minimal satu barang untuk diretur.`; `Pilih Semua` mencentang semua dan `Total Retur` `Dari 3 Kuantitas`; stepper tidak melebihi 3; nominal diubah menjadi `1` lebih dari nilai menampilkan teks `nominalMelebihi`; memilih `Lainnya` tanpa keterangan menampilkan `Alasan retur wajib diisi.` (MSG-086); retur sah menampilkan `Retur Berhasil`, `Dikembalikan Rp 140.000` untuk 2 Sak, dan tombol `Cetak Bukti Retur` membuka pratinjau memuat `BUKTI RETUR`; Selesai menutup dan jumlah yang bisa diretur berkurang pada pembukaan modal berikutnya.
- [ ] **Step 2: Jalankan** `npx vitest run tests/unit/pos/receipt.test.ts` dan e2e. Harapan: GAGAL.
- [ ] **Step 3: Implement** `createStepper`, modal baru, `returnReceipt`, dan hubungkan `history.ts` ke modal baru. Pesan galat memakai `failureText` (Task 3). Label baru `buktiReturTerkirimWa` dipakai sebagai `sentLabel` pada `openShareReceipt` untuk `Kirim Bukti Retur`.
- [ ] **Step 4: Jalankan** `npm run typecheck`, `npm test`, dan `npx playwright test tests/e2e/pos*.spec.ts tests/e2e/audit.spec.ts tests/e2e/target-sentuh.spec.ts --project=tablet-1280x800`. Harapan: hijau.
- [ ] **Step 5: Commit** (berkas Task 12).

### Task 13: Dokumentasi dan verifikasi akhir

**Files:**

- Modify: `docs/asumsi.md`, `docs/teks-baru.md`, `README.md`
- Test: seluruh suite

- [ ] **Step 1: Catat asumsi.** Tambahkan bagian `## 13. Revisi POS November 2026` di `docs/asumsi.md` berisi A-1 sampai A-10 dari spec bagian 11, konflik proposal (Toko Arif, Pak Samsul, Haji Sulam tidak dimasukkan; total piutang Bu Sherly memakai hal. 7), penempatan data di akhir dataset, dan sumber foto (halaman 3 dan 5 PDF proposal, resolusi sekitar 150 piksel).
- [ ] **Step 2: Catat teks baru.** Tambahkan satu entri `TB-xxx` ke `docs/teks-baru.md` untuk setiap kunci label baru di `messages.ts` (bandingkan dengan `git diff -U0 src/shared/messages.ts`), termasuk perubahan `judulPilihKasir` menjadi `Pilih Pengguna`.
- [ ] **Step 3: README.** Perbarui daftar layar POS (shift, menu samping, tema) dan tabel `Uji dan verifikasi` bila perintah berubah.
- [ ] **Step 4: Verifikasi penuh.** Jalankan berurutan: `npm run lint`, `npm run lint:teks`, `npm run typecheck`, `npm test`, `npm run kontras`, `npm run build`, `npm run budget`, `npm run test:e2e`, `npm run verifikasi:axe`. Harapan: semuanya lulus; bagian C `npm run kontras` memuat empat tema tanpa gagal; `verifikasi:axe` tanpa pelanggaran.
- [ ] **Step 5: Pemeriksaan visual.** Jalankan `npm run serve`; pada 1280 x 800 dan 1366 x 768 untuk setiap tema (ganti lewat menu samping) ambil tangkapan layar login, belum mulai shift, jual, bayar piutang, Pembayaran Berhasil, riwayat, dan Retur Berhasil, lalu bandingkan dengan gambar referensi dan sketsa proposal halaman 3. Catat selisih yang disengaja (palet tema, foto 150 piksel) pada laporan akhir.
- [ ] **Step 6: Commit** `git add docs/asumsi.md docs/teks-baru.md README.md` lalu `git commit -m "Catat asumsi, teks baru, dan README revisi POS"`.
