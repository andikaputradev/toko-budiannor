import { wibDate } from '../../../shared/data/receivable';
import { profitLoss, rangeDays } from '../../../shared/data/report';
import type { Dataset, Product } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import { overdueRows, totalOverdue } from '../../../shared/domain/receivables';
import { mostCritical } from '../../../shared/domain/stock';
import {
  dailyPoints,
  hourlyPoints,
  monthStart,
  topProducts,
  type DateRange,
  type ProductRank,
  type SalesPoint,
} from './reporting';
import { percentChange, summarize } from './summary';

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
  const points = dailyPoints(data, { from, to: today });
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
    points,
  };
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

export type RankPeriod = 'hari-ini' | 'bulan-ini';

export const TOP_PRODUCT_ROWS = 5;

export function rankRange(now: Date, period: RankPeriod): DateRange {
  const today = wibDate(now);
  return { from: period === 'hari-ini' ? today : monthStart(today), to: today };
}

export function topProductRows(
  data: Dataset,
  now: Date,
  period: RankPeriod,
  limit = TOP_PRODUCT_ROWS,
): ProductRank[] {
  return topProducts(data, rankRange(now, period), limit);
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
