import { wibDate } from '../../../shared/data/receivable';
import type { PaymentMethod, Sale, SalePayment, SyncItem } from '../../../shared/data/types';

export type StatusFilter = 'semua' | 'lunas' | 'pending';

export const PAGE_SIZE = 50;

// Filter metode: Split berarti lebih dari satu pembayaran terbayar; Piutang mencakup penjualan
// yang memakai DP.
export type MethodFilter = 'semua' | 'tunai' | 'qris' | 'edc' | 'transfer' | 'split' | 'piutang';

export interface HistoryFilter {
  readonly start: string;
  readonly end: string;
  readonly status: StatusFilter;
  readonly query: string;
  readonly onlyDevice: ReadonlySet<string> | undefined;
  readonly method?: MethodFilter | undefined;
}

export function dayOf(iso: string): string {
  return wibDate(new Date(iso));
}

export function saleDate(sale: Sale): string {
  return dayOf(sale.createdAt);
}

export function isUnsynced(sale: Sale, queue: readonly SyncItem[]): boolean {
  return queue.some(
    (item) =>
      item.kind === 'transaksi' && item.saleNumber === sale.number && item.status !== 'terkirim',
  );
}

export function isPending(sale: Sale, queue: readonly SyncItem[]): boolean {
  const owes = (sale.payment === 'piutang' || sale.payment === 'dp') && sale.paid < sale.total;
  return owes || isUnsynced(sale, queue);
}

function matchesMethod(sale: Sale, method: MethodFilter | undefined): boolean {
  if (method === undefined || method === 'semua') {
    return true;
  }
  const kind = paymentKeyOf(sale);
  if (method === 'piutang') {
    return kind === 'piutang' || kind === 'dp';
  }
  return kind === method;
}

export function filterSales(
  sales: readonly Sale[],
  queue: readonly SyncItem[],
  filter: HistoryFilter,
  customerName: (id: string | undefined) => string,
): Sale[] {
  const needle = filter.query.trim().toLowerCase();
  return sales
    .filter((sale) => {
      const day = saleDate(sale);
      if (filter.start !== '' && day < filter.start) {
        return false;
      }
      if (filter.end !== '' && day > filter.end) {
        return false;
      }
      if (filter.onlyDevice !== undefined && !filter.onlyDevice.has(sale.number)) {
        return false;
      }
      if (!matchesMethod(sale, filter.method)) {
        return false;
      }
      const pending = isPending(sale, queue);
      if (filter.status === 'lunas' && pending) {
        return false;
      }
      if (filter.status === 'pending' && !pending) {
        return false;
      }
      return (
        needle === '' ||
        sale.number.toLowerCase().includes(needle) ||
        customerName(sale.customerId).toLowerCase().includes(needle)
      );
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function pageSlice<T>(items: readonly T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

export interface DayGroup {
  readonly day: string;
  readonly sales: readonly Sale[];
}

// Kelompok per hari WIB: hari terbaru dulu, dan terbaru dulu di dalam hari.
export function groupByDay(sales: readonly Sale[]): DayGroup[] {
  const sorted = [...sales].sort((first, second) =>
    second.createdAt.localeCompare(first.createdAt),
  );
  const groups = new Map<string, Sale[]>();
  for (const sale of sorted) {
    const day = saleDate(sale);
    const list = groups.get(day) ?? [];
    list.push(sale);
    groups.set(day, list);
  }
  return [...groups].map(([day, items]) => ({ day, sales: items }));
}

// Baris penerimaan transaksi. Data bawaan lama tanpa rincian disusun dari payment dan paid.
export function paymentRowsOf(sale: Sale): readonly SalePayment[] {
  if (sale.payments === undefined) {
    const owed = sale.total - sale.paid;
    return [
      ...(sale.paid > 0 ? [{ method: sale.payment, amount: sale.paid }] : []),
      ...(owed > 0 ? [{ method: 'piutang' as const, amount: owed }] : []),
    ];
  }
  return sale.payments.filter((row) => row.amount > 0);
}

export function paymentKeyOf(sale: Sale): 'split' | PaymentMethod {
  const paid = paymentRowsOf(sale).filter((row) => row.method !== 'piutang');
  return paid.length > 1 ? 'split' : sale.payment;
}

export function receivableInfo(
  sale: Sale,
): { readonly sisa: number; readonly dueDate: string | undefined } | undefined {
  const sisa = sale.total - sale.paid;
  return sisa > 0 ? { sisa, dueDate: sale.terms?.dueDate } : undefined;
}

export function methodSummary(sale: Sale): {
  readonly kind: 'split' | PaymentMethod;
  readonly channel?: string;
} {
  const kind = paymentKeyOf(sale);
  const channel = paymentRowsOf(sale).find((row) => row.method === kind)?.channel;
  return channel === undefined ? { kind } : { kind, channel };
}

const VISIBLE_RECEIPTS = 2;

// Riwayat Penerimaan memperlihatkan dua baris lebih dulu; sisanya lewat "+ N Penerimaan Lainnya".
export function visibleReceipts(
  rows: readonly SalePayment[],
  expanded: boolean,
): { readonly shown: readonly SalePayment[]; readonly hidden: number; readonly extra: number } {
  const extra = Math.max(0, rows.length - VISIBLE_RECEIPTS);
  if (expanded || extra === 0) {
    return { shown: rows, hidden: 0, extra };
  }
  return { shown: rows.slice(0, VISIBLE_RECEIPTS), hidden: extra, extra };
}

// Subtotal baris sebelum diskon, diskon (selisihnya terhadap total tersimpan), dan grand total.
export function saleBreakdown(sale: Sale): {
  readonly subtotal: number;
  readonly discount: number;
  readonly grandTotal: number;
} {
  const gross =
    sale.lines.length === 0
      ? sale.total
      : sale.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  return {
    subtotal: gross,
    discount: Math.max(0, gross - sale.total),
    grandTotal: sale.total,
  };
}
