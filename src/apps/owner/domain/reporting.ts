import { outstanding, wibDate } from '../../../shared/data/receivable';
import {
  expenseSummary,
  MAX_REPORT_DAYS,
  profitLoss,
  rangeDays,
  type ProfitLoss,
} from '../../../shared/data/report';
import type {
  BillLine,
  Dataset,
  ExpenseRecord,
  PaymentMethod,
  Sale,
} from '../../../shared/data/types';
import { round3, totalStock } from '../../../shared/data/units';
import type { SystemMessageId } from '../../../shared/messages';
import { hourlyBars, salesOn, shiftDay, TRADING_HOURS } from './summary';

/* ===== Jenis laporan dan rentang tanggal ===== */

export type ReportKind =
  'penjualan' | 'laba-rugi' | 'neraca' | 'biaya' | 'produk-terlaris' | 'per-penjual';

export const REPORT_KINDS: readonly ReportKind[] = [
  'penjualan',
  'laba-rugi',
  'neraca',
  'biaya',
  'produk-terlaris',
  'per-penjual',
];

export function parseReportKind(value: string | null | undefined): ReportKind | undefined {
  return REPORT_KINDS.find((kind) => kind === value);
}

export type RangeKind = 'hari-ini' | 'bulan-ini' | 'tanggal';

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`;
}

export function resolveRange(kind: RangeKind, today: string, custom: DateRange): DateRange {
  if (kind === 'hari-ini') {
    return { from: today, to: today };
  }
  if (kind === 'bulan-ini') {
    return { from: monthStart(today), to: today };
  }
  return custom;
}

export type RangeCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly messageId: Extract<SystemMessageId, 'MSG-039' | 'MSG-104'> };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Tanggal kosong atau terbalik memakai MSG-039; rentang lebih dari 366 hari memakai MSG-104.
export function checkRange(range: DateRange): RangeCheck {
  if (!ISO_DAY.test(range.from) || !ISO_DAY.test(range.to) || range.to < range.from) {
    return { ok: false, messageId: 'MSG-039' };
  }
  if (rangeDays(range.from, range.to) > MAX_REPORT_DAYS) {
    return { ok: false, messageId: 'MSG-104' };
  }
  return { ok: true };
}

function inRange(day: string, range: DateRange): boolean {
  return day >= range.from && day <= range.to;
}

function saleDay(sale: Sale): string {
  return wibDate(new Date(sale.createdAt));
}

function salesIn(data: Dataset, range: DateRange): Sale[] {
  return data.sales.filter((sale) => inRange(saleDay(sale), range));
}

// Jumlah baris setelah diskon baris (persen atau nominal per satuan), tidak pernah negatif.
export function lineAmount(line: BillLine): number {
  const gross = Math.round(line.quantity * line.unitPrice);
  const discount = line.discount;
  if (discount === undefined || !Number.isFinite(discount.value) || discount.value <= 0) {
    return gross;
  }
  const raw =
    discount.kind === 'persen'
      ? Math.round((gross * discount.value) / 100)
      : Math.round(discount.value * line.quantity);
  return gross - Math.min(gross, Math.max(0, raw));
}

/* ===== Penjualan ===== */

export interface SalesPoint {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

function hourOf(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
      .format(date)
      .slice(0, 2),
  );
}

// Omzet per jam dagang. Untuk hari berjalan hanya sampai jam sekarang agar garis tidak jatuh ke nol.
export function hourlyPoints(data: Dataset, day: string, now: Date): SalesPoint[] {
  const first = TRADING_HOURS[0] ?? 8;
  const last = TRADING_HOURS[TRADING_HOURS.length - 1] ?? 17;
  const through = day === wibDate(now) ? Math.min(last, Math.max(first, hourOf(now))) : last;
  return hourlyBars(salesOn(data, day))
    .filter((bar) => Number(bar.key) <= through)
    .map((bar) => ({ key: bar.key, label: `${bar.key}:00`, value: bar.value }));
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < MAX_REPORT_DAYS; day = shiftDay(day, 1)) {
    days.push(day);
  }
  return days;
}

// Omzet per hari dari omzet harian. Hari tanpa catatan bernilai nol; hari setelah `to` dibuang.
export function dailyPoints(data: Dataset, range: DateRange): SalesPoint[] {
  const revenue = new Map(data.dailyRevenue.map((item) => [item.date, item.revenue]));
  return daysBetween(range.from, range.to).map((day) => ({
    key: day,
    label: String(Number(day.slice(8, 10))),
    value: revenue.get(day) ?? 0,
  }));
}

export interface MethodRow {
  readonly method: PaymentMethod;
  readonly count: number;
  readonly amount: number;
  readonly percent: number;
}

// Komposisi cara bayar dari transaksi yang tercatat rinci pada rentang.
export function paymentMix(data: Dataset, range: DateRange): MethodRow[] {
  const totals = new Map<PaymentMethod, { count: number; amount: number }>();
  for (const sale of salesIn(data, range)) {
    const current = totals.get(sale.payment) ?? { count: 0, amount: 0 };
    totals.set(sale.payment, { count: current.count + 1, amount: current.amount + sale.total });
  }
  const sum = [...totals.values()].reduce((total, item) => total + item.amount, 0);
  return [...totals.entries()]
    .map(([method, item]) => ({
      method,
      count: item.count,
      amount: item.amount,
      percent: sum <= 0 ? 0 : Math.round((item.amount / sum) * 100),
    }))
    .sort((first, second) => second.amount - first.amount);
}

export interface SalesReport {
  readonly revenue: number;
  readonly count: number;
  readonly average: number;
  readonly granularity: 'jam' | 'hari' | 'tidak-ada';
  readonly points: readonly SalesPoint[];
  readonly days: readonly {
    readonly date: string;
    readonly revenue: number;
    readonly count: number;
  }[];
  readonly methods: readonly MethodRow[];
}

export function salesReport(data: Dataset, range: DateRange, now: Date): SalesReport {
  const today = wibDate(now);
  const days = data.dailyRevenue
    .filter((item) => inRange(item.date, range))
    .sort((first, second) => second.date.localeCompare(first.date));
  const revenue = days.reduce((sum, item) => sum + item.revenue, 0);
  const count = days.reduce((sum, item) => sum + item.count, 0);
  const single = range.from === range.to;
  let granularity: SalesReport['granularity'] = 'hari';
  let points: SalesPoint[] = [];
  if (single) {
    const detailed = salesOn(data, range.from).length > 0;
    granularity = detailed ? 'jam' : 'tidak-ada';
    points = detailed ? hourlyPoints(data, range.from, now) : [];
  } else {
    points = dailyPoints(data, { from: range.from, to: range.to < today ? range.to : today });
  }
  return {
    revenue,
    count,
    average: count === 0 ? 0 : Math.round(revenue / count),
    granularity,
    points,
    days,
    methods: paymentMix(data, range),
  };
}

/* ===== Laba rugi dan biaya ===== */

export interface ProfitReport extends ProfitLoss {
  readonly grossMargin: number;
  readonly netMargin: number;
  readonly cost: number;
  readonly hasData: boolean;
}

function percentOf(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

export function profitReport(data: Dataset, range: DateRange): ProfitReport {
  const result = profitLoss(data, range.from, range.to);
  return {
    ...result,
    cost: result.cogs + result.expenses,
    grossMargin: percentOf(result.gross, result.sales),
    netMargin: percentOf(result.net, result.sales),
    hasData: result.sales !== 0 || result.expenses !== 0,
  };
}

export interface ExpenseShare {
  readonly category: string;
  readonly amount: number;
  readonly percent: number;
}

export interface ExpenseReport {
  readonly total: number;
  readonly shares: readonly ExpenseShare[];
  readonly items: readonly ExpenseRecord[];
}

export function expenseReport(data: Dataset, range: DateRange, itemLimit = 10): ExpenseReport {
  const summary = expenseSummary(data, range.from, range.to);
  const items = data.expenses
    .filter((expense) => inRange(expense.date, range))
    .sort(
      (first, second) => second.date.localeCompare(first.date) || second.id.localeCompare(first.id),
    )
    .slice(0, itemLimit);
  return {
    total: summary.total,
    shares: summary.rows.map((row) => ({
      category: row.category,
      amount: row.amount,
      percent: percentOf(row.amount, summary.total),
    })),
    items,
  };
}

/* ===== Neraca ===== */

// Saldo kas dan bank awal bulan: angka dasar fiktif (dicatat sebagai asumsi).
export const OPENING_CASH = 850_000_000;

export interface BalanceSheet {
  readonly asOf: string;
  readonly cash: number;
  readonly receivable: number;
  readonly inventory: number;
  readonly assets: number;
  readonly payable: number;
  readonly liabilities: number;
  readonly equity: number;
}

// Aset = kas + piutang usaha + persediaan; Kewajiban = hutang usaha; Ekuitas = selisihnya,
// sehingga neraca selalu seimbang. Kas = saldo dasar + penerimaan bulan ini - biaya bulan ini.
export function balanceSheet(data: Dataset, now: Date): BalanceSheet {
  const today = wibDate(now);
  const month: DateRange = { from: monthStart(today), to: today };
  const receipts = salesIn(data, month).reduce((sum, sale) => sum + sale.paid, 0);
  const spent = expenseSummary(data, month.from, month.to).total;
  const cash = OPENING_CASH + receipts - spent;
  const receivable = data.customers.reduce((sum, customer) => sum + outstanding(customer), 0);
  const inventory = Math.round(
    data.products.reduce((sum, product) => sum + Math.max(0, totalStock(product)) * product.hpp, 0),
  );
  const payable = data.suppliers.reduce((sum, supplier) => sum + supplier.payable, 0);
  const assets = cash + receivable + inventory;
  return {
    asOf: today,
    cash,
    receivable,
    inventory,
    assets,
    payable,
    liabilities: payable,
    equity: assets - payable,
  };
}

/* ===== Produk terlaris dan penjual ===== */

export interface ProductRank {
  readonly productId: string;
  readonly name: string;
  readonly unit: string;
  readonly quantity: number;
  readonly amount: number;
  readonly percent: number;
}

// Peringkat menurut nilai penjualan; jumlah dinyatakan dalam satuan dasar barang.
export function topProducts(data: Dataset, range: DateRange, limit = 5): ProductRank[] {
  const products = new Map(data.products.map((product) => [product.id, product]));
  const totals = new Map<string, { quantity: number; amount: number }>();
  for (const sale of salesIn(data, range)) {
    for (const line of sale.lines) {
      const factor =
        products.get(line.productId)?.units.find((unit) => unit.code === line.unit)?.factor ?? 1;
      const current = totals.get(line.productId) ?? { quantity: 0, amount: 0 };
      totals.set(line.productId, {
        quantity: current.quantity + line.quantity * factor,
        amount: current.amount + lineAmount(line),
      });
    }
  }
  const rows = [...totals.entries()]
    .map(([productId, total]) => {
      const product = products.get(productId);
      return {
        productId,
        name: product?.name ?? productId,
        unit: product?.baseUnit ?? '',
        quantity: round3(total.quantity),
        amount: total.amount,
      };
    })
    .sort((first, second) => second.amount - first.amount || first.name.localeCompare(second.name))
    .slice(0, limit);
  const best = rows[0]?.amount ?? 0;
  return rows.map((row) => ({ ...row, percent: best <= 0 ? 0 : (row.amount / best) * 100 }));
}

export interface SellerRow {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly amount: number;
  readonly average: number;
  readonly percent: number;
}

// Penjualan per penjual: `BillLine.sellerId` bila ada, selain itu kasir transaksi.
export function sellerSales(data: Dataset, range: DateRange): SellerRow[] {
  const names = new Map(data.users.map((user) => [user.id, user.name]));
  const totals = new Map<string, { sales: Set<string>; amount: number }>();
  for (const sale of salesIn(data, range)) {
    for (const line of sale.lines) {
      const id = line.sellerId ?? sale.cashierId;
      const current = totals.get(id) ?? { sales: new Set<string>(), amount: 0 };
      current.sales.add(sale.id);
      current.amount += lineAmount(line);
      totals.set(id, current);
    }
  }
  const rows = [...totals.entries()]
    .map(([id, total]) => ({
      id,
      name: names.get(id) ?? id,
      count: total.sales.size,
      amount: total.amount,
      average: total.sales.size === 0 ? 0 : Math.round(total.amount / total.sales.size),
    }))
    .sort((first, second) => second.amount - first.amount || first.name.localeCompare(second.name));
  const best = rows[0]?.amount ?? 0;
  return rows.map((row) => ({ ...row, percent: best <= 0 ? 0 : (row.amount / best) * 100 }));
}

/* ===== Daftar laporan ===== */

export type ReportStatus = 'segar' | 'lokal';

export const FRESH_MS = 5 * 60 * 1000;

// Hijau (segar) bila online dan dimuat dalam lima menit terakhir; kuning (lokal) selain itu.
export function reportStatus(online: boolean, loadedAt: Date, now: Date): ReportStatus {
  return online && now.getTime() - loadedAt.getTime() <= FRESH_MS ? 'segar' : 'lokal';
}

export interface ReportHeadline {
  readonly amount?: number | undefined;
  readonly name?: string | undefined;
}

// Ringkasan satu baris tiap laporan untuk daftar laporan (bulan berjalan).
export function reportHeadlines(
  data: Dataset,
  now: Date,
): Readonly<Record<ReportKind, ReportHeadline>> {
  const today = wibDate(now);
  const month: DateRange = { from: monthStart(today), to: today };
  const days = data.dailyRevenue.filter((item) => inRange(item.date, month));
  const topProduct = topProducts(data, month, 1)[0];
  const topSeller = sellerSales(data, month)[0];
  return {
    penjualan: { amount: days.reduce((sum, item) => sum + item.revenue, 0) },
    'laba-rugi': { amount: profitLoss(data, month.from, month.to).net },
    neraca: { amount: balanceSheet(data, now).assets },
    biaya: { amount: expenseSummary(data, month.from, month.to).total },
    'produk-terlaris': { name: topProduct?.name },
    'per-penjual': { name: topSeller?.name, amount: topSeller?.amount },
  };
}
