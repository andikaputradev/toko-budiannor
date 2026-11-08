# Revisi POS Toko Budiannor: desain

Tanggal: 2026-11-07. Status: draf, menunggu review. Cakupan: modul POS (`#/pos`). Target klien: Selasa, 10 November 2026.

## 1. Konteks dan tujuan

Klien (H.M Noor) meminta revisi prototype lewat Zoom. Rangkuman dan tambahannya ada di percakapan WhatsApp 6 sampai 7 November 2026. Spec ini hanya memuat bagian POS. Back-Office, Owner, dan Sales tidak diubah, kecuali dampak dari tipe data bersama (bagian 9).

Tujuan: POS yang tampil dan berjalan seperti 16 gambar referensi, dengan data dari proposal.

Sumber, urut prioritas:

1. `../docs/PROPOSAL-KEBUTUHAN-SYSTEM.pdf` (folder `docs` induk proyek, di luar repositori ini). Sketsa POS ada di halaman 3 PDF, Form Data Barang di halaman 5, Form Penjualan di halaman 6, Daftar Saldo Piutang di halaman 7.
2. Catatan revisi WhatsApp.
3. Gambar referensi, hanya untuk gaya dan alur. Barang dagangan di gambar referensi (sambal, anggur, dan lain-lain) tidak dipakai.

Butir revisi dan letaknya di spec ini:

| Butir dari klien                                          | Bagian |
| --------------------------------------------------------- | ------ |
| Kategori menu berupa dropdown                             | 5      |
| Harga dan stok per satuan pada kartu barang               | 5      |
| Split Payment                                             | 6      |
| Bill dan Hold Bill pindah ke menu titik tiga              | 5      |
| Saldo awal sebelum mulai shift                            | 4      |
| Retur dari riwayat: barang, jumlah, nominal, cara kembali | 7      |
| Piutang dengan syarat bayar dan DP                        | 6      |
| Setelah bayar: cetak struk atau kirim WA                  | 6      |
| Pilihan warna dan tema                                    | 8      |
| Data sesuai proposal, tidak mengarang                     | 3      |

## 2. Di luar cakupan

- Back-Office, Owner, dan Sales. Tema untuk ketiganya: mekanismenya disiapkan, belum dipasang.
- Layar Karyawan, "Konsultasi Gratis", nomor versi, dan pengiriman struk lewat email (ada di referensi, tidak ada di proposal maupun catatan revisi).
- Faktur piutang baru tidak ditambahkan ke pelanggan setelah transaksi piutang, sama seperti perilaku sekarang.
- Pencetakan, WhatsApp, dan pembayaran tetap simulasi.
- Ilustrasi dan avatar bergaya referensi digambar sendiri (SVG sederhana). Gambar referensi tidak disalin.
- Hak akses retur tidak berubah: Owner dan Supervisor.

## 3. Data (Opsi B)

### 3.1 Aturan

Barang proposal ditambahkan di akhir dataset dan POS menampilkannya di depan; sisa katalog bangkitan tetap ada. Aturan masuknya data:

- Barang masuk hanya bila proposal memberi **harga dan stok**. Barang tanpa harga atau tanpa stok tidak dimasukkan.
- Pelanggan masuk bila proposal memberi data yang tidak saling bertentangan.
- Angka yang tidak ada di proposal tidak diisi, kecuali yang terdaftar di bagian 11.

Total barang menjadi 3.607 (3.600 bangkitan ditambah 7) dan total pelanggan 67 (60 ditambah 7). Uji dan teks yang menyebut angka lama disesuaikan pada rencana implementasi.

### 3.2 Barang (7)

Satuan dasar adalah satuan terkecil. Angka dalam kurung adalah isi dalam satuan dasar. Stok dalam satuan dasar. "PO" adalah stok yang sudah dipesan dan belum datang; kosong di proposal berarti tidak ada.

| Barang                    | Satuan dan harga Eceran                           | Toko | Gudang | PO  | Sumber |
| ------------------------- | ------------------------------------------------- | ---- | ------ | --- | ------ |
| Semen Gresik 40KG         | SAK 70.000                                        | 28   | 800    | -   | hal. 3 |
| Lem Fox 70 Gram           | KLG 10.000; LSN (12) 105.000; DOS (72) 600.000    | 78   | 144    | 72  | hal. 3 |
| Cat Spray Pylox 109 Black | KLG 30.000; DOS (12) 345.000                      | 7    | 48     | -   | hal. 3 |
| Knee PVC 3/4"             | PCS 2.000; DOS (100) 175.000                      | 220  | 0      | 300 | hal. 3 |
| Kabel NYM 2x1,5MM         | MTR 10.000; ROL (100) 900.000                     | 115  | 0      | -   | hal. 3 |
| Gembok Kodai 30MM         | PCS 20.000; LSN (12) 225.000; DOS (120) 2.150.000 | 0    | 0      | 240 | hal. 3 |
| Engsel Bellucci SN 5      | PSG 65.000; LSN (12) 720.000; DOS (120) 7.000.000 | 66   | 0      | 0   | hal. 5 |

Tambahan untuk Engsel Bellucci SN 5 (hal. 5): kode 1059, barcode 10005286, kategori Door & Window, merek Bellucci, harga Grosir PSG 55.000, LSN 630.000, DOS 6.000.000, HPP rata-rata 45.550, minimal stok toko 12, minimal stok semua 24, rak 123A, berat 0,7 KG. Proposal menulis satuan dasarnya "PSG" di daftar dan "PCS" di tabel harga; dipakai PSG.

Ketentuan:

- Harga Grosir hanya ada untuk Engsel. Untuk barang lain Grosir mengikuti Eceran.
- Kontraktor tidak ada di proposal. Kontraktor mengikuti Grosir.
- Semua barang aktif. HPP dan minimal stok hanya ada untuk Engsel; enam barang lain memakai HPP 0 dan minimal stok 0 (asumsi A-10).
- Tampilan stok pada kartu mengikuti proposal: dalam satuan dasar, bukan dikonversi ke satuan jual.

### 3.3 Pelanggan (7)

| Pelanggan          | Kode  | Data dari proposal                                                               |
| ------------------ | ----- | -------------------------------------------------------------------------------- |
| Kevin Wahyudi      | PL387 | Tier RETAIL, dipetakan ke Eceran (hal. 3). Tanpa piutang.                        |
| Bu Sherly Tjoandra | -     | Jl. Rajawali No 17, 0811230988, tempo 30 hari (hal. 6). Saldo piutang 8.500.000. |
| CV Laut Mas        | -     | Saldo piutang 29.000.000 (hal. 7).                                               |
| Pak Wahyudi        | -     | Saldo piutang 10.000.000 (hal. 7), empat faktur di bawah.                        |
| Toko ABC           | -     | Saldo piutang 770.000 (hal. 7).                                                  |
| Udin               | -     | Saldo piutang 1.200.000 (hal. 7).                                                |
| Zaki               | -     | Saldo piutang 2.800.000 (hal. 7).                                                |

Faktur Pak Wahyudi (hal. 7), tempo 30 hari semuanya:

| Faktur     | Tanggal    | Jatuh tempo | Nilai     | Dibayar | Sisa      |
| ---------- | ---------- | ----------- | --------- | ------- | --------- |
| FJ26091234 | 01/09/2026 | 01/10/2026  | 1.500.000 | 500.000 | 1.000.000 |
| FJ26104444 | 22/10/2026 | 22/11/2026  | 3.750.000 | 0       | 3.750.000 |
| FJ26105678 | 25/10/2026 | 25/11/2026  | 250.000   | 0       | 250.000   |
| FJ26108899 | 26/10/2026 | 02/11/2026  | 5.000.000 | 0       | 5.000.000 |

Faktur pertama sudah lewat jatuh tempo pada tanggal demo 19 Oktober 2026, sehingga piutang baru untuk Pak Wahyudi ditolak oleh aturan yang ada (MSG-036). Ini sekaligus contoh kontrol piutang dari proposal. Jumlah saldo ketujuh pelanggan harus sama dengan "Total Saldo Piutang Rp 52.270.000" pada proposal; ini dijadikan uji.

Tidak dimasukkan karena datanya bertentangan di dalam proposal: Toko Arif, Pak Samsul, Haji Sulam. Contoh: nomor FJ26104444 dipakai untuk Toko Arif (850.000) di halaman 5 dan untuk faktur 3.750.000 di halaman 7. Total piutang Bu Sherly juga berbeda (17.000.000 di halaman 6, 8.500.000 di halaman 7); dipakai tabel saldo halaman 7.

Untuk pelanggan selain Bu Sherly, saldo piutang dimodelkan sebagai satu faktur "saldo awal" dengan tanggal terbit 19 Oktober 2026 dan jatuh tempo 18 November 2026 (tempo 30 hari bawaan).

### 3.4 Penempatan dan foto

- File baru `src/shared/data/proposal.ts` memuat tabel di atas. Fungsi `withProposalData` menambahkannya di akhir `Dataset.products` dan `Dataset.customers` (supaya uji dan layar BO yang bergantung pada indeks 0 tidak bergeser) dan menandainya `pinned`; POS menampilkan yang `pinned` lebih dulu. Hanya store bawaan aplikasi yang memakainya; `generateDataset()` tetap murni bangkitan. Tipe `Product` dan `Dataset` tidak berubah bentuk, hanya bertambah bidang opsional (bagian 9).
- id barang `P-01` sampai `P-07`; kode barang memakai kode proposal bila ada (Engsel: 1059), selain itu `P001` dan seterusnya. Barcode kosong bila proposal tidak memberi barcode. id pelanggan `C-061` sampai `C-067`; kode pelanggan memakai kode proposal bila ada (Kevin: PL387), selain itu `C0061` dan seterusnya.
- Foto: tujuh foto dipotong dari gambar halaman 3 (enam barang) dan halaman 5 (Engsel), disimpan di `public/produk/`, masing-masing di bawah 40 KB. Resolusi asli sekitar 150 piksel; cukup untuk kartu. Barang bangkitan memakai kotak placeholder yang sudah ada.

## 4. Kerangka, login, dan shift

### 4.1 Kerangka

Bilah atas diganti. Kiri: tombol menu dan judul layar. Tengah: chip "Shift Dimulai" (hanya saat shift berjalan). Kanan: chip Online/Offline yang sudah ada (membuka POS-09) dan ikon Bill dengan lencana jumlah bill gantung (membuka Open Bill).

Menu samping (modal, jebakan fokus, Esc menutup, item minimal 48 px) berisi menurut hak akses peran:

1. Pesanan Baru (POS-02)
2. Open Bill (POS-05)
3. Riwayat Penjualan (POS-06)
4. Biaya (POS-07)
5. Pelanggan (membuka formulir POS-08, pendaftaran instan seperti proposal)
6. Status Sinkronisasi (POS-09)
7. Pilihan tema (bagian 8)
8. Selesai Shift
9. Keluar

### 4.2 Login

Pilih pengguna berupa kartu avatar (inisial pada lingkaran, nama, peran). PIN memakai 6 titik dan tombol angka bulat. Layar login memakai permukaan gelap pada semua tema, seperti referensi; warna aksen mengikuti tema. Logika PIN, penjaga percobaan, dan pesan tetap.

### 4.3 Shift

- Setelah login, bila belum ada shift: layar "Belum Mulai Shift" dengan ilustrasi, teks petunjuk, dan tombol Mulai Shift.
- Mulai Shift membuka modal **Masukkan Modal**: kolom nominal, papan angka (1 sampai 9, 000, 0), tombol C dan hapus, tombol Lanjut. Modal 0 diperbolehkan; kolom kosong ditolak dengan pesan baru.
- Satu shift per perangkat (satu laci kas). Shift mencatat pembuka, jam mulai, dan modal awal. Pengguna lain yang masuk saat shift berjalan melanjutkan shift itu; chip menampilkan nama pembuka.
- Frontliner tidak memegang kas, jadi tidak ada gerbang shift baginya.
- Saldo laci = modal awal + tunai bersih dari penjualan (jumlah tunai termasuk tunai untuk DP, dikurangi kembalian) dikurangi biaya kasir dan retur tunai. Saldo ini menggantikan konstanta `OPENING_CASH` (Rp 1.337.000) pada layar Biaya.
- Selesai Shift membuka ringkasan: modal awal, tunai penjualan, biaya, retur tunai, saldo akhir. Tombol Akhiri Shift menutup shift dan kembali ke "Belum Mulai Shift". Tidak ada pencocokan uang fisik.
- Layar Biaya dan retur tunai memerlukan shift berjalan; tanpa shift ditolak dengan pesan baru.
- Mode Tinjau memulai shift otomatis dengan modal Rp 500.000 agar semua layar langsung bisa dibuka.

## 5. Layar jual (POS-02)

Mengikuti sketsa proposal halaman 3 dan referensi:

- Baris alat: dropdown kategori ("Semua Kategori" dan kategori yang ada di data), kolom cari ("Masukkan kode / nama barang"), tombol pindai (memfokuskan kolom cari dan menampilkan petunjuk; pemindai tetap lewat Enter di kolom cari), dan tombol pelanggan dengan label `KODE - NAMA (TIER)`, misalnya `PL387 - KEVIN WAHYUDI (RETAIL)`. Tanpa pelanggan: "Pelanggan Umum".
- Dropdown kategori adalah tombol dengan daftar pilihan (role listbox), item minimal 48 px, mendukung panah dan Esc.
- Grid tiga kolom. Kartu barang: foto, nama, lalu blok dua kolom seperti proposal. Kolom Harga berisi satu baris per satuan (satuan dan harga). Mengetuk satu baris menambahkan satuan itu ke pesanan. Kolom Stok berisi Toko, Gudang, dan PO beserta satuan dasar; PO kosong ditulis "-". Ketuk panjang atau Shift+Enter pada kartu tetap membuka modal satuan POS-03.
- Panel kanan: judul "Pesanan (n)", daftar baris (nama, `QTY : 3 X 70.000`, subtotal; mengetuk baris membuka modal satuan), keadaan kosong dengan ilustrasi dan teks "Belum ada barang yang dipilih", Subtotal, tombol **Bayar Rp...** dan tombol titik tiga.
- Menu titik tiga: Tahan Bill, Panggil Bill, dan Cetak Struk Draf (hanya Frontliner). Frontliner tidak punya tombol Bayar.
- Pilih pelanggan memakai modal daftar: kolom cari, baris berisi inisial, kode, nama, tier, sisa limit, dan tombol "+ Tambah Pelanggan" (menuju POS-08). Opsi Pelanggan Umum tetap ada.
- Pintasan F2, F4, F6, F9 tetap. Tahan Bill dan Panggil Bill tetap menjalankan aturan yang ada (MSG-025, MSG-028).

## 6. Pembayaran dan sesudahnya (POS-04)

Rute `#/pos/bayar` tetap berupa layar penuh.

### 6.1 Syarat bayar

Pilihan di bagian atas: **Tunai** (lunas sekarang) atau **Piutang**.

**Tunai.**

- Cara bayar: Tunai, QRIS, EDC, Transfer. EDC ditambahkan karena ada di proposal ("Multi-Pembayaran: Tunai, QRIS, EDC, Transfer") tetapi belum ada di build.
- Mode normal: satu cara bayar. Tunai memakai jumlah diterima dengan tombol cepat yang sudah ada dan menampilkan kembalian. QRIS, EDC, dan Transfer langsung sebesar total.
- Saklar **Split Payment**: bila aktif, pengguna menambah beberapa baris (cara bayar dan nominal, maksimum sebesar sisa). Layar menampilkan daftar baris, sisa, dan kembalian. Tombol Bayar aktif saat sisa 0. Kembalian hanya muncul bila baris tunai melebihi sisa. Nomor referensi tetap ada untuk QRIS dan Transfer.

**Piutang.** Memerlukan pelanggan terdaftar (MSG-034).

- Tempo: pilihan 7, 30, 45 hari (angka dari proposal), atau isian hari sendiri (0 sampai 365). Bawaan dari tempo pelanggan, atau 30.
- DP: nominal (papan angka dan tombol cepat yang sama) dengan cara bayar DP (Tunai, QRIS, EDC, Transfer). DP boleh 0 dan tidak boleh melebihi total.
- Layar menampilkan Total, DP, **Sisa Tagihan**, dan **Jatuh Tempo** (tanggal demo ditambah tempo).
- Aturan limit tidak berubah: sisa tagihan yang melebihi sisa limit atau pelanggan dengan faktur terlambat ditolak, dan hanya persetujuan Owner (POS-10) atau persetujuan dari HP yang membukanya.

### 6.2 Model

- `PaymentMethod` bertambah `edc`.
- Baris DP menyimpan cara bayarnya (`via`) agar saldo laci dan riwayat benar.
- `Sale` bertambah `payments` (seluruh baris), `terms` (hari tempo dan tanggal jatuh tempo, hanya untuk piutang), dan `dp`. Bidang lama (`payment`, `paid`) tetap dan diisi seperti sekarang.

### 6.3 Setelah bayar

Tombol Bayar menyimpan transaksi (stok, antrean offline, aktivitas seperti sekarang), lalu membuka modal **Pembayaran Berhasil**: total, kembalian (bila ada), nama pelanggan, nomor transaksi, dan tiga tombol:

- **Cetak Struk**: membuka pratinjau struk yang sudah ada; keadaan printer terputus tetap memunculkan MSG-040 dan banner MSG-018.
- **Kirim WA**: isian nomor (terisi dari pelanggan bila ada, validasi nomor yang sudah ada) dan tombol Kirim. Pengiriman hanya disimulasikan dengan toast; tidak ada tautan keluar.
- **Selesai**: kembali ke POS-02 dengan bill baru.

## 7. Riwayat penjualan dan retur (POS-06)

### 7.1 Riwayat

Susunan dua panel. Kiri: kolom cari, filter (yang sudah ada), daftar dikelompokkan per hari; tiap baris berisi nomor, total, jam, cara bayar (tertulis "Split" bila lebih dari satu baris), dan nama kasir. Kanan: detail transaksi terpilih.

Detail berisi:

- Tombol **Retur** (hanya peran berhak), **Share Struk**, **Cetak Struk**.
- Informasi Penjualan: nomor, tanggal, pelanggan, dibuat oleh.
- Informasi Penerimaan: total penerimaan, total bayar, kembali, dan riwayat penerimaan per cara bayar. Untuk piutang: tempo, jatuh tempo, dan sisa tagihan.
- Barang dan Jasa: baris barang dengan jumlah, satuan, harga, dan "Diinput oleh".
- Total dan status (Lunas, Pending, Belum tersinkron) yang sudah ada.

Perilaku yang tetap: pencarian nomor persis lewat Enter (E-16), cetak ulang bertanda SALINAN, aturan offline (E-05), status (E-04).

**Share Struk**: modal dengan isian nomor WA dan tombol Kirim (simulasi). Email tidak dibuat.

### 7.2 Retur

Modal Retur menggantikan modal lama:

- **Pilih Semua** dan satu kotak centang per baris, dengan tombol kurang, isian, dan tambah untuk jumlah. Jumlah tidak boleh melebihi sisa yang belum diretur (MSG-085). Judul "Total Retur" dan "Dari n Kuantitas" mengikuti pilihan.
- **Jumlah Dikembalikan** (nominal): bawaan sama dengan nilai barang terpilih (jumlah kali harga transaksi asal). Boleh diturunkan, tidak boleh melebihi nilai barang, harus lebih dari 0 (MSG-029).
- **Metode Pengembalian**: Tunai, QRIS, EDC, Transfer. Bawaan mengikuti cara bayar utama transaksi bila termasuk empat itu, selain itu Tunai. Tunai memerlukan shift berjalan dan saldo laci cukup.
- **Alasan Retur**: Pengembalian Barang, Pembatalan Transaksi, Kesalahan Pembayaran, Lainnya. Lainnya wajib diberi keterangan (MSG-086).
- **Foto bukti** (opsional): hanya mencatat nama dan ukuran berkas, seperti foto barang di BO.
- Aturan lama tetap: hak akses Owner dan Supervisor, stok kembali ke gudang Display, nomor R-0001 dan seterusnya, retur tidak mengurangi piutang, tercatat di log aktivitas.
- Hasil: modal **Retur Berhasil** dengan nominal dikembalikan dan nama pelanggan, tombol Cetak Bukti Retur (jenis struk baru `retur`), Kirim Bukti Retur (simulasi WA), dan Selesai.
- `ReturnRecord` bertambah metode, nominal, jenis alasan, keterangan, dan nama foto.

## 8. Tema

Empat palet, dipilih dari menu samping dan disimpan di perangkat (`localStorage`, dibungkus try/catch, bawaan Oranye bila gagal):

| Tema     | Keterangan                                                              |
| -------- | ----------------------------------------------------------------------- |
| Oranye   | Bawaan. Meniru oranye referensi, digelapkan sedikit agar lolos kontras. |
| Terakota | Palet spesifikasi desain sebelumnya (`terracotta`).                     |
| Teal     | Aksen teal seperti warna sekunder referensi.                            |
| Gelap    | Permukaan gelap dari token gelap yang sudah ada, aksen terang.          |

Cara kerja:

- `tokens/tokens.json` mendapat blok `$themes` berisi nilai aksen (default, pressed, teks pada aksen, serta latar aksen lembut untuk baris terpilih) per tema. Tema Gelap memakai set `$dark` yang sudah ada.
- `scripts/build-tokens.mjs` mengeluarkan blok CSS `[data-app='pos'][data-pos-theme='...']` ke `tokens.css`. Tema dipasang lewat atribut `data-pos-theme` pada elemen akar. Tidak ada gaya inline sehingga CSP tidak berubah. Berkas Dart ekspor tidak ikut berubah.
- `scripts/check-contrast.mjs` menjalankan seluruh pasangan yang sekarang berlaku untuk setiap tema (teks pada aksen, aksen pada permukaan, status, fokus, tombol bahaya, chip terpilih). Pasangan tema baru tidak punya nilai pembanding di tabel 4.2, jadi kolom itu diabaikan; batas 4,5 : 1 atau 3 : 1 tetap berlaku. Tema yang gagal membuat perintah gagal.
- Nilai heks aksen ditetapkan saat implementasi lewat skrip itu. Patokan awal Oranye mendekati `#B94F00` (putih di atasnya harus minimal 4,5 : 1). Oranye referensi yang asli (sekitar `#F57C00`) hanya sekitar 2,8 : 1 dengan teks putih sehingga tidak dipakai.
- Mekanisme dibuat umum: BO dan Mobile dapat memakainya nanti dengan mendaftarkan aplikasinya, tanpa mengubah pemilih tema.

## 9. Perubahan kode

Tipe bersama (`src/shared/data/types.ts`), semuanya penambahan: `Product.incoming?`, `Product.photoUrl?`, `Product.pinned?`, `Customer.pinned?`, `PaymentMethod` tambah `edc`, `Sale.payments?`, `Sale.terms?`, `Sale.dp?`. Karena `PaymentMethod` bertambah, `tsc` akan menunjukkan setiap `switch` atau tabel label di BO, Owner, dan Sales yang harus menangani `edc`; hanya dilengkapi, tidak dirombak.

Modul POS:

- Baru: `domain/shift.ts`, `screens/shift.ts` (belum mulai, modal, ringkasan), `screens/drawer.ts`, `screens/payment-done.ts`, `screens/share-receipt.ts`, `screens/customer-picker.ts`, `theme.ts`, `src/shared/data/proposal.ts`, `src/shared/ui/dropdown.ts`, `src/shared/ui/stepper.ts`.
- Diubah: `topbar.ts`, `pos-session.ts` (shift, `startShift`, `endShift`, baris DP dengan `via`, `finish` mengisi `payments` dan `terms`, `returnSale` menerima metode, nominal, alasan), `domain/payment.ts` (split, EDC, DP, tempo), `screens/login.ts`, `sell.ts`, `pay.ts`, `history.ts`, `retur-modal.ts`, `receipt-preview.ts` (jenis `retur`), `styles/pos.css`, `pos-lanjut.css`, `tokens.json`, `build-tokens.mjs`, `check-contrast.mjs`, `messages.ts`.
- Teks baru dicatat di `docs/teks-baru.md`; asumsi dan konflik baru di `docs/asumsi.md` pada bagian baru "Revisi POS November 2026". Aturan tanpa tanda pisah panjang (`npm run lint:teks`) berlaku.
- File yang sudah dimodifikasi sebelum pekerjaan ini (`src/apps/owner/domain/order.ts`, kosong di working tree) tidak disentuh dan tidak ikut commit.

## 10. Fase pengerjaan

Tiap fase selesai bila `typecheck`, `lint`, `test`, `kontras`, dan e2e POS hijau, dengan uji lama yang bergantung tampilan diperbarui.

1. **Dasar:** data proposal dan foto, tema (token, skrip, pemilih), kerangka (bilah atas, menu samping), login baru, shift dan modal, layar jual (dropdown, kartu, panel pesanan, menu titik tiga, modal pelanggan).
2. **Pembayaran:** syarat bayar Tunai dan Piutang, Split Payment, EDC, tempo dan DP, modal Pembayaran Berhasil dengan Cetak Struk dan Kirim WA.
3. **Riwayat dan retur:** susunan dua panel, Share Struk, modal Retur baru, Retur Berhasil, jenis struk `retur`.

## 11. Asumsi dan keputusan yang perlu dikonfirmasi

Angka dan pilihan yang tidak berasal dari proposal:

| No   | Asumsi                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1  | **Limit piutang** tidak ada di proposal. Dipakai Rp 50.000.000 untuk ketujuh pelanggan proposal agar alur piutang dapat didemokan. Mohon dikonfirmasi.                                                   |
| A-2  | Kategori Semen, Lem, Gembok, dan Kabel NYM mengikuti kategori barang bangkitan yang sama. Cat Spray dan Knee PVC dipetakan ke kategori bangkitan terdekat. Engsel memakai "Door & Window" dari proposal. |
| A-3  | Barcode kosong untuk enam barang sketsa; pemindai didemokan dengan barang bangkitan dan Engsel.                                                                                                          |
| A-4  | Tier seluruh pelanggan proposal Eceran. Tempo selain Bu Sherly: 30 hari (bawaan sistem).                                                                                                                 |
| A-5  | Tanggal faktur Pak Wahyudi mengikuti proposal apa adanya. Tiga faktur bertanggal setelah 19 Oktober 2026; yang dipakai pada cek jatuh tempo hanyalah tanggal jatuh tempo.                                |
| A-6  | Modal Mode Tinjau Rp 500.000 hanya untuk kemudahan peninjau.                                                                                                                                             |
| A-7  | Layar login selalu gelap pada semua tema, mengikuti referensi.                                                                                                                                           |
| A-8  | Satu shift per perangkat; Frontliner tidak memerlukan shift.                                                                                                                                             |
| A-9  | Nilai heks palet tema ditetapkan saat implementasi dan harus lolos `npm run kontras`.                                                                                                                    |
| A-10 | HPP dan minimal stok enam barang sketsa tidak ada di proposal; diisi 0 supaya model tetap valid. Laporan HPP dan margin di BO untuk barang itu tidak bermakna.                                           |

## 12. Pengujian dan kriteria selesai

Uji unit baru (Vitest, lingkungan node):

- Data proposal: tiap barang sama dengan tabel 3.2 (harga, isi satuan, stok); jumlah saldo pelanggan proposal sama dengan 52.270.000; tidak ada kode, barcode, atau id ganda di seluruh katalog.
- Shift: mulai, saldo laci setelah penjualan tunai, kembalian, biaya, dan retur tunai; akhiri shift; penolakan tanpa shift.
- Pembayaran: split (sisa, kembalian), EDC, DP dengan cara bayar, tempo dan tanggal jatuh tempo, limit dengan DP, `Sale.payments` dan `Sale.terms`.
- Retur: nominal tidak melebihi nilai, metode pengembalian, alasan Lainnya wajib keterangan, jumlah melebihi sisa, saldo laci untuk retur tunai.
- Tema: `build-tokens` mengeluarkan blok untuk empat tema; setiap pasangan kontras tema lolos.

Uji e2e (Playwright, viewport 1000 px ke atas): alur login, mulai shift, jual dengan dropdown dan pilih satuan, bayar tunai, bayar split, bayar piutang dengan DP, Cetak Struk dan Kirim WA, riwayat, retur sampai Retur Berhasil, ganti tema. Uji lama (`pos.spec.ts`, `pos-lanjut.spec.ts`, `target-sentuh.spec.ts`, `urutan-tab.spec.ts`, `audit.spec.ts`, `tinjau-bo.spec.ts`, dan lainnya yang menyentuh POS) diperbarui.

Kriteria selesai:

1. `npm run typecheck`, `npm run lint`, `npm run lint:teks`, `npm test`, `npm run kontras`, `npm run build`, `npm run budget` hijau (anggaran JS 70 KB dan CSS 25 KB gzip per aplikasi tetap berlaku untuk POS).
2. `npm run test:e2e` hijau, termasuk axe tanpa pelanggaran pada setiap tema dan target sentuh 48 px untuk semua kontrol baru (menu samping, dropdown, baris satuan pada kartu, tombol jumlah, pemilih tema).
3. Pemeriksaan visual pada 1280 x 800 dan 1366 x 768 untuk keempat tema terhadap gambar referensi dan sketsa proposal.
4. BO, Owner, dan Sales tetap lulus uji yang ada setelah penambahan barang, pelanggan, dan `edc`.
