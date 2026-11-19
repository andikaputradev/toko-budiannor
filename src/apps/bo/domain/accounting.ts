import { matchesPhrase } from '../../../shared/data/search-index';
import type { Dataset } from '../../../shared/data/types';

export interface JournalRow {
  readonly id: string;
  readonly date: string;
  readonly source: string;
  readonly debitAccount: string;
  readonly creditAccount: string;
  readonly amount: number;
  readonly status: 'terposting' | 'review';
  readonly warehouse?: string;
}

export interface OperatingExpenseItem {
  readonly id: string;
  readonly date: string;
  readonly category: string;
  readonly description: string;
  readonly amount: number;
  readonly paidFrom: string;
  readonly status: 'terjurnal' | 'draf';
}

export interface CashFlowStatement {
  readonly periodLabel: string;
  readonly initialCash: number;
  readonly operatingInflows: { readonly label: string; readonly amount: number }[];
  readonly operatingOutflows: { readonly label: string; readonly amount: number }[];
  readonly netOperatingCash: number;
  readonly investingOutflows: { readonly label: string; readonly amount: number }[];
  readonly financingOutflows: { readonly label: string; readonly amount: number }[];
  readonly netCashChange: number;
  readonly endingCash: number;
  readonly cashPositions: {
    readonly account: string;
    readonly amount: number;
    readonly percent: number;
    readonly barColor: string;
  }[];
}

export interface ProfitLossStatement {
  readonly periodLabel: string;
  readonly revenue: {
    readonly netSales: number;
    readonly cogs: number;
    readonly grossProfit: number;
    readonly grossMarginPercent: number;
  };
  readonly expenses: {
    readonly items: { readonly category: string; readonly amount: number }[];
    readonly totalExpense: number;
    readonly expensePercentFromSales: number;
  };
  readonly netProfit: number;
  readonly netProfitPercentFromSales: number;
}

export interface BalanceSheetStatement {
  readonly asOfDate: string;
  readonly currentAssets: { readonly label: string; readonly amount: number }[];
  readonly totalCurrentAssets: number;
  readonly fixedAssets: { readonly label: string; readonly amount: number }[];
  readonly totalFixedAssets: number;
  readonly totalAssets: number;
  readonly liabilities: { readonly label: string; readonly amount: number }[];
  readonly totalLiabilities: number;
  readonly equity: { readonly label: string; readonly amount: number }[];
  readonly totalEquity: number;
  readonly totalLiabilitiesAndEquity: number;
  readonly isBalanced: boolean;
}

// Data Acuan Awal Sesuai Proposal & Ilustrasi Visual
export const DEFAULT_JOURNAL_ENTRIES: readonly JournalRow[] = [
  {
    id: 'JU-2610-0318',
    date: '2026-10-19',
    source: 'Penjualan tunai POS',
    debitAccount: 'Kas',
    creditAccount: 'Penjualan',
    amount: 14_250_000,
    status: 'terposting',
    warehouse: 'Toko',
  },
  {
    id: 'JU-2610-0317',
    date: '2026-10-19',
    source: 'Penjualan kredit INV-2610-0211',
    debitAccount: 'Piutang Usaha',
    creditAccount: 'Penjualan',
    amount: 4_200_000,
    status: 'terposting',
    warehouse: 'Gudang',
  },
  {
    id: 'JU-2610-0316',
    date: '2026-10-19',
    source: 'HPP penjualan (HPP Average)',
    debitAccount: 'HPP',
    creditAccount: 'Persediaan',
    amount: 12_880_000,
    status: 'terposting',
    warehouse: 'Toko',
  },
  {
    id: 'JU-2610-0315',
    date: '2026-10-18',
    source: 'Pelunasan piutang pelanggan',
    debitAccount: 'Kas',
    creditAccount: 'Piutang Usaha',
    amount: 3_500_000,
    status: 'terposting',
  },
  {
    id: 'JU-2610-0314',
    date: '2026-10-17',
    source: 'Pembelian PO-2610-0042',
    debitAccount: 'Persediaan',
    creditAccount: 'Utang Usaha',
    amount: 45_018_548,
    status: 'terposting',
    warehouse: 'Gudang',
  },
  {
    id: 'JU-2610-0313',
    date: '2026-10-17',
    source: 'Beban transportasi pengiriman',
    debitAccount: 'Beban Transportasi',
    creditAccount: 'Kas',
    amount: 850_000,
    status: 'terposting',
  },
  {
    id: 'JU-2610-0312',
    date: '2026-10-16',
    source: 'Bayar utang supplier',
    debitAccount: 'Utang Usaha',
    creditAccount: 'Bank',
    amount: 20_000_000,
    status: 'terposting',
  },
  {
    id: 'JU-2610-0311',
    date: '2026-10-15',
    source: 'Retur penjualan INV-2610-0188',
    debitAccount: 'Retur Penjualan',
    creditAccount: 'Kas',
    amount: 475_000,
    status: 'review',
    warehouse: 'Toko',
  },
];

export const DEFAULT_EXPENSE_ITEMS: readonly OperatingExpenseItem[] = [
  {
    id: 'BBN-01',
    date: '2026-10-19',
    category: 'Gaji dan Komisi',
    description: 'Komisi sales minggu ke-3',
    amount: 2_150_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
  {
    id: 'BBN-02',
    date: '2026-10-18',
    category: 'Listrik dan Internet',
    description: 'Listrik toko dan gudang Okt',
    amount: 3_200_000,
    paidFrom: 'Bank',
    status: 'terjurnal',
  },
  {
    id: 'BBN-03',
    date: '2026-10-17',
    category: 'Transportasi Angkutan',
    description: 'Bensin dan sewa truk kirim',
    amount: 850_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
  {
    id: 'BBN-04',
    date: '2026-10-15',
    category: 'Beban Lain Lain',
    description: 'ATK dan kantong plastik',
    amount: 420_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
  {
    id: 'BBN-05',
    date: '2026-10-10',
    category: 'Gaji dan Komisi',
    description: 'Gaji karyawan (6 orang)',
    amount: 24_000_000,
    paidFrom: 'Bank',
    status: 'terjurnal',
  },
  {
    id: 'BBN-06',
    date: '2026-10-01',
    category: 'Sewa Toko',
    description: 'Sewa ruko dan gudang',
    amount: 9_600_000,
    paidFrom: 'Bank',
    status: 'terjurnal',
  },
  {
    id: 'BBN-07',
    date: '2026-10-14',
    category: 'Gaji dan Komisi',
    description: 'Komisi sales minggu ke-1 & ke-2',
    amount: 5_250_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
  {
    id: 'BBN-08',
    date: '2026-10-12',
    category: 'Transportasi Angkutan',
    description: 'Biaya ekspedisi armada pengiriman',
    amount: 5_400_000,
    paidFrom: 'Bank',
    status: 'terjurnal',
  },
  {
    id: 'BBN-09',
    date: '2026-10-08',
    category: 'Beban Lain Lain',
    description: 'Pemeliharaan etalase dan perlengkapan',
    amount: 630_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
  {
    id: 'BBN-10',
    date: '2026-10-16',
    category: 'Katering Makan',
    description: 'Katering makan karyawan minggu ke-2',
    amount: 1_100_000,
    paidFrom: 'Kas',
    status: 'terjurnal',
  },
];

/**
 * Mengambil daftar jurnal otomatis yang difilter
 */
export function getFilteredJournalEntries(
  entries: readonly JournalRow[],
  filter: {
    source?: string;
    status?: string;
    warehouse?: string;
    searchQuery?: string;
  } = {},
): readonly JournalRow[] {
  return entries.filter((row) => {
    if (
      filter.source &&
      filter.source !== 'semua' &&
      !row.source.toLowerCase().includes(filter.source.toLowerCase())
    ) {
      return false;
    }
    if (filter.status && filter.status !== 'semua' && row.status !== filter.status) {
      return false;
    }
    if (
      filter.warehouse &&
      filter.warehouse !== 'semua' &&
      row.warehouse &&
      !row.warehouse.toLowerCase().includes(filter.warehouse.toLowerCase())
    ) {
      return false;
    }
    if (filter.searchQuery) {
      const match = matchesPhrase(
        `${row.id} ${row.source} ${row.debitAccount} ${row.creditAccount}`,
        filter.searchQuery,
      );
      if (!match) return false;
    }
    return true;
  });
}

/**
 * Menghitung total debit/kredit dari daftar jurnal
 */
export function calculateJournalTotal(entries: readonly JournalRow[]): number {
  return entries.reduce((sum, r) => sum + r.amount, 0);
}

/**
 * Ringkasan beban operasional per kategori
 */
// Enam kategori beban usaha (gambar klien 25 dan 26), berurutan seperti pada gambar.
export const EXPENSE_CATEGORIES: readonly string[] = [
  'Gaji dan Komisi',
  'Transportasi Angkutan',
  'Katering Makan',
  'Listrik dan Internet',
  'Sewa Toko',
  'Beban Lain Lain',
];

export interface ExpenseCategorySummary {
  readonly totalBeban: number;
  readonly persenDariPenjualan: number;
  // Jumlah dan porsi (persen dari total beban) per kategori, urut EXPENSE_CATEGORIES.
  readonly categories: readonly {
    readonly name: string;
    readonly amount: number;
    readonly percent: number;
  }[];
}

export function calculateExpenseSummary(
  expenses: readonly OperatingExpenseItem[],
  totalSales = 412_600_000,
): ExpenseCategorySummary {
  const totals = new Map<string, number>(EXPENSE_CATEGORIES.map((name) => [name, 0]));
  let totalBeban = 0;
  for (const item of expenses) {
    totalBeban += item.amount;
    // Kategori di luar daftar (data lama) dihitung sebagai Beban Lain Lain.
    const name = totals.has(item.category) ? item.category : 'Beban Lain Lain';
    totals.set(name, (totals.get(name) ?? 0) + item.amount);
  }
  const persenDariPenjualan = totalSales > 0 ? (totalBeban / totalSales) * 100 : 0;
  return {
    totalBeban,
    persenDariPenjualan: Math.round(persenDariPenjualan * 10) / 10,
    categories: EXPENSE_CATEGORIES.map((name) => {
      const amount = totals.get(name) ?? 0;
      return {
        name,
        amount,
        percent: totalBeban > 0 ? Math.round((amount / totalBeban) * 1000) / 10 : 0,
      };
    }),
  };
}

/**
 * Menghasilkan Laporan Arus Kas Langsung
 */
export function generateCashFlowStatement(
  expenses: readonly OperatingExpenseItem[] = DEFAULT_EXPENSE_ITEMS,
): CashFlowStatement {
  const initialCash = 195_050_000;
  const penerimaanPelanggan = 389_750_000;
  const pembayaranSupplier = 234_300_000;
  const totalBeban = expenses.reduce((s, e) => s + e.amount, 0);

  const operatingInflows = [{ label: 'Penerimaan dari pelanggan', amount: penerimaanPelanggan }];
  const operatingOutflows = [
    { label: 'Pembayaran ke supplier', amount: pembayaranSupplier },
    { label: 'Pembayaran beban operasional', amount: totalBeban },
  ];

  const netOperatingCash = penerimaanPelanggan - pembayaranSupplier - totalBeban; // 102.850.000

  const investingOutflows = [{ label: 'Pembelian peralatan', amount: 24_500_000 }];
  const financingOutflows = [{ label: 'Penarikan pemilik (prive)', amount: 35_000_000 }];

  const netCashChange = netOperatingCash - 24_500_000 - 35_000_000; // 43.350.000
  const endingCash = initialCash + netCashChange; // 238.400.000

  const bankBcaAmount = 186_000_000;
  const kasTokoAmount = endingCash - bankBcaAmount; // 52.400.000

  const cashPositions = [
    {
      account: 'Bank',
      amount: bankBcaAmount,
      percent: Math.round((bankBcaAmount / endingCash) * 1000) / 10,
      barColor: '#3b82f6',
    },
    {
      account: 'Kas',
      amount: kasTokoAmount,
      percent: Math.round((kasTokoAmount / endingCash) * 1000) / 10,
      barColor: '#f97316',
    },
  ];

  return {
    periodLabel: 'Periode Oktober 2026 - Metode langsung',
    initialCash,
    operatingInflows,
    operatingOutflows,
    netOperatingCash,
    investingOutflows,
    financingOutflows,
    netCashChange,
    endingCash,
    cashPositions,
  };
}

/**
 * Menghasilkan Laporan Laba Rugi
 */
export function generateProfitLossStatement(
  _data?: Dataset,
  expenses: readonly OperatingExpenseItem[] = DEFAULT_EXPENSE_ITEMS,
): ProfitLossStatement {
  const netSales = 412_600_000;
  const cogs = 287_900_000;
  const grossProfit = netSales - cogs; // 124.700.000
  const grossMarginPercent = Math.round((grossProfit / netSales) * 1000) / 10; // 30.2%

  const summary = calculateExpenseSummary(expenses, netSales);

  const expenseItems = summary.categories.map((item) => ({
    category: item.name === 'Gaji dan Komisi' ? 'Gaji dan Komisi Sales' : item.name,
    amount: item.amount,
  }));

  const totalExpense = summary.totalBeban; // 52.600.000
  const netProfit = grossProfit - totalExpense; // 72.100.000
  const netProfitPercentFromSales = Math.round((netProfit / netSales) * 1000) / 10; // 17.5%

  return {
    periodLabel: 'Periode 01/10/2026 s.d. 19/10/2026',
    revenue: {
      netSales,
      cogs,
      grossProfit,
      grossMarginPercent,
    },
    expenses: {
      items: expenseItems,
      totalExpense,
      expensePercentFromSales: summary.persenDariPenjualan,
    },
    netProfit,
    netProfitPercentFromSales,
  };
}

/**
 * Menghasilkan Laporan Neraca Seimbang
 */
export function generateBalanceSheetStatement(
  cashTotal = 238_400_000,
  netProfit = 72_100_000,
): BalanceSheetStatement {
  const piutangUsaha = 86_450_000;
  const persediaanBarang = 1_284_500_000;
  const totalCurrentAssets = cashTotal + piutangUsaha + persediaanBarang; // 1.609.350.000

  const fixedAssets = [{ label: 'Peralatan dan Kendaraan (nilai buku)', amount: 185_000_000 }];
  const totalFixedAssets = 185_000_000;
  const totalAssets = totalCurrentAssets + totalFixedAssets; // 1.794.350.000

  const utangUsaha = 64_200_000;
  const utangLain = 12_150_000;
  const totalLiabilities = utangUsaha + utangLain; // 76.350.000

  const modalPemilik = 1_400_000_000;
  const labaDitahan = 245_900_000;
  const totalEquity = modalPemilik + labaDitahan + netProfit; // 1.718.000.000

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity; // 1.794.350.000

  return {
    asOfDate: '19/10/2026',
    currentAssets: [
      { label: 'Kas dan Bank', amount: cashTotal },
      { label: 'Piutang Usaha', amount: piutangUsaha },
      { label: 'Persediaan Barang', amount: persediaanBarang },
    ],
    totalCurrentAssets,
    fixedAssets,
    totalFixedAssets,
    totalAssets,
    liabilities: [
      { label: 'Utang Usaha (supplier)', amount: utangUsaha },
      { label: 'Utang Lain-lain', amount: utangLain },
    ],
    totalLiabilities,
    equity: [
      { label: 'Modal Pemilik', amount: modalPemilik },
      { label: 'Laba Ditahan', amount: labaDitahan },
      { label: 'Laba Bersih Okt 2026', amount: netProfit },
    ],
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: totalAssets === totalLiabilitiesAndEquity,
  };
}

/**
 * Utilitas ekspor file CSV yang kompatibel penuh dengan Microsoft Excel (RFC 4180 + UTF-8 BOM)
 */
export function exportTableToCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): void {
  const escapeCell = (val: string | number): string => {
    const s = String(val);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvRows: string[] = [];
  csvRows.push(headers.map(escapeCell).join(','));

  for (const row of rows) {
    csvRows.push(row.map(escapeCell).join(','));
  }

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
