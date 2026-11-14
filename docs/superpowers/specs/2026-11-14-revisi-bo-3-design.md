# Revisi Back Office Toko Budiannor, putaran ketiga: desain

Tanggal: 2026-11-14. Cakupan: modul Back Office (`#/bo`). Sumber: dokumen klien "Revisi Penyesuain BO 2" (Word, 13 gambar contoh, berkas 14 November 2026 pukul 11.46). Melanjutkan putaran kedua (`2026-11-12-revisi-bo-2-design.md`) dan berjalan di cabang `revisi-bo-3` yang dipotong dari `revisi-pos-4`.

## 1. Konteks

Dokumen ini memuat seluruh isi dokumen BO 12 November (kerangka, Dashboard, Data Barang; tiga gambar pertama identik byte demi byte dan sudah dikerjakan di putaran kedua) ditambah bagian baru:

1. Tombol Info Data Barang menampilkan **empat** riwayat: Pembelian, Penjualan, Koreksi, Mutasi (gambar 4 sampai 7).
2. Data **No Rekening dihapus** dari menu Master; rekening dipakai dari menu Profil Toko.
3. Semua halaman menu Transaksi tampil **satu layar tanpa scroll** dan mengikuti gambar 8 sampai 13 (daftar faktur, input faktur, daftar PO atau SO, input PO atau SO, form Rincian Barang, Surat Jalan koli ekspedisi).
4. Mutasi Stok, Hutang Piutang, Akuntansi, Laporan, dan Pengaturan berstatus "On Proses Review": **tidak diubah** pada putaran ini.

Kondisi aplikasi sebelum revisi (build produksi, 1280 x 640, peran Owner), hasil pengamatan langsung:

- Halaman Transaksi memang tidak menggulir, tetapi tata letaknya jauh dari gambar klien.
- Faktur Penjualan dan Pembelian terjepit: area tabel barang hampir tak terlihat di 1280 x 640. Alat ukur `ukur:bo` lolos karena hanya mengukur tinggi halaman, bukan apakah isinya terlihat.
- Menu PO Pembelian dan SO Penjualan hanya membuka formulir faktur yang sama (judul berbeda, isi "Form Faktur ..."): tidak ada Daftar PO atau SO dan tidak ada formulir PO atau SO sendiri.
- Tidak ada form Rincian Barang; barang dipilih lewat baris isian cepat dengan `select`.
- Surat Jalan memakai model koli berisi barang dan bobot, berbeda dari gambar 13 (satu baris isian Jumlah, Satuan, Nama Koli Barang dan tabel datar).
- Info barang baru punya tiga tab dan kolom yang berbeda dari gambar 4 sampai 7.
- No Rekening Toko sudah ada sebagai tab di Profil Toko (`settings.ts`), sehingga menu Master hanya perlu dihapus.

Layar acuan klien sekitar 1280 x 640 px (lihat memori proyek). Syarat "tanpa scroll" diuji pada 1366x640, 1280x640, 1280x720, 1366x768, dan 1920x1080, dan kini juga mensyaratkan **isi terlihat**: tabel barang minimal beberapa baris tampak pada 1280x640.

## 2. Tujuan, bukan tujuan, antitujuan

Tujuan: setiap permintaan dokumen terpenuhi dan terlacak sampai tes; halaman Transaksi mengikuti gambar klien dalam perilaku dan susunan, muat satu layar dengan isi yang terbaca.

Bukan tujuan: persistensi data faktur ke penyimpanan nyata (BO tetap mockup; faktur penjualan dan pembelian hanya menampilkan notifikasi simpan, PO dan SO baru masuk ke store sesi agar muncul di daftar), pengubahan aplikasi POS, Owner, atau Sales di luar yang terdampak data bersama.

Antitujuan: menyentuh kelima menu "On Proses Review" (termasuk CSS bersama yang bisa menggeser layar mereka); menambah label ke `src/shared/labels` sehingga anggaran JS POS (69,50 dari 70 KB) terlampaui; meniru piksel atau angka contoh gambar (nama barang, nominal, tanggal pada gambar hanya contoh).

## 3. Batasan yang tetap berlaku

Semua batasan bagian 2 spesifikasi putaran kedua tetap berlaku: CSP `style-src 'self'` (tanpa atribut `style`, tanpa `innerHTML`, lebar dinamis lewat CSSOM atau atribut SVG), anggaran JS awal 70 KB gzip dan CSS 25 KB per aplikasi, tanpa tanda pisah en dan em, target sentuh 48 px pada tombol utama, axe WCAG A dan AA, setiap layar tetap menyediakan `ScreenHandle`. Tambahan:

- **Teks baru layar Transaksi tidak masuk `src/shared/labels`** (label itu dimuat semua aplikasi, sisa anggaran POS hanya 0,5 KB). Teks ditaruh pada modul teks yang dimuat malas bersama layarnya (`src/apps/bo/screens/trx/text.ts`). Label lama yang dipakai ulang tetap lewat `label()`.
- Harga beli akhir, HPP, dan riwayat harga beli tetap hanya untuk Owner (aturan B5): kolom HARGA riwayat Pembelian dan blok Harga Histori Beli disembunyikan untuk Supervisor. Supervisor berhak atas BO-08 dan BO-09 (buat PO, terima barang) sehingga harga yang ia ketik sendiri pada faktur pembelian dan PO tetap tampil.
- Uji tetap lulus yang mengunci perilaku lama: `getByPlaceholder('Alamat Pengiriman')` memuat isian uppercase, opsi `SO-0001 - Umum (Rp 164.700)` pada pilihan "SO Pending" Faktur Penjualan (flows.spec), tab menyimpan isi formulir saat berpindah tab (bo-kerangka).

## 4. Pendekatan yang dipertimbangkan

- **A. Membangun ulang di atas komponen bersama (dipilih).** Satu set komponen (kepala formulir berlabel sebaris, kotak cari barang, dialog Rincian Barang, tabel baris, kotak total) dipakai Faktur Penjualan, Faktur Pembelian, SO, dan PO. Keempat dokumen jadi seragam seperti gambar klien, perbaikan satu tempat berlaku di semua. Biayanya: perubahan besar pada `sales-form.ts` (873 baris) dan `purchase-form.ts` (691 baris), dan sejumlah tes e2e lama perlu disesuaikan.
- B. Menambal layar yang ada (CSS saja). Murah, tetapi tidak bisa menghadirkan kotak cari barang, dialog Rincian Barang, kolom Koli, maupun Daftar PO atau SO; bertentangan dengan permintaan klien.
- C. Memecah per dokumen tanpa komponen bersama. Tiap dokumen bebas, tetapi empat salinan kode yang hampir sama dan risiko gambar tidak seragam.

Pilihan: A. Alasan: gambar 9 dan 11 menunjukkan kepala, tabel, dan kotak total yang sama untuk keempat dokumen; yang berbeda hanya isian kepala dan kolom Koli.

## 5. Matriks keterlacakan

Kolom Tes: `U` uji unit (Vitest), `E` e2e Playwright, `M` ukur ulang layar (`ukur:bo` dan tes `bo-muat-layar`, termasuk isi terlihat).

### 5.1 Terbawa dari putaran kedua (verifikasi ulang, tanpa perubahan fitur)

| No  | Permintaan dokumen                                                                                       | Keputusan                                      | Tes |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --- |
| K1  | Menu kiri disembunyikan, muncul saat titik tiga kiri atas diklik                                         | Sudah ada (laci)                               | E   |
| K2  | Header: nama halaman, hari tanggal jam, nama user; log off di baris paling bawah menu titik tiga         | Sudah ada                                      | E   |
| K3  | Beberapa tab halaman di bawah header                                                                     | Sudah ada                                      | E   |
| D1  | Dashboard sembilan widget dengan jenis grafik yang diminta                                               | Sudah ada                                      | E M |
| B1  | Data Barang satu halaman (satuan 1 sampai 3, komisi, promo, harga beli akhir dan HPP khusus Owner, foto) | Sudah ada; Info dan Cetak diubah di bagian 5.2 | E M |
| M1  | Kategori, merk, pemasok, pelanggan, sales, ekspedisi satu halaman penuh                                  | Sudah ada; diukur ulang                        | M   |

### 5.2 Baru pada putaran ini

| No  | Permintaan dokumen                                                                     | Keputusan dan perubahan                                                                                                                                                                                                                                                                                                                                                                                                                                            | Tes   |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| I1  | Info: riwayat pembelian, penjualan, koreksi, dan mutasi (gambar 4 sampai 7)            | Modal berjudul "Data Histori Barang"; baris tab empat kotak (Pembelian, Penjualan, Koreksi, Mutasi, aktif beraksen); nama barang dan kode di tengah; baris filter `[tanggal] s/d [tanggal] [segarkan]`                                                                                                                                                                                                                                                             | U E   |
| I2  | Pembelian: TGL PEMBELIAN, NO NOTA, QTY, SATUAN, HARGA, PEMASOK; filter Pemasok         | Tabel enam kolom; filter Pemasok berupa kotak cari yang menyaring baris. Kolom HARGA hanya Owner                                                                                                                                                                                                                                                                                                                                                                   | U E   |
| I3  | Penjualan: TGL PENJUALAN, NO NOTA, QTY, SATUAN, HARGA, PELANGGAN; filter Pelanggan     | Tabel enam kolom; filter Pelanggan menyaring baris. HARGA = harga satuan setelah diskon baris                                                                                                                                                                                                                                                                                                                                                                      | U E   |
| I4  | Koreksi: TGL KOREKSI, NO KOREKSI, QTY AWAL, AKSI, QTY, QTY AKHIR                       | QTY AWAL = stok sistem saat koreksi, AKSI = TAMBAH atau KURANG, QTY = selisih mutlak, QTY AKHIR = stok sebenarnya; dalam satuan baris koreksi                                                                                                                                                                                                                                                                                                                      | U E   |
| I5  | Mutasi: TANGGAL, NOMOR, TRANSAKSI, NAMA, MASUK, KELUAR, SALDO; filter Gudang           | Memakai ulang mesin Kartu Stok (`movementsFor`, `buildStockCard`): saldo berjalan dihitung mundur dari stok sekarang; baris pertama SALDO AWAL; TRANSAKSI = Saldo Awal, Pembelian, Penjualan, Transfer, Koreksi (plus Opname dan Retur bila ada); NAMA = pemasok, pelanggan, gudang tujuan, atau KOREKSI; filter Gudang: Semua, Toko, Gudang Besar                                                                                                                 | U E   |
| I6  | Rentang tanggal bawaan pada gambar: 01/08/2026 s/d 12/11/2026                          | Bawaan berubah dari 30 hari menjadi tanggal 1 pada tiga bulan sebelumnya sampai hari ini (menyamai gambar); pengguna tetap bisa mengubah                                                                                                                                                                                                                                                                                                                           | U     |
| M2  | Data No Rekening dihapus dari menu Master; pakai No Rekening di Profil Toko            | Entri menu dan rute `/bo/master/rekening` dihapus; `/bo/pengaturan/rekening` tetap ke tab "No. Rekening Toko" pada Profil Toko; alias tab, label menu, dan tes ikut disesuaikan                                                                                                                                                                                                                                                                                    | U E   |
| T1  | Semua halaman Transaksi satu halaman tanpa scroll                                      | Diukur pada lima ukuran layar dengan aturan baru "isi terlihat" (tabel barang minimal tiga baris tampak pada 1280x640)                                                                                                                                                                                                                                                                                                                                             | M E   |
| T2  | Daftar Faktur Pembelian atau Penjualan (gambar 8)                                      | Kartu judul "Daftar Nota Penjualan" atau "Daftar Nota Pembelian", empat kotak angka (Jumlah Transaksi Hari Ini, Total Transaksi Hari Ini, Total Belum Lunas, Total Jatuh Tempo), tombol Buat Faktur Baru, segarkan, filter Tanggal, Pelanggan atau Pemasok, Status, pencarian. Kolom: No. Invoice, No. SO atau No. PO, Tanggal, Pelanggan atau Pemasok, Pembayaran, Status, Umur Nota, Total, User, Keterangan. Pengalih Penjualan dan Pembelian dipertahankan     | U E M |
| T3  | Input Faktur Penjualan (gambar 9)                                                      | Kepala berlabel sebaris: Tanggal, No. Invoice, No. SO, Keterangan; Pelanggan, Alamat, Telepon; Syarat Bayar, Tempo, Metode Pembayaran; Sales, Ekspedisi; kartu Info Piutang Pelanggan. Bilah barang: kotak cari, Simpan, Cetak, Isi SJ Ekspedisi, ikon cari, penghitung "N Barang (jumlah)". Tabel: pegangan urut, Koli, Nama Barang, Kode #, Gudang, Kuantitas, Satuan, @Harga, Diskon, Total Harga. Kotak total: Sub Total, Diskon (Rp), Total Biaya (Rp), Total | U E M |
| T4  | Input Faktur Pembelian (gambar 9, varian pembelian)                                    | Susunan sama; kepala: Tanggal, Tgl Terima, No. Invoice, No. PO, No. Faktur Pemasok, Pemasok, Alamat, Telepon, Syarat, Tempo, Metode, Info Hutang Pemasok, Keterangan; tanpa kolom Koli dan tanpa tombol Isi SJ; kolom Gudang berarti tujuan masuk stok                                                                                                                                                                                                             | U E M |
| T5  | Daftar PO (gambar 10)                                                                  | Kartu "Daftar Pesanan Pembelian (PO)", Buat PO Baru, segarkan, filter Tanggal, Pemasok, Status, pencarian; kolom No. PO, Tanggal, Pemasok, Keterangan, Status (On Proses merah, Partial jingga, Selesai hijau), Total. Sumber `state.purchaseOrders`                                                                                                                                                                                                               | U E M |
| T6  | Input PO (gambar 11)                                                                   | Kepala: Tanggal, No PO, Pemasok, Pemesan, Syarat Bayar, Tempo, Ekspedisi, Keterangan; bilah Simpan dan Cetak; tabel tanpa Koli; Simpan menambah PO ke store sesi                                                                                                                                                                                                                                                                                                   | U E M |
| T7  | Daftar SO (padanan gambar 10)                                                          | Kartu "Daftar Pesanan Penjualan (SO)", Buat SO Baru; kolom No. SO, Tanggal, Pelanggan, Keterangan, Status, Total. Sumber `state.salesOrders` (SO dari Owner dan Sales)                                                                                                                                                                                                                                                                                             | U E M |
| T8  | Input SO (padanan gambar 11)                                                           | Kepala: Tanggal, No SO, Pelanggan, Sales, Syarat Bayar, Tempo, Ekspedisi, Keterangan; Simpan menambah SO ke store sesi (sumber `owner`) sehingga muncul di Daftar SO dan pilihan "SO Pending" Faktur Penjualan                                                                                                                                                                                                                                                     | U E M |
| T9  | Form Rincian Barang saat pencarian barang diklik (gambar 12), untuk faktur, PO, dan SO | Kotak cari menampilkan daftar bertanda sorot pada teks cocok dengan kode di bawah nama; memilih membuka dialog Rincian Barang: Kode #, Nama Barang, Kuantitas dengan pilih satuan, @Harga, Diskon (% dan Rp), Total Harga, Gudang dan stok, Harga Histori Jual (penjualan dan SO) atau Ongkos Kirim dan Harga Histori Beli (pembelian dan PO), tombol Hapus dan Lanjut. Klik baris tabel membuka dialog yang sama untuk mengubah                                   | U E   |
| T10 | Surat Jalan Ekspedisi dan Packing Koli (gambar 13)                                     | Baris 1: No. Surat Jalan, Faktur Penjualan, Tanggal, No. Polisi atau Driver, Nama Ekspedisi, Penerima dan Alamat Kirim. Baris 2: Jumlah, Satuan, Nama Koli Barang, Simpan, Batal, Hapus. Tabel datar Jumlah, Satuan, Nama Barang; klik baris memuatnya ke baris isian. Tombol kanan atas "Isi Data Faktur Penjualan" kembali ke faktur. Baris awal berasal dari barang berkotak Koli pada faktur                                                                   | U E M |
| T11 | Retur Penjualan, Retur Pembelian, Deposit Pelanggan satu halaman                       | Tidak dirombak; diukur dengan aturan isi terlihat dan diperbaiki hanya bila gagal                                                                                                                                                                                                                                                                                                                                                                                  | M     |
| N1  | Mutasi Stok, Hutang Piutang, Akuntansi, Laporan, Pengaturan: "On Proses Review"        | Tidak diubah. Berkas CSS bersama yang disentuh dicek agar layar ini tidak bergeser (ukur ulang sebelum dan sesudah)                                                                                                                                                                                                                                                                                                                                                | M     |

## 6. Keputusan dan asumsi

1. **Menu PO dan SO membuka daftar dahulu**, tombol "Buat PO Baru" atau "Buat SO Baru" membuka formulir; Simpan atau Batal kembali ke daftar. Menu Faktur Penjualan dan Faktur Pembelian tetap membuka formulir langsung (sesuai tab klien pada gambar 13) dan daftarnya lewat menu Daftar Nota.
2. **Rute baru** untuk formulir PO dan SO: `/bo/transaksi/po-pembelian/baru` dan `/bo/transaksi/so-penjualan/baru` (query `?no=` untuk membuka yang ada, tampil-saja). Rute `/bo/transaksi/po-pembelian` dan `/bo/transaksi/so-penjualan` menjadi daftar. Satu tab per rute seperti putaran kedua, jadi daftar dan formulir adalah dua tab (judul tab formulir "PO Baru" dan "SO Baru"). Dalam pelaksanaan sempat satu rute dengan `?baru=1`; tinjauan akhir menunjukkan formulir tertimpa saat daftar dibuka, sehingga dikembalikan ke rute terpisah.
3. **Kolom aksi Daftar Nota dihapus** (Buka, Cetak, WA tidak ada pada gambar 8). Nomor invoice menjadi tautan yang membuka faktur; Cetak dan WA tetap ada di formulir faktur. Tombol "Cetak Laporan" juga dihapus (tidak ada pada gambar).
4. **Aturan hitung diskon BO tetap** (persen atas harga satuan, nominal per satuan, bertingkat `5+5`). Angka contoh pada gambar 9 (diskon 2.000 pada 10 sak) tidak dipakai. Dialog Rincian Barang memetakan isian % dan Rp ke ekspresi diskon yang sama; mengisi salah satu mengosongkan yang lain dan menampilkan padanannya.
5. **Status PO** dipetakan dari data: `draf` dan `dipesan` menjadi On Proses, `diterima-sebagian` menjadi Partial, `diterima` menjadi Selesai. **Status SO**: seluruh SO berstatus `draf` pada model data, ditampilkan On Proses; SO yang sudah diimpor ke faktur pada sesi berjalan ditampilkan Selesai.
6. **Koli**: kotak centang pada tabel faktur menandai barang yang dikirim lewat ekspedisi; "Isi SJ Ekspedisi" membuka Surat Jalan dengan satu baris awal per barang bertanda (Jumlah, Satuan, Nama dari barang). Tanpa barang bertanda, tombol memberi pesan. Baris dapat diubah, dihapus, atau ditambah di Surat Jalan.
7. **Pegangan urut baris** (tiga garis pada gambar): baris dapat diurut ulang dengan seret atau dengan Alt+panah atas atau bawah pada pegangan (alternatif papan ketik).
8. **Teks halaman Transaksi** memakai modul teks malas, bukan label bersama (alasan anggaran JS POS, bagian 3). Tes `messages.test.ts` tidak terpengaruh.
9. **Rentang bawaan riwayat barang** berubah ke tiga bulan (I6) karena gambar baru klien memperlihatkan 01/08/2026 s/d 12/11/2026; ini menggantikan keputusan 30 hari putaran kedua.
10. **Harga Histori** pada dialog Rincian Barang: tiga transaksi terakhir barang itu (penjualan: harga satuan jual ke pelanggan mana pun; pembelian: harga beli dari faktur dan PO pemasok). Ongkos Kirim dan Harga Histori Beli hanya muncul pada dokumen pembelian dan PO; blok Harga Histori Beli hanya untuk Owner (Supervisor tidak melihat riwayat harga beli), sedangkan Ongkos Kirim adalah isian dokumen dan tampil untuk keduanya.
11. **Layar yang hanya berubah tampilan** (retur, deposit) tidak dibangun ulang; hanya diukur.

## 7. Rancangan teknis

### 7.1 Komponen bersama (`src/apps/bo/screens/trx/`)

- `text.ts`: konstanta teks Indonesia seluruh layar Transaksi baru.
- `item-search.ts`: kotak cari barang dengan listbox ARIA (`role=combobox`, `aria-activedescendant`), 8 hasil maksimal dari `findProducts`, sorot teks cocok lewat elemen `mark`, kode di bawah nama, panah atas bawah, Enter, Esc.
- `line-dialog.ts`: dialog Rincian Barang di atas `openModal`; perhitungan murni dipisah ke domain.
- `lines-table.ts`: tabel baris (pegangan urut, Koli opsional, kolom sesuai jenis dokumen), penghitung "N Barang (jumlah)", kotak total (Sub Total, Diskon Rp, Total Biaya Rp, Total).
- `doc-head.ts`: pembangun grid kepala berlabel sebaris dari daftar spesifikasi isian; menautkan label ke kontrol.
- `list-page.ts`: kerangka halaman daftar (kartu judul, kotak angka, bilah filter, tabel menggulir) dipakai Daftar Nota, Daftar PO, Daftar SO.

### 7.2 Domain murni (`src/apps/bo/domain/`)

- `line-detail.ts`: hitung total baris dari kuantitas, harga, ekspresi diskon; padanan % dan Rp; harga histori jual dan beli; opsi satuan dan stok per gudang.
- `product-history.ts`: diperluas (satuan, harga satuan, qty awal dan akhir koreksi, filter pihak) dan ditambah `buildMutationHistory` yang membungkus `movementsFor` dan `buildStockCard`.
- `expedition.ts`: model datar `ExpeditionLine { quantity, unit, name }` menggantikan koli bertingkat; fungsi turunan dari baris faktur bertanda.
- `order-list.ts`: baris Daftar PO dan Daftar SO dari store (status terpetakan, pemesan, keterangan).
- `transaction-list.ts`: ditambah kolom No. SO atau No. PO, User, Keterangan, jumlah transaksi hari ini, saringan tanggal dan pihak.
- `menu.ts`, `tabs.ts`: hapus rekening dari Master; judul tab untuk rute baru.

### 7.3 Tata letak satu layar

Aturan di `src/styles/bo-trx.css` (berkas baru, diimpor setelah `bo-fit.css` dan dimuat malas bersama layar Transaksi agar tidak menggeser layar lain). Kepala formulir berlabel sebaris memakai grid CSS; tabel baris mengisi sisa tinggi (`flex: 1 1 0; min-height: 0`) dengan header menempel; kotak total menempel di bawah. Aturan lama `bo-fit.css` untuk `.bo-form-page` yang dipakai layar lain (retur, deposit) tidak diubah. Tes ukur baru memeriksa tinggi area tabel pada 1280x640.

### 7.4 Pengujian

Unit (Vitest) untuk setiap modul domain baru; e2e Playwright untuk alur per layar (cari barang, dialog, ubah, hapus, urut, simpan PO dan SO muncul di daftar, Isi SJ, riwayat empat tab); tes `bo-muat-layar` ditambah pemeriksaan isi terlihat dan seluruh rute baru; audit axe seluruh rute BO terang dan gelap; `npm run budget` dan `npm run kontras`.

## 8. Urutan pengerjaan

Cabang `revisi-bo-3`, satu commit per tahap; setiap tahap lulus `typecheck`, `lint`, `test`, dan ukur layar sebelum lanjut.

1. Info barang empat riwayat; hapus No Rekening dari Master.
2. Komponen bersama dan dialog Rincian Barang.
3. Daftar Nota, Faktur Penjualan, Faktur Pembelian.
4. Daftar dan formulir PO dan SO.
5. Surat Jalan.
6. Verifikasi menyeluruh, tes lama disesuaikan, dokumen asumsi dan teks baru, build produksi, anggaran, ukur akhir.

## 9. Hasil verifikasi

Dijalankan terhadap build produksi pada 14 November 2026, ulang sesudah perbaikan temuan tinjauan akhir (tautan nota, diskon melebihi harga, data basi pada tab yang dipertahankan, versi benih Surat Jalan, harga awal pembelian, rute formulir PO dan SO, tanggal pesanan, tampil-saja pesanan lama, tombol Cetak dan gaya cetak).

- Statis: `npm run lint` dan `npm run lint:teks` (528 berkas, 0 pelanggaran) dan `npm run typecheck` bersih. `npm test`: 100 berkas, 1054 tes lulus.
- Anggaran: `npm run budget` lolos (JS gzip POS 69,42 KB dari 70, BO 66,47, Owner 63,61, Sales 65,95, Portal 53,67; CSS BO 19,12 KB dari 25). `npm run kontras`: 37 pasangan, 0 gagal.
- Tanpa scroll dan isi terlihat: `node scripts/ukur-bo.mjs` melaporkan 0 dari 53 rute melebihi layar pada 1366 x 640, 1280 x 640, 1280 x 720, 1366 x 768, dan 1920 x 1080, termasuk syarat tabel baris minimal 150 px. Tes `bo-muat-layar.spec.ts` menjaga hal yang sama dan audit axe seluruh rute BO terang dan gelap (0 pelanggaran).
- Playwright BO (`bo`, `bo-kerangka`, `bo-barang`, `bo-dashboard`, `bo-trx`, `tinjau-bo`, `flows`, `gaya`, `header`, `jaringan`, `urutan-tab`, `target-sentuh`, `audit`, `bo-muat-layar`) pada `pc-1366x768`: seluruhnya lulus kecuali audit axe OWN-04 (`.mob-avatar`, aplikasi Owner di luar cakupan, kegagalan lama). `tablet-1280x800`: lulus. `urutan-tab` BO-09 pernah gagal sekali saat semua spesifikasi paralel dan lulus sendiri berulang kali.
- Regresi aplikasi lain pada `tablet-1280x800`: POS (`pos`, `pos-lanjut`, `pos-revisi` sampai `pos-revisi4`) 284 lulus; `responsif`, `portal`, `owner`, `sales` lulus.
- Diperiksa mata pada 1280 x 640: Info barang empat tab, Daftar Nota (penjualan dan pembelian), Faktur Penjualan dan Pembelian (kosong, berisi, dan dialog Rincian Barang), Daftar dan formulir PO, Surat Jalan.

Belum diverifikasi: hasil cetak fisik atau PDF (hanya diperiksa lewat emulasi media cetak), berkas .xlsx dan .pdf asli untuk Info barang (menunggu contoh klien), dan layar BO di bawah 1000 px.
