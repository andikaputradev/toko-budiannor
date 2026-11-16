import type { OrderKind, OrderRow } from './order-list';

// Baris contoh Daftar PO dan SO sesuai gambar klien (Contoh Daftar PO Atau SO). Hanya tampilan:
// toko data (state.purchaseOrders, state.salesOrders) dibaca aplikasi Owner dan Sales dan banyak tes
// mengandalkannya kosong pada sesi baru, jadi baris ini tidak masuk ke sana dan nomornya tidak
// dapat dibuka. Pesanan yang dibuat pengguna tampil bersama baris contoh ini.
function row(
  kind: OrderKind,
  number: string,
  date: string,
  partyName: string,
  notes: string,
  status: OrderRow['status'],
  total: number,
): OrderRow {
  return { demo: true, kind, number, date, partyName, notes, status, total, createdBy: '' };
}

export const DEMO_PO_ROWS: readonly OrderRow[] = [
  row('po', 'PO26101234', '2026-10-25', 'PT Demokrat Jaya Selalu', '', 'on-proses', 2_450_000),
  row(
    'po',
    'PO26101233',
    '2026-10-25',
    'CV Gerakan Indonesia Raya',
    'Urgen Ditunggu Developer',
    'on-proses',
    850_000,
  ),
  row('po', 'PO26101231', '2026-10-25', 'Toko Sejahtera Adil Makmur', '', 'partial', 125_000),
  row(
    'po',
    'PO26100131',
    '2026-10-19',
    'PT Astra International',
    'Pre Order 2 Minggu',
    'partial',
    7_313_400,
  ),
  row('po', 'PO26100132', '2026-10-19', 'Toko ABC', '', 'selesai', 4_357_300),
  row('po', 'PO26100133', '2026-10-19', 'PT Demokrat Jaya Selalu', '', 'selesai', 2_799_000),
];

export const DEMO_SO_ROWS: readonly OrderRow[] = [
  row(
    'so',
    'SO26101234',
    '2026-10-25',
    'Bu Sherly Tjoandra',
    'Barang Besok Diambil',
    'on-proses',
    2_450_000,
  ),
  row('so', 'SO26101233', '2026-10-25', 'Toko Arif', 'Kirim Via Jne Cargo', 'on-proses', 850_000),
  row('so', 'SO26101231', '2026-10-25', 'Pelanggan Umum', '', 'selesai', 125_000),
  row('so', 'SO26100131', '2026-10-19', 'UD Tiga Saudara', '', 'on-proses', 7_313_400),
  row('so', 'SO26100132', '2026-10-19', 'Bu Wati', 'Hubungi Tukang Ari', 'selesai', 4_357_300),
  row('so', 'SO26100133', '2026-10-19', 'Pelanggan Umum', '', 'selesai', 2_799_000),
];
