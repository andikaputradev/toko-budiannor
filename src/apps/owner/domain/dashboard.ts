import { createRandom } from '../../../shared/data/prng';
import { wibDate } from '../../../shared/data/receivable';
import { profitLoss, rangeDays } from '../../../shared/data/report';
import type { BillLine, Dataset, Product } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import { overdueRows, totalOverdue } from '../../../shared/domain/receivables';
import { mostCritical } from '../../../shared/domain/stock';
import {
  hourlyPoints,
  monthStart,
  topProducts,
  type DateRange,
  type ProductRank,
  type SalesPoint,
} from './reporting';
import { percentChange, shiftDay, summarize } from './summary';

/* ===== Omzet Live ===== */

export type RevenueMode = 'harian' | 'bulanan';

// Pembanding: harian dengan kemarin sampai jam yang sama; bulanan dengan rata-rata harian bulan lalu.
export type RevenueCompare = 'kemarin' | 'rata-bulan-lalu';

export interface RevenueView {
  readonly mode: RevenueMode;
  readonly total: number;
  readonly count: number;
  readonly comparison: number | undefined;
  readonly compare: RevenueCompare;
  readonly points: readonly SalesPoint[];
}

// Hari yang diperlukan agar rata-rata harian bulan lalu cukup berarti sebagai pembanding.
export const MIN_COMPARE_DAYS = 7;

export function revenueView(data: Dataset, now: Date, mode: RevenueMode): RevenueView {
  const today = wibDate(now);
  if (mode === 'harian') {
    const summary = summarize(data, now, 'hari-ini');
    return {
      mode,
      total: summary.revenue,
      count: summary.count,
      comparison: summary.comparison,
      compare: 'kemarin',
      points: hourlyPoints(data, today, now),
    };
  }
  const from = monthStart(today);
  const days = data.dailyRevenue.filter((item) => item.date >= from && item.date <= today);
  const total = days.reduce((sum, item) => sum + item.revenue, 0);
  const earlier = data.dailyRevenue.filter((item) => item.date < from);
  const average = total / Math.max(1, rangeDays(from, today));
  const earlierAverage =
    earlier.reduce((sum, item) => sum + item.revenue, 0) / Math.max(1, earlier.length);
  return {
    mode,
    total,
    count: days.reduce((sum, item) => sum + item.count, 0),
    comparison:
      earlier.length < MIN_COMPARE_DAYS ? undefined : percentChange(average, earlierAverage),
    compare: 'rata-bulan-lalu',
    points: monthlyPoints(data, today),
  };
}

/* ===== Omzet bulanan (grafik batang) ===== */

export const MONTH_COUNT = 6;

export const MONTH_NAMES: readonly string[] = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const MONTH_SHORT: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

// Nama bulan panjang dari kunci "2026-10", mis. "Oktober 2026".
export function monthText(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? ''} ${key.slice(0, 4)}`;
}

function daysInMonth(key: string): number {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
}

function monthBefore(key: string, back: number): string {
  const index = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) - back;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}`;
}

// ASUMSI: data contoh hanya memuat 31 hari omzet harian, jadi bulan sebelum bulan berjalan diperkirakan
// dari omzet harian rata-rata dikali jumlah hari bulan itu dengan faktor tetap per bulan (0,85 sampai
// 1,15, deterministik dari seed). Bulan berjalan memakai omzet nyata sampai hari ini.
export function monthlyPoints(data: Dataset, today: string, count = MONTH_COUNT): SalesPoint[] {
  const current = today.slice(0, 7);
  const known = data.dailyRevenue;
  const dailyAverage =
    known.reduce((sum, item) => sum + item.revenue, 0) / Math.max(1, known.length);
  return Array.from({ length: count }, (_, index) => {
    const key = monthBefore(current, count - 1 - index);
    const label = MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? '';
    if (key === current) {
      const value = known
        .filter((item) => item.date.startsWith(key) && item.date <= today)
        .reduce((sum, item) => sum + item.revenue, 0);
      return { key, label, value };
    }
    const random = createRandom(
      data.seed * 53 + Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)),
    );
    const factor = 0.85 + random.next() * 0.3;
    return {
      key,
      label,
      value: Math.round((dailyAverage * daysInMonth(key) * factor) / 1000) * 1000,
    };
  });
}

/* ===== Laba rugi bulan ini ===== */

export interface ProfitSnapshot {
  readonly from: string;
  readonly to: string;
  readonly revenue: number;
  readonly expense: number;
  readonly net: number;
}

// Pendapatan - beban (harga pokok + beban operasional) = laba bersih, sama dengan Laporan Laba Rugi.
export function monthProfit(data: Dataset, now: Date): ProfitSnapshot {
  const to = wibDate(now);
  const from = monthStart(to);
  const result = profitLoss(data, from, to);
  return {
    from,
    to,
    revenue: result.sales,
    expense: result.cogs + result.expenses,
    net: result.net,
  };
}

/* ===== Stok minim ===== */

export interface LowStockRow {
  readonly id: string;
  readonly name: string;
  readonly remaining: number;
  readonly unit: string;
  readonly minimum: number;
}

export const LOW_STOCK_ROWS = 5;

export function lowStockRows(data: Dataset, limit = LOW_STOCK_ROWS): LowStockRow[] {
  return mostCritical(data.products, limit).map((product) => ({
    id: product.id,
    name: product.name,
    remaining: totalStock(product),
    unit: product.baseUnit,
    minimum: product.minStock,
  }));
}

/* ===== Produk terlaris ===== */

// Harian, mingguan, bulanan, dan triwulan: hari ini, 7, 30, dan 90 hari terakhir termasuk hari ini.
export type RankPeriod = 'hari-ini' | 'minggu' | 'bulan' | 'triwulan';

export const RANK_PERIODS: readonly RankPeriod[] = ['hari-ini', 'minggu', 'bulan', 'triwulan'];

export const RANK_DAYS: Readonly<Record<RankPeriod, number>> = {
  'hari-ini': 1,
  minggu: 7,
  bulan: 30,
  triwulan: 90,
};

export const TOP_PRODUCT_ROWS = 5;

export function parseRankPeriod(value: string): RankPeriod {
  return RANK_PERIODS.find((period) => period === value) ?? 'hari-ini';
}

export function rankRange(now: Date, period: RankPeriod): DateRange {
  const today = wibDate(now);
  return { from: shiftDay(today, 1 - RANK_DAYS[period]), to: today };
}

// ASUMSI: penjualan rinci hanya tercatat untuk kemarin dan hari ini. Untuk hari yang lebih lama pada
// rentang mingguan, bulanan, dan triwulan, penjualan dibangkitkan deterministik dari seed (barang
// populer lebih sering muncul) agar peringkat tiap periode berbeda dan stabil.
export const DETAILED_DAYS = 2;
const BACKFILL_POPULAR = 60;

function backfillLines(data: Dataset, day: string): BillLine[] {
  const products = data.products.filter((product) => product.active !== false);
  const popular = products.slice(0, Math.min(BACKFILL_POPULAR, products.length));
  if (popular.length === 0) {
    return [];
  }
  const count = data.dailyRevenue.find((item) => item.date === day)?.count ?? 30;
  const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const random = createRandom(data.seed * 7919 + dayNumber);
  return Array.from({ length: Math.max(3, Math.round(count / 3)) }, () => {
    const product = popular[Math.floor(random.next() ** 2 * popular.length)] ?? popular[0];
    if (product === undefined) {
      throw new RangeError('Daftar barang kosong');
    }
    return {
      productId: product.id,
      unit: product.baseUnit,
      quantity: product.allowDecimal ? random.int(1, 8) / 2 : random.int(1, 5),
      unitPrice: product.prices[product.baseUnit]?.eceran ?? 0,
    };
  });
}

export function topProductRows(
  data: Dataset,
  now: Date,
  period: RankPeriod,
  limit = TOP_PRODUCT_ROWS,
): ProductRank[] {
  const range = rankRange(now, period);
  const detailedFrom = shiftDay(range.to, 1 - DETAILED_DAYS);
  const extra: BillLine[] = [];
  for (let day = range.from; day < detailedFrom && day <= range.to; day = shiftDay(day, 1)) {
    extra.push(...backfillLines(data, day));
  }
  return topProducts(data, range, limit, extra);
}

/* ===== Monitoring HPP ===== */

export const HPP_LIMIT = 90;
export const HPP_WATCH = 80;
export const HPP_ROWS = 3;

export type HppLevel = 'aman' | 'waspada' | 'lewat';

export interface HppRow {
  readonly productId: string;
  readonly name: string;
  readonly unit: string;
  readonly hpp: number;
  readonly price: number;
  readonly percent: number;
  readonly level: HppLevel;
}

export function hppLevel(percent: number): HppLevel {
  if (percent >= HPP_LIMIT) {
    return 'lewat';
  }
  return percent >= HPP_WATCH ? 'waspada' : 'aman';
}

// Nama jenis barang tanpa merk di belakangnya, agar satu jenis tidak memenuhi seluruh daftar.
function kindOf(product: Product): string {
  const brand = product.brand.trim();
  return brand !== '' && product.name.endsWith(brand)
    ? product.name.slice(0, product.name.length - brand.length).trim()
    : product.name;
}

// Barang dengan HPP tertinggi terhadap harga eceran satuan dasar; satu baris per jenis barang.
export function hppMonitor(data: Dataset, limit = HPP_ROWS): HppRow[] {
  const rows: { readonly row: HppRow; readonly kind: string }[] = [];
  for (const product of data.products) {
    const price = product.prices[product.baseUnit]?.eceran ?? 0;
    if (product.active === false || price <= 0 || product.hpp <= 0) {
      continue;
    }
    const percent = (product.hpp / price) * 100;
    rows.push({
      row: {
        productId: product.id,
        name: product.name,
        unit: product.baseUnit,
        hpp: product.hpp,
        price,
        percent,
        level: hppLevel(percent),
      },
      kind: kindOf(product),
    });
  }
  rows.sort(
    (first, second) =>
      second.row.percent - first.row.percent || first.row.name.localeCompare(second.row.name),
  );
  const seen = new Set<string>();
  const picked: HppRow[] = [];
  for (const { row, kind } of rows) {
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    picked.push(row);
    if (picked.length >= limit) {
      break;
    }
  }
  return picked;
}

/* ===== Piutang dan hutang ===== */

export interface DebtSnapshot {
  readonly amount: number;
  readonly parties: number;
}

// Piutang jatuh tempo: sisa invoice yang lewat jatuh tempo dan jumlah pelanggannya.
export function receivableSnapshot(data: Dataset, now: Date): DebtSnapshot {
  const rows = overdueRows(data.customers, now);
  return { amount: totalOverdue(rows), parties: rows.length };
}

// Hutang supplier: jumlah `payable` dan jumlah supplier yang masih berhutang.
export function payableSnapshot(data: Dataset): DebtSnapshot {
  const owing = data.suppliers.filter((supplier) => supplier.payable > 0);
  return {
    amount: owing.reduce((sum, supplier) => sum + supplier.payable, 0),
    parties: owing.length,
  };
}
