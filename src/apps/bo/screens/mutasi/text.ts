// Teks menu Mutasi Stok (gambar klien 14 sampai 18). Sengaja bukan label bersama: label bersama
// dimuat semua aplikasi dan anggaran JS POS tinggal sedikit, sedangkan modul ini dimuat malas.
export const MUT_TEXT = {
  // Umum
  cetak: 'Cetak',
  segarkan: 'Segarkan',
  kembaliKeDaftar: 'Kembali ke daftar',
  // Transfer Stok: daftar (gambar 14) dan formulir (gambar 15)
  buatDoTransfer: 'Buat Do Transfer',
  kolomUser: 'User',
  kolomKeterangan: 'Keterangan',
  daftarMutasi: 'Daftar mutasi stok',
  mutasiKosong: 'Belum ada mutasi. Klik Buat Do Transfer untuk memindahkan stok.',
  formMutasi: 'Formulir transfer stok',
  tabelMutasi: 'Barang yang dimutasi',
  buktiTransfer: 'Bukti Transfer Stok',
  buktiTransferDraf: 'Draf Bukti Transfer Stok',
  buktiPembuka: 'Perpindahan stok dari {asal} ke {tujuan} pada {tanggal}.',
  buktiKeterangan: 'Keterangan: {teks}',
  buktiTanpaKeterangan: 'Tanpa keterangan.',
  dibuatOleh: 'Dibuat oleh',
  disetujuiOleh: 'Disetujui oleh',
  diterimaOleh: 'Diterima oleh',
  isiBarangDulu: 'Isi barang yang akan dimutasi lebih dulu.',
  logCetakMutasi: 'Bukti transfer stok {nomor} dicetak',
  // Koreksi Stok: daftar (gambar 16) dan formulir (gambar 17)
  tulisAlasan: 'Tulis Alasan',
  kolomAlasanKoreksi: 'Alasan Koreksi',
  hapusDrafJudul: 'Hapus draf koreksi',
  hapusDrafTeks: 'Semua barang dan alasan yang sudah diisi akan dihapus. Lanjutkan?',
  hapusDraf: 'Hapus draf',
  daftarKoreksi: 'Daftar koreksi stok',
  stokSebenarnyaWajib: 'Isi stok sebenarnya',
  barangBelumDiisi: 'Isi stok sebenarnya dan alasan pada setiap barang yang berubah.',
  draf: 'Draf',
  // Daftar Stok Minim (gambar 18)
  stokToko: 'Stok Toko',
  stokGudang: 'Stok Gudang',
  totalStok: 'Total Stok',
  minToko: 'Min Toko',
  minTotal: 'Min Total',
  satuan: 'Satuan',
  cetakDaftarStok: 'Daftar Stok Minim',
  pilihCetak: 'Pilih cara mencetak daftar stok',
  cetakLangsung: 'Print',
  // Stok Opname: Daftar Perintah (judul klien tanpa gambar)
  daftarPerintahOpname: 'Daftar Perintah Stok Opname',
  perintahOpname: 'Perintah Opname',
  opnameKosong: 'Belum ada perintah opname. Klik Perintah Opname untuk memulai.',
  kolomNoOpname: 'No. Opname',
  kolomTanggal: 'Tanggal',
  kolomGudang: 'Gudang',
  kolomPetugas: 'Petugas',
  kolomBarang: 'Barang',
  kolomStatus: 'Status',
  kolomNilaiSelisih: 'Nilai selisih',
  statusDraf: 'Draf',
  statusDiterapkan: 'Diterapkan',
  barangJumlah: '{jumlah} barang',
  lanjutkanDraf: 'Lanjutkan draf',
  daftarOpname: 'Daftar perintah opname',
  lihat: 'Lihat',
  aksi: 'Aksi',
} as const;

export type MutKey = keyof typeof MUT_TEXT;

export function mut(key: MutKey, values: Readonly<Record<string, string>> = {}): string {
  return Object.entries(values).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    MUT_TEXT[key],
  );
}
