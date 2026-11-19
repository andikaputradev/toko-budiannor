# Revisi Back-Office putaran kesepuluh: matriks keterlacakan

Acuan: dokumen klien "Revisi Penyesuain BO 2 (1) (3).docx" (19 November 2026). Cabang `revisi-bo-10`. Keputusan dan pertanyaan terbuka ada di `docs/asumsi.md` bagian 24 (R12-xx).

| #   | Butir dokumen                                                                                                     | Perubahan                                                                     | Bukti                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| K1  | Cara Bayar Tunai atau Hutang/Piutang; Tempo hanya angka dengan "Hari"                                             | `trx/payment-fields.ts`, `order-form.ts`, `purchase-form.ts`, `sales-form.ts` | `bo-revisi10.spec.ts`                                         |
| K2  | Tunai menonaktifkan Tempo dan membuka Kas / Bank                                                                  | `createPaymentFields` (`sync`)                                                | `bo-revisi10.spec.ts`                                         |
| K3  | Kepala PO, SO, Faktur Beli, Faktur Jual dan urutan Tab (gambar 42 sampai 45)                                      | `createDocHead` `labelFor`, susunan kolom, Nomor dilewati Tab                 | `bo-revisi10.spec.ts`, `bo-trx.spec.ts`, `urutan-tab.spec.ts` |
| K4  | Kolom Ongkir PO dan Faktur Beli; tanpa Total Biaya                                                                | `LinesTableOptions.shipping`, `TotalsBoxOptions.withExtra`                    | `bo-trx.spec.ts`, `bo-revisi10.spec.ts`                       |
| K5  | Ongkir menjadi bagian HPP rata-rata                                                                               | `domain/landed-cost.ts`, `applyPurchaseCost`                                  | `tests/unit/bo/landed-cost.test.ts`, `bo-revisi10.spec.ts`    |
| K6  | Nama Barang di dialog boleh diubah (alias)                                                                        | `line-dialog.ts`, `alias` pada `PurchaseOrderLine` dan `BillLine`             | `bo-revisi10.spec.ts`                                         |
| K7  | Daftar berpasangan seragam, Total terakhir, nomor retur tautan                                                    | `fixColumns`, urutan kolom, `return-list-page.ts`, `payment-list.ts`          | `bo-revisi10.spec.ts`, `bo-trx.spec.ts`, `bo-daftar.spec.ts`  |
| K8  | Tanggal hari/bulan/tahun dengan garis miring di semua halaman                                                     | `short-date.ts` (`shortDate`, `slashIso`, `slashStamp`, `formatDayDateTime`)  | `landed-cost.test.ts`, `bo-revisi10.spec.ts`                  |
| K9  | "Beban Operasional" menjadi "Beban Usaha"; "Kas Toko" dan "Bank BCA/Mandiri" menjadi "Kas" dan "Bank"             | `settings-rbac.ts`, `accounting.ts`, `debt-payments.ts`, `messages.ts`        | `bo-akuntansi.spec.ts`, `tests/unit/bo`                       |
| K10 | "On Proses" menjadi "Proses"; "Syarat Bayar" menjadi "Cara Bayar"; "Metode Bayar/Pembayaran" menjadi "Kas / Bank" | `order-list.ts`, formulir                                                     | `bo-trx.spec.ts`                                              |
| K11 | Master tanpa Nonaktifkan; Impor hanya Pemasok dan Pelanggan                                                       | `screens/master-data.ts`, `master-dialogs.ts`, `labels/bo-master.ts`          | `bo-templat.spec.ts`                                          |
| K12 | Kode otomatis: Kode Barang empat digit, Kode Pelanggan C0012, nomor PO/SO/FJ/FB                                   | `nextProductCode`, `lockedFields`, `domain/doc-number.ts`, `nextOrderNumber`  | `landed-cost.test.ts`, `bo-revisi10.spec.ts`, `bo.spec.ts`    |
| K13 | Kaca pembesar semua pencarian sama dengan Data Barang                                                             | `createSearchBox`, `item-search.ts`, `master-data.ts`                         | `bo-revisi10.spec.ts`                                         |
| K14 | Kepala daftar membeku                                                                                             | `bo-seragam.css` (`.pos-table thead th`)                                      | `bo-revisi10.spec.ts`                                         |
| K15 | Caption dua baris menjadi satu baris                                                                              | `bo-seragam.css` bagian putaran 10, `bo-master.css`                           | `bo-revisi10.spec.ts`                                         |
| K16 | Tombol Import hanya di master Data Barang, Pemasok, Pelanggan                                                     | lihat K11                                                                     | `bo-templat.spec.ts`                                          |

## Pemeriksaan

- Unit: `npm test` (1.104 lulus, termasuk `landed-cost.test.ts`).
- E2E pada PC dan tablet: `bo-revisi10.spec.ts` dan seluruh spesifikasi BO yang diperbarui.
- Anggaran JS: BO 68,8 KB gzip dari batas 70 KB.
- Sapuan seluruh rute BO untuk tanggal gaya lama, caption terpotong, dan kepala tabel tidak membeku (hasil: hanya kartu daftar pihak dan kartu tema yang memang bertumpuk).
