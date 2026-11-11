# Revisi POS Toko Budiannor, putaran ketiga: desain

Tanggal: 2026-11-11. Cakupan: modul POS (`#/pos`). Sumber: dokumen klien "Revisi Penyesuaian Pos" (Word, 10 gambar contoh). Melanjutkan putaran kedua (`2026-11-07-revisi-pos-2-design.md`, sudah di `main`).

## 1. Konteks

Klien meminta penyesuaian POS setelah mencoba putaran kedua. Dokumen terbagi empat bagian: Pesanan Baru (12 poin), saat klik barang di kartu dan di keranjang (2 poin), halaman pembayaran (4 poin), dan tambahan fitur POS (8 poin). Setiap poin diberi nomor di bawah dan dilacak sampai kode dan pengujian. Gambar 1 sampai 10 dipakai sebagai acuan tata letak; angka dan nama barang pada gambar hanya contoh.

Ukuran layar klien pada gambar 1 sekitar 1366 x 640 px (area halaman setelah bilah peramban). Syarat "tanpa scroll bar" diuji pada 1366 x 640 dan 1280 x 720, selain 1280 x 800 dan 1366 x 768.

## 2. Batasan yang tetap berlaku

Sama seperti putaran kedua: CSP `style-src 'self'` (tanpa gaya inline dan `innerHTML`), anggaran JS awal POS 70 KB gzip dan CSS awal 25 KB gzip, teks lewat `labels` dan dicatat di `docs/teks-baru.md`, 120 pesan sistem terkunci, tanpa tanda pisah en dan em, target sentuh 48 px, axe WCAG 2.x A dan AA, kontras lewat `npm run kontras`.

## 3. Matriks keterlacakan

Kolom Tes berisi berkas pengujian utama: `U` uji unit (Vitest), `E` e2e Playwright `tests/e2e/pos-revisi3.spec.ts` kecuali disebut lain.

### 3.1 Pesanan Baru

| No  | Permintaan klien                                                                                        | Keputusan dan perubahan                                                                                                                                                                                                                                     | Tes |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| A1  | Login PIN 6 angka, setelah lengkap tekan Enter langsung masuk tanpa mouse                               | Enter selalu mengirim PIN walau fokus ada di tombol angka atau kartu kasir; fokus tidak lagi dipindah ke tombol "1" setelah memilih kasir                                                                                                                   | E   |
| A2  | Klik "Akhiri Shift" langsung log off                                                                    | Setelah shift ditutup, sesi keluar dan layar kembali ke login                                                                                                                                                                                               | E U |
| A3  | Stok PO tidak ditampilkan; hanya stok Toko dan Gudang; PO diganti No Rak                                | Kartu, daftar katalog, dan modal satuan menampilkan Toko, Gudang, No Rak (`Product.rak`); tujuh barang proposal diberi nomor rak                                                                                                                            | U E |
| A4  | Transaksi hanya dari stok toko; stok kosong: kartu tidak masuk keranjang dan ada peringatan stok kosong | Batas jual = stok Toko (`stock.display`). Kartu stok 0 bertanda `aria-disabled` dan redup, klik menampilkan toast "Stok kosong". Jumlah di keranjang tidak boleh melebihi stok Toko (pesan "Stok toko hanya ...")                                           | U E |
| A5  | Nama pelanggan di atas daftar keranjang                                                                 | Tombol pelanggan pindah dari bilah alat ke kepala panel pesanan, format `KODE - NAMA (ECERAN)`; pelanggan Umum tampil `UMUM (ECERAN)`                                                                                                                       | E   |
| A6  | Header: "Shift Dimulai" diganti hari dan tanggal                                                        | Chip shift dihapus; tengah header memuat `Selasa, 10 November 2026 - 15:42`; jam terpisah dihapus                                                                                                                                                           | U E |
| A7  | Foto kosong menampilkan huruf awal (Semen Gresik jadi SG)                                               | Barang tanpa foto sendiri menampilkan inisial dua kata pertama pada kotak berwarna; foto kategori generik tidak lagi dipakai sebagai foto barang                                                                                                            | U E |
| A8  | Harga mengikuti kategori pelanggan Ecer atau Grosir                                                     | Sudah berjalan lewat `Tier`; diverifikasi dan diberi tes. Label RETAIL diganti ECERAN                                                                                                                                                                       | U E |
| A9  | Menu titik tiga: Open Bill, Diskon Transaksi, Mulai Pesanan Baru (dengan konfirmasi)                    | Menu berisi tiga pilihan. Open Bill = Tahan Bill. Diskon Transaksi = diskon persen atau nominal atas total (hak akses sama dengan Diskon baris). Mulai Pesanan Baru memunculkan "Konfirmasi Pesanan Baru: Barang yang ada dikeranjang tidak akan tersimpan" | U E |
| A10 | Barang promo bertanda gambar keterangan promo                                                           | Pita "PROMO" di pojok kiri atas kartu untuk barang dengan `promo` bernilai; Cat Spray Pylox diberi promo seperti gambar 1                                                                                                                                   | E   |
| A11 | Nama barang satu baris, maksimal 30 sampai 35 karakter; sertakan kode barang                            | Nama dipotong 32 karakter dengan tanda elipsis (nama penuh di `title`); kode barang tampil di kartu, keranjang, dan daftar                                                                                                                                  | U E |
| A12 | Kartu barang lebih mepet dan proporsional                                                               | Foto 112 px, nama satu baris, baris harga 34 px (satu tombol kartu, baris harga bukan kontrol terpisah), stok tiga kolom ringkas                                                                                                                            | E   |

### 3.2 Klik barang di kartu dan di keranjang

| No  | Permintaan klien                                                      | Keputusan dan perubahan                                                                                                          | Tes |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --- |
| B1  | Tanpa scroll bar; hanya keranjang dan pratinjau struk boleh scroll    | Modal Detail Barang dan modal satuan dua kolom dengan tinggi tetap; diuji `scrollHeight <= clientHeight` pada empat ukuran layar | E   |
| B2  | Hilangkan Tenaga Penjual, Cek Stok, Catatan; sisakan diskon dan harga | Ketiganya dihapus dari modal Detail Barang; `stock-sheet.ts` dihapus. Data lama (`sellerId`, `note`) tetap terbaca               | E   |

### 3.3 Pembayaran

| No  | Permintaan klien                                        | Keputusan dan perubahan                                                                                                                                                                                                                                                                                 | Tes |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| C1  | Tunai: Uang Pas dan dua pecahan di atasnya              | `cashSuggestions(total)`: pecahan pertama = pecahan tunggal terkecil di atas total (total di bawah 100.000) atau kelipatan 50.000 berikutnya; pecahan kedua = kelipatan 50.000 berikutnya lagi dari 50.000. 3.500 jadi 5.000 dan 50.000; 8.000 jadi 10.000 dan 50.000; 141.000 jadi 150.000 dan 200.000 | U E |
| C2  | Non-tunai hanya QRIS, Transfer, EDC; QRIS tanpa barcode | Kartu kanal (Gopay, OVO, Shopee Pay, bank) dan modal Scan QR dihapus dari pembayaran. QRIS langsung dianggap diterima manual. Isian Nomor Referensi diganti kolom Catatan                                                                                                                               | U E |
| C3  | Split maksimal 3; kalkulator rapi tanpa scroll          | Tiga slot tetap, tombol Tambah Pembayaran dihapus, domain menolak indeks 3 ke atas. Modal Pembayaran N dua kolom                                                                                                                                                                                        | U E |
| C4  | Piutang tanpa scroll; hari 7, 14, 30                    | `TERM_CHOICES = [7, 14, 30]`; tata letak dua kolom agar muat satu layar                                                                                                                                                                                                                                 | U E |
| C5  | Kolom catatan di semua tab pembayaran                   | Satu kolom "Masukkan Catatan (Opsional)" dipakai bersama semua tab (di bawah pilihan pada Non-Tunai seperti gambar 4, di baris bawah bersama Kembali dan Bayar pada tab lain), disimpan pada `Sale.note`, tampil di Riwayat dan struk                                                                   | U E |

### 3.4 Tambahan fitur

| No  | Permintaan klien                                                                                     | Keputusan dan perubahan                                                                                                                                                                                        | Tes |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| D1  | Diskon per satuan barang, bukan total jumlah                                                         | Diskon nominal berarti rupiah per satuan dikali jumlah; persen tidak berubah. Pembagian bill, penggabungan bill, dan retur mengikuti. Data bangkitan `invoice-lines` disesuaikan agar total invoice tetap sama | U E |
| D2  | Ubah harga tanpa tampilan harga asli dan harga coret                                                 | Teks harga asli dan coretan dihapus dari keranjang, layar bayar, Riwayat, struk, dan modal                                                                                                                     | U E |
| D3  | Bill gantung: satu barang tampak, sisanya "+N Barang Lainnya" bisa dibuka                            | Kartu Open Bill lebar mengikuti gambar 7: info bill, satu barang, tombol "+N Barang Lainnya" membuka semua (Tutup menutup), subtotal, Bayar, cetak                                                             | E   |
| D4  | Pilihan Biaya: Bensin Armada, Bayar Ekspedisi, Uang Makan Karyawan, Upah Bongkar Muat, Biaya Lainnya | `EXPENSE_KINDS = ['bensin', 'ekspedisi', 'makan', 'bongkar', 'lainnya']`; Parkir dihapus                                                                                                                       | U E |
| D5  | Retur ikut terposting di Riwayat Penjualan                                                           | Setiap retur menjadi baris Riwayat (nomor `T-0101.1`, lencana Retur merah muda) dengan detail alasan, foto bukti, barang, dan Total Uang Dikembalikan; penjualan asal memuat tautan Riwayat Retur              | U E |
| D6  | Katalog daftar dirapikan (gambar 9)                                                                  | Baris: foto, nama dan kode, chip harga per satuan, kotak stok Toko, Gudang, No Rak di kanan                                                                                                                    | E   |
| D7  | Kalkulator: angka nol 0, 00, 000                                                                     | Papan nominal: `1 2 3 C`, `4 5 6 Hapus`, `7 8 9`, `0 00 000` (Enter dua baris di kolom kanan bila ada)                                                                                                         | U E |
| D8  | Tema tambah merah dan kuning                                                                         | Dua palet baru (total delapan) dengan kontras lolos di mode terang dan gelap; kuning memakai kuning tua agar teks tetap terbaca                                                                                | U   |

## 4. Keputusan dan asumsi baru

1. **Foto kategori tidak dipakai lagi** sebagai foto barang (A7). Berkasnya tetap di `public/kategori`; hanya foto sendiri barang proposal yang tampil, sisanya inisial. Mudah dikembalikan bila klien lebih suka foto kategori.
2. **Retur Gopay, OVO, dan bank** (C2). Dokumen hanya menyebut pembayaran. Pilihan kanal pada modal Retur dibiarkan seperti putaran kedua dan dicatat sebagai pertanyaan terbuka.
3. **Stok melebihi toko ditolak** (A4), bukan hanya diberi peringatan. Stok negatif dari POS tidak mungkin lagi.
4. **Frontliner** tetap memiliki "Cetak Struk Draf" sebagai pilihan keempat menu titik tiga karena ia tidak punya tombol Bayar.
5. **Mulai Pesanan Baru** selalu meminta konfirmasi, juga saat keranjang kosong.
6. **Diskon Transaksi** disimpan pada Open Bill dan pada `Sale.discount`. Saat Merge Bill, diskon bill tujuan dipertahankan; pada Split Bill, diskon tetap di bill asal.
7. **Nomor retur di Riwayat** `T-0101.1` diturunkan dari nomor penjualan dan urutan retur pada penjualan itu; nomor internal `R-...` tetap dipakai pada log.
8. **Pelanggan Umum** tampil `UMUM (ECERAN)` tanpa kode, karena Umum bukan data pelanggan dan kode `C0001` milik pelanggan nyata.

## 5. Hasil verifikasi

Dijalankan pada 11 November 2026, cabang `revisi-pos-3`:

| Pemeriksaan                                                                                            | Hasil                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `npm run lint` (ESLint dan Prettier)                                                                   | bersih                                                                                 |
| `npm run lint:teks`                                                                                    | 0 pelanggaran                                                                          |
| `npm run typecheck`                                                                                    | bersih                                                                                 |
| `npm test` (Vitest)                                                                                    | 89 berkas, 882 tes lulus                                                               |
| `npm run kontras`                                                                                      | 37 pasangan, 36 lolos, 1 dikecualikan, 0 gagal (delapan palet, dua mode)               |
| `npm run budget`                                                                                       | POS JS 68,49 KB gzip (batas 70), CSS 16,18 KB (batas 25); aplikasi lain dalam anggaran |
| Playwright, tablet 1280x800: `pos`, `pos-lanjut`, `pos-revisi`, `pos-revisi2`                          | 202 lulus                                                                              |
| Playwright, tablet 1280x800: `pos-revisi3`, `responsif`, `flows`, `header`, `gaya`, `portal`           | 106 lulus                                                                              |
| Playwright, PC 1366x768: seluruh spesifikasi POS dan `flows`                                           | 241 lulus, 3 dilewati                                                                  |
| Playwright, audit axe, target sentuh, urutan Tab (POS, Sales, Owner, Portal) pada 1366x768 dan 360x800 | 99 lulus                                                                               |
| Playwright, audit, target sentuh, urutan Tab, jaringan pada tablet 1280x800                            | 86 lulus, 16 gagal (lihat di bawah)                                                    |

Enam belas kegagalan terakhir seluruhnya berada di Back-Office (BO-02 sampai BO-07 dan BO-09: gaya inline yang melanggar CSP pada `accounting.ts` dan `index.ts`, urutan Tab BO-09) dan Owner (OWN-04: kontras `.mob-avatar` 4,24 : 1). Kegagalan yang sama muncul persis pada commit `c8b884a` (sebelum revisi ini) di worktree terpisah, dan berkas yang terkait tidak diubah oleh revisi ini, jadi bukan akibat perubahan POS. Dicatat sebagai R3-20 di `docs/asumsi.md`.

Pemeriksaan manual dengan tangkapan layar: 1366x640 (layar jual, bayar, modal barang), 360 px (layar jual, lembar pesanan, modal satuan, modal barang), 768 px (header dan bilah alat).

Catatan lingkungan: Chromium bawaan Playwright tidak terpasang pada mesin ini saat putaran akhir, jadi Playwright dijalankan memakai Google Chrome yang terpasang (konfigurasi sementara, sudah dihapus). Hasil putaran sebelumnya memakai Chromium bawaan dan sama.

## 6. Urutan pengerjaan

1. Logika domain beserta uji unit: diskon per satuan, batas stok, saran uang tunai, hari tempo, jenis biaya, papan 00, batas Split, Diskon Transaksi, catatan pembayaran, pesanan baru, entri Riwayat retur, palet merah dan kuning.
2. Pesanan Baru: header, panel pelanggan, kartu, daftar, menu titik tiga.
3. Modal barang tanpa scroll.
4. Halaman pembayaran.
5. Open Bill, Riwayat retur, Biaya, login, akhir shift.
6. Pembaruan uji lama, uji baru, dokumen, dan verifikasi penuh.
