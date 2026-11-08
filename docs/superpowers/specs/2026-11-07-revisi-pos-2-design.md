# Revisi POS Toko Budiannor, putaran kedua: desain

Tanggal: 2026-11-07. Status: draf, menunggu review. Cakupan: modul POS (`#/pos`). Target klien: Selasa, 10 November 2026. Melanjutkan `2026-11-07-revisi-pos-design.md` (putaran pertama, sudah digabung ke `main`).

## 1. Konteks dan tujuan

Setelah putaran pertama, pemilik proyek mengirim PDF 32 halaman (`Screenshot 2026-11-07 134637.pdf`): tangkapan layar aplikasi kasir lain dari rekaman video. Permintaannya: POS diperbaiki lagi dari sisi tampilan dan fitur, mengikuti PDF itu, **semua fitur di PDF berfungsi** termasuk Retur, tampilan rapi dan enak dilihat, **responsif sederhana**, **6 pilihan warna**, mode terang dan gelap **otomatis**, dan aset dari internet boleh dipakai.

Sumber, urut prioritas: (1) proposal klien dan batasan data putaran pertama, (2) PDF baru, hanya untuk gaya dan alur (barang dagangan di PDF seperti Sania dan Ultra Milk tidak dipakai), (3) permintaan pemilik proyek di percakapan.

Keputusan pemilik proyek di percakapan: satu spec dan satu rencana untuk lima bagian berurutan; Kasir boleh Retur langsung; desain ini disetujui secara lisan.

### 1.1 Peta PDF ke bagian spec

| Halaman PDF              | Isi                                                          | Bagian |
| ------------------------ | ------------------------------------------------------------ | ------ |
| 1, 2, 9, 10, 11          | Riwayat Penjualan: daftar, detail, Retur, Share Struk        | 5      |
| 3                        | Kirim Struk lewat WA dan email                               | 5      |
| 4 sampai 7, 12 sampai 14 | Retur: barang, metode pengembalian, alasan, Retur Berhasil   | 5      |
| 15 sampai 19             | Biaya, Catat Biaya, numpad, Transaksi Berhasil               | 8      |
| 20                       | Pelanggan                                                    | 8      |
| 8, 21, 22                | Karyawan, shift, Belum Diperiksa                             | 8      |
| 23 sampai 25             | Laporan shift, rincian per metode                            | 8      |
| 26                       | Pengaturan, Tema                                             | 4, 8   |
| 27, 28                   | Detail barang, Cek Stok                                      | 7      |
| 29                       | Open Bill dengan menu Ubah, Split Bill, Merge Bill, Batalkan | 7      |
| 30 sampai 32             | Penerimaan Split, Pembayaran 1 dengan numpad, Scan QR        | 6      |

## 2. Di luar cakupan

- Back-Office, Owner, dan Sales. Tema dan mode gelap hanya dipasang di POS.
- Halaman "Langganan untuk Menggunakan Fitur" dan tautan "Konsultasi Gratis". Itu fitur jualan aplikasi acuan, bukan fungsi kasir.
- Nomor versi aplikasi acuan, pajak (PPN), dan tombol "Katalog Tampilan F&B".
- Pengiriman nyata (WA, email, cetak). Semuanya simulasi tanpa permintaan jaringan.

## 3. Batasan yang tetap berlaku

- Data barang dan pelanggan tetap dari proposal (putaran pertama). Tidak ada data karangan baru. Riwayat shift mulai kosong.
- CSP `style-src 'self'`: tanpa gaya inline, tanpa `innerHTML`. Uji jaringan melarang permintaan keluar dan alamat http(s) di `dist`. Semua aset disimpan lokal di `public/`.
- Anggaran gzip per aplikasi: JS awal 70 KB (POS sekarang 55 KB) dan CSS awal 25 KB (sekarang 10 KB), dihitung dari berkas masuk dan dependensi statisnya. Layar sekunder dimuat malas lewat `import()` supaya JS awal tetap di anggaran. CSS yang dimuat malas tetap dihitung.
- Teks antarmuka lewat `labels` di `src/shared/messages.ts` dan dicatat di `docs/teks-baru.md`. 120 pesan sistem tetap terkunci. Tanpa tanda pisah en atau em (`npm run lint:teks`).
- axe WCAG 2.x A dan AA, target sentuh 48 px, kontras lewat `npm run kontras`.

## 4. Bagian 1: fondasi tampilan

### 4.1 Enam palet

Palet hanya mengganti aksen (`default`, `pressed`, `soft`, masing-masing nilai terang dan gelap), lewat `$themes` di `tokens/tokens.json` dan blok yang dibangkitkan `build-tokens`.

| Kode       | Nama        | Aksen terang | Aksen gelap |
| ---------- | ----------- | ------------ | ----------- |
| `oranye`   | Oranye      | `#B94F00`    | `#F0A15C`   |
| `terakota` | Terakota    | bawaan token | bawaan      |
| `teal`     | Teal        | `#0F766E`    | `#5CC8BE`   |
| `biru`     | Biru Safir  | `#1D4ED8`    | `#8AB4FF`   |
| `hijau`    | Hijau Hutan | `#15803D`    | `#6FD08C`   |
| `ungu`     | Ungu Indigo | `#6D28D9`    | `#B9A2FF`   |

Nilai awal `pressed` dan `soft` palet baru (terang, lalu gelap): Biru Safir `#1E3A8A` dan `#DBEAFE`, lalu `#8AB4FF` dan `#1E2A44`; Hijau Hutan `#14532D` dan `#DCFCE7`, lalu `#6FD08C` dan `#1B3326`; Ungu Indigo `#4C1D95` dan `#EDE9FE`, lalu `#B9A2FF` dan `#2A2340`. Semua angka di bagian ini adalah usulan; angka akhir ditentukan oleh `npm run kontras` (6 palet kali 2 mode = 12 kombinasi, bagian C): teks putih pada aksen terang minimal 4,5 : 1, teks gelap pada aksen gelap minimal 4,5 : 1, teks utama pada `soft` minimal 7 : 1 seperti sekarang. Nilai yang gagal diganti, bukan pengecualian.

Palet "gelap" lama dihapus karena kini menjadi mode. Nilai `gelap` yang sudah tersimpan di `localStorage` dimigrasi: palet jadi `oranye` dan mode jadi `gelap`.

### 4.2 Mode terang, gelap, otomatis

- Pilihan: `otomatis` (bawaan), `terang`, `gelap`. Disimpan di `localStorage` kunci `toko-budiannor-mode-pos`; palet tetap di `toko-budiannor-tema-pos`. Akses penyimpanan dibungkus try/catch seperti `loadTheme`.
- Fungsi murni `resolveScheme(mode, prefersDark): 'terang' | 'gelap'`. `applyAppearance(root, palette, mode)` memasang `data-pos-theme` (palet), `data-pos-mode` (pilihan), dan `data-pos-scheme` (hasil). Pendengar `matchMedia('(prefers-color-scheme: dark)')` memasang ulang saat mode `otomatis` dan pengaturan perangkat berubah.
- CSS: blok gelap yang sudah ada untuk `[data-app='pos'][data-pos-surface='dark']` dipakai ulang untuk `[data-app='pos'][data-pos-scheme='gelap']` (selektor dikeluarkan bersama oleh `build-tokens`), ditambah `color-scheme: dark` agar kontrol bawaan peramban ikut gelap.
- Layar login tetap gelap pada semua mode (R-10 putaran pertama). Layar lain mengikuti mode.

### 4.3 Responsif

Dua titik henti: **900 px** (mode ringkas) dan **600 px** (mode ponsel). Tablet 1024 x 768 mendapat tata letak dua panel; tablet potret 768 dan ponsel memakai mode ringkas.

| Layar                                           | 900 px ke atas                 | Di bawah 900 px                                                         | Di bawah 600 px                                    |
| ----------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Jual                                            | katalog + panel pesanan 340 px | katalog penuh, bilah "Pesanan (n) Rp" membuka lembar pesanan dari bawah | sama; kartu barang satu kolom                      |
| Riwayat, Karyawan, Biaya, Pelanggan, Pengaturan | daftar + detail dua panel      | satu panel: daftar dulu, detail setelah dipilih dengan tombol Kembali   | sama                                               |
| Bayar                                           | ringkasan + pembayaran         | ditumpuk; ringkasan bisa dilipat                                        | sama                                               |
| Modal                                           | di tengah, lebar maksimal 680  | sama                                                                    | layar penuh (`100dvh`), tombol aksi menempel bawah |
| Topbar                                          | menu, judul, chip, pengguna    | nama pengguna disembunyikan                                             | chip shift hanya ikon                              |

Grid barang memakai `repeat(auto-fill, minmax(min(100%, 230px), 1fr))` sehingga kolom menyesuaikan lebar. Tata letak dua panel dibuat sebagai satu pola CSS bersama (`.pos-split`) dengan satu atribut `data-pane="daftar|detail"` untuk mode satu panel. Tidak ada mesin tata letak di JavaScript.

### 4.4 Pengaturan > Tampilan

Layar baru POS-12 (bagian 8) memuat kartu **Tema** berisi enam swatch (radiogroup) dan kartu **Mode** berisi tiga pilihan (radiogroup), serta **Tampilan katalog** (Kartu atau Daftar). Pilihan tema di menu samping lama diganti satu tautan ke Pengaturan.

### 4.5 Kerapian visual

Selain palet dan responsif: jarak dan ukuran huruf konsisten dari token, ikon dari satu keluarga, ilustrasi layar kosong, avatar karyawan, kartu dengan sudut dan bayangan seragam, dan keadaan kosong, memuat, serta galat di setiap layar. Perbaikan visual per layar mengikuti PDF di bagian 5 sampai 8.

## 5. Bagian 2: Riwayat, Retur, struk (POS-06)

### 5.1 Riwayat

- Panel kiri: kolom cari "Cari Penjualan" dan tombol corong yang membuka popover filter (rentang tanggal, metode, status Lunas dan Pending). Baris: ikon metode dalam lingkaran, nomor penjualan tebal, "Total Rp...", jam di kanan, baris bawah berisi metode (Tunai, QRIS, Split, nama kanal) dan nama kasir. Dikelompokkan per hari seperti sekarang.
- Detail: tombol Retur, Share Struk, Cetak Struk (utama), dan Ajukan Koreksi bila diizinkan. Bagian Informasi Penjualan (ikon + nomor, tanggal, pelanggan, dibuat oleh), Informasi Penerimaan (tiga kartu: Total Penerimaan, Total Bayar, Kembali), Riwayat Penerimaan (dua baris pertama, sisanya lewat "+ N Penerimaan Lainnya"), Barang & Jasa (foto kecil, nama, jumlah dan satuan, "Diinput Oleh: nama - peran", harga), lalu Subtotal, Diskon (bila ada), dan Grand Total. Tanpa Pajak.

### 5.2 Retur

Alur putaran pertama dipertahankan (barang, jumlah, nominal, cara kembali, alasan, foto, Retur Berhasil) dengan perubahan:

- **Kasir boleh Retur langsung.** Aturan `['BO-10', 'Simpan Retur', 'YYT']` menjadi `'YYY'` dan `returnItems` memeriksa aturan yang sama. Ini perubahan atas proposal dan dicatat sebagai keputusan pemilik proyek di `docs/asumsi.md`.
- Baris barang menampilkan foto, "Total Rp...", jumlah dan satuan, serta "Diinput Oleh". Judul bagian "Retur Barang & Jasa" dengan ikon informasi, kotak Pilih Semua, pita "Pesanan (n)".
- Metode Pengembalian berupa chip yang bisa digeser: Tunai, QRIS, EDC, Transfer. Bila QRIS atau Transfer dipilih, muncul baris chip kedua berisi kanal (bagian 6.2). Kanal disimpan pada `ReturnRecord.refund.channel`.
- Foto bukti: tile dengan tanda tambah, memilih berkas gambar, menampilkan nama berkas. Yang dicatat tetap nama berkas.
- Tampilan modal: layar penuh di bawah 600 px, tombol Retur menempel di bawah dengan "Total Retur" dan "Dari N Kuantitas".

### 5.3 Share Struk

Modal "Kirim Struk": ikon, nomor penjualan, total, nama pelanggan. Dua baris: WA ("Masukkan No. Handphone", tombol Kirim) dan email ("Masukkan Email", tombol Kirim). Nomor WA divalidasi seperti sekarang (MSG-044); email divalidasi dengan pola sederhana dan memakai label galat baru. Keduanya simulasi: toast "terkirim" tanpa permintaan jaringan. Modal yang sama dipakai untuk Kirim Bukti Retur dan setelah bayar.

## 6. Bagian 3: Penerimaan (POS-04)

### 6.1 Tata letak

Kiri: chip pelanggan, "Pesanan (n)" berisi baris (nama, jumlah, harga; harga coret dan tanda diskon bila ada), dan bar Subtotal yang bisa dibuka untuk melihat Subtotal, Diskon, Total. Kanan: "Total Pembayaran" besar berwarna aksen, tab **Tunai | Non-Tunai | Split | Piutang** (`role="tablist"`), isi tab, dan tombol Bayar. Syarat bayar lama (radiogroup Tunai/Piutang) digantikan tab; isi Piutang tetap (tempo 7, 30, 45, hari lainnya, DP dan caranya, sisa tagihan, jatuh tempo) sesuai R-12.

### 6.2 Metode dan kanal

Empat metode proposal tetap (`tunai`, `qris`, `edc`, `transfer`). Kanal adalah pilihan di bawahnya, disimpan sebagai `channel`:

| Metode     | Kanal                             |
| ---------- | --------------------------------- |
| `qris`     | QRIS umum, Gopay, OVO, Shopee Pay |
| `edc`      | tanpa kanal                       |
| `transfer` | BCA, BRI, Mandiri                 |

Tab Non-Tunai menampilkan daftar kanal sebagai kartu. QRIS dan dompet digital membuka modal **Scan QR Code**: gambar mirip kode QR (digambar SVG deterministik dari nomor referensi, tidak bisa dipindai), "Reference ID", "Tagihan Rp...", tombol Cek Status Pembayaran (mensimulasikan lunas setelah sekitar satu detik), Cetak Kode QR (pratinjau struk), dan tautan Metode Pembayaran untuk kembali. EDC dan Transfer menampilkan isian Nomor Referensi. Baris pembayaran dikenali oleh pasangan metode dan kanal, jadi Transfer BCA dan Transfer BRI bisa ada bersamaan.

### 6.3 Tunai dan numpad

Tab Tunai memakai papan angka di halaman: 1 sampai 9, `C`, hapus, `000`, `0`, dan tombol enter yang mengisi Uang Pas. Tombol Uang Pas dan nominal cepat tetap. Kembalian tampil langsung. Papan angka yang sama dipakai di modal Split, Catat Biaya, dan Selesai Shift (dari `createMoneyPad`).

### 6.4 Split

Tab Split berisi "Pembayaran 1", "Pembayaran 2", dan "+ Tambah Pembayaran". Tiap baris membuka modal "Pembayaran N" dengan tab Tunai dan Non-Tunai, papan angka, dan tombol Simpan. Sisa tagihan tampil. Bayar aktif setelah jumlah pembayaran minimal sama dengan total (tunai boleh lebih untuk kembalian).

### 6.5 Setelah bayar

Dialog Pembayaran Berhasil putaran pertama tetap (Cetak Struk, Kirim WA, Selesai). Kirim WA memakai modal Kirim Struk bagian 5.3.

## 7. Bagian 4: Pesanan (POS-02, POS-03, POS-05)

### 7.1 Detail barang

Mengetuk baris pesanan membuka **Detail Barang** (menggantikan modal satuan POS-03 tanpa mengubah perilaku lamanya): judul dan "Kode Barang", Subtotal berwarna aksen, tombol Simpan, ikon hapus. Isi: foto barang, harga "@Rp...", pilihan satuan, stepper Kuantitas, **Tenaga Penjual** (pilih dari pengguna berperan frontliner atau sales), **Berikan Diskon** (persen atau nominal), **Ubah Harga** (nominal), **Catatan** (opsional), dan **Cek Stok Barang** (membuka rincian stok Toko, Gudang, dan PO per satuan dari `domain/stock.ts`).

- Model: `BillLine` mendapat `discount?`, `listPrice?` (harga asli saat harga diubah), `note?`, `sellerId?`. `unitPrice` tetap harga efektif. `lineSubtotal` = jumlah kali `unitPrice` dikurangi diskon baris, dibulatkan ke rupiah.
- Hak akses: Diskon dan Ubah Harga: Owner dan Supervisor ya, Kasir **otorisasi** (PIN Supervisor atau Owner lewat modal otorisasi yang sudah ada, tujuan baru `harga`). Catatan, Tenaga Penjual, dan Cek Stok untuk semua peran. Frontliner tidak membayar sehingga tidak mengubah harga.
- Diskon dan perubahan harga ikut ke `Sale`, struk, riwayat, retur (nilai retur memakai subtotal baris setelah diskon), dan Grand Total.

### 7.2 Open Bill

Layar POS-05 mengikuti PDF: tiap bill berupa kartu berisi Nomor Open Bill, Nama Pelanggan, Dibuat oleh, Waktu, dan menu titik tiga: **Ubah** (memanggil ke pesanan, syarat pesanan kosong seperti MSG-028), **Split Bill** (pilih baris dan jumlah untuk dipindah ke bill baru; keduanya tetap tersimpan), **Merge Bill** (pilih bill lain untuk digabung; baris dengan barang dan satuan sama dijumlahkan), dan **Batalkan** (hapus bill). Batalkan mengikuti aturan lama "Hapus Bill" (Kasir tidak). Kartu menampilkan dua baris pertama dan "+ N Barang Lainnya".

## 8. Bagian 5: shift, Karyawan, Biaya, Pelanggan, Pengaturan

### 8.1 Shift dan laporan

- Selesai Shift meminta **Uang tunai di laci** (papan angka). Hasilnya menjadi `ClosedShift`: `id`, `userId`, `startedAt`, `endedAt`, `openingCash`, `expectedCash` (saldo laci), `countedCash`, `difference` (hitungan dikurangi harapan), rekap per metode dan kanal (jumlah penerimaan dan nominal), total dan jumlah retur, total dan jumlah biaya, `review: { status: 'belum' | 'sudah', by?, at? }`. Daftarnya `PosState.closedShifts`. Mulai dari kosong.
- Selesai Shift tetap menampilkan ringkasan putaran pertama, kini disertai selisih tunai.

### 8.2 Karyawan (POS-11, Owner dan Supervisor)

Panel kiri: pengguna berperan owner, supervisor, kasir, dan frontliner (tanpa sales lapangan), dengan avatar, nama, peran, dan lencana merah jumlah shift "Belum Diperiksa". Panel kanan: kepala pengguna dan daftar shift ("Shift Berjalan" bila ada, lalu shift tertutup dengan status Belum Diperiksa atau Sudah Diperiksa dan rentang waktu). Tanpa shift: ilustrasi "Tidak ada data / Belum ada shift dimulai".

Mengetuk shift membuka modal laporan: **Informasi Tunai** (Modal Awal, Laporan Tunai, Selisih Tunai), **Riwayat Penerimaan Akhir & Pengeluaran** (Total Penerimaan Akhir dengan jumlah transaksi, Total Retur, Total Biaya), lalu baris per metode dan kanal (Tunai, QRIS, EDC, Transfer dan kanalnya) yang bisa diketuk membuka daftar transaksi metode itu (judul "BCA | rentang waktu", Total Diterima, cari, baris Penerimaan dan Retur dengan tanda plus atau minus). Tombol **Terima Laporan** dan **Terima & Cetak Laporan** hanya untuk Owner dan Supervisor dan hanya pada shift Belum Diperiksa; setelah diterima status menjadi Sudah Diperiksa dengan nama pemeriksa. Shift berjalan dibuka tanpa tombol terima.

### 8.3 Biaya (POS-07)

Dua panel (bagian 4.3): daftar biaya dengan kolom cari "Cari Transaksi" dan tombol bulat tambah; detail berisi Nomor Pembayaran, Dibuat Oleh, Jenis Biaya, Nominal Pembayaran, Tanggal Pembayaran, Catatan, dan tombol Cetak Struk. Tombol tambah membuka **Catat Biaya**: jenis biaya (dropdown berisi jenis proposal: bensin, parkir, ekspedisi, lainnya), nominal (tampilan dan papan angka), catatan opsional dengan penghitung 0/144, lampiran opsional (JPG, JPEG, PNG maksimal 3 MB dan PDF maksimal 1 MB, dicatat nama dan ukuran), dan Simpan. Setelah simpan muncul dialog "Transaksi Berhasil" dengan jenis biaya, Cetak Struk, dan Selesai. `Expense` mendapat `attachment?: { name, size }`.

### 8.4 Pelanggan (POS-08)

Rute baru `/pos/pelanggan` (daftar), sementara `/pos/pelanggan-baru` tetap sebagai formulir. Panel kiri: kolom cari "Cari pelanggan" dan daftar dikelompokkan per huruf awal dengan avatar inisial. Panel kanan: nama, telepon, alamat, kategori harga, limit piutang, sisa limit, total piutang, tempo, dan faktur belum lunas dari data yang ada. Tombol bulat tambah membuka formulir pelanggan baru. Menu samping "Pelanggan" menuju daftar.

### 8.5 Pengaturan (POS-12, semua peran)

Menu kiri: Profil Pengguna, Printer, Mesin EDC, Perangkat, Backup Data, Pengaturan Lainnya.

- **Profil Pengguna**: avatar, nama, peran, dan **Ubah PIN** (PIN lama, PIN baru, ulangi). PIN baru empat sampai enam digit (pola `PIN_PATTERN` yang sudah ada) dan tidak boleh sama dengan PIN lama. Disimpan di sesi (`PosState.pins`), memengaruhi login berikutnya selama aplikasi belum dimuat ulang.
- **Printer**: status terhubung atau terputus mengikuti Panel Simulasi, tombol Uji Cetak membuka pratinjau struk contoh.
- **Mesin EDC**: status simulasi dan tombol Uji Koneksi (toast).
- **Perangkat**: nama perangkat, outlet terhubung "Toko Budiannor", dan versi mockup.
- **Backup Data**: tombol "Unduh Cadangan" menghasilkan berkas JSON berisi penjualan, biaya, retur, bill tertahan, dan shift sesi ini (unduhan Blob lokal).
- **Pengaturan Lainnya**: Tema, Mode, dan Tampilan katalog (bagian 4.4).

Menu samping memuat tambahan Karyawan (Owner dan Supervisor), Pelanggan, dan Pengaturan.

## 9. Data, hak akses, dan katalog layar

### 9.1 Perubahan tipe

- `BillLine`: `discount?: { kind: 'persen' | 'nominal'; value: number }`, `listPrice?: number`, `note?: string`, `sellerId?: string`.
- `SalePayment`, `PaymentRow`, dan `ReturnRecord.refund`: `channel?: string`. Identitas baris pembayaran menjadi metode ditambah kanal.
- `Expense`: `attachment?`. `PosState`: `closedShifts`, `pins`. Pengaturan tampilan di `localStorage` (palet, mode, katalog).
- Metode sesi baru: `setLineDetail`, `splitHeldBill`, `mergeHeldBills`, `endShift(countedCash)`, `reviewShift`, `changePin`, serta `saveExpense` menerima lampiran. Semuanya didahului tes unit.

### 9.2 Hak akses dan katalog

- ID layar baru: **POS-11** Karyawan (`/pos/karyawan`, Owner dan Supervisor) dan **POS-12** Pengaturan (`/pos/pengaturan`, Owner, Supervisor, Kasir). POS-10 sudah dipakai (Persetujuan) dan tidak diubah.
- Baris matriks baru: POS-03 (Diskon, Ubah Harga: Owner ya, Supervisor ya, Kasir otorisasi; Catatan, Tenaga Penjual, Cek Stok: semua ya), POS-05 (Ubah, Split Bill, Merge Bill), POS-11 (Terima Laporan untuk Owner dan Supervisor), POS-12 (Ubah PIN, Backup Data, Uji Cetak). Baris `BO-10 Simpan Retur` berubah ke `YYY`.
- Uji yang mengunci matriks dan katalog (`permissions.test.ts`: jumlah aturan 148 dan layar 43, `catalog.test.ts`, daftar layar Mode Tinjau) diubah dengan sadar sesuai penambahan. Setiap perubahan angka dicatat di `docs/asumsi.md`.

## 10. Aset dari internet

Aset diunduh sekali, disimpan di `public/`, tidak pernah dimuat dari luar saat aplikasi berjalan. Hanya sumber berlisensi bebas. Rencana implementasi menyebut nama berkas, sumber, lisensi, dan ukuran setiap aset, dan pengunduhan baru dilakukan setelah rencana disetujui. Rencana awal:

- **Ilustrasi layar kosong** (tidak ada data, belum mulai shift, bill kosong): gaya unDraw, warna diganti ke variabel tema.
- **Avatar karyawan**: ilustrasi berlisensi bebas (CC0), satu per pengguna; inisial sebagai cadangan.
- **Foto kategori barang** untuk barang bangkitan (placeholder abu-abu sekarang): sekitar 12 foto kecil berlisensi bebas (Pexels atau Unsplash), WebP sekitar 300 piksel. Tujuh barang proposal tetap memakai foto dari PDF.
- **Ikon**: tambahan dari Lucide (ISC), keluarga yang sama dengan ikon sekarang.
- Sumber dan lisensi dicatat di `docs/aset-pihak-ketiga.md`.

## 11. Asumsi dan keputusan yang perlu dikonfirmasi

- A-1 Tanpa pajak (PPN): total mengikuti proposal.
- A-2 Kanal non-tunai (Gopay, OVO, Shopee Pay, BCA, BRI, Mandiri) berasal dari PDF, bukan proposal. Empat metode proposal tetap.
- A-3 Layar QR dan pengiriman WA dan email hanya simulasi.
- A-4 Nilai enam palet adalah usulan; angka akhir ditentukan oleh uji kontras.
- A-5 Layar login tetap gelap pada semua mode.
- A-6 Riwayat shift mulai kosong dan terisi dari shift yang diakhiri di sesi ini. Tidak ada data karangan.
- A-7 Tenaga Penjual diambil dari pengguna berperan frontliner dan sales.
- A-8 Diskon dan Ubah Harga untuk Kasir memerlukan otorisasi Supervisor atau Owner.
- A-9 Ubah PIN hanya berlaku selama sesi aplikasi.
- A-10 Perubahan atas proposal: Kasir boleh Retur (keputusan pemilik proyek).
- A-11 Jenis biaya tetap dari proposal, bukan dari PDF.
- A-12 Menu samping tidak lagi memuat pemilih tema; pemilihan ada di Pengaturan.
- A-13 Pelanggan, faktur, dan limit memakai data proposal; limit Rp 50.000.000 (A-1 putaran pertama) masih perlu konfirmasi klien.

## 12. Fase pengerjaan

Lima bagian berurutan, masing-masing diakhiri komit dan verifikasi:

1. Fondasi tampilan: palet, mode, responsif, Pengaturan > Tampilan.
2. Riwayat, Retur, struk.
3. Penerimaan.
4. Pesanan: Detail Barang dan Open Bill.
5. Shift, Karyawan, Biaya, Pelanggan, Pengaturan lain.

Bagian 1 dikerjakan pertama karena menentukan CSS yang dipakai semua layar lain. Bila waktu habis sebelum Selasa, pekerjaan boleh berhenti setelah bagian mana pun karena tiap bagian utuh.

## 13. Pengujian dan kriteria selesai

- Unit: `resolveScheme`, parsing dan migrasi tema, diskon dan harga baris, split dan merge bill, baris pembayaran dengan kanal, `ClosedShift` dan selisih tunai, `changePin`, validasi email, validasi lampiran.
- e2e per bagian di `tests/e2e/pos-revisi2.spec.ts`; spesifikasi `responsif.spec.ts` pada 360 x 800 dan 768 x 1024 memeriksa tidak ada scroll horizontal, axe, dan target 48 px untuk layar utama; uji mode otomatis memakai `page.emulateMedia({ colorScheme })`.
- axe pada setiap layar baru dalam mode terang dan gelap.
- `npm run kontras` lolos untuk 12 kombinasi palet dan mode.
- `npm run lint`, `lint:teks`, `typecheck`, `npm test`, `build`, `budget` (JS awal 70 KB dan CSS awal 25 KB), `npm run test:e2e` (uji jaringan tetap lulus), dan `npm run verifikasi:axe` hijau.
- Tinjauan visual setiap bagian pada tiga lebar (360, 768, 1280) untuk setidaknya dua palet dalam mode terang dan gelap.
- Selesai bila seluruh gerbang hijau dan review akhir seluruh cabang tidak menyisakan temuan Critical atau Important.
