import { wibDate } from '../../../shared/data/receivable';
import type { Dataset } from '../../../shared/data/types';

export type TransactionType = 'penjualan' | 'pembelian';
export type TransactionStatus = 'lunas' | 'belum-lunas' | 'jatuh-tempo';

export interface TransactionRow {
  readonly type: TransactionType;
  readonly number: string;
  readonly date: string;
  readonly partyName: string;
  readonly paymentTerms: string;
  readonly status: TransactionStatus;
  readonly ageDays: number;
  readonly total: number;
  // No. SO untuk penjualan dan No. PO untuk pembelian; kosong bila nota tidak berasal dari pesanan.
  readonly refNumber: string;
  readonly user: string;
  readonly notes: string;
  readonly rawObject?: unknown;
}

export interface TransactionFilterOptions {
  readonly type: 'semua' | TransactionType;
  readonly status: 'semua' | TransactionStatus;
  readonly query: string;
  readonly party?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export type DateRangeKind = 'semua' | 'hari-ini' | 'tujuh-hari' | 'bulan-ini';

export function calculateTransactionAgeDays(
  txDateIso: string,
  referenceDateIso: string = new Date().toISOString(),
): number {
  const d1 = new Date(txDateIso.slice(0, 10)).getTime();
  const d2 = new Date(referenceDateIso.slice(0, 10)).getTime();
  const diffMs = d2 - d1;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function filterTransactions(
  rows: readonly TransactionRow[],
  options: TransactionFilterOptions,
): readonly TransactionRow[] {
  const q = options.query.trim().toLowerCase();
  const party = options.party ?? '';
  return rows.filter((r) => {
    if (options.type !== 'semua' && r.type !== options.type) {
      return false;
    }
    if (options.status !== 'semua' && r.status !== options.status) {
      return false;
    }
    if (party !== '' && r.partyName !== party) {
      return false;
    }
    if (options.startDate && r.date < options.startDate) {
      return false;
    }
    if (options.endDate && r.date > options.endDate) {
      return false;
    }
    if (q) {
      const matchNum = r.number.toLowerCase().includes(q);
      const matchRef = r.refNumber.toLowerCase().includes(q);
      const matchParty = r.partyName.toLowerCase().includes(q);
      const matchTerms = r.paymentTerms.toLowerCase().includes(q);
      if (!matchNum && !matchRef && !matchParty && !matchTerms) {
        return false;
      }
    }
    return true;
  });
}

export function computeTransactionMetrics(rows: readonly TransactionRow[]): {
  totalNilai: number;
  totalBelumLunas: number;
  totalJatuhTempo: number;
} {
  let totalNilai = 0;
  let totalBelumLunas = 0;
  let totalJatuhTempo = 0;

  for (const r of rows) {
    totalNilai += r.total;
    if (r.status === 'belum-lunas') {
      totalBelumLunas += r.total;
    } else if (r.status === 'jatuh-tempo') {
      totalBelumLunas += r.total;
      totalJatuhTempo += r.total;
    }
  }

  return {
    totalNilai,
    totalBelumLunas,
    totalJatuhTempo,
  };
}

// "Jumlah Transaksi Hari Ini" dan "Total Transaksi Hari Ini" pada kartu daftar (gambar klien 8).
export function countToday(
  rows: readonly TransactionRow[],
  today: string,
): { readonly count: number; readonly total: number } {
  const todays = rows.filter((row) => row.date === today);
  return { count: todays.length, total: todays.reduce((sum, row) => sum + row.total, 0) };
}

// Pilihan filter Tanggal dihitung dari hari ini (tanggal WIB berformat YYYY-MM-DD).
export function dateRangeFor(
  kind: DateRangeKind,
  today: string,
): { readonly startDate?: string; readonly endDate?: string } {
  if (kind === 'semua') {
    return {};
  }
  const start = new Date(`${today}T00:00:00Z`);
  if (kind === 'tujuh-hari') {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (kind === 'bulan-ini') {
    start.setUTCDate(1);
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: today };
}

// Nama pelanggan atau pemasok yang muncul pada daftar, untuk pilihan filter.
export function partyNames(rows: readonly TransactionRow[], type: TransactionType): string[] {
  return [...new Set(rows.filter((row) => row.type === type).map((row) => row.partyName))].sort(
    (first, second) => first.localeCompare(second),
  );
}

const BUYERS = ['Rizal', 'Dewi', 'Haris'] as const;

// Baris daftar nota: penjualan POS dan draf proposal, serta pembelian dari data pemasok.
export function buildTransactionRows(dataset: Dataset): TransactionRow[] {
  const today = dataset.referenceDate.slice(0, 10);
  const rows: TransactionRow[] = [];
  const staffName = (id: string): string =>
    dataset.users.find((user) => user.id === id)?.name ?? id;

  dataset.sales.forEach((sale, idx) => {
    const customer = dataset.customers.find((item) => item.id === sale.customerId);
    const isPaid = sale.paid >= sale.total;
    const date = wibDate(new Date(sale.createdAt));
    const age = calculateTransactionAgeDays(date, today);
    let status: TransactionStatus = 'lunas';
    if (!isPaid) {
      status = age > 30 ? 'jatuh-tempo' : 'belum-lunas';
    }
    rows.push({
      type: 'penjualan',
      number: sale.number !== '' ? sale.number : `FJ2610${String(1200 + idx)}`,
      date,
      partyName: customer?.name ?? 'Pelanggan Umum',
      paymentTerms: sale.payment === 'piutang' ? 'Piutang (30 Hari)' : 'Tunai',
      status,
      ageDays: age,
      total: sale.total,
      refNumber: '',
      user: staffName(sale.cashierId),
      notes: '',
      rawObject: sale,
    });
  });

  // Draf proposal contoh klien (FJ26101234 dan seterusnya, sesuai gambar 8).
  rows.push(
    {
      type: 'penjualan',
      number: 'FJ26101234',
      date: '2026-10-25',
      partyName: 'Bu Sherly Tjoandra',
      paymentTerms: 'Piutang (30 Hari)',
      status: 'belum-lunas',
      ageDays: 0,
      total: 2_450_000,
      refNumber: '26101234',
      user: 'Rizal',
      notes: 'Barang Besok Diambil',
    },
    {
      type: 'penjualan',
      number: 'FJ26101233',
      date: '2026-10-25',
      partyName: 'Toko Arif',
      paymentTerms: 'Piutang (30 Hari)',
      status: 'belum-lunas',
      ageDays: 0,
      total: 850_000,
      refNumber: '',
      user: 'Dewi',
      notes: 'Kirim Via Jne Cargo',
    },
    {
      type: 'penjualan',
      number: 'FJ26101232',
      date: '2026-10-18',
      partyName: 'Pak Samsul',
      paymentTerms: 'Piutang (7 Hari)',
      status: 'jatuh-tempo',
      ageDays: 7,
      total: 3_000_000,
      refNumber: '',
      user: 'Haris',
      notes: 'Hubungi Tukang Ari',
    },
    {
      type: 'penjualan',
      number: 'FJ26101231',
      date: '2026-10-25',
      partyName: 'Pelanggan Umum',
      paymentTerms: 'Tunai',
      status: 'lunas',
      ageDays: 0,
      total: 125_000,
      refNumber: '26101231',
      user: 'Rizal',
      notes: '',
    },
  );

  dataset.suppliers.forEach((supplier, idx) => {
    const hasDebt = supplier.payable > 0;
    const number = `FB2610${String(2000 + idx)}`;
    rows.push({
      type: 'pembelian',
      number,
      date: '2026-10-20',
      partyName: supplier.name,
      paymentTerms: hasDebt ? 'Hutang (30 Hari)' : 'Tunai',
      status: hasDebt ? 'belum-lunas' : 'lunas',
      ageDays: 5,
      total: hasDebt ? supplier.payable : 2_500_000,
      refNumber: `PO${number.slice(2)}`,
      user: BUYERS[idx % BUYERS.length] ?? 'Rizal',
      notes: '',
    });
  });

  rows.push(
    {
      type: 'pembelian',
      number: 'FB26101234',
      date: '2026-10-25',
      partyName: 'PT Sejati Raya',
      paymentTerms: 'Hutang (30 Hari)',
      status: 'belum-lunas',
      ageDays: 0,
      total: 1_890_000,
      refNumber: 'PO26101234',
      user: 'Rizal',
      notes: 'Pre Order 2 Minggu',
    },
    {
      type: 'pembelian',
      number: 'FB26101210',
      date: '2026-09-20',
      partyName: 'PT Tiga Roda Semen',
      paymentTerms: 'Hutang (30 Hari)',
      status: 'jatuh-tempo',
      ageDays: 35,
      total: 8_200_000,
      refNumber: 'PO26101210',
      user: 'Dewi',
      notes: 'Urgen Ditunggu Developer',
    },
  );

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
