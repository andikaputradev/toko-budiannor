# Revisi Back-Office putaran kesembilan: matriks keterlacakan

Acuan: dokumen klien "Revisi Penyesuain BO 2 (1) (2).docx" (18 November 2026). Cabang `revisi-bo-9`. Keputusan dan pertanyaan terbuka ada di `docs/asumsi.md` bagian 23 (R11-xx).

| #   | Butir dokumen                                                              | Perubahan                                            | Bukti                                                   |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| H1  | Dashboard: Omset tambah Transaksi Lunas dan Piutang, rata-rata dihilangkan | `MetricBreakdown.lunas` dan `piutang`, stat omset    | `tests/unit/bo/dashboard.test.ts`, `bo-revisi9.spec.ts` |
| H2  | Grafik: angka di samping grafik, nilai saat penunjuk di titik              | `createLineChart` dengan skala sumbu dan kotak nilai | `bo-revisi9.spec.ts`                                    |
| H3  | Aset: diagram rata sejajar                                                 | `.bo-hbars` satu grid                                | `bo-revisi9.spec.ts`                                    |
| H4  | Penjualan Barang: pilihan nilai, frekuensi, laba                           | `productsBy`, segmented tiga pilihan                 | `dashboard.test.ts`, `bo-revisi9.spec.ts`               |
| H5  | Widget lebih tinggi dan warna diagram cerah (gambar 35)                    | header 44 px; token `--chart-1..7`                   | `bo-revisi9.spec.ts`                                    |
| H6  | Header semua halaman direndahkan (gambar 36)                               | `--bo-topbar-h` 44 px, judul sebaris                 | `tests/e2e/bo.spec.ts`, `bo-revisi9.spec.ts`            |
| H7  | Daftar Barang seperti gambar 37                                            | `products.ts`, `bo-products.css`                     | `bo-barang.spec.ts`, `bo-revisi9.spec.ts`               |
| H8  | Tombol Tambah menjadi Batal                                                | `syncToolbar`                                        | `bo-revisi9.spec.ts`                                    |
| H9  | Isi Harga Jual Barang (gambar 38), Owner                                   | `product-dialogs.ts` `openPriceDialog`               | `bo-revisi9.spec.ts`                                    |
| H10 | Isi Saldo Awal Barang (gambar 39), Owner                                   | `domain/opening-balance.ts`, `openOpeningDialog`     | `bo-revisi9.spec.ts`                                    |
| H11 | Perbesar gambar setengah halaman di tengah (gambar 40)                     | `openImageViewer`                                    | `bo-barang.spec.ts` B6                                  |
| H12 | Akuntansi seragam, "Sewa Toko" (gambar 41)                                 | `bo-seragam.css` bagian Akuntansi                    | `bo-revisi9.spec.ts`, `accounting.test.ts`              |
