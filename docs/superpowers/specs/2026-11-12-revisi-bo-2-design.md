# Revisi Back Office Toko Budiannor, putaran kedua: desain

Tanggal: 2026-11-12. Cakupan: modul Back Office (`#/bo`). Sumber: dokumen klien "Revisi Penyesuain Back Office" (Word, 3 gambar contoh) dan video WhatsApp 12 November 2026 yang memperagakan kolom Satuan. Melanjutkan revisi Back Office pertama (`2026-11-09-revisi-back-office-design.md`) dan putaran POS ketiga (`2026-11-11-revisi-pos-3-design.md`).

## 1. Konteks

Klien meminta empat hal: menu kiri disembunyikan agar halaman lebih luas, header dan tab halaman mengikuti gambar, Dashboard dirapikan menjadi sembilan widget, dan halaman Master Data Barang disusun ulang agar muat satu layar dengan beberapa perilaku baru. Gambar 1 (Dashboard), gambar 2 (tab halaman), dan gambar 3 (Data Barang) dipakai sebagai acuan tata letak; angka dan nama barang pada gambar hanya contoh.

Layar acuan klien sekitar 1366 x 640 px (sama dengan POS). Syarat "tanpa scroll" diuji pada 1366x640, 1280x720, 1366x768, dan 1920x1080.

Kondisi awal yang diukur sebelum revisi (server dev, peran Owner): pada 1366x768 sebanyak 38 dari 44 rute menu melebihi tinggi layar, dan pada 1920x1080 masih 21 dari 44. Karena itu syarat "tanpa scroll" berlaku untuk seluruh Back Office, bukan hanya Dashboard dan Data Barang.

## 2. Batasan yang tetap berlaku

- CSP `style-src 'self'`: tanpa atribut `style` dan tanpa `innerHTML`. Lebar dinamis diatur lewat CSSOM (`element.style.setProperty`) atau atribut SVG. Server dev membuang meta CSP, jadi verifikasi akhir memakai build produksi (`npm run build` lalu `vite preview`, yang memberi header CSP).
- Anggaran JS awal per aplikasi 70 KB gzip dan CSS 25 KB gzip (`npm run budget`). Layar sekunder dimuat malas lewat `import()`.
- Teks lewat `src/shared/labels/*.ts` lalu `node scripts/sync-teks-baru.mjs`; tanpa tanda pisah en dan em (`npm run lint:teks`); 120 pesan sistem terkunci.
- Target sentuh 48 px pada tombol utama, axe WCAG 2.x A dan AA, kontras lewat `npm run kontras`.
- Layar tidak boleh bergantung pada urutan modul: setiap layar tetap menyediakan `ScreenHandle` (`element`, `destroy`).

## 3. Matriks keterlacakan

Kolom Tes: `U` uji unit (Vitest), `E` e2e Playwright, `M` ukur ulang 44 rute pada empat ukuran layar.

### 3.1 Kerangka

| No  | Permintaan klien                                                                         | Keputusan dan perubahan                                                                                                                                                                                                                                                             | Tes |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| K1  | Menu kiri disembunyikan, muncul saat titik tiga kiri atas diklik                         | Sidebar jadi laci (overlay) di semua lebar layar. Tombol titik tiga (`ellipsis-vertical`) di kiri header membuka laci; Esc, klik latar, atau memilih menu menutupnya. Laci tertutup bersifat `inert`                                                                                | E   |
| K2  | Semua halaman tanpa scroll naik turun, kecuali halaman yang memang mengharuskan          | Kerangka setinggi layar (`100dvh`) tidak pernah scroll; hanya tabel atau daftar di dalam panel yang scroll. Target: 0 dari 44 rute melebihi layar pada empat ukuran. Pengecualian, bila ada, dicatat di bagian 5                                                                    | M   |
| K3  | Header: nama halaman, tanggal dan jam dengan hari di depan, nama user yang login         | Kiri: titik tiga, `Grup /`, judul halaman. Kanan: pil `Senin, 19 Okt 2026, 10:02 WIB` dan kartu pengguna (avatar, nama, peran). Tombol palet tema dihapus dari header; tema tetap lewat Pengaturan > Tema                                                                           | U E |
| K4  | Fungsi log off dipindah ke menu titik tiga di baris paling bawah                         | Baris "Keluar" terakhir di laci menu menggantikan tombol Keluar di header                                                                                                                                                                                                           | E   |
| K5  | Beberapa tab halaman di bawah header; buka halaman lain tanpa menutup halaman sebelumnya | Bilah tab di bawah header: Dashboard tetap di kiri dan tidak bisa ditutup, tab aktif beraksen, tombol tutup per tab, penunjuk `N ⌄` membuka daftar semua tab. Tab menyimpan isi layar (tidak dirender ulang), satu tab per rute, maksimal 10 tab (yang terlama tidak aktif ditutup) | U E |

### 3.2 Dashboard

| No  | Permintaan klien                                                                                 | Keputusan dan perubahan                                                                                                                                                                                      | Tes   |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| D1  | Sembilan widget, tanpa scroll bar                                                                | Grid 3 x 3 setinggi layar: Omset, Grafik Penjualan, Kegiatan Mendatang; Laba, Beban, Aset saat ini; Penjualan Pelanggan, Penjualan Barang, Monitoring HPP. Widget Stok Minim dan Pelanggan Berhutang dihapus | U E M |
| D2  | Laba batang warna-warni, Beban donat warna-warni, Aset batang menyamping, Grafik penjualan garis | Laba: empat batang (Pendapatan, Nilai HPP, Pengeluaran, Laba) dengan legenda. Beban: donat lima kategori dengan TOTAL di tengah. Aset: tiga batang mendatar (Kas, Piutang, Stok). Grafik: garis, tren        | U E   |
| D3  | Penjualan Pelanggan, Penjualan Barang, Monitoring HPP diseragamkan dengan widget di atasnya      | Kartu bergaya sama dengan widget lain; daftar peringkat dengan lencana 1 sampai 3, chip persen, dan batang; daftar scroll di dalam kartu; ikon segarkan dan pemilih periode                                  | E     |

### 3.3 Master Data Barang

| No  | Permintaan klien                                                                                         | Keputusan dan perubahan                                                                                                                                                                                                                                        | Tes |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| B1  | Satu halaman penuh tanpa scroll bar, kecuali daftar barang                                               | Tata letak gambar 3: kiri formulir dua kolom, kanan bilah tombol, pencarian, daftar barang, matriks harga. Hanya daftar barang yang scroll                                                                                                                     | E M |
| B2  | Satuan: 1 sampai 3 baris tergantung barang; bila satu satuan, dua baris di bawahnya tidak muncul         | Pemilih satuan berchip (video). Baris 2 muncul setelah satuan dasar dipilih, baris 3 setelah baris 2 lengkap. Baris 2 dan 3 berbentuk `[satuan] = [angka] [satuan dasar]`. Maksimal tiga satuan, konversi selalu terhadap satuan dasar, simpan memakai `units` | U E |
| B3  | Komisi sales kosong: ikut persen form Sales; terisi: ikut persen barang                                  | Isian persen 0 sampai 100. Komisi baris = subtotal x persen barang bila terisi, selain itu persen profil sales. Master Sales menghitung komisi bulan berjalan per baris                                                                                        | U   |
| B4  | Promo terisi otomatis berlaku di setiap transaksi penjualan dan ada tanda promo di POS atau BO           | Isian persen 0 sampai 100. Saat barang masuk baris POS atau Faktur dan SO Penjualan BO, diskon persen bawaan = persen promo (bila hanya nominal lama, nominal per satuan dasar). Tanda "PROMO" pada kartu POS (ada), baris keranjang, dan baris faktur BO      | U E |
| B5  | Tulisan dan kolom Harga Beli Akhir dan HPP hanya tampil untuk Owner                                      | Label dan isian tidak dirender untuk peran lain, termasuk pilihan kolom pada Cetak                                                                                                                                                                             | U E |
| B6  | Klik ikon + pada foto, foto membesar                                                                     | Ikon `zoom-in` di pojok foto membuka penampil foto (modal) dengan zoom 1x sampai 3x                                                                                                                                                                            | E   |
| B7  | Tombol Info menampilkan Histori Pembelian, Penjualan, dan Koreksi; bisa difilter tanggal atau lebih lama | Modal tiga tab. Bawaan 30 hari terakhir terhadap tanggal sistem; filter Dari dan Sampai untuk rentang lain. Sumber: faktur pemasok dan PO, penjualan POS dan SO, dokumen koreksi stok                                                                          | U E |
| B8  | Tombol Cetak memunculkan pilihan Print, export Excel, export PDF dengan parameter                        | Modal parameter: pilih kolom (stok semua gudang, harga semua tier, HPP, harga beli akhir, pemasok, no rak, dll) dan filter (kategori, merk, status, stok). Lalu tiga keluaran. Contoh visual dari klien menyusul, tata letak mudah disesuaikan                 | U E |

## 4. Keputusan dan asumsi baru

1. **Header tanpa palet dan Keluar** (K3, K4). Gambar 1 hanya menampilkan judul, tanggal, dan pengguna. Pemilih tema tetap di Pengaturan > Tema.
2. **Tab menyimpan isi layar** (K5). Pindah tab tidak merender ulang layar, jadi isian formulir setengah jadi tidak hilang. Tab hilang saat Keluar atau saat peran diganti dari Panel Simulasi.
3. **Satu tab per rute** (K5). Dua rute berbeda yang membuka layar yang sama (misalnya SO dan Faktur Penjualan) tetap dua tab. Rute yang sama dengan query berbeda memakai tab yang sama dan merender ulang isinya.
4. **Dashboard Supervisor** (D1). Widget keuangan (Laba, Beban, Aset, Monitoring HPP) disembunyikan, sehingga tersisa lima widget. HPP termasuk informasi Owner (lihat B5).
5. **Impor Excel pada Data Barang** (B1). Tidak ada pada bilah tombol gambar 3, jadi dipindah menjadi ikon kecil di baris pencarian. Fungsinya tidak berubah.
6. **Tombol Keluar pada Data Barang** menutup tab Data Barang dan kembali ke tab sebelumnya.
7. **Harga pada matriks Data Barang** hanya bisa diisi saat Tambah barang baru. Perubahan harga barang yang sudah ada tetap lewat Pricelist agar peringatan "di bawah HPP" tidak terlewati. Satuan baru pada barang lama otomatis berharga = harga satuan dasar x konversi.
8. **Promo mengubah POS** (B4). Hanya Cat Spray Pylox yang berpromo di data contoh (10 persen), sehingga hanya tes yang memakai barang itu berubah. Kasir tetap bisa mengubah atau menghapus diskon lewat menu Diskon sesuai hak akses.
9. **Komisi tidak memakai nominal** (B3). Isian lama berformat persen dan nominal; nominal tetap tersimpan pada data lama tetapi tidak dipakai perhitungan.
10. **Sisa HPP di laporan BO**. Laporan Stok dan nilai persediaan juga menampilkan HPP ke Supervisor. Dokumen hanya meminta pembatasan di Data Barang, jadi ini dicatat sebagai pertanyaan terbuka, bukan diubah.

## 5. Rancangan teknis

### 5.1 Kerangka (K1 sampai K5)

- `src/apps/bo/domain/tabs.ts` (murni, uji unit): status tab (`tabs`, `activeKey`), `openTab`, `closeTab` (Dashboard tidak bisa ditutup; menutup tab aktif memilih tetangga kanan, lalu kiri), kunci tab = path tanpa query, judul tab dari `entryFor` dengan tabel alias untuk rute di luar menu, batas `MAX_TABS = 10`.
- `src/apps/bo/shell.ts`: shell menjadi persisten. `index.ts` tidak lagi membuang shell pada setiap perubahan rute; ia memanggil `workspace.show(path)`. Panel tiap tab (`div[role=tabpanel]`) memegang `ScreenHandle` masing-masing dan disembunyikan dengan atribut `hidden`. Shell dan seluruh layar dibuang saat Keluar, saat peran berubah, atau saat sesi habis.
- Pendengar `keydown` global pada layar BO hanya bertindak bila layarnya aktif (`element.closest('[hidden]') === null`).
- Bilah tab: `role=tablist`, panah kiri kanan, Home, End; tombol tutup tiap tab; daftar semua tab pada penunjuk `N ⌄`.
- CSS: `.bo` berukuran `100dvh`, kolom flex, `overflow: hidden`. Area `.bo-content` mengisi sisa tinggi dengan `min-height: 0` dan menjadi tempat scroll cadangan bila sebuah layar tidak muat.
- Label baru di `src/shared/labels/bo-shell.ts`.

### 5.2 Dashboard (D1 sampai D3)

- `domain/dashboard.ts`: kategori Beban jadi lima (Gaji, Katering, Bensin, Operasional, Listrik); Laba konsisten (`pendapatan - hpp - pengeluaran`); fungsi `dashboardWidgets(role)` mengembalikan sembilan widget untuk Owner dan lima untuk Supervisor.
- Grafik: batang berwarna (SVG), donat dengan TOTAL di tengah, batang mendatar Aset, garis. Warna kategori memakai token `--chart-*` yang punya varian terang dan gelap serta kontras minimal 3:1 terhadap permukaan.
- Grid `repeat(3, minmax(0, 1fr))` pada kedua sumbu. Isi widget memakai ukuran relatif sehingga muat pada tinggi sekitar 166 px (1366x640) dan memanfaatkan ruang pada layar besar.
- Seluruh lebar batang lewat CSSOM atau atribut SVG, bukan atribut `style`.

### 5.3 Data Barang (B1 sampai B8)

- `domain/product-units.ts` (murni): baris satuan, aturan pembukaan bertahap, validasi (maksimal 3, kode unik dan berbeda dari satuan dasar, konversi lebih dari 0), konversi ke `UnitDef[]`.
- `domain/product-form.ts`: `buildProduct` memakai baris satuan dari draf (bukan hanya `keep.units`), harga satuan baru otomatis, komisi dan promo hanya persen.
- `shared/domain/promo.ts`: `promoDiscount(product, factor)` dan `isPromoLine`. POS (`pos-session.addProduct`) dan Faktur/SO Penjualan BO memakainya saat baris dibuat.
- `domain/master-sales.ts`: komisi per baris (persen barang bila ada, selain itu persen profil).
- `domain/product-history.ts` (murni): riwayat Pembelian, Penjualan, Koreksi per barang dengan filter tanggal.
- `domain/product-export.ts` (murni): katalog kolom (kolom Owner saja ditandai), filter, dan baris hasil untuk Print, Excel, PDF.
- `screens/products.ts` dipecah: formulir, pemilih satuan, modal Info, modal Cetak ke berkas terpisah agar berkas tetap kecil dan dimuat malas.

### 5.4 Tanpa scroll seluruh halaman (K2)

Pola umum: akar layar `flex: 1; min-height: 0`, wilayah tabel atau daftar `flex: 1; min-height: 0; overflow: auto` dengan header menempel, kartu ringkasan dan filter dipadatkan, formulir panjang memakai grid dua atau tiga kolom. Layar dikerjakan per kelompok (master, transaksi, mutasi, hutang piutang, akuntansi dan laporan, pengaturan). Setiap kelompok selesai bila ukur ulang menunjukkan 0 halaman melebihi layar pada empat ukuran. Gaya inline pada layar yang disentuh diganti sehingga kegagalan e2e BO yang sudah ada (gaya inline dan urutan Tab BO-09) ikut tertangani.

## 6. Hasil verifikasi

Diisi setelah semua tahap selesai (lihat bagian 7).

## 7. Urutan pengerjaan

Cabang `revisi-bo-2`, satu commit per tahap, setiap tahap lulus `typecheck`, `lint`, `test`, dan e2e kelompoknya sebelum lanjut.

1. Kerangka: menu laci, header, tab halaman, bingkai setinggi layar.
2. Dashboard sembilan widget.
3. Data Barang: halaman, satuan bertahap, komisi, promo, pembatasan Owner, foto, Info, Cetak.
4. Tanpa scroll: master, transaksi, mutasi, hutang piutang, akuntansi dan laporan, pengaturan.
5. Pembaruan tes lama, dokumen (asumsi, teks baru), build produksi, anggaran, dan ukur ulang akhir.
