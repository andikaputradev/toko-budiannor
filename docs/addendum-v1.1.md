# Addendum Spesifikasi Desain UI/UX v1.1

Sistem POS Toko Bahan Bangunan. Addendum ini melengkapi Spesifikasi v1.0 (18 Okt 2026) berdasarkan revisi poin C Proposal Kebutuhan Sistem (pesan H.M Noor, 30 Okt 2026). Format layar sama dengan spesifikasi: tujuan, zona tata letak, komponen dan data, aksi, state, aturan isian dan pesan persis, perilaku scanner, kriteria penerimaan (Given, When, Then).

Ketentuan umum addendum:

- Aplikasi mobile Owner dan Sales Lapangan dilabeli "Aplikasi mobile Flutter offline-first", menggantikan istilah PWA hanya lihat pada halaman 81 sampai 89 spesifikasi. Mockup berupa HTML dan TypeScript pada 360 x 800.
- Peran pada kolom Peran memakai huruf O (Owner), S (Supervisor), K (Kasir), L (Sales). Tanda "-" berarti tidak ada akses.
- Pesan bertanda MSG memakai teks persis Lampiran C. Pesan tanpa nomor adalah teks baru (docs/teks-baru.md).
- Layar baru tidak punya wireframe. Ukuran memakai token aplikasi mobile: tinggi header 56 px, kolom isian 52 px, tombol 52 px (aksi kartu 48 px), chip 44 px, tinggi sentuh minimum 44 px.

## OWN-06 Transaksi (baru)

**Tujuan.** Owner memasukkan Sales Order (SO) dan Purchase Order (PO) darurat, menyetujui atau menolak permintaan persetujuan dengan PIN Owner, dan membaca pusat notifikasi push dari HP.

| Atribut         | Isi                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Owner (Flutter offline-first)                                                            |
| Prioritas rilis | Rilis 3                                                                                                  |
| Perangkat       | HP Android atau iOS, portrait; 360 x 800                                                                 |
| Hak akses       | Owner                                                                                                    |
| Fitur RAB       | 15 Mobile Monitoring Owner; 5 Multi Opsi Bayar dan Limit Piutang; 13 RBAC Berjenjang dan Log Audit Trail |

### Zona tata letak

| No  | Zona        | Ukuran dan posisi                                                                                                                    |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Header      | tinggi 56 px; judul "Transaksi", chip status sinkron, lonceng notifikasi dengan lencana, tombol Muat Ulang                           |
| 2   | Tab         | empat tab "Persetujuan", "Sales Order", "Purchase Order", "Notifikasi"; tinggi 48 px, lencana jumlah pada Persetujuan dan Notifikasi |
| 3   | Isi tab     | lebar penuh dikurangi 16 px tiap sisi, kartu dengan jarak 12 px                                                                      |
| 4   | Bilah bawah | lima tujuan Ringkasan, Stok, Transaksi, Laporan, Piutang; tinggi 64 px                                                               |

### Komponen dan data

| Komponen            | Format dan perilaku                                                                                                                                                                                   | Sumber data                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Kartu persetujuan   | Jenis (Diskon, Piutang over-limit, Koreksi transaksi), rujukan (nomor bill, SO, atau transaksi), pemohon dan jam, rincian, nilai rupiah, tombol Setujui dan Tolak                                     | Antrean persetujuan                  |
| Riwayat persetujuan | Status "Disetujui" atau "Ditolak" beserta alasan                                                                                                                                                      | Antrean persetujuan                  |
| Formulir SO         | Pelanggan, pencari barang, baris barang (jumlah, satuan, subtotal), cara bayar (Tunai, QRIS, Transfer, DP, Piutang), uang muka bila DP, total; tersimpan sebagai Draf bernomor SO-0001 dan seterusnya | Master barang, harga tier, pelanggan |
| Formulir PO         | Pemasok, gudang penerima, pencari barang, baris barang (jumlah, satuan, harga beli awal dari HPP per satuan), total; tersimpan berstatus Dipesan bernomor PO-0001 dan seterusnya                      | Master barang, pemasok               |
| Pusat notifikasi    | Daftar notifikasi push (stok di bawah minimum, piutang terlambat lebih dari 7 hari, omzet harian di bawah target Rp 10.000.000), status dibaca, tombol simulasi                                       | Stok, kartu piutang, omzet           |

### Aksi

| Label persis                                     | Hasil                                                                                     | Pintasan papan ketik (PC) | Peran O S K L |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------- | ------------- |
| Setujui                                          | Membuka isian alasan dan PIN Owner; bila benar permintaan disetujui dan tercatat di BO-21 | Ketuk                     | O---          |
| Tolak                                            | Sama dengan Setujui, hasil Ditolak                                                        | Ketuk                     | O---          |
| Simpan Sales Order                               | Menyimpan SO Draf; piutang melebihi limit atau menunggak meminta PIN Owner                | Ketuk                     | O---          |
| Simpan Purchase Order                            | Menyimpan PO berstatus Dipesan                                                            | Ketuk                     | O---          |
| Tandai semua dibaca                              | Menghapus tanda belum dibaca                                                              | Ketuk                     | O---          |
| Simulasikan: stok di bawah minimum               | Memicu notifikasi bila kondisi terpenuhi                                                  | Ketuk                     | O---          |
| Simulasikan: piutang terlambat lebih dari 7 hari | Memicu notifikasi bila kondisi terpenuhi                                                  | Ketuk                     | O---          |
| Simulasikan: omzet di bawah target               | Memicu notifikasi bila kondisi terpenuhi                                                  | Ketuk                     | O---          |

### State

| State             | Tampilan dan perilaku                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default           | Tab Persetujuan; kartu menunggu di atas, riwayat di bawah                                                                                                                                                                       |
| Memuat            | Tidak berlaku (data lokal)                                                                                                                                                                                                      |
| Kosong            | Persetujuan: "Tidak ada persetujuan yang menunggu."; Notifikasi: "Belum ada notifikasi."; riwayat SO dan PO: "Belum ada Sales Order." dan "Belum ada Purchase Order."                                                           |
| Error             | Pesan merah di bawah isian atau di dalam lembar PIN sesuai tabel validasi                                                                                                                                                       |
| Offline           | Banner "Tidak ada koneksi internet. Data terakhir diperbarui pukul 00:00." Aksi tetap berjalan lokal, chip menampilkan "Offline, N menunggu", dan lembar PIN menampilkan keterangan mode offline; terkirim otomatis saat online |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Owner." (MSG-118)                                                                                                                                                                               |
| Data banyak       | Tidak berlaku                                                                                                                                                                                                                   |

### Aturan validasi dan pesan error persis

| Kondisi                             | Pesan yang tampil                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Alasan kurang dari 5 karakter       | Alasan wajib diisi minimal 5 karakter. (MSG-048)                                                 |
| PIN salah                           | PIN Owner salah. Sisa percobaan: 2. (MSG-049)                                                    |
| PIN milik peran lain                | PIN ini bukan milik Owner. (MSG-050)                                                             |
| Tiga PIN salah                      | Otorisasi dikunci 5 menit. (MSG-051)                                                             |
| SO tanpa barang                     | Bill masih kosong. Tambahkan barang terlebih dahulu. (MSG-025)                                   |
| Jumlah nol atau bukan angka         | Jumlah harus lebih dari 0. (MSG-029)                                                             |
| Desimal lebih dari 3 angka          | Maksimal 3 angka di belakang koma. (MSG-031)                                                     |
| Barang bilangan bulat diisi pecahan | Barang ini hanya dijual dalam jumlah bulat. (MSG-032)                                            |
| Piutang tanpa pelanggan terdaftar   | Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan. (MSG-034)               |
| Piutang melebihi limit              | Transaksi piutang ditolak: jumlah piutang Rp 1.200.000 melebihi sisa limit Rp 500.000. (MSG-035) |
| Pelanggan menunggak                 | Transaksi piutang ditolak: pelanggan memiliki tagihan melewati jatuh tempo. (MSG-036)            |
| PO tanpa pemasok                    | Pilih pemasok terlebih dahulu. (MSG-078)                                                         |
| PO tanpa gudang                     | Pilih gudang penerima. (MSG-081)                                                                 |
| Harga beli kosong atau nol          | Harga beli wajib diisi dan lebih dari 0. (MSG-080)                                               |
| PO tanpa barang                     | Tambahkan minimal satu barang. (MSG-073)                                                         |

### Perilaku scanner barcode

Pencari barang menerima kode, nama, atau barcode yang diketik atau ditempel; Enter menambahkan barang pertama yang cocok. Kamera tidak dipakai pada mockup.

### Kriteria penerimaan (Given, When, Then)

| No  | Given                                                          | When                                                                  | Then                                                                                           |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| K-1 | Tiga permintaan menunggu (diskon, piutang over-limit, koreksi) | Owner membuka OWN-06                                                  | Tiga kartu tampil dan tab Persetujuan berlencana 3                                             |
| K-2 | Kartu diskon B-0002                                            | Owner menekan Setujui, mengisi alasan "Pelanggan lama" dan PIN 482916 | Permintaan pindah ke riwayat berstatus Disetujui dan tercatat di BO-21 sebagai Otorisasi       |
| K-3 | PIN diisi 1234                                                 | Owner menekan Setujui                                                 | Pesan "PIN Owner salah. Sisa percobaan: 2." tampil dan lembar tetap terbuka                    |
| K-4 | SO piutang melebihi limit pelanggan C-003                      | Owner menekan Simpan Sales Order                                      | Lembar PIN tampil dengan pesan MSG-035; setelah PIN Owner benar SO-000N tersimpan sebagai Draf |
| K-5 | PO tanpa pemasok                                               | Owner menekan Simpan Purchase Order                                   | Pesan "Pilih pemasok terlebih dahulu." tampil                                                  |
| K-6 | HP offline                                                     | Owner menyetujui satu permintaan                                      | Chip menampilkan "Offline, 1 menunggu"; setelah online berubah menjadi "Tersinkron"            |
| K-7 | Ada barang di bawah minimum                                    | Owner menekan "Simulasikan: stok di bawah minimum"                    | Banner push tampil dan notifikasi bertambah di daftar                                          |

## OWN-03 Cek Stok (perubahan v1.1)

**Perubahan.** Kartu barang menambah dua aksi sesuai revisi C.1 butir 2. Zona, data, state, dan pesan v1.0 (halaman 85 dan 86) tetap berlaku.

### Zona tata letak (tambahan)

| No  | Zona             | Ukuran dan posisi                                                                                           |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| 3a  | Baris aksi kartu | dua tombol "Buat Mutasi" dan "Buat PO" sebaris, tinggi 48 px; tinggi kartu bertambah dari 148 px sesuai isi |

### Komponen dan data (tambahan)

| Komponen           | Format dan perilaku                                                                                                          | Sumber data     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Lembar Buat Mutasi | Gudang asal, gudang tujuan, satuan, jumlah, informasi stok asal; nomor mutasi dari penomoran bersama (M-0002 dan seterusnya) | Stok per gudang |
| Buat PO            | Membuka tab Purchase Order OWN-06 dengan barang terisi                                                                       | Master barang   |

### Aksi (tambahan)

| Label persis | Hasil                                                                       | Pintasan papan ketik (PC) | Peran O S K L |
| ------------ | --------------------------------------------------------------------------- | ------------------------- | ------------- |
| Buat Mutasi  | Membuka lembar mutasi; Simpan Mutasi memindahkan stok dan tercatat di BO-21 | Ketuk                     | O---          |
| Buat PO      | Membuka OWN-06 tab Purchase Order dengan barang terpilih                    | Ketuk                     | O---          |

### Aturan validasi dan pesan error persis (tambahan)

| Kondisi                        | Pesan yang tampil                                      |
| ------------------------------ | ------------------------------------------------------ |
| Gudang asal sama dengan tujuan | Gudang asal dan tujuan tidak boleh sama. (MSG-071)     |
| Jumlah melebihi stok asal      | Jumlah melebihi stok gudang asal (40,0 Sak). (MSG-072) |
| Jumlah nol                     | Jumlah harus lebih dari 0. (MSG-029)                   |

### Kriteria penerimaan (Given, When, Then)

| No  | Given                          | When                                                            | Then                                                                  |
| --- | ------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| K-4 | Barang dengan stok Besar cukup | Owner menekan Buat Mutasi, mengisi jumlah 1, lalu Simpan Mutasi | Pesan "Mutasi M-0002 tersimpan." tampil dan stok kedua gudang berubah |
| K-5 | Jumlah 99999999                | Owner menekan Simpan Mutasi                                     | Pesan melebihi stok tampil dan stok tidak berubah                     |
| K-6 | Kartu barang B0002             | Owner menekan Buat PO                                           | OWN-06 tab Purchase Order terbuka dengan satu baris barang B0002      |

## OWN-05 Piutang Jatuh Tempo (perubahan v1.1)

**Perubahan.** Kartu pelanggan menambah tiga aksi sesuai revisi C.1 butir 4. Rincian invoice tetap hanya lihat. Zona, state, dan pesan v1.0 (halaman 89 dan 90) tetap berlaku.

### Zona tata letak (tambahan)

| No  | Zona             | Ukuran dan posisi                                                                                 |
| --- | ---------------- | ------------------------------------------------------------------------------------------------- |
| 2a  | Baris aksi kartu | tiga tombol sebaris (ikon dan teks), tinggi minimum 72 px; kartu bertambah dari 136 px sesuai isi |

### Komponen dan data (tambahan)

| Komponen                   | Format dan perilaku                                                                        | Sumber data      |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| Lembar Catat Bayar Piutang | Saldo piutang, jumlah bayar, cara bayar (Tunai, Transfer, QRIS); alokasi ke invoice tertua | Kartu piutang    |
| Pratinjau tagihan          | Teks "TAGIHAN PIUTANG" berisi invoice jatuh tempo dan total; simulasi PDF                  | Kartu piutang    |
| Lembar Hubungi             | Tautan telepon dan WhatsApp ke nomor pelanggan                                             | Master pelanggan |

### Aksi (tambahan)

| Label persis           | Hasil                                                                          | Pintasan papan ketik (PC) | Peran O S K L |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------- | ------------- |
| Catat Bayar Piutang    | Membuka lembar bayar; Simpan Pembayaran mengurangi saldo dan tercatat di BO-21 | Ketuk                     | O---          |
| Kirim Tagihan WA (PDF) | Membuka pratinjau; Kirim via WA disimulasikan dan tercatat di BO-21            | Ketuk                     | O---          |
| Hubungi Pelanggan      | Membuka pilihan Telepon dan WhatsApp                                           | Ketuk                     | O---          |

### Aturan validasi dan pesan error persis (tambahan)

| Kondisi                     | Pesan yang tampil                                       |
| --------------------------- | ------------------------------------------------------- |
| Jumlah bayar nol            | Jumlah harus lebih dari 0. (MSG-029)                    |
| Jumlah bayar melebihi saldo | Pembayaran melebihi saldo piutang Rp 837.000. (MSG-087) |

### Kriteria penerimaan (Given, When, Then)

| No  | Given                               | When                                                   | Then                                                                                         |
| --- | ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| K-4 | Pelanggan dengan saldo Rp 1.337.000 | Owner mencatat bayar Rp 1.000                          | Pesan "Pembayaran Rp 1.000 tercatat." tampil dan total piutang jatuh tempo berkurang         |
| K-5 | Jumlah bayar melebihi saldo         | Owner menekan Simpan Pembayaran                        | Pesan melebihi saldo tampil di lembar                                                        |
| K-6 | Kartu pelanggan                     | Owner menekan Kirim Tagihan WA (PDF) lalu Kirim via WA | Pesan "Tagihan PDF terkirim ke 08xxxxxxxxxx via WA (simulasi)." tampil dan tercatat di BO-21 |
| K-7 | Kartu pelanggan                     | Owner menekan Hubungi Pelanggan                        | Tautan tel dan wa.me berformat internasional tampil                                          |

## SALES-01 Masuk dan Mode Offline

**Tujuan.** Sales Lapangan masuk dengan nama pengguna dan kata sandi, tetap dapat bekerja tanpa sinyal, dan melihat antrean data yang belum terkirim.

| Atribut         | Isi                                                                                   |
| --------------- | ------------------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Sales Lapangan (Flutter offline-first)                                |
| Prioritas rilis | Rilis 3 atau 3B (diusulkan pada revisi C)                                             |
| Perangkat       | HP Android atau iOS, portrait; 360 x 800, mode terang                                 |
| Hak akses       | Sales                                                                                 |
| Fitur RAB       | 15 Mobile Monitoring Owner dan Sales Lapangan; 13 RBAC Berjenjang dan Log Audit Trail |

### Zona tata letak

| No  | Zona                                                     | Ukuran dan posisi                                                                                                                               |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Logo toko                                                | kotak 100 x 60 px, tengah, 90 px dari atas                                                                                                      |
| 2   | Judul "Sales Lapangan"                                   | teks 24 px tebal; di bawahnya label "Aplikasi mobile Flutter offline-first"                                                                     |
| 3   | Kolom nama pengguna                                      | lebar penuh dikurangi 24 px tiap sisi, tinggi 52 px                                                                                             |
| 4   | Kolom kata sandi                                         | tinggi 52 px, tombol "Tampilkan" di sampingnya                                                                                                  |
| 5   | Tombol Masuk                                             | tinggi 56 px, lebar penuh                                                                                                                       |
| 6   | Indikator sinkron (setelah masuk, di header semua layar) | chip tinggi 44 px: "Tersinkron", "Mengirim N", "Offline, data lokal", atau "Offline, N menunggu"; menekannya membuka lembar Status sinkronisasi |

### Komponen dan data

| Komponen                   | Format dan perilaku                                                                                        | Sumber data   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| Nama pengguna              | Sama dengan akun Back-Office                                                                               | Akun          |
| Kata sandi                 | Tersembunyi; Tampilkan membukanya 3 detik                                                                  | Akun          |
| Sesi                       | Tetap masuk 30 hari di HP yang sama sampai Sales memilih Keluar [Usulan, A-16]                             | Perangkat     |
| Perangkat dikenal          | Akun yang pernah masuk di HP ini boleh masuk saat offline                                                  | Perangkat     |
| Lembar Status sinkronisasi | Waktu sinkron terakhir, daftar antrean beserta status, pilihan Printer Bluetooth (simulasi), tombol Keluar | Antrean lokal |

### Aksi

| Label persis | Hasil                                                               | Pintasan papan ketik (PC) | Peran O S K L |
| ------------ | ------------------------------------------------------------------- | ------------------------- | ------------- |
| Tampilkan    | Memperlihatkan kata sandi sementara                                 | Ketuk                     | ---L          |
| Masuk        | Memeriksa akun peran Sales lalu membuka SALES-02; tercatat di BO-21 | Enter                     | ---L          |
| Keluar       | Mengakhiri sesi dan kembali ke SALES-01                             | Ketuk                     | ---L          |

### State

| State             | Tampilan dan perilaku                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Default           | Fokus di kolom nama pengguna                                                                                                     |
| Memuat            | Tidak berlaku (pemeriksaan sinkron)                                                                                              |
| Kosong            | Tidak berlaku                                                                                                                    |
| Error             | Pesan merah di bawah kata sandi sesuai tabel validasi                                                                            |
| Offline           | Banner "Mode offline: hanya akun yang pernah masuk di HP ini yang dapat masuk." Tombol Masuk tetap aktif untuk perangkat dikenal |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Sales."                                                                                          |
| Data banyak       | Tidak berlaku                                                                                                                    |

### Aturan validasi dan pesan error persis

| Kondisi                    | Pesan yang tampil                               |
| -------------------------- | ----------------------------------------------- |
| Nama pengguna kosong       | Nama pengguna wajib diisi. (MSG-052)            |
| Kata sandi kosong          | Kata sandi wajib diisi. (MSG-053)               |
| Kombinasi salah            | Nama pengguna atau kata sandi salah. (MSG-054)  |
| Akun nonaktif              | Akun Anda tidak aktif. Hubungi Owner. (MSG-020) |
| Akun bukan Sales           | Aplikasi ini hanya untuk peran Sales.           |
| Masuk pertama saat offline | Masuk pertama di HP ini memerlukan internet.    |

### Perilaku scanner barcode

Tidak berlaku.

### Kriteria penerimaan (Given, When, Then)

| No  | Given                                            | When                                  | Then                                                                                   |
| --- | ------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- |
| K-1 | Akun Sales aktif dan HP online                   | Sales memasukkan kredensial benar     | SALES-02 terbuka dan login tercatat di BO-21                                           |
| K-2 | Akun Owner                                       | Owner mencoba masuk di aplikasi Sales | Pesan "Aplikasi ini hanya untuk peran Sales." tampil                                   |
| K-3 | HP offline dan akun belum pernah masuk di HP itu | Sales menekan Masuk                   | Pesan "Masuk pertama di HP ini memerlukan internet." tampil                            |
| K-4 | HP offline dan akun pernah masuk di HP itu       | Sales menekan Masuk                   | SALES-02 terbuka dan chip menampilkan "Offline, data lokal"                            |
| K-5 | Order disimpan saat offline                      | Sales melihat header                  | Chip menampilkan "Offline, 1 menunggu" dan setelah online berubah menjadi "Tersinkron" |

## SALES-02 Katalog dan Cek Stok

**Tujuan.** Sales memeriksa stok per gudang, harga per tier pelanggan, dan satuan desimal, lalu menambahkan barang ke order.

| Atribut         | Isi                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Sales Lapangan                                                                                  |
| Prioritas rilis | Rilis 3 atau 3B                                                                                                 |
| Perangkat       | HP, portrait; 360 x 800, mode terang                                                                            |
| Hak akses       | Sales                                                                                                           |
| Fitur RAB       | 15 Mobile Monitoring Owner dan Sales Lapangan; 7 Manajemen Multi-Gudang 2 Lokasi; 4 Satuan dan Harga Bertingkat |

### Zona tata letak

| No  | Zona                   | Ukuran dan posisi                                                                                                                                     |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pilihan pelanggan      | tinggi 52 px; mengatur tier harga                                                                                                                     |
| 2   | Tier harga             | bila pelanggan umum: chip "Eceran", "Grosir", "Kontraktor" tinggi 44 px; bila pelanggan dipilih: teks tier mengikuti pelanggan                        |
| 3   | Kolom cari             | tinggi 52 px                                                                                                                                          |
| 4   | Chip gudang dan filter | "Semua", "Display", "Besar", "Di bawah minimum"; tinggi 44 px                                                                                         |
| 5   | Daftar kartu           | nama, kode dan satuan dasar, pemilih satuan, harga per satuan, stok per gudang dan total dalam satuan terpilih, lencana, tombol Tambah ke Order 48 px |
| 6   | Tombol Lihat Order     | di dasar daftar                                                                                                                                       |

### Komponen dan data

| Komponen | Format dan perilaku                                                              | Sumber data      |
| -------- | -------------------------------------------------------------------------------- | ---------------- |
| Harga    | "Rp 55.000 / Sak" menurut tier dan satuan                                        | Harga bertingkat |
| Stok     | "Display: 12,0 Sak", "Besar: 40,0 Sak", "Total 52,0 Sak"; desimal sampai 3 digit | Stok per gudang  |
| Lencana  | "Di bawah minimum" atau "Ditinjau (negatif)" dengan ikon dan teks                | Stok minimum     |

### Aksi

| Label persis    | Hasil                                             | Pintasan papan ketik (PC) | Peran O S K L |
| --------------- | ------------------------------------------------- | ------------------------- | ------------- |
| Cari            | Menyaring daftar (tunda 300 ms)                   | Ketuk kolom               | ---L          |
| Chip gudang     | Menyaring gudang atau minimum                     | Ketuk                     | ---L          |
| Tier harga      | Mengganti tier saat pelanggan umum                | Ketuk                     | ---L          |
| Tambah ke Order | Menambah barang dan satuan terpilih ke draf order | Ketuk                     | ---L          |

### State

| State             | Tampilan dan perilaku                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Default           | "Semua", urut kode barang, 30 kartu                                                                                              |
| Memuat            | Tidak berlaku (data lokal)                                                                                                       |
| Kosong            | "Barang tidak ditemukan."                                                                                                        |
| Error             | Tidak berlaku                                                                                                                    |
| Offline           | Banner "Mode offline: order tetap tersimpan di HP dan dikirim otomatis saat internet pulih. Antrean: N." Data lokal tetap tampil |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Sales."                                                                                          |
| Data banyak       | 3.600 barang: 30 kartu lalu 30 berikutnya lewat gulir atau tombol "Muat N lagi"                                                  |

### Aturan validasi dan pesan error persis

| Kondisi                 | Pesan yang tampil                                 |
| ----------------------- | ------------------------------------------------- |
| Pencarian satu karakter | Ketik minimal 2 karakter untuk mencari. (MSG-120) |

### Perilaku scanner barcode

Tidak berlaku (pencarian mendukung barcode yang diketik).

### Kriteria penerimaan (Given, When, Then)

| No  | Given                           | When                          | Then                                                                           |
| --- | ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| K-1 | Pelanggan umum                  | Sales memilih chip Grosir     | Harga pada kartu berubah menurut tier Grosir                                   |
| K-2 | Barang dengan satuan Sak dan Kg | Sales mengganti satuan kartu  | Harga dan stok berganti ke satuan itu dengan desimal                           |
| K-3 | Chip "Display" dipilih          | Daftar tampil                 | Kartu hanya memuat baris stok Display                                          |
| K-4 | Pelanggan C-003 dipilih         | Sales melihat tier            | Teks "Tier harga mengikuti pelanggan: ..." tampil                              |
| K-5 | Draf order kosong               | Sales menekan Tambah ke Order | Pesan "{nama} ditambahkan ke order." tampil dan tab Order berlabel "Order (1)" |

## SALES-03 Input Sales Order

**Tujuan.** Sales memasukkan pesanan di depan pelanggan dengan cara bayar Tunai, QRIS, Transfer, DP, atau Piutang; SO otomatis masuk sebagai Draf di BO-09.

| Atribut         | Isi                                                                                 |
| --------------- | ----------------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Sales Lapangan                                                      |
| Prioritas rilis | Rilis 3 atau 3B                                                                     |
| Perangkat       | HP, portrait; 360 x 800, mode terang                                                |
| Hak akses       | Sales                                                                               |
| Fitur RAB       | 15 Mobile Monitoring Owner dan Sales Lapangan; 5 Multi Opsi Bayar dan Limit Piutang |

### Zona tata letak

| No  | Zona                      | Ukuran dan posisi                                                    |
| --- | ------------------------- | -------------------------------------------------------------------- |
| 1   | Pelanggan                 | tinggi 52 px; teks tier harga di bawahnya                            |
| 2   | Pencari barang            | tinggi 52 px                                                         |
| 3   | Baris barang              | kartu per barang: nama, jumlah, satuan, subtotal, tombol Hapus 48 px |
| 4   | Cara bayar                | pilihan 52 px; kolom Uang muka (DP) hanya bila DP                    |
| 5   | Total                     | angka 24 px tebal                                                    |
| 6   | Tombol Simpan Sales Order | tinggi 52 px, lebar penuh                                            |

### Komponen dan data

| Komponen     | Format dan perilaku                                                                  | Sumber data       |
| ------------ | ------------------------------------------------------------------------------------ | ----------------- |
| Draf order   | Disimpan pada sesi sehingga tetap ada saat berpindah layar                           | Sesi              |
| Harga        | Menurut tier pelanggan dan satuan                                                    | Harga bertingkat  |
| Nomor SO     | "SO-0001" dan seterusnya, penomoran bersama                                          | Penomoran dokumen |
| Hasil simpan | SO berstatus Draf, sumber Sales, tampil di BO-09; setelah tersimpan membuka SALES-05 | Buku SO           |

### Aksi

| Label persis       | Hasil                                                                        | Pintasan papan ketik (PC) | Peran O S K L |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------- | ------------- |
| Simpan Sales Order | Memvalidasi lalu menyimpan SO Draf; bila piutang bermasalah membuka SALES-04 | Ketuk                     | ---L          |

### State

| State             | Tampilan dan perilaku                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Default           | Pelanggan umum, cara bayar Tunai, baris kosong                             |
| Memuat            | Tidak berlaku                                                              |
| Kosong            | Tidak ada baris barang; total Rp 0                                         |
| Error             | Pesan merah di atas tombol; kolom jumlah bermasalah diberi tanda dan fokus |
| Offline           | Banner offline; SO tersimpan lokal dan masuk antrean                       |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Sales."                                    |
| Data banyak       | Tidak berlaku                                                              |

### Aturan validasi dan pesan error persis

| Kondisi                                   | Pesan yang tampil                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Tanpa barang                              | Bill masih kosong. Tambahkan barang terlebih dahulu. (MSG-025)                     |
| Jumlah nol atau bukan angka               | Jumlah harus lebih dari 0. (MSG-029)                                               |
| Desimal lebih dari 3 angka                | Maksimal 3 angka di belakang koma. (MSG-031)                                       |
| Barang bilangan bulat diisi pecahan       | Barang ini hanya dijual dalam jumlah bulat. (MSG-032)                              |
| DP atau Piutang tanpa pelanggan terdaftar | Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan. (MSG-034) |
| DP kosong atau nol                        | Jumlah harus lebih dari 0. (MSG-029)                                               |

### Perilaku scanner barcode

Tidak berlaku (pencari menerima kode atau barcode yang diketik; Enter menambah barang).

### Kriteria penerimaan (Given, When, Then)

| No  | Given                                         | When                             | Then                                                                |
| --- | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| K-1 | Draf kosong                                   | Sales menekan Simpan Sales Order | Pesan "Bill masih kosong. Tambahkan barang terlebih dahulu." tampil |
| K-2 | Satu baris barang jumlah 2, cara bayar QRIS   | Sales menekan Simpan Sales Order | SO-0001 tersimpan sebagai Draf dan SALES-05 terbuka                 |
| K-3 | Cara bayar Piutang tanpa pelanggan            | Sales menekan Simpan Sales Order | Pesan MSG-034 tampil                                                |
| K-4 | Cara bayar DP, pelanggan terdaftar, DP kosong | Sales menekan Simpan Sales Order | Pesan "Jumlah harus lebih dari 0." tampil                           |
| K-5 | SO tersimpan                                  | Back-Office membuka BO-09        | SO tampil berstatus Draf dari sumber Sales                          |

## SALES-04 Validasi Piutang

**Tujuan.** Sebelum SO piutang atau DP disimpan, sistem memeriksa limit dan tunggakan pelanggan dan, bila bermasalah, mengarahkan Sales meminta persetujuan Owner.

| Atribut         | Isi                                                                          |
| --------------- | ---------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Sales Lapangan                                               |
| Prioritas rilis | Rilis 3 atau 3B                                                              |
| Perangkat       | HP, portrait; lembar di atas SALES-03                                        |
| Hak akses       | Sales                                                                        |
| Fitur RAB       | 5 Multi Opsi Bayar dan Limit Piutang; 13 RBAC Berjenjang dan Log Audit Trail |

### Zona tata letak

| No  | Zona                                                                                              | Ukuran dan posisi       |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | Judul lembar "Validasi piutang"                                                                   | tinggi 56 px            |
| 2   | Teks peringatan                                                                                   | lebar penuh, teks 16 px |
| 3   | Keterangan "Order tetap tersimpan sebagai Draf dan menunggu persetujuan Owner di aplikasi Owner." | teks 13 px              |
| 4   | Tombol Ubah Order dan Minta Persetujuan Owner                                                     | tinggi 52 px            |

### Komponen dan data

| Komponen               | Format dan perilaku                                                                                 | Sumber data         |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------- |
| Peringatan tunggakan   | "Pelanggan ini ada piutang terlambat Rp 1.000.000, sudah 12 hari. Lanjutkan? Butuh Approval Owner." | Kartu piutang       |
| Peringatan limit       | Pesan MSG-035 diikuti "Butuh Approval Owner."                                                       | Limit pelanggan     |
| Permintaan persetujuan | Dibuat jenis Piutang over-limit, rujukan nomor SO, nilai piutang, pemohon Sales; tampil di OWN-06   | Antrean persetujuan |
| Status SO              | "Draf, menunggu persetujuan Owner", "Draf, disetujui Owner", atau "Draf, ditolak Owner"             | Antrean persetujuan |

### Aksi

| Label persis            | Hasil                                                                                | Pintasan papan ketik (PC) | Peran O S K L |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------- | ------------- |
| Minta Persetujuan Owner | Menyimpan SO Draf, membuat permintaan di OWN-06, mencatat di BO-21, membuka SALES-05 | Ketuk                     | ---L          |
| Ubah Order              | Menutup lembar tanpa menyimpan                                                       | Ketuk                     | ---L          |

### State

| State             | Tampilan dan perilaku                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| Default           | Lembar tampil bila pemeriksaan menemukan tunggakan atau melebihi limit         |
| Memuat            | Tidak berlaku                                                                  |
| Kosong            | Tidak berlaku                                                                  |
| Error             | Pesan merah di dalam lembar bila penyimpanan gagal                             |
| Offline           | Permintaan tetap dibuat lokal dan masuk antrean; terkirim otomatis saat online |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Sales."                                        |
| Data banyak       | Tidak berlaku                                                                  |

### Aturan validasi dan pesan error persis

| Kondisi                           | Pesan yang tampil                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pelanggan menunggak               | Pelanggan ini ada piutang terlambat Rp 1.000.000, sudah 12 hari. Lanjutkan? Butuh Approval Owner.                      |
| Piutang melebihi limit            | Transaksi piutang ditolak: jumlah piutang Rp 1.200.000 melebihi sisa limit Rp 500.000. Butuh Approval Owner.           |
| Piutang tanpa pelanggan terdaftar | Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan. (MSG-034; tidak dapat dimintakan persetujuan) |

### Perilaku scanner barcode

Tidak berlaku.

### Kriteria penerimaan (Given, When, Then)

| No  | Given                                            | When                                  | Then                                                                                           |
| --- | ------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| K-1 | Pelanggan C-003 dengan SO piutang melebihi limit | Sales menekan Simpan Sales Order      | Lembar Validasi piutang tampil dengan teks limit dan "Butuh Approval Owner."                   |
| K-2 | Lembar terbuka                                   | Sales menekan Minta Persetujuan Owner | SO tersimpan Draf berstatus "Draf, menunggu persetujuan Owner" dan permintaan tampil di OWN-06 |
| K-3 | Permintaan menunggu                              | Sales menekan Kirim Salinan SO        | Pesan "Salinan SO dapat dikirim setelah Owner menyetujui." tampil                              |
| K-4 | Owner menyetujui dengan PIN                      | Sales membuka SO                      | Status "Draf, disetujui Owner" dan pengiriman salinan terbuka                                  |
| K-5 | Owner menolak                                    | Sales menekan Kirim Salinan SO        | Pesan "Salinan SO tidak dapat dikirim karena Owner menolak persetujuan." tampil                |
| K-6 | Pelanggan menunggak 12 hari                      | Sales menekan Simpan Sales Order      | Teks menyebut jumlah tunggakan dan "sudah 12 hari"                                             |

## SALES-05 Salinan SO dan Kirim via WhatsApp

**Tujuan.** Sales melihat pratinjau salinan SO (PDF) dan mengirimkannya ke pelanggan lewat WhatsApp (simulasi); pengiriman tercatat di BO-21. Printer Bluetooth tersedia sebagai opsi simulasi.

| Atribut         | Isi                                                                                   |
| --------------- | ------------------------------------------------------------------------------------- |
| Aplikasi        | Aplikasi mobile Sales Lapangan                                                        |
| Prioritas rilis | Rilis 3 atau 3B                                                                       |
| Perangkat       | HP, portrait; 360 x 800, mode terang                                                  |
| Hak akses       | Sales                                                                                 |
| Fitur RAB       | 15 Mobile Monitoring Owner dan Sales Lapangan; 13 RBAC Berjenjang dan Log Audit Trail |

### Zona tata letak

| No  | Zona                                  | Ukuran dan posisi                                                         |
| --- | ------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Daftar SO                             | kartu: nomor, pelanggan, total, status, lencana "Salinan terkirim via WA" |
| 2   | Tombol Kembali                        | tinggi 52 px, di atas rincian                                             |
| 3   | Judul rincian                         | nomor SO dan status                                                       |
| 4   | Pratinjau salinan                     | kotak teks monospasi, tinggi maksimum 40 persen layar, dapat digulir      |
| 5   | Tombol Kirim Salinan SO (PDF) via WA  | tinggi 52 px, lebar penuh                                                 |
| 6   | Tombol Cetak via Bluetooth (simulasi) | tinggi 52 px, lebar penuh                                                 |

### Komponen dan data

| Komponen     | Format dan perilaku                                                                                                     | Sumber data          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Salinan SO   | Judul, toko, nomor, tanggal, nama Sales, pelanggan, baris barang, total, cara bayar, uang muka dan sisa tagihan, status | Buku SO              |
| Lembar Kirim | Isian nomor WhatsApp terisi dari pelanggan; keterangan simulasi (PDF tidak dibuat, WhatsApp tidak terkirim)             | Master pelanggan     |
| Printer      | Dipilih pada lembar Status sinkronisasi: "Tanpa printer", "Printer BT-58", "Printer BT-80"                              | Pengaturan perangkat |

### Aksi

| Label persis                  | Hasil                                                                                          | Pintasan papan ketik (PC) | Peran O S K L |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- | ------------- |
| Kirim Salinan SO (PDF) via WA | Membuka lembar kirim; Kirim via WA mencatat pengiriman di BO-21                                | Ketuk                     | ---L          |
| Cetak Bluetooth (simulasi)    | Mencetak ke printer terpilih (simulasi) dan mencatat di BO-21; tanpa printer menampilkan pesan | Ketuk                     | ---L          |

### State

| State             | Tampilan dan perilaku                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Default           | Daftar SO terbaru lebih dulu                                                             |
| Memuat            | Tidak berlaku                                                                            |
| Kosong            | "Belum ada Sales Order. Buat dari Katalog atau Order."                                   |
| Error             | Pesan merah di dalam lembar kirim atau toast galat                                       |
| Offline           | Pengiriman masuk antrean: "Salinan SO akan dikirim ke 08xxxxxxxxxx saat internet pulih." |
| Hak akses ditolak | "Aplikasi ini hanya untuk peran Sales."                                                  |
| Data banyak       | Tidak berlaku                                                                            |

### Aturan validasi dan pesan error persis

| Kondisi                      | Pesan yang tampil                                                 |
| ---------------------------- | ----------------------------------------------------------------- |
| Nomor WhatsApp tidak valid   | Nomor telepon tidak valid. Gunakan 9 sampai 14 angka. (MSG-044)   |
| Persetujuan Owner menunggu   | Salinan SO dapat dikirim setelah Owner menyetujui.                |
| Persetujuan Owner ditolak    | Salinan SO tidak dapat dikirim karena Owner menolak persetujuan.  |
| Cetak tanpa printer terpilih | Pilih printer Bluetooth pada Status sinkronisasi terlebih dahulu. |

### Perilaku scanner barcode

Tidak berlaku.

### Kriteria penerimaan (Given, When, Then)

| No  | Given                                                | When                                     | Then                                                                                                                        |
| --- | ---------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| K-1 | SO-0001 tersimpan                                    | Sales membuka rincian                    | Pratinjau memuat "SALINAN SALES ORDER", "No. SO: SO-0001", dan nama Sales                                                   |
| K-2 | Nomor "12"                                           | Sales menekan Kirim via WA               | Pesan "Nomor telepon tidak valid. Gunakan 9 sampai 14 angka." tampil                                                        |
| K-3 | Nomor 081234567890 dan SO tanpa persetujuan tertunda | Sales menekan Kirim via WA               | Pesan "Salinan SO (PDF) terkirim ke 081234567890 via WA (simulasi)." tampil, lencana terkirim muncul, dan tercatat di BO-21 |
| K-4 | HP offline                                           | Sales mengirim salinan                   | Chip menampilkan "Offline, N menunggu" dan terkirim otomatis saat online                                                    |
| K-5 | Printer belum dipilih                                | Sales menekan Cetak Bluetooth (simulasi) | Pesan pilih printer tampil                                                                                                  |
| K-6 | Printer BT-58 dipilih                                | Sales menekan Cetak Bluetooth (simulasi) | Pesan "Salinan SO dicetak ke Printer BT-58 (simulasi)." tampil dan tercatat di BO-21                                        |

## Daftar konflik dan keputusan

Konflik berikut tercatat pada docs/asumsi.md. Kolom Keputusan menyatakan sumber yang dipakai pada mockup.

| No  | Konflik                         | Sumber A                                                                              | Sumber B                                                   | Keputusan                                                                       | Rujukan    |
| --- | ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 1   | Sifat aplikasi Owner            | Spesifikasi v1.0 halaman 81 sampai 89: PWA hanya lihat                                | Revisi poin C: aplikasi Flutter dengan aksi dan OWN-06     | Revisi C dan prompt; label "Aplikasi mobile Flutter offline-first"              | K-03, O-01 |
| 2   | Layar Sales                     | Spesifikasi v1.0 tidak memuat layar Sales                                             | Revisi C.2: SALES-01 sampai SALES-05                       | Layar dibangun dan didokumentasikan pada addendum ini                           | J-01       |
| 3   | Tier harga                      | Revisi C.2: Umum, Reseller, grosir                                                    | Model data: Eceran, Grosir, Kontraktor                     | Model data; "Umum" dipetakan ke Eceran                                          | J-03       |
| 4   | Daftar barang OWN-03 dan OWN-05 | Spesifikasi: tinggi kartu 148 px dan 136 px, hanya lihat                              | Revisi C.1: tambahan aksi pada kartu                       | Kartu bertambah tinggi sesuai isi                                               | O-07, O-09 |
| 5   | Paginasi daftar barang          | Spesifikasi BO-03 dan BO-05: paginasi 50                                              | Prompt: tabel virtual 3.600 baris                          | Prompt                                                                          | F-03       |
| 6   | Teknologi produksi              | Revisi C.3: Flutter, SQLite atau Hive, REST API, FCM, WhatsApp API, printer Bluetooth | Prompt: mockup HTML dan TypeScript                         | Mockup; seluruhnya disimulasikan                                                | J-11       |
| 7   | Rilis                           | Spesifikasi halaman 13: OWN-01 sampai OWN-05 Rilis 3                                  | Revisi C: OWN-06 dan SALES di Rilis 3 atau 3B              | Tidak diputuskan pada mockup; diserahkan kepada pemberi kerja                   | J-11       |
| 8   | Persetujuan SO dari Sales       | Revisi C.2 butir 4: Fitur 5 Matriks halaman 99                                        | Halaman 99 tidak tersedia pada berkas yang dibaca          | Dipakai mekanisme permintaan pada OWN-06 dengan PIN dan log POS-10              | J-07       |
| 9   | Penerima PDF WhatsApp           | Revisi C.2 butir 5: PDF otomatis terkirim                                             | Prompt: pengiriman disimulasikan                           | Simulasi; PDF tidak dibuat                                                      | J-08       |
| 10  | Masuk saat offline              | Spesifikasi OWN-01: masuk memerlukan internet                                         | Revisi C.2 butir 1: Sales tetap dapat bekerja tanpa sinyal | Owner memerlukan internet; Sales boleh masuk offline hanya pada HP yang dikenal | J-04, O-03 |
| 11  | Kartu pelanggan OWN-05          | Spesifikasi: pelanggan melunasi di Back-Office                                        | Revisi C.1 butir 4: Catat Bayar Piutang dari HP            | Revisi C; pembayaran dari HP mengurangi saldo yang sama                         | O-09       |
| 12  | Ekspor laporan OWN-04           | Spesifikasi OWN-04 K-3: tidak ada tombol ekspor                                       | Prompt: ekspor berupa pratinjau simulasi di Back-Office    | OWN-04 tanpa tombol ekspor; teks arahan ke Back-Office                          | O-08       |
