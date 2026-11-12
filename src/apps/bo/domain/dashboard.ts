import { balanceOf, overdueInvoices, wibDate } from '../../../shared/data/receivable';
import type { DailyRevenue, Product, Role } from '../../../shared/data/types';
import { formatDate } from '../../../shared/format';
import { totalStock } from '../../../shared/data/units';
import type { AppState } from '../../../shared/store/store';
import { LAST_BACKUP, type BackupInfo } from './backup';
import { countBelowMinimum, countNegative, mostCritical } from './stock-view';

export interface DashboardData {
  readonly omzetToday: number;
  readonly countToday: number;
  readonly overdueAmount: number;
  readonly belowMinimum: number;
  readonly critical: readonly Product[];
  readonly series: readonly DailyRevenue[];
  readonly negative: number;
  readonly queue: number;
  readonly backup: BackupInfo;
}

export interface MetricBreakdown {
  readonly current: number;
  readonly total: number;
  readonly count: number;
  readonly average: number;
  readonly trendPercent: number;
  readonly trendDirection: 'naik' | 'turun';
}

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface UpcomingEvent {
  readonly id: string;
  readonly dateText: string;
  readonly code: string;
  readonly type: 'utang' | 'piutang';
  readonly name: string;
  readonly description: string;
}

export interface RankedItem {
  readonly name: string;
  readonly amount: number;
  readonly percent: number;
}

export interface HppMonitoringItem {
  readonly name: string;
  readonly hpp: number;
  readonly price: number;
  readonly percent: number;
}

export interface LowStockItem {
  readonly name: string;
  readonly remaining: number;
}

export interface ProfitBreakdown {
  readonly laba: number;
  readonly pendapatan: number;
  readonly nilaiHpp: number;
  readonly pengeluaran: number;
}

export type ExpenseKind = 'gaji' | 'katering' | 'bensin' | 'operasional' | 'listrik';

export interface ExpenseItem {
  readonly key: ExpenseKind;
  readonly amount: number;
}

export interface ExpenseBreakdown {
  readonly beban: number;
  readonly items: readonly ExpenseItem[];
}

export interface RankPeriod {
  readonly label: string;
  readonly products: readonly RankedItem[];
  readonly customers: readonly RankedItem[];
}

export type DashboardWidgetId =
  'omset' | 'grafik' | 'kegiatan' | 'laba' | 'beban' | 'aset' | 'pelanggan' | 'barang' | 'hpp';

const OWNER_WIDGETS: readonly DashboardWidgetId[] = [
  'omset',
  'grafik',
  'kegiatan',
  'laba',
  'beban',
  'aset',
  'pelanggan',
  'barang',
  'hpp',
];

// Supervisor tidak melihat widget keuangan dan HPP (informasi Owner).
const SUPERVISOR_WIDGETS: readonly DashboardWidgetId[] = [
  'omset',
  'grafik',
  'kegiatan',
  'pelanggan',
  'barang',
];

export function dashboardWidgets(role: Role): readonly DashboardWidgetId[] {
  if (role === 'owner') {
    return OWNER_WIDGETS;
  }
  return role === 'supervisor' ? SUPERVISOR_WIDGETS : [];
}

export type HppTone = 'bahaya' | 'waspada' | 'aman';

// Persen HPP terhadap harga jual: makin tinggi makin tipis labanya.
export function hppTone(percent: number): HppTone {
  if (percent >= 95) {
    return 'bahaya';
  }
  return percent >= 90 ? 'waspada' : 'aman';
}

export interface AssetBreakdown {
  readonly total: number;
  readonly kas: number;
  readonly piutang: number;
  readonly stok: number;
  readonly percentKas: number;
  readonly percentPiutang: number;
  readonly percentStok: number;
}

export interface OverdueCustomer {
  readonly name: string;
  readonly overdueDays: number;
  readonly amount: number;
}

export interface FullDashboardData {
  readonly isOwner: boolean;
  readonly omzet: {
    readonly daily: number;
    readonly monthly: number;
    readonly dailyBreakdown: MetricBreakdown;
    readonly monthlyBreakdown: MetricBreakdown;
    readonly trendPercent: number;
    readonly trendDirection: 'naik' | 'turun';
  };
  readonly omset: {
    readonly daily: number;
    readonly monthly: number;
    readonly dailyBreakdown: MetricBreakdown;
    readonly monthlyBreakdown: MetricBreakdown;
    readonly trendPercent: number;
    readonly trendDirection: 'naik' | 'turun';
  };
  readonly chartSeries: {
    readonly daily: readonly ChartPoint[];
    readonly monthly: readonly ChartPoint[];
    readonly trendText: string;
  };
  readonly upcomingEvents: readonly UpcomingEvent[];
  readonly topProducts: readonly RankedItem[];
  readonly topCustomers: readonly RankedItem[];
  // Dua periode untuk widget peringkat: bulan berjalan sampai hari ini, lalu bulan lalu penuh.
  readonly rankPeriods: readonly RankPeriod[];
  readonly hppMonitoring: readonly HppMonitoringItem[];
  readonly lowStockItems: readonly LowStockItem[];
  readonly profit: {
    readonly daily: ProfitBreakdown;
    readonly monthly: ProfitBreakdown;
  };
  readonly expense: {
    readonly daily: ExpenseBreakdown;
    readonly monthly: ExpenseBreakdown;
  };
  readonly assets: AssetBreakdown;
  readonly overdueCustomers: readonly OverdueCustomer[];
  readonly legacy: DashboardData;
}

export const CRITICAL_ROWS = 4;
export const SERIES_DAYS = 7;

export function computeDashboard(state: AppState, now: Date): DashboardData {
  const day = wibDate(now);
  const sales = state.data.sales.filter((sale) => wibDate(new Date(sale.createdAt)) === day);
  const reference = new Date(state.data.referenceDate);
  const overdueAmount = state.data.customers.reduce(
    (sum, customer) =>
      sum +
      overdueInvoices(customer, reference).reduce(
        (inner, invoice) => inner + balanceOf(invoice),
        0,
      ),
    0,
  );
  const products = state.data.products;
  return {
    omzetToday: sales.reduce((sum, sale) => sum + sale.total, 0),
    countToday: sales.length,
    overdueAmount,
    belowMinimum: countBelowMinimum(products),
    critical: mostCritical(products, CRITICAL_ROWS),
    series: state.data.dailyRevenue.slice(-SERIES_DAYS),
    negative: countNegative(products),
    queue: state.posQueue,
    backup: LAST_BACKUP,
  };
}

const EXPENSE_ORDER: readonly ExpenseKind[] = [
  'gaji',
  'katering',
  'bensin',
  'operasional',
  'listrik',
];

function expenseOf(amounts: Readonly<Record<ExpenseKind, number>>): ExpenseBreakdown {
  const items = EXPENSE_ORDER.map((key) => ({ key, amount: amounts[key] }));
  return {
    beban: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

function profitOf(pendapatan: number, nilaiHpp: number, pengeluaran: number): ProfitBreakdown {
  return { laba: pendapatan - nilaiHpp - pengeluaran, pendapatan, nilaiHpp, pengeluaran };
}

function hppRow(name: string, hpp: number, price: number): HppMonitoringItem {
  return { name, hpp, price, percent: Math.round((hpp / price) * 100) };
}

interface RankRow {
  readonly name: string;
  readonly amount: number;
}

// Persen = bagian dari seluruh penjualan periode (bukan hanya baris yang tampil), urut terbesar dulu.
function ranked(rows: readonly RankRow[], total: number): RankedItem[] {
  return [...rows]
    .sort((first, second) => second.amount - first.amount)
    .map((row) => ({ ...row, percent: Math.min(100, Math.round((row.amount / total) * 100)) }));
}

const RANK_DATA: readonly {
  readonly customers: readonly RankRow[];
  readonly customerTotal: number;
  readonly products: readonly RankRow[];
  readonly productTotal: number;
}[] = [
  {
    customers: [
      { name: 'PELANGGAN UMUM', amount: 159_694_400 },
      { name: 'UD RESMI (BU MILA)', amount: 9_800_000 },
      { name: 'ABM', amount: 9_556_000 },
      { name: 'PRIMA', amount: 8_450_100 },
      { name: 'INDRA RIDHA', amount: 6_195_000 },
      { name: 'DWI PUTRA', amount: 4_820_000 },
      { name: 'BAGUS PERDANA', amount: 3_410_000 },
    ],
    customerTotal: 261_000_000,
    products: [
      { name: 'THINNER CEMERLANG A 5LT', amount: 8_780_000 },
      { name: 'SENG GELOMBANG KECIL CAP KUDA', amount: 7_500_000 },
      { name: 'SENG FIBER GELOMBANG KECIL', amount: 7_485_000 },
      { name: 'THINNER PEGASUS HIJAU 5LT', amount: 5_760_000 },
      { name: 'KERAMIK 50X50 GNET ELCHE', amount: 4_400_000 },
      { name: 'LEM QBOND XTRA', amount: 4_150_000 },
      { name: 'CAT NIPPON 1LT', amount: 3_960_000 },
    ],
    productTotal: 130_000_000,
  },
  {
    customers: [
      { name: 'PELANGGAN UMUM', amount: 201_340_000 },
      { name: 'PRIMA', amount: 14_200_000 },
      { name: 'UD RESMI (BU MILA)', amount: 11_050_000 },
      { name: 'ABM', amount: 8_730_000 },
      { name: 'SINAR PELANGI', amount: 7_100_000 },
      { name: 'INDRA RIDHA', amount: 5_480_000 },
    ],
    customerTotal: 318_000_000,
    products: [
      { name: 'SENG GELOMBANG KECIL CAP KUDA', amount: 11_200_000 },
      { name: 'THINNER CEMERLANG A 5LT', amount: 9_640_000 },
      { name: 'LEM QBOND XTRA', amount: 6_900_000 },
      { name: 'SENG FIBER GELOMBANG KECIL', amount: 6_120_000 },
      { name: 'CAT NIPPON 1LT', amount: 5_330_000 },
      { name: 'KERAMIK 50X50 GNET ELCHE', amount: 4_010_000 },
    ],
    productTotal: 165_000_000,
  },
];

// Periode pertama: tanggal 1 bulan berjalan sampai hari ini. Kedua: bulan lalu penuh.
function buildRankPeriods(now: Date): readonly RankPeriod[] {
  const [year = 0, month = 1] = wibDate(now).split('-').map(Number);
  const day = (y: number, monthIndex: number, dayOfMonth: number): string =>
    formatDate(new Date(Date.UTC(y, monthIndex, dayOfMonth)));
  const withoutYear = (text: string): string => text.replace(/ \d{4}$/, '');
  const labels = [
    `${withoutYear(day(year, month - 1, 1))} - ${formatDate(now)}`,
    `${withoutYear(day(year, month - 2, 1))} - ${day(year, month - 1, 0)}`,
  ];
  return RANK_DATA.map((data, index) => ({
    label: labels[index] ?? '',
    customers: ranked(data.customers, data.customerTotal),
    products: ranked(data.products, data.productTotal),
  }));
}

export function computeFullDashboard(
  state: AppState,
  now: Date,
  role: Role = state.role,
): FullDashboardData {
  const legacy = computeDashboard(state, now);
  const isOwner = role === 'owner';

  const dailyOmzet = legacy.omzetToday || 2_450_000;
  const dailyCount = legacy.countToday || 90;
  const dailyTotal = 3_406_250;
  const dailyAvg = Math.round(dailyTotal / (dailyCount || 1));

  const monthlyOmzet = 43_320_000;
  const monthlyCount = 1_280;
  const monthlyTotal = 48_500_000;
  const monthlyAvg = Math.round(monthlyTotal / monthlyCount);

  const dailyPoints: ChartPoint[] = [
    { label: 'Mon', value: 1_850_000 },
    { label: 'Tue', value: 2_100_000 },
    { label: 'Wed', value: 1_950_000 },
    { label: 'Thu', value: 2_600_000 },
    { label: 'Fri', value: 2_200_000 },
    { label: 'Sat', value: 2_850_000 },
    { label: 'Sun', value: 2_450_000 },
  ];

  const monthlyPoints: ChartPoint[] = [
    { label: 'M1', value: 9_800_000 },
    { label: 'M2', value: 10_500_000 },
    { label: 'M3', value: 11_200_000 },
    { label: 'M4', value: 11_820_000 },
  ];

  const upcomingEvents: UpcomingEvent[] = [
    {
      id: 'EV-1',
      dateText: '17 Okt',
      code: 'FB26VIII0083',
      type: 'utang',
      name: 'DANA KHARISMA',
      description: 'FB26VIII0083 Jatuh Tempo Utang - DANA KHARISMA',
    },
    {
      id: 'EV-2',
      dateText: '20 Okt',
      code: 'V8Y',
      type: 'piutang',
      name: 'SURYA MANDIRI',
      description: 'V8Y Jatuh Tempo Piutang - SURYA MANDIRI',
    },
    {
      id: 'EV-3',
      dateText: '26 Okt',
      code: '26100077',
      type: 'piutang',
      name: 'TIARA',
      description: '26100077 Jatuh Tempo Piutang - TIARA',
    },
  ];

  const rankPeriods = buildRankPeriods(now);
  const topProducts = rankPeriods[0]?.products ?? [];
  const topCustomers = rankPeriods[0]?.customers ?? [];

  const hppMonitoring: HppMonitoringItem[] = [
    hppRow('CCM TINTER LAMP BLACK', 120_175, 125_000),
    hppRow('CCM TINTER OXIDE', 120_175, 125_000),
    hppRow('CAT DJARUM 4KG', 228_012, 240_000),
    hppRow('CCM TINTER RED', 223_724, 235_500),
    hppRow('OBENG 2WAY TEKIRO TPR', 60_581, 68_000),
    hppRow('TARIKAN TOP 088 SC', 62_791, 70_000),
  ];

  const lowStockItems: LowStockItem[] = [
    { name: 'LEM QBOND XTRA', remaining: 0 },
    { name: 'CCM MATEX 20KG', remaining: 1 },
    { name: 'THINNER CEMERLANG 5L', remaining: 3 },
    { name: 'CCM MATEX 5KG', remaining: 3 },
    { name: 'THINNER QBOND 5L', remaining: 3 },
    { name: 'THINNER POWER 5L', remaining: 3 },
    { name: 'LEM QBOND POWER', remaining: 3 },
  ];

  // Laba = pendapatan - nilai HPP - pengeluaran; pengeluaran sama dengan total beban.
  const expense = {
    daily: expenseOf({
      gaji: 650_000,
      katering: 150_000,
      bensin: 120_000,
      operasional: 90_000,
      listrik: 60_000,
    }),
    monthly: expenseOf({
      gaji: 7_000_000,
      katering: 4_100_000,
      bensin: 3_200_000,
      operasional: 2_800_000,
      listrik: 1_800_000,
    }),
  };
  const profit = {
    daily: profitOf(5_480_000, 3_630_000, expense.daily.beban),
    monthly: profitOf(142_800_000, 98_500_000, expense.monthly.beban),
  };

  const totalAsset = 3_837_012_882;
  const kas = 1_245_000_000;
  const piutang = 872_340_000;
  const stok = 1_719_672_882;

  const assets: AssetBreakdown = {
    total: totalAsset,
    kas,
    piutang,
    stok,
    percentKas: Math.round((kas / totalAsset) * 100),
    percentPiutang: Math.round((piutang / totalAsset) * 100),
    percentStok: Math.round((stok / totalAsset) * 100),
  };

  const overdueCustomers: OverdueCustomer[] = [
    { name: 'PRIMA', overdueDays: 137, amount: 18_500_000 },
    { name: 'BAGUS PERDANA', overdueDays: 65, amount: 6_400_000 },
    { name: 'SINAR PELANGI', overdueDays: 64, amount: 4_200_000 },
    { name: 'DWI PUTRA', overdueDays: 4, amount: 850_000 },
  ];

  const omzetData = {
    daily: dailyOmzet,
    monthly: monthlyOmzet,
    dailyBreakdown: {
      current: dailyOmzet,
      total: dailyTotal,
      count: dailyCount,
      average: dailyAvg,
      trendPercent: 12.5,
      trendDirection: 'naik' as const,
    },
    monthlyBreakdown: {
      current: monthlyOmzet,
      total: monthlyTotal,
      count: monthlyCount,
      average: monthlyAvg,
      trendPercent: 15.2,
      trendDirection: 'naik' as const,
    },
    trendPercent: 12.5,
    trendDirection: 'naik' as const,
  };

  return {
    isOwner,
    omzet: omzetData,
    omset: omzetData,
    chartSeries: {
      daily: dailyPoints,
      monthly: monthlyPoints,
      trendText: 'Tren naik 12.5%',
    },
    upcomingEvents,
    topProducts,
    topCustomers,
    rankPeriods,
    hppMonitoring,
    lowStockItems,
    profit,
    expense,
    assets,
    overdueCustomers,
    legacy,
  };
}

export function stockLabelValue(product: Product): number {
  return totalStock(product);
}
