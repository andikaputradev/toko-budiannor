# Revisi tambahan POS dan Back-Office (21 November 2026)

Sumber: dokumen "Tambahan Revisi Penyesuaian.docx" (lima butir teks dengan tiga gambar) dan gambar Data
Barang beranotasi yang ditempel pengguna di percakapan (tiga butir). Keputusan dan pertanyaan terbuka ada di
`docs/asumsi.md` bagian 26 (R14-xx).

## Matriks butir

| No  | Butir klien                                                                                                            | Modul | Pekerjaan                                                                                                                                                                                                                                           | Tes                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Harga di kartu barang mengikuti kategori pelanggan (Grosir tampil harga Grosir, ganti ke Ecer tampil harga Ecer)       | POS   | Penyebabnya data: enam barang proposal teratas berharga Grosir sama dengan Eceran, jadi kartu tampak tidak berubah. Harga Grosir ditetapkan lebih rendah (`src/shared/data/proposal.ts`). Logika kartu, keranjang, dan satuan sudah mengikuti tier. | `pos-revisi6` H1, `proposal.test`                                    |
| 2   | Di menu bawah pojok kanan tambah biaya kirim                                                                           | POS   | Menu titik tiga: Open Bill, Diskon Transaksi, Biaya Kirim, Mulai Pesanan Baru. Kotak Biaya Kirim (`screens/shipping-fee.ts`), `PosState.shippingFee`, total, Open Bill, penjualan, struk, riwayat, retur, faktur BO.                                | `pos-revisi6` H2, `biaya-kirim.test`, `receipt.test`, `history.test` |
| 3   | Bayar hutang atau piutang: fitur Split, bila dicentang bisa bayar dengan dua cara (tunai 75.000 + transfer 25.000)     | BO    | Kotak centang Split, Cara Bayar, Kas / Bank, Nominal kedua; `DebtPayment.parts`; daftar, filter, laporan, kuitansi, riwayat bayar faktur.                                                                                                           | `bo-tambahan` J1 sampai J5, `debt-payments.test`                     |
| 4   | Retur: tata letak diperbaiki karena daftar barang yang diretur terlalu kecil dan mepet                                 | BO    | Panel Penyelesaian jadi kolom sempit di kanan, Faktur Asal dua baris, tabel barang mengisi sisa tinggi (`bo-retur.css`, `return-form.ts`).                                                                                                          | `bo-tambahan` K1 sampai K5                                           |
| 5   | Kursor di nama barang pada daftar: muncul nama selengkapnya                                                            | BO    | `revealTruncatedText` (title untuk sel terpotong) di semua tabel dan daftar BO.                                                                                                                                                                     | `bo-tambahan` I4                                                     |
| 6   | Kolom Nama pada formulir dipanjangkan, kolom di sampingnya (Barcode, Kategori, Merk) dipendekkan; Catatan dipanjangkan | BO    | Proporsi kolom `.bo-pd-form` dan Catatan `grid-area: 4 / 2 / 5 / 4` (`bo-products.css`).                                                                                                                                                            | `bo-tambahan` I3                                                     |
| 7   | Tombol impor di samping pencarian dihapus; pencarian dipanjangkan                                                      | BO    | `btnImpor` dan penangannya dihapus dari `products.ts`; pencarian `flex: 1 1 320px`; tiga label yang tidak terpakai dihapus.                                                                                                                         | `bo-tambahan` I1, I2                                                 |

## Rancangan Biaya Kirim

- Domain: `MAX_SHIPPING_FEE` (Rp 10.000.000), `normalizeShippingFee`, `netTotal(lines, discount, shipping)` di
  `domain/bill.ts`. Diskon Transaksi hanya mengurangi barang; biaya kirim ditambahkan sesudahnya.
- Sesi: `PosState.shippingFee`, `shippingFee()`, `setShippingFee(amount)`. Kosong bila keranjang kosong;
  `commit` menyelaraskan baris piutang dengan total baru.
- Bill tertahan: `HeldBill.shipping`; Split Bill menyisakannya di bill asal; Merge Bill menjumlahkannya.
- Penjualan: `Sale.shipping` (total sudah menyertakannya). `saleBreakdown` menambah `shipping` dan tidak
  menghitungnya sebagai diskon baris. `itemsValue` memakai total barang (total dikurangi biaya kirim).
- Tampilan: panel pesanan, layar bayar (`pay-summary.ts`), kartu Open Bill, rincian Riwayat, struk
  (`receipt.ts`), dan BO (`salesDraftFromNumber` memakai biaya kirim sebagai ongkos kirim faktur).

## Rancangan Split bayar hutang atau piutang

- Domain (`domain/debt-payments.ts`): `DebtPaymentPart`, `SplitDraft`, `checkPayment` menerima `draft.split` dan
  mengembalikan `parts` (dua bagian); galat baru `splitCara` dan `splitJumlah`. `applyToCustomer` menerima
  satu cara atau daftar bagian dan memecah pembayaran tiap faktur menurut urutan bagian.
  `paymentMethodText` dan `paymentAccountText` menyusun teks daftar.
- Layar (`screens/debt/payment-form.ts`): kotak centang Split dan kelompok isian kedua. `syncSplit` menjaga
  jumlah kedua Nominal sama dengan Total Bayar (lihat R14-05). Pembayaran tersimpan terbuka hanya-baca.

## Rancangan tata letak Retur

Kolom kiri memuat Faktur Asal (Pelanggan dan Faktur sebaris; pencarian dan ringkasan faktur di baris kedua) dan
tabel Barang yang Diretur yang mengisi sisa tinggi; kolom kanan (380 sampai 440 px) memuat Penyelesaian Retur
satu kolom dengan Nilai Retur dan tombol Simpan sebaris. Aturan lama di `bo-fit.css`, `bo-rapi.css`, dan
`bo-seragam.css` tidak dihapus; blok baru di akhir `bo-retur.css` memakai awalan `html[data-app='bo'] .bo-ret`
sehingga menang lewat spesifisitas, bukan urutan muat. Chip alasan memakai selektor `.field > .bo-ret-chips`
karena aturan umum field di `bo-seragam.css` memaksa isi field ke kolom kedua.

## Pengukuran

Layar acuan 1280x640 (klien sekitar 1280x640 CSS px) dan 1366x768. Retur: empat baris barang penuh di
1280x640, enam sampai tujuh di 1366x768, tanpa gulir halaman. Formulir bayar dengan Split muat satu layar 1280x640 tanpa
gulir dalam. Anggaran JS awal: POS 69,84 KB, BO 69,65 KB (batas 70 KB).
