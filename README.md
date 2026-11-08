# Mockup POS dan Inventory Toko Budiannor

Mockup HTML interaktif yang bisa diklik untuk Sistem POS dan Inventory Toko Budiannor. Seluruhnya statis: tidak ada server, tidak ada basis data, dan tidak ada permintaan jaringan ke luar. Data contoh (3.600 barang, 60 pelanggan, riwayat transaksi) dibangkitkan secara deterministik di peramban dari benih tetap.

Lima modul dalam satu bundel, dipilih lewat hash alamat:

| Modul  | Alamat    | Kerangka rancangan | Isi                                                        |
| ------ | --------- | ------------------ | ---------------------------------------------------------- |
| portal | `#/`      | semua              | Beranda, halaman gaya (`#/gaya`), Mode Tinjau (`#/tinjau`) |
| pos    | `#/pos`   | 1280 x 800         | Kasir: POS-01 sampai POS-10                                |
| bo     | `#/bo`    | 1440 x 900         | Back-Office: BO-01 sampai BO-09                            |
| owner  | `#/owner` | 360 x 800          | Monitoring Owner (aplikasi mobile): OWN-01 sampai OWN-06   |
| sales  | `#/sales` | 360 x 800          | Sales Lapangan (aplikasi mobile): SALES-01 sampai SALES-05 |

BO-08 dan BO-10 sampai BO-22 belum dibangun pada mockup ini; Mode Tinjau menandainya "belum dibangun".

### Revisi POS (November 2026)

POS memakai menu samping, shift dengan modal awal, layar jual bergaya referensi (dropdown kategori, kartu harga per satuan dengan stok Toko, Gudang, dan PO), pembayaran Tunai atau Piutang dengan Split Payment, EDC, tempo, dan DP, dialog Pembayaran Berhasil (Cetak Struk atau Kirim WA), riwayat dua panel, retur (barang, jumlah, nominal, cara pengembalian), dan tema warna yang dipilih dari Pengaturan (putaran kedua mengganti empat tema dengan enam palet dan mode terang, gelap, atau otomatis). Tujuh barang dan tujuh pelanggan dari proposal tampil paling depan; asumsi dan konfliknya ada di `docs/asumsi.md` bagian 13. Rancangan: `docs/superpowers/specs/2026-11-07-revisi-pos-design.md`.

### Revisi POS putaran kedua (November 2026)

Permintaan klien tanggal 7 November 2026 (PDF acuan dipakai untuk gaya dan alur saja): enam palet warna dengan mode terang, gelap, dan otomatis; tata letak responsif dengan titik henti 900 px dan 600 px; layar bayar dengan papan angka, kanal non-tunai, QR simulasi, dan Split Payment; Detail Barang (diskon, ubah harga, catatan, Tenaga Penjual, Cek Stok); Open Bill berupa kartu dengan Ubah, Split Bill, dan Merge Bill; Riwayat dengan Retur langsung oleh Kasir; Selesai Shift dengan hitungan tunai, layar Karyawan, dan laporan shift; Biaya dua panel dengan lampiran; daftar Pelanggan; dan Pengaturan (Ubah PIN, printer, EDC, perangkat, backup, tampilan). Layar sekunder dimuat malas sehingga JS awal POS tetap di bawah anggaran. Rancangan dan rencana: `docs/superpowers/specs/2026-11-07-revisi-pos-2-design.md` dan `docs/superpowers/plans/2026-11-07-revisi-pos-2.md`; asumsi di `docs/asumsi.md` bagian 14; aset baru dan lisensinya di `docs/aset-pihak-ketiga.md`.

## Prasyarat

- Node.js 22.12 atau lebih baru (diuji pada 22.13.0) dan npm 10.
- Peramban Chromium untuk Playwright dan Lighthouse (dipasang pada langkah instal).

## Instal

```bash
npm ci
npx playwright install chromium
```

`npm ci` memasang versi persis dari `package-lock.json`. Semua dependensi dikunci pada versi tetap dan semuanya `devDependencies`: hasil build tidak memuat paket pihak ketiga selain font dan ikon yang disalin ke `dist`.

## Jalan (pengembangan)

```bash
npm run dev
```

Skrip ini membangun token desain dan aset (font, sprite ikon) lalu menjalankan Vite pada `http://localhost:5173`. CSP pada `index.html` dilepas khusus saat pengembangan agar HMR berjalan; hasil build tetap memakai CSP penuh.

## Build

```bash
npm run build
```

Urutannya: token desain, aset, `tsc --noEmit`, lalu `vite build`. Hasilnya ada di `dist/` dan sudah berisi `_headers`. Alamat memakai hash dan `base: './'`, sehingga `dist` dapat ditaruh di akar domain maupun subfolder tanpa aturan rewrite.

## Menyajikan `dist` secara lokal

```bash
npm run serve
```

Buka `http://127.0.0.1:4173`. Perintah ini memakai `vite preview` dan menerapkan header global dari `public/_headers`, sehingga yang diuji sama dengan yang disajikan host statis.

## Uji dan verifikasi

| Perintah                 | Fungsi                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`           | ESLint (aturan ketat, `innerHTML` dilarang) dan Prettier                                                                                         |
| `npm run typecheck`      | `tsc --noEmit`                                                                                                                                   |
| `npm test`               | Uji unit Vitest (logika domain, data, penyimpanan)                                                                                               |
| `npm run test:e2e`       | Seluruh uji Playwright pada empat viewport (1280x800, 1366x768, 1440x900, 360x800); membangun dan menyajikan `dist` sendiri                      |
| `npm run verifikasi:axe` | Ringkasan pelanggaran axe dari `verifikasi/axe` setelah `test:e2e`                                                                               |
| `npm run lint:teks`      | Menolak tanda pisah panjang (en dash dan em dash) pada seluruh teks proyek                                                                       |
| `npm run kontras`        | Memeriksa pasangan warna token terhadap tabel kontras spesifikasi                                                                                |
| `npm run budget`         | Gagal bila JS awal per aplikasi melebihi 70 KB gzip atau CSS awal melebihi 25 KB gzip (jalankan setelah `build`)                                 |
| `npm run audit:dep`      | `npm audit` untuk dependensi produksi (gagal pada temuan apa pun)                                                                                |
| `npm run audit:semua`    | `npm audit` seluruh pohon, termasuk perkakas pengembangan (informatif)                                                                           |
| `npm run sbom`           | SBOM CycloneDX 1.6 (JSON) ke `sbom/bom.cdx.json` lewat `@cyclonedx/cyclonedx-npm` (dengan `--ignore-npm-errors` dan `--no-validate`, lihat L-09) |
| `npm run lighthouse`     | Lighthouse pada POS-02, BO-03, OWN-02, SALES-02 dengan CPU 4x dan 4G lambat; laporan ke `verifikasi/lighthouse`                                  |

Uji e2e yang bersifat verifikasi rilis (folder `tests/e2e`):

- `pos-revisi.spec.ts`: shift, menu samping, tema (axe pada tiap tema), layar jual, pembayaran, riwayat, dan retur POS.
- `pos-revisi2.spec.ts`: putaran kedua per bagian: mode otomatis dan palet, riwayat dan retur, penerimaan (bayar, QR, Split), Detail Barang, Open Bill, Selesai Shift, Karyawan, Biaya, Pelanggan, Pengaturan, susunan kartu barang, dan pemuatan malas; axe pada mode terang dan gelap untuk setiap layar baru.
- `responsif.spec.ts`: ponsel 360 x 800 dan tablet potret 768 x 1024: tanpa scroll horizontal, kontrol tidak tertutup Panel Simulasi, modal layar penuh, dan satu panel dengan tombol Kembali untuk layar dua panel.
- `audit.spec.ts`: seluruh rute dipindai axe (WCAG 2.0, 2.1, 2.2 level A dan AA) pada empat viewport, ditambah lembar dan modal POS-03, POS-10, SALES-04 pada kerangka rancangannya. Tangkapan layar tiap rute ke `verifikasi/screenshots/<viewport>/` dan hasil axe ke `verifikasi/axe/`.
- `target-sentuh.spec.ts`: setiap kontrol interaktif pada POS dan aplikasi mobile berukuran minimal 48 x 48 px.
- `urutan-tab.spec.ts`: urutan Tab sama dengan urutan DOM, tanpa `tabindex` positif, tanpa jebakan fokus, penanda fokus tampak, fokus tidak melompat ke kiri atas.
- `jaringan.spec.ts`: tidak ada permintaan ke asal lain, tidak ada WebSocket, tidak ada galat konsol atau pelanggaran CSP, dan `dist` tidak memuat alamat http atau https selain tautan WhatsApp yang diketuk pengguna.
- `header.spec.ts`: CSP ketat, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`, dan kesesuaian dengan `public/_headers`.

Lighthouse butuh `dist` yang sudah dibangun. Skrip menyalakan servernya sendiri pada port 4174 dan Chromium milik Playwright pada port debug 9333. Jumlah ulangan diatur dengan `LH_RUNS` (bawaan 3, dilaporkan median).

## Header keamanan dan hosting

`public/_headers` disalin ke `dist/_headers` (dibaca Cloudflare Pages dan Netlify; Vercel memakai `vercel.json`). Isi aturan global:

- `Content-Security-Policy`: `default-src 'none'`, skrip, gaya, font, koneksi, dan bingkai hanya `'self'`, gambar `'self'` dan `data:`, `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`, `frame-ancestors 'self'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (kamera, mikrofon, lokasi, pembayaran dimatikan), `X-Frame-Options: SAMEORIGIN`.
- Cache: `index.html` `no-cache`; `assets/*` `immutable` setahun (nama berkas ber-hash).

### Hosting di Vercel

`vercel.json` sudah menyiapkan semuanya: framework Vite, `npm ci`, `npm run build`, keluaran `dist`, serta header keamanan dan cache. Vercel tidak membaca `public/_headers`, jadi isi header global disalin ke `vercel.json` dan uji unit `tests/unit/hosting-headers.test.ts` memastikan keduanya sama. Ubah keduanya bersamaan.

1. Dorong repositori ke GitHub.
2. Di Vercel pilih Add New, Project, lalu impor repositori. Biarkan Root Directory kosong; pengaturan lain terbaca dari `vercel.json`.
3. Deploy. Setiap push ke `main` membangun ulang. Bagikan alamat `*.vercel.app` ke klien, atau pasang domain sendiri di Settings, Domains.

Alamat memakai hash, sehingga tidak perlu aturan rewrite. Node 22 dipilih otomatis dari `engines` pada `package.json`. Host statis lain yang membaca `public/_headers` (Cloudflare Pages, Netlify) juga dapat dipakai tanpa perubahan.

## Struktur

```
index.html            Titik masuk tunggal (CSP meta, preload font)
public/               Aset statis; _headers dibaca host; fonts/ dan icons/ dibangkitkan oleh npm run assets
src/
  main.ts             Router hash dan pemuatan malas per modul
  apps/               portal, pos, bo, owner, sales (domain/ untuk logika murni, screens/ untuk layar)
  shared/             store, data contoh, izin peran, komponen UI, simulator, router
  styles/             tokens.css (dibangkitkan dari tokens/tokens.json) dan CSS per modul
tokens/tokens.json    Sumber token desain; export/app_tokens.dart untuk Flutter
scripts/              build-tokens, copy-assets, check-contrast, lint-text, budget, lighthouse, axe-summary, tree
tests/unit/           Vitest
tests/e2e/            Playwright; helpers/ berisi daftar rute dan alur masuk
docs/                 asumsi.md, addendum-v1.1.md, panduan-tinjau.md, teks-baru.md
verifikasi/, sbom/    Keluaran verifikasi (tidak masuk git)
```

Akun contoh (fiksi) ada di `src/shared/data/generator.ts`. Layar yang dilindungi masuk lewat formulir sungguhan; Mode Tinjau (`?tinjau=1`) memasukkan POS dan BO otomatis.

## Asumsi

Daftar lengkap, konflik antara spesifikasi dan prompt, serta keputusan per stage ada di [docs/asumsi.md](docs/asumsi.md). Yang paling memengaruhi pembacaan hasil:

- Data bersifat contoh dan hidup di memori; memuat ulang mengembalikan keadaan awal (kecuali sesi Owner dan Sales yang tersimpan di `localStorage`).
- Cetak, PDF, WhatsApp, Bluetooth, dan ekspor hanya disimulasikan.
- Jumlah barang 3.600 SKU (K-01), peran Owner, Supervisor, Kasir, Frontliner (K-04), lima modul kode (K-06).
- Sasaran viewport: POS 1280 x 800 dan 1366 x 768, Back-Office 1440 x 900, aplikasi mobile 360 x 800.
- `frame-ancestors 'self'` dipakai, bukan `'none'`, karena Mode Tinjau menanam aplikasi dalam iframe satu asal (lihat L-01 pada docs/asumsi.md).

## Keterbatasan

- Ini mockup, bukan produksi: tanpa autentikasi nyata, tanpa penyimpanan permanen, tanpa sinkronisasi, tanpa integrasi printer atau pembayaran.
- Layar BO-08 dan BO-10 sampai BO-22 belum dibangun.
- Dependensi pengembangan masih memuat advisori `npm audit` (lihat `npm run audit:semua`); seluruhnya berada pada perkakas, bukan pada hasil build. Lighthouse 12.8.2 dipilih karena Lighthouse 13 mensyaratkan Node 22.19 atau lebih baru; naikkan Node dan Lighthouse bersamaan untuk menghilangkan advisori tersebut.
- Lighthouse menjalankan POS-02 dan BO-03 lewat `?tinjau=1` (masuk otomatis) karena sesi POS dan BO hanya ada di memori.
- Angka Lighthouse bersifat simulasi dan bervariasi antarmesin; gunakan sebagai perbandingan relatif.
- Pemindaian axe hanya menangkap sebagian masalah aksesibilitas; uji manual dengan pembaca layar tetap diperlukan.
