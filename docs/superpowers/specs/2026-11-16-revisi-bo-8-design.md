# Revisi Back-Office putaran kedelapan: matriks keterlacakan

Acuan: dokumen klien "Revisi Penyesuain BO 2 (1) (1).docx" (16 November 2026, malam). Cabang `revisi-bo-8`. Keputusan dan pertanyaan terbuka ada di `docs/asumsi.md` bagian 22 (R10-xx).

| #   | Butir dokumen                                                                          | Perubahan                                                                                                | Bukti                                                                 |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| G1  | Pencarian mengenali frasa (potongan kata, urutan bebas)                                | `matchesPhrase` dan mode `substring` pada indeks barang; semua filter teks BO memakainya                 | `tests/unit/search-index.test.ts`, gambar popup cari barang "men gre" |
| G2  | Tampilan baku (gambar 30): tinggi tidak berubah menurut jumlah satuan atau angka besar | Blok Satuan dan panel Harga berukuran tetap; kotak Info Piutang berlebar tetap                           | pengukuran geometri 20 barang (daftar 240 px, Harga 140 px)           |
| G3  | Halaman data seragam (gambar 31)                                                       | Bilah Tambah, Ubah, Hapus, Nonaktifkan, Info, Impor, Cetak, Keluar                                       | `screens/master-data.ts`, `bo-seragam.css` bagian 6                   |
| G4  | Halaman daftar seragam (gambar 32)                                                     | `createListPage` baru: bilah tombol, filter, pencarian, kotak angka, pilihan baris; 13 daftar memakainya | `screens/trx/list-page.ts`, `tests/e2e/bo-daftar.spec.ts`             |
| G5  | Menu (gambar 33): Dashboard, Daftar Nota, Surat Jalan, rincian Akuntansi tidak di menu | `domain/menu.ts` (entri tersembunyi untuk rute yang tetap hidup)                                         | `tests/unit/bo/menu.test.ts`                                          |
| G6  | Price List satu entri di menu Laporan                                                  | Entri kotak pilihan; halaman Satuan dan Harga tidak di menu                                              | `tests/e2e/bo-laporan.spec.ts`                                        |
| G7  | Stok Opname daftar (gambar 19, sama dengan sebelumnya)                                 | Kolom PSO dan HSO tetap; memakai templat G4                                                              | `screens/opname.ts`                                                   |

## Hasil verifikasi

- Unit: 102 berkas, 1090 tes lulus (termasuk pencarian frasa, menu, penghapusan PO, SO, dan perintah opname).
- E2E (build produksi): BO 1280x800 178 lulus; seluruh rangkaian 1366x768 564 lulus, 3 gagal yang bukan dari putaran ini atau sporadis: `audit` OWN-04 (kontras `.mob-avatar`, gagal juga di `main`), `urutan-tab` BO-09 dan `bo-barang` I1 (keduanya lulus bila dijalankan sendiri).
- Muat-layar: 56 rute tanpa gulir pada 1280x640, 1366x640, 1280x720, 1366x768, 1920x1080; axe bersih pada semua rute BO mode terang dan gelap.
- Anggaran JS awal: POS 69,45 KB (batas 70), BO 67,86 KB; CSS BO 21,61 KB (batas 25).
