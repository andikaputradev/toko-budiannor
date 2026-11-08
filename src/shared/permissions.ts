import type { Role } from './data/types';

export type Access = 'ya' | 'tidak' | 'otorisasi';

export interface PermissionRule {
  readonly screen: string;
  readonly action: string;
  readonly owner: Access;
  readonly supervisor: Access;
  readonly kasir: Access;
  readonly sales: Access;
}

export const PERMISSION_ROWS: readonly (readonly [string, string, string])[] = [
  ['POS-01', 'Kartu kasir', 'YYY'],
  ['POS-01', 'Angka 0 sampai 9', 'YYY'],
  ['POS-01', 'Hapus', 'YYY'],
  ['POS-01', 'Masuk', 'YYY'],
  ['POS-02', 'Kartu produk (ketuk)', 'YYY'],
  ['POS-02', 'Kartu produk (tahan 0,5 detik)', 'YYY'],
  ['POS-02', 'Baris item (ketuk)', 'YYY'],
  ['POS-02', 'Cari', 'YYY'],
  ['POS-02', 'Ganti, Pelanggan, Pelanggan Baru', 'YYY'],
  ['POS-02', 'Tahan Bill', 'YYY'],
  ['POS-02', 'Panggil Bill', 'YYY'],
  ['POS-02', 'Bayar', 'YYY'],
  ['POS-03', 'Pilihan satuan', 'YYY'],
  ['POS-03', 'Papan angka', 'YYY'],
  ['POS-03', 'Batal', 'YYY'],
  ['POS-03', 'Tambahkan ke Bill (mode ubah: Simpan Perubahan)', 'YYY'],
  ['POS-03', 'Hapus Item (mode ubah)', 'YYY'],
  ['POS-03', 'Diskon', 'YYA'],
  ['POS-03', 'Ubah Harga', 'YYA'],
  ['POS-03', 'Catatan', 'YYY'],
  ['POS-03', 'Tenaga Penjual', 'YYY'],
  ['POS-03', 'Cek Stok', 'YYY'],
  ['POS-04', 'Tunai, QRIS, Transfer, DP, Piutang', 'YYY'],
  ['POS-04', 'Uang Pas dan nominal cepat', 'YYY'],
  ['POS-04', 'Kembali', 'YYY'],
  ['POS-04', 'Selesaikan dan Cetak Struk', 'YYY'],
  ['POS-04', 'Minta Otorisasi Owner atau Ganti Cara Bayar (state limit)', 'YYY'],
  ['POS-05', 'Cetak Struk Draf', 'YYY'],
  ['POS-05', 'Panggil Bill', 'YYY'],
  ['POS-05', 'Hapus Bill', 'YYT'],
  ['POS-05', 'Ubah', 'YYY'],
  ['POS-05', 'Split Bill', 'YYY'],
  ['POS-05', 'Merge Bill', 'YYY'],
  ['POS-05', 'Kembali ke Jual', 'YYY'],
  ['POS-06', 'Cetak Ulang Struk', 'YYY'],
  ['POS-06', 'Ajukan Koreksi', 'TYT'],
  ['POS-06', 'Filter dan pencarian', 'YYY'],
  ['POS-07', 'Jenis biaya', 'YYY'],
  ['POS-07', 'Simpan Biaya', 'YYY'],
  ['POS-07', 'Batal', 'YYY'],
  ['POS-08', 'Kategori harga', 'YYY'],
  ['POS-08', 'Simpan Pelanggan', 'YYY'],
  ['POS-08', 'Batal', 'YYY'],
  ['POS-09', 'Sinkronkan Sekarang', 'YYY'],
  ['POS-09', 'Kembali ke Jual', 'YYY'],
  ['POS-10', 'Setujui', 'YYY'],
  ['POS-10', 'Batal', 'YYY'],
  ['BO-01', 'Tampilkan', 'YYY'],
  ['BO-01', 'Masuk', 'YYT'],
  ['BO-02', 'Lihat Semua Stok', 'YYT'],
  ['BO-02', 'Kartu piutang jatuh tempo', 'YYT'],
  ['BO-02', 'Strip stok negatif', 'YYT'],
  ['BO-03', 'Cari', 'YYT'],
  ['BO-03', 'Tambah Barang', 'YYT'],
  ['BO-03', 'Impor Excel', 'YYT'],
  ['BO-03', 'Simpan Barang', 'YYT'],
  ['BO-03', 'Nonaktifkan Barang', 'YTT'],
  ['BO-04', 'Tambah Satuan', 'YTT'],
  ['BO-04', 'Simpan Harga', 'YTT'],
  ['BO-04', 'Batal', 'YYT'],
  ['BO-05', 'Chip gudang', 'YYT'],
  ['BO-05', 'Di bawah minimum', 'YYT'],
  ['BO-05', 'Mutasi Stok', 'YYT'],
  ['BO-05', 'Ekspor PDF', 'YYT'],
  ['BO-05', 'Ekspor Excel', 'YYT'],
  ['BO-05', 'Tandai Sudah Ditinjau (pada baris negatif)', 'YYT'],
  ['BO-06', 'Hapus (baris)', 'YYT'],
  ['BO-06', 'Simpan Mutasi', 'YYT'],
  ['BO-06', 'Batal', 'YYT'],
  ['BO-07', 'Simpan Draf Opname', 'YYT'],
  ['BO-07', 'Terapkan Penyesuaian Stok', 'YYT'],
  ['BO-08', 'Buat PO', 'YYT'],
  ['BO-08', 'Terima Barang', 'YYT'],
  ['BO-08', 'Cetak PO', 'YYT'],
  ['BO-08', 'Tab Pemasok: Tambah Pemasok', 'YYT'],
  ['BO-09', 'Cetak Ulang Invoice', 'YYT'],
  ['BO-09', 'Buat Surat Jalan', 'YYT'],
  ['BO-09', 'Koreksi Transaksi (Otorisasi Owner)', 'YAT'],
  ['BO-09', 'Hapus Transaksi', 'TTT'],
  ['BO-10', 'Cari', 'YYT'],
  ['BO-10', 'Simpan Retur', 'YYY'],
  ['BO-10', 'Batal', 'YYT'],
  ['BO-11', 'Tambah Pelanggan', 'YYT'],
  ['BO-11', 'Catat Pembayaran Piutang', 'YYT'],
  ['BO-11', 'Ubah Limit', 'YTT'],
  ['BO-11', 'Ekspor PDF', 'YYT'],
  ['BO-12', 'Muat', 'YYT'],
  ['BO-12', 'Pilih Semua ke Koli 1', 'YYT'],
  ['BO-12', 'Tambah Koli', 'YYT'],
  ['BO-12', 'Simpan', 'YYT'],
  ['BO-12', 'Cetak Packing List Koli', 'YYT'],
  ['BO-12', 'Cetak Surat Jalan', 'YYT'],
  ['BO-13', 'Label Barcode, Label Harga Rak', 'YYT'],
  ['BO-13', 'Pilih (kotak centang)', 'YYT'],
  ['BO-13', 'Cetak Label', 'YYT'],
  ['BO-14', 'Tambah Aturan', 'YTT'],
  ['BO-14', 'Persen, Nominal tetap', 'YTT'],
  ['BO-14', 'Simpan Aturan', 'YTT'],
  ['BO-14', 'Ekspor PDF, Ekspor Excel (tab Laporan)', 'YYT'],
  ['BO-15', 'Unduh Templat Excel', 'YYT'],
  ['BO-15', 'Pilih Berkas', 'YYT'],
  ['BO-15', 'Mulai Impor', 'YYT'],
  ['BO-15', 'Batal', 'YYT'],
  ['BO-16', 'Pilih laporan', 'YYT'],
  ['BO-16', 'Tampilkan', 'YYT'],
  ['BO-16', 'Ekspor PDF', 'YYT'],
  ['BO-16', 'Ekspor Excel', 'YYT'],
  ['BO-17', 'Tab laporan', 'YTT'],
  ['BO-17', 'Pemilih periode', 'YTT'],
  ['BO-17', 'Ekspor PDF', 'YTT'],
  ['BO-17', 'Ekspor Excel', 'YTT'],
  ['BO-18', 'Tampilkan', 'YYT'],
  ['BO-18', 'Ekspor PDF', 'YYT'],
  ['BO-18', 'Ekspor Excel', 'YYT'],
  ['BO-19', 'Simpan Beban', 'YYT'],
  ['BO-19', 'Ekspor PDF, Ekspor Excel', 'YYT'],
  ['BO-20', 'Tambah Pengguna', 'YTT'],
  ['BO-20', 'Simpan', 'YTT'],
  ['BO-20', 'Nonaktifkan', 'YTT'],
  ['BO-21', 'Tampilkan', 'YYT'],
  ['BO-21', 'Ekspor PDF, Ekspor Excel', 'YYT'],
  ['BO-22', 'Menu Toko, Gudang', 'YTT'],
  ['BO-22', 'USB atau LAN', 'YTT'],
  ['BO-22', 'Cetak Halaman Uji', 'YYT'],
  ['BO-22', 'Simpan', 'YTT'],
  ['OWN-01', 'Tampilkan', 'YTT'],
  ['OWN-01', 'Masuk', 'YTT'],
  ['OWN-02', 'Chip periode', 'YTT'],
  ['OWN-02', 'Tarik ke bawah', 'YTT'],
  ['OWN-02', 'Batang grafik', 'YTT'],
  ['OWN-02', 'Bilah bawah', 'YTT'],
  ['OWN-03', 'Cari', 'YTT'],
  ['OWN-03', 'Chip', 'YTT'],
  ['OWN-04', 'Segmen', 'YTT'],
  ['OWN-04', 'Chip periode', 'YTT'],
  ['OWN-05', 'Kartu pelanggan', 'YTT'],
  ['OWN-03', 'Buat Mutasi', 'YTT'],
  ['OWN-03', 'Buat PO', 'YTT'],
  ['OWN-05', 'Catat Bayar Piutang', 'YTT'],
  ['OWN-05', 'Kirim Tagihan WA (PDF)', 'YTT'],
  ['OWN-05', 'Hubungi Pelanggan', 'YTT'],
  ['OWN-06', 'Buat SO', 'YTT'],
  ['OWN-06', 'Buat PO', 'YTT'],
  ['OWN-06', 'Setujui', 'YTT'],
  ['OWN-06', 'Tolak', 'YTT'],
  ['OWN-06', 'Notifikasi', 'YTT'],
  ['SALES-01', 'Tampilkan', 'TTTY'],
  ['SALES-01', 'Masuk', 'TTTY'],
  ['SALES-02', 'Cari', 'TTTY'],
  ['SALES-02', 'Chip gudang', 'TTTY'],
  ['SALES-02', 'Tier harga', 'TTTY'],
  ['SALES-02', 'Tambah ke Order', 'TTTY'],
  ['SALES-03', 'Simpan Sales Order', 'TTTY'],
  ['SALES-04', 'Minta Persetujuan Owner', 'TTTY'],
  ['SALES-05', 'Kirim Salinan SO (PDF) via WA', 'TTTY'],
  ['SALES-05', 'Cetak Bluetooth (simulasi)', 'TTTY'],
];

const CODES: Readonly<Record<string, Access>> = { Y: 'ya', T: 'tidak', A: 'otorisasi' };

function decode(code: string | undefined): Access {
  return CODES[code ?? 'T'] ?? 'tidak';
}

export const PERMISSION_RULES: readonly PermissionRule[] = PERMISSION_ROWS.map(
  ([screen, action, codes]) => ({
    screen,
    action,
    owner: decode(codes[0]),
    supervisor: decode(codes[1]),
    kasir: decode(codes[2]),
    sales: decode(codes[3]),
  }),
);

const SCREEN_ROLES: readonly (readonly [string, string])[] = [
  ['POS-01', 'OSKF'],
  ['POS-02', 'OSKF'],
  ['POS-03', 'OSKF'],
  ['POS-04', 'OSK'],
  ['POS-05', 'OSKF'],
  ['POS-06', 'OSK'],
  ['POS-07', 'OSK'],
  ['POS-08', 'OSK'],
  ['POS-09', 'OSK'],
  ['POS-10', 'OSK'],
  ['BO-01', 'OS'],
  ['BO-02', 'OS'],
  ['BO-03', 'OS'],
  ['BO-04', 'OS'],
  ['BO-05', 'OS'],
  ['BO-06', 'OS'],
  ['BO-07', 'OS'],
  ['BO-08', 'OS'],
  ['BO-09', 'OS'],
  ['BO-10', 'OS'],
  ['BO-11', 'OS'],
  ['BO-12', 'OS'],
  ['BO-13', 'OS'],
  ['BO-14', 'OS'],
  ['BO-15', 'OS'],
  ['BO-16', 'OS'],
  ['BO-17', 'O'],
  ['BO-18', 'OS'],
  ['BO-19', 'OS'],
  ['BO-20', 'O'],
  ['BO-21', 'OS'],
  ['BO-22', 'OS'],
  ['OWN-01', 'O'],
  ['OWN-02', 'O'],
  ['OWN-03', 'O'],
  ['OWN-04', 'O'],
  ['OWN-05', 'O'],
  ['OWN-06', 'O'],
  ['SALES-01', 'L'],
  ['SALES-02', 'L'],
  ['SALES-03', 'L'],
  ['SALES-04', 'L'],
  ['SALES-05', 'L'],
];

const ROLE_LETTER: Readonly<Record<Role, string>> = {
  owner: 'O',
  supervisor: 'S',
  kasir: 'K',
  frontliner: 'F',
  sales: 'L',
};

const FRONTLINER_SCREENS = new Set(['POS-01', 'POS-02', 'POS-03', 'POS-05']);
const FRONTLINER_DENIED = new Set([
  'POS-02|Bayar',
  'POS-05|Hapus Bill',
  'POS-03|Diskon',
  'POS-03|Ubah Harga',
]);

export const SCREEN_IDS: readonly string[] = SCREEN_ROLES.map(([screen]) => screen);

export function canOpenScreen(role: Role, screen: string): boolean {
  const entry = SCREEN_ROLES.find(([id]) => id === screen);
  return entry?.[1].includes(ROLE_LETTER[role]) === true;
}

export function screensFor(role: Role): string[] {
  return SCREEN_IDS.filter((screen) => canOpenScreen(role, screen));
}

export function actionsOf(screen: string): readonly string[] {
  return PERMISSION_RULES.filter((rule) => rule.screen === screen).map((rule) => rule.action);
}

export function accessFor(role: Role, screen: string, action: string): Access {
  const rule = PERMISSION_RULES.find((item) => item.screen === screen && item.action === action);
  if (rule === undefined) {
    return 'tidak';
  }
  if (role === 'frontliner') {
    const allowed = FRONTLINER_SCREENS.has(screen) && !FRONTLINER_DENIED.has(`${screen}|${action}`);
    return allowed ? 'ya' : 'tidak';
  }
  return rule[role];
}

export function isAllowed(role: Role, screen: string, action: string): boolean {
  return accessFor(role, screen, action) === 'ya';
}

export function needsOwnerAuthorization(role: Role, screen: string, action: string): boolean {
  return accessFor(role, screen, action) === 'otorisasi';
}
