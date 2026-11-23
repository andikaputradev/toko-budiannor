# Layar Masuk POS Satu Halaman: Spesifikasi dan Matriks Butir

Tanggal: 2026-11-23. Permintaan klien (pesan teks + tiga gambar): "Tampilan awal POS saat mau login, tolong jangan pakai scroll bar, diatur supaya bisa satu halaman saja. Boleh dirapatkan jaraknya atau dikecilkan tombolnya." Keputusan dan asumsi dicatat di `docs/asumsi.md` bagian 29 (R17-xx).

## 1. Matriks butir

| No  | Permintaan klien                                     | Perubahan                                                                                                                | Tes                                                                                |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| L1  | Layar Pilih Pengguna tanpa bilah gulir, satu halaman | `.pos-login` berbaris tunggal `minmax(0, 1fr)` dengan `min-height: 0`; panel kanan menjadi kontainer ukuran tetap        | `pos-login-satu-halaman.spec.ts` (delapan ukuran layar, 1280x580 sampai 1920x1080) |
| L2  | Jarak dirapatkan                                     | Jarak kartu 6 px, label dan titik PIN rapat, jarak papan 8 px; di layar pendek 4 px                                      | sama                                                                               |
| L3  | Tombol dikecilkan                                    | Kartu dan tombol PIN mengikuti tinggi panel lewat `cqh`, 48 sampai 60 atau 64 px (batas bawah 48 = target sentuh proyek) | sama, `target-sentuh.spec.ts`, G3 `pos-revisi5.spec.ts`                            |
| L4  | Tampilan mengikuti layar tujuan (gambar 2)           | Kartu dua kolom; label PIN, titik, papan angka, dan Masuk di tengah panel                                                | G3 (tata letak berbelah) tetap lulus                                               |
| L5  | Gambar 3: layar masuk Back-Office                    | Hanya diukur; sudah tanpa gulir di semua ukuran uji                                                                      | skrip ukur (lihat bagian 3)                                                        |

## 2. Rancangan

Kolom kanan `.pos-login__side` memakai `container-type: size`; tingginya sisa layar di bawah header. Anak-anaknya membaca `100cqh` (tinggi isi kontainer):

```
--lg-fit:  100cqh - 204px                  (jarak, label, titik, Masuk, dua baris galat, sisa 8 px)
--lg-key:  clamp(48px, --lg-fit / 6.7, 64px)    tombol PIN
--lg-card: clamp(48px, --lg-fit * 0.134, 60px)  kartu kasir (0,9 x tombol)
```

`3 x kartu + 4 x tombol = 6,7 x tombol`, jadi seluruh isi pas dengan tinggi panel pada ukuran mana pun di antara batasnya. Tinggi isi panel di bawah 540 px memakai blok `@container` yang merapatkan jarak dan menyembunyikan baris galat kosong; padding panel 6 px di jendela di bawah 580 px.

## 3. Pengukuran (build produksi, Chrome)

Skrip di scratchpad mengukur selisih tinggi dokumen dan panel terhadap layar, serta batas bawah tombol Masuk. Sebelum: 1366x640 selisih 99 px, 1280x720 selisih 19 px, 900x560 selisih 179 px. Sesudah: nol di semua ukuran 1280x560 ke atas dan 900x560; hanya ponsel lanskap (800x360) yang masih menggulir di dalam panel.

## 4. Pertanyaan terbuka

- Gambar klien menampilkan dua "Agus Frontliner" (enam kotak). Data contoh hanya memuat lima pengguna aktif non-Sales, jadi lima kartu yang tampil. Bila klien memang ingin enam, perlu satu pengguna tambahan di data contoh.
