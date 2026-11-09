import { balanceOf, overdueInvoices, wibDate } from '../../../shared/data/receivable';
import type { DailyRevenue, Product, Role } from '../../../shared/data/types';
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

export interface ExpenseBreakdown {
  readonly beban: number;
  readonly bebanGaji: number;
  readonly bebanOperasional: number;
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

  const topProducts: RankedItem[] = [
    { name: 'LEM QBOND XTRA', amount: 5_196_915, percent: 94 },
    { name: 'CAT NIPPON 1LT', amount: 3_196_915, percent: 18 },
    { name: 'CCM MATEX 20KG', amount: 196_915, percent: 5 },
    { name: 'THINNER CEMERLANG 5L', amount: 126_915, percent: 5 },
  ];

  const topCustomers: RankedItem[] = [
    { name: 'PRIMA', amount: 98_450_000, percent: 95 },
    { name: 'BAGUS PERDANA', amount: 8_450_000, percent: 18 },
    { name: 'DWI PUTRA', amount: 450_000, percent: 21 },
    { name: 'JEPARA MEBEL', amount: 100_500, percent: 20 },
  ];

  const hppMonitoring: HppMonitoringItem[] = [
    { name: 'CCM TINTER LAMP BLACK', hpp: 120_175, price: 125_000, percent: 96 },
    { name: 'CCM TINTER OXIDE', hpp: 120_175, price: 125_000, percent: 96 },
    { name: 'CAT DJARUM 4KG', hpp: 228_012, price: 240_000, percent: 95 },
    { name: 'CCM TINTER RED', hpp: 223_724, price: 235_500, percent: 94 },
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

  const profit = {
    daily: {
      laba: 737_253,
      pendapatan: 43_320_000,
      nilaiHpp: 3_320_000,
      pengeluaran: 320_000,
    },
    monthly: {
      laba: 18_450_000,
      pendapatan: 142_800_000,
      nilaiHpp: 98_500_000,
      pengeluaran: 25_850_000,
    },
  };

  const expense = {
    daily: {
      beban: 54_946_500,
      bebanGaji: 43_320_000,
      bebanOperasional: 320_000,
    },
    monthly: {
      beban: 52_600_000,
      bebanGaji: 31_400_000,
      bebanOperasional: 21_200_000,
    },
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
