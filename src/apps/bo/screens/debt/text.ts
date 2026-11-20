// Teks menu Hutang Piutang (gambar klien 21 sampai 23). Sengaja bukan label bersama: label bersama
// dimuat semua aplikasi dan anggaran JS POS tinggal sedikit, sedangkan modul ini dimuat malas.
import type { PartyType } from '../../domain/receivable-payable';

export interface DebtCopy {
  // Halaman Saldo
  readonly saldoJudul: string;
  readonly saldoTotal: string;
  readonly saldoPihak: string;
  readonly cariPihak: string;
  readonly petunjukCentang: string;
  readonly rincianJudul: string;
  readonly kolomPihak: string;
  // Halaman Daftar Pembayaran
  readonly daftarJudul: string;
  readonly buat: string;
  readonly totalHariIni: string;
  readonly semuaPihak: string;
  readonly cariPembayaran: string;
  readonly cariPembayaranNama: string;
  // Formulir
  readonly formJudul: string;
  readonly pilihPihak: string;
  readonly kuitansiJudul: string;
  readonly untukPembayaran: string;
  readonly logCetak: string;
}

export const DEBT_COPY: Readonly<Record<PartyType, DebtCopy>> = {
  pelanggan: {
    saldoJudul: 'Daftar Saldo Piutang dan Pembuatan Laporan Penagihan Piutang',
    saldoTotal: 'Total Saldo Piutang',
    saldoPihak: 'Pelanggan',
    cariPihak: 'Cari Nama Pelanggan',
    petunjukCentang: 'Beri tanda centang di No Faktur yang akan dicetak di laporan penagihan',
    rincianJudul: 'Rincian Faktur dan TTD Faktur',
    kolomPihak: 'Pelanggan',
    daftarJudul: 'Daftar Pembayaran Piutang Penjualan',
    buat: 'Bayar Piutang',
    totalHariIni: 'Total Pembayaran Piutang Hari Ini',
    semuaPihak: 'Pelanggan: Semua',
    cariPembayaran: 'Cari pembayaran...',
    cariPembayaranNama: 'Cari nomor pembayaran atau pelanggan',
    formJudul: 'Isi Data Pembayaran Piutang',
    pilihPihak: 'Pilih Pelanggan',
    kuitansiJudul: 'Kuitansi Pembayaran Piutang',
    untukPembayaran: 'Pelunasan piutang',
    logCetak: 'Kuitansi piutang {nomor} dicetak',
  },
  pemasok: {
    saldoJudul: 'Daftar Saldo Hutang dan Pembuatan Laporan Pembayaran Hutang',
    saldoTotal: 'Total Saldo Hutang',
    saldoPihak: 'Pemasok',
    cariPihak: 'Cari Nama Pemasok',
    petunjukCentang: 'Beri tanda centang di No Faktur yang akan dicetak di laporan pembayaran',
    rincianJudul: 'Rincian Faktur dan TTD Faktur',
    kolomPihak: 'Pemasok',
    daftarJudul: 'Daftar Pembayaran Hutang Pembelian',
    buat: 'Bayar Hutang',
    totalHariIni: 'Total Pembayaran Hutang Hari Ini',
    semuaPihak: 'Pemasok: Semua',
    cariPembayaran: 'Cari pembayaran...',
    cariPembayaranNama: 'Cari nomor pembayaran atau pemasok',
    formJudul: 'Isi Data Pembayaran Hutang',
    pilihPihak: 'Pilih Pemasok',
    kuitansiJudul: 'Bukti Pembayaran Hutang',
    untukPembayaran: 'Pelunasan hutang',
    logCetak: 'Bukti hutang {nomor} dicetak',
  },
};

export const DEBT_TEXT = {
  simpan: 'Simpan',
  cetak: 'Cetak',
  kirimWa: 'Kirim WA',
  segarkan: 'Segarkan',
  totalJatuhTempo: 'Total Jatuh Tempo',
  totalDicetak: 'Total Faktur yang Dicetak',
  daftarSaldo: 'Daftar Saldo',
  kolomNama: 'Nama',
  kolomSaldo: 'Saldo',
  kolomStatus: 'Status',
  kolomCetak: 'Cetak',
  kolomNo: 'No',
  kolomFaktur: 'No. Faktur',
  kolomTglFaktur: 'Tgl Faktur',
  kolomJatuhTempo: 'Jatuh Tempo',
  kolomNilaiFaktur: 'Nilai Faktur',
  kolomSisaBayar: 'Sisa Bayar',
  statusBelumLunas: 'Belum Lunas',
  statusJatuhTempo: 'Jatuh Tempo',
  fakturJumlah: '{jumlah} Faktur',
  pihakKosong: 'Tidak ada pihak dengan saldo.',
  fakturKosong: 'Pilih pihak untuk melihat rincian faktur.',
  fakturLunas: 'Tidak ada faktur yang belum lunas.',
  rincianTotal: 'Total: {nilai}',
  tandaiTersimpan: 'Daftar faktur yang dicetak tersimpan.',
  tandaiKosong: 'Beri tanda centang pada faktur yang akan dicetak lebih dulu.',
  waDibuka: 'Tautan WhatsApp telah dibuka.',
  pilihPihakDulu: 'Pilih pihak terlebih dahulu.',
  // Daftar Pembayaran
  kolomTanggal: 'Tanggal',
  kolomNomorBayar: 'Nomor Pembayaran',
  kolomTotalBayar: 'Total Bayar',
  kolomCaraBayar: 'Cara Bayar',
  kolomMetode: 'Metode Bayar',
  kolomKasBank: 'Kas / Bank',
  kolomKeterangan: 'Keterangan',
  kolomUser: 'User',
  daftarPembayaran: 'Daftar pembayaran',
  pembayaranKosong: 'Belum ada pembayaran. Klik Tambah untuk mencatat pembayaran pertama.',
  pembayaranDitolak:
    'Pembayaran yang sudah tercatat tidak dapat dihapus karena sudah mengubah saldo hutang atau piutang.',
  pembayaranTidakCocok: 'Tidak ada pembayaran yang sesuai filter.',
  // Formulir
  tanggal: 'Tanggal',
  keterangan: 'Keterangan',
  caraBayar: 'Cara Bayar',
  kasBank: 'Kas / Bank',
  nominal: 'Nominal',
  bagiOtomatis: 'Bagi otomatis ke faktur terlama',
  rincianFaktur: 'Rincian Faktur',
  kolomTotalFaktur: 'Total Faktur',
  kolomSisaFaktur: 'Sisa Faktur',
  kolomPembayaran: 'Pembayaran',
  totalBayar: 'Total Bayar',
  bayarKosong: 'Pilih pihak yang akan dibayar untuk menampilkan fakturnya.',
  bayarTerkunci: 'Pembayaran yang sudah tercatat tidak dapat diubah.',
  rincianTidakTercatat: 'Rincian faktur tidak tercatat untuk pembayaran contoh ini.',
  tersimpan: 'Pembayaran {nomor} sebesar {nilai} tercatat.',
  isiPihak: 'Pilih pihak yang dibayar.',
  isiTanggal: 'Isi tanggal pembayaran.',
  isiNominal: 'Isi pembayaran minimal pada satu faktur.',
  lebihSisa: 'Pembayaran faktur {faktur} melebihi sisa tagihan.',
  tidakBerhak: 'Anda tidak berhak mencatat pembayaran.',
  kuitansiNomor: 'No. Pembayaran: {nomor}',
  kuitansiDraf: 'Draf, belum tersimpan',
  sudahTerimaDari: 'Sudah diterima dari',
  sudahBayarKepada: 'Sudah dibayarkan kepada',
  uangSejumlah: 'Uang sejumlah',
  untukPembayaranLabel: 'Untuk pembayaran',
  cetakKuitansi: 'Cetak',
  tutup: 'Tutup',
  ttdPenerima: 'Penerima',
  ttdPetugas: 'Petugas',
  laporanPenagihan: 'Laporan Penagihan',
  laporanPembayaran: 'Laporan Pembayaran',
  laporanTanggal: 'Tanggal cetak: {tanggal}',
  laporanKosong: 'Tidak ada faktur bertanda.',
  laporanTotal: 'Total yang ditagih',
  laporanPembayaranTotal: 'Total yang dibayar',
} as const;

export type DebtKey = keyof typeof DEBT_TEXT;

export function debt(key: DebtKey, values: Readonly<Record<string, string>> = {}): string {
  return Object.entries(values).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    DEBT_TEXT[key],
  );
}
