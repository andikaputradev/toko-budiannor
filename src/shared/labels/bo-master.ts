// Teks baru Back-Office (lengkapi menu). Tambahkan kunci di sini; jangan ubah berkas lain.
// Aliran BO-1: layar Master Data (Kategori, Merk, Pemasok, Pelanggan, Sales, Ekspedisi).
export const boMasterLabels = {
  // Tombol dan bilah
  masterTambah: 'Tambah',
  masterUbah: 'Ubah',
  masterInfo: 'Info',
  masterImpor: 'Impor',
  masterEkspor: 'Ekspor Excel',
  masterNonaktifkan: 'Nonaktifkan',
  masterAktifkan: 'Aktifkan',
  masterPintas: '{aksi} (Alt+{tombol})',
  masterHakTidak: 'Peran Anda tidak memiliki hak untuk tindakan ini.',
  masterHanyaLihat: 'Peran Anda hanya dapat melihat data ini. Hubungi Owner untuk mengubahnya.',
  masterPilihDulu: 'Pilih data pada daftar terlebih dahulu.',
  masterTerkunci: 'Data bawaan ini tidak dapat diubah.',

  // Daftar
  masterCari: 'Cari nama, kode, atau telepon',
  masterCariAria: 'Cari data pada daftar',
  masterMuatUlang: 'Muat ulang daftar',
  masterDaftar: 'Daftar {entitas}',
  masterHitung: '{tampil} dari {total} data',
  masterTidakAda: 'Data tidak ditemukan',
  masterTidakAdaDesk: 'Ubah kata pencarian atau tambahkan data baru.',

  // Formulir dan ringkasan
  masterFormDetail: 'Detail {entitas}',
  masterFormTambah: 'Tambah {entitas}',
  masterFormUbah: 'Ubah {entitas}',
  masterModeBaru: 'Data baru',
  masterModeUbah: 'Sedang diubah',
  masterRingkasan: 'Ringkasan',
  masterLimitHanyaOwner: 'Limit piutang hanya dapat diubah oleh Owner.',
  masterNamaMengikutiAkun: 'Nama dan peran mengikuti akun pengguna, diubah lewat menu Pengguna.',
  masterSalesKosong: 'Belum ada penjualan atas nama sales ini pada bulan berjalan.',

  // Nama entitas
  masterEntitasKategori: 'Kategori',
  masterEntitasMerk: 'Merk',
  masterEntitasPemasok: 'Pemasok',
  masterEntitasPelanggan: 'Pelanggan',
  masterEntitasSales: 'Sales',
  masterEntitasEkspedisi: 'Ekspedisi',

  // Kolom formulir
  masterFieldKode: 'Kode',
  masterFieldNama: 'Nama',
  masterFieldNamaKategori: 'Nama Kategori',
  masterFieldNamaMerk: 'Nama Merk',
  masterFieldNamaPemasok: 'Nama Pemasok',
  masterFieldNamaPelanggan: 'Nama Pelanggan',
  masterFieldNamaSales: 'Nama Sales',
  masterFieldNamaEkspedisi: 'Nama Ekspedisi',
  masterFieldKeterangan: 'Keterangan',
  masterFieldCatatan: 'Catatan',
  masterFieldTelepon: 'Telepon',
  masterFieldAlamat: 'Alamat',
  masterFieldTier: 'Tier Harga',
  masterFieldLimit: 'Limit Piutang (Rp)',
  masterFieldTempo: 'Jatuh Tempo (hari)',
  masterFieldPeran: 'Peran',
  masterFieldKomisi: 'Komisi (%)',
  masterFieldTarget: 'Target Bulanan (Rp)',
  masterFieldTarif: 'Tarif Dasar (Rp)',
  masterFieldStatus: 'Status',
  masterFieldAkun: 'Akun Pengguna',
  masterStatusAktif: 'Aktif',
  masterStatusNonaktif: 'Nonaktif',

  // Kolom tabel
  masterColBarang: 'Barang',
  masterColMerk: 'Merk',
  masterColKategori: 'Kategori',
  masterColHutang: 'Hutang',
  masterColTier: 'Tier',
  masterColLimit: 'Limit',
  masterColPiutang: 'Piutang',
  masterColKomisi: 'Komisi',
  masterColTarget: 'Target',
  masterColOmzet: 'Omzet',
  masterColTarif: 'Tarif Dasar',

  // Angka ringkasan per baris
  masterMetBarang: 'Jumlah Barang',
  masterMetBarangAktif: 'Barang Aktif',
  masterMetStok: 'Total Stok',
  masterMetNilai: 'Nilai Persediaan',
  masterMetMerk: 'Jumlah Merk',
  masterMetKategori: 'Jumlah Kategori',
  masterMetHutang: 'Hutang Berjalan',
  masterMetHutangTempo: 'Hutang Jatuh Tempo',
  masterMetFaktur: 'Jumlah Faktur',
  masterMetFakturBuka: 'Faktur Terbuka',
  masterMetPo: 'Jumlah PO',
  masterMetPiutang: 'Saldo Piutang',
  masterMetSisaLimit: 'Sisa Limit',
  masterMetPiutangTempo: 'Piutang Jatuh Tempo',
  masterMetDeposit: 'Saldo Deposit',
  masterMetTransaksi: 'Jumlah Transaksi',
  masterMetOmzet: 'Omzet Bulan Ini',
  masterMetNota: 'Jumlah Nota',
  masterMetKomisiBulan: 'Komisi Bulan Ini',
  masterMetCapaian: 'Capaian Target',
  masterMetPilihanAwal: 'Pilihan Awal Surat Jalan',
  masterYa: 'Ya',
  masterTidak: 'Tidak',

  // Kartu angka di atas daftar
  masterStatKategori: 'Total Kategori',
  masterStatMerk: 'Total Merk',
  masterStatBarang: 'Total Barang',
  masterStatKosong: 'Tanpa Barang',
  masterStatPemasok: 'Pemasok Aktif',
  masterStatHutang: 'Total Hutang',
  masterStatHutangTempo: 'Hutang Jatuh Tempo',
  masterStatPelanggan: 'Pelanggan Aktif',
  masterStatPiutang: 'Total Piutang',
  masterStatPiutangTempo: 'Piutang Jatuh Tempo',
  masterStatSales: 'Total Sales',
  masterStatOmzet: 'Omzet Bulan Ini',
  masterStatTarget: 'Total Target',
  masterStatEkspedisi: 'Total Ekspedisi',
  masterStatTarifRendah: 'Tarif Terendah',
  masterStatTarifTinggi: 'Tarif Tertinggi',

  // Lencana
  masterBadgeNonaktif: 'Nonaktif',
  masterBadgeLewatTempo: 'Lewat tempo',
  masterBadgeBawaan: 'Bawaan',
  masterTanpaMerk: 'Tanpa Merk',

  // Pemberitahuan
  masterSimpanBaru: '{entitas} "{nama}" ditambahkan.',
  masterSimpanUbah: '{entitas} "{nama}" diperbarui.',
  masterHapusOk: '{entitas} "{nama}" dihapus.',
  masterNonaktifOk: '{entitas} "{nama}" dinonaktifkan.',
  masterAktifOk: '{entitas} "{nama}" diaktifkan kembali.',

  // Dialog
  masterInfoJudul: 'Info {entitas}: {nama}',
  masterHapusJudul: 'Hapus {entitas}',
  masterHapusIsi: 'Hapus "{nama}"? Data yang dihapus tidak dapat dikembalikan.',
  masterNonaktifJudul: 'Nonaktifkan {entitas}',
  masterNonaktifIsi:
    'Nonaktifkan "{nama}"? Data tetap tersimpan dan dapat diaktifkan kembali kapan saja.',
  masterTolakJudul: 'Tidak dapat diproses',
  masterTolakKategori:
    'Kategori "{nama}" masih dipakai oleh {jumlah} barang. Pindahkan barangnya ke kategori lain terlebih dahulu.',
  masterTolakMerk:
    'Merk "{nama}" masih dipakai oleh {jumlah} barang. Pindahkan barangnya ke merk lain terlebih dahulu.',
  masterTolakHutang:
    'Pemasok "{nama}" masih memiliki hutang {jumlah}. Lunasi hutangnya sebelum dinonaktifkan.',
  masterTolakPiutang:
    'Pelanggan "{nama}" masih memiliki piutang {jumlah}. Selesaikan piutangnya sebelum dinonaktifkan.',
  masterTolakSalesPengguna:
    '"{nama}" adalah akun pengguna aplikasi. Nonaktifkan lewat menu Pengguna, bukan dari daftar Sales.',
  masterTolakSalesPakai:
    'Sales "{nama}" tercatat pada {jumlah} penjualan bulan ini dan tidak dapat dihapus.',
  masterTolakEkspedisi:
    'Ekspedisi "{nama}" dipakai sebagai pilihan awal Surat Jalan dan tidak dapat dihapus.',
  masterTolakBawaan: 'Data bawaan ini tidak dapat diubah atau dihapus.',

  // Impor simulasi
  masterImporIsi:
    'Pilih berkas Excel (.xlsx) dengan kolom: {kolom}. Pada simulasi ini Anda dapat memuat data contoh tanpa berkas.',
  masterImporContoh: 'Data contoh yang akan dimuat ({jumlah})',
  masterImporMuat: 'Muat Contoh',
  masterImporHasil: 'Berhasil mengimpor {jumlah} data, {lewat} dilewati karena sudah ada.',
  masterImporKosong: 'Semua data contoh sudah ada pada daftar.',

  // Log aktivitas
  masterLogTambah: '{entitas} {nama} ditambahkan',
  masterLogUbah: '{entitas} {nama} diubah',
  masterLogHapus: '{entitas} {nama} dihapus',
  masterLogNonaktif: '{entitas} {nama} dinonaktifkan',
  masterLogAktif: '{entitas} {nama} diaktifkan kembali',
  masterLogImpor: '{entitas}: impor {jumlah} data contoh',
  masterLogCetak: 'Daftar {entitas} ({jumlah} baris) dicetak: {format}',

  // Validasi
  masterErrUmum: 'Periksa kembali isian ini.',
  masterErrNamaPanjang: 'Nama maksimal {maks} karakter.',
  masterErrNamaPakai: '{entitas} dengan nama ini sudah ada.',
  masterErrKodeWajib: 'Kode wajib diisi.',
  masterErrKodeFormat: 'Kode hanya huruf besar, angka, dan tanda hubung, maksimal {maks} karakter.',
  masterErrKodePakai: 'Kode sudah dipakai.',
  masterErrKeteranganPanjang: 'Isian maksimal {maks} karakter.',
  masterErrAlamatPanjang: 'Alamat maksimal {maks} karakter.',
  masterErrAngka: 'Isi dengan angka saja, tanpa huruf atau tanda minus.',
  masterErrKomisi: 'Komisi harus antara 0 dan 100 persen.',
  masterErrPeran: 'Pilih peran sales.',
} as const;
