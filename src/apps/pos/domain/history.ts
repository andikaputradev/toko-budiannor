import { wibDate } from '../../../shared/data/receivable';
import type { Sale, SyncItem } from '../../../shared/data/types';

export type StatusFilter = 'semua' | 'lunas' | 'pending';

export const PAGE_SIZE = 50;

export interface HistoryFilter {
  readonly start: string;
  readonly end: string;
  readonly status: StatusFilter;
  readonly query: string;
  readonly onlyDevice: ReadonlySet<string> | undefined;
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
