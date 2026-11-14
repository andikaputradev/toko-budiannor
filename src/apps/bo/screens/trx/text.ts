// Teks layar Transaksi (gambar klien 8 sampai 13). Sengaja bukan label bersama: label bersama
// dimuat semua aplikasi dan anggaran JS POS tinggal 0,5 KB, sedangkan modul ini dimuat malas.
export const TRX_TEXT = {
  // Kotak cari barang
  cariBarang: 'Cari/Pilih Barang & Jasa...',
  cariBarangNama: 'Cari atau pilih barang dan jasa',
  tombolCariBarang: 'Cari barang',
  // Dialog Rincian Barang
  rincianBarang: 'Rincian Barang',
  kode: 'Kode #',
  namaBarang: 'Nama Barang',
  kuantitas: 'Kuantitas',
  satuan: 'Satuan',
  harga: '@Harga',
  diskon: 'Diskon',
  diskonPersen: 'Diskon persen',
  diskonRupiah: 'Diskon rupiah',
  totalHarga: 'Total Harga',
  gudang: 'Gudang',
  stok: 'Stok',
  ongkosKirim: 'Ongkos Kirim',
  histJual: 'Harga Histori Jual',
  histBeli: 'Harga Histori Beli',
  belumRiwayat: 'Belum ada riwayat',
  kosongkanNama: 'Pilih barang lain',
  hapus: 'Hapus',
  lanjut: 'Lanjut',
  toko: 'TOKO',
  gudangBesar: 'GUDANG',
  errKuantitas: 'Isi kuantitas lebih dari 0.',
  errDesimal:
    'Kuantitas harus bilangan bulat (maksimal tiga desimal untuk barang yang boleh pecahan).',
  errHarga: 'Isi harga satuan 0 atau lebih.',
  errDiskon: 'Diskon tidak boleh melebihi harga satuan atau 100 persen.',
  errOngkos: 'Ongkos kirim tidak boleh negatif.',
  // Tabel baris
  urut: 'Urut',
  urutBaris: 'Urutkan baris {nama}',
  koli: 'Koli',
  koliBaris: 'Kirim {nama} lewat ekspedisi',
  promo: 'PROMO',
  kolNama: 'Nama Barang',
  kolKode: 'Kode #',
  kolGudang: 'Gudang',
  kolKuantitas: 'Kuantitas',
  kolSatuan: 'Satuan',
  kolHarga: '@Harga',
  kolDiskon: 'Diskon',
  kolTotal: 'Total Harga',
  daftarBarang: 'Daftar barang dokumen',
  kosong: 'Belum ada barang. Cari barang lalu pilih.',
  // Kotak total
  subTotal: 'Sub Total',
  diskonNota: 'Diskon',
  totalBiaya: 'Total Biaya',
  total: 'Total',
} as const;

// "5 Barang (39)": jumlah baris dan total kuantitas.
export function itemCountText(count: number, quantity: number): string {
  return `${String(count)} Barang (${String(quantity)})`;
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
    return values[name] ?? placeholder;
  });
}
