import { wibDate } from '../../../shared/data/receivable';
import type { AppState } from '../../../shared/store/store';

export type OrderKind = 'po' | 'so';
export type OrderStatus = 'on-proses' | 'partial' | 'selesai';

export interface OrderRow {
  readonly kind: OrderKind;
  readonly number: string;
  // Tanggal WIB berformat YYYY-MM-DD.
  readonly date: string;
  // Pemasok (PO) atau pelanggan (SO).
  readonly partyName: string;
  readonly notes: string;
  readonly status: OrderStatus;
  readonly total: number;
  readonly createdBy: string;
}

export interface OrderFilter {
  readonly start?: string;
  readonly end?: string;
  readonly party?: string;
  readonly status: 'semua' | OrderStatus;
  readonly text: string;
}

const newestFirst = (rows: readonly OrderRow[]): OrderRow[] =>
  [...rows].sort((first, second) => second.date.localeCompare(first.date));

// draf dan dipesan masih berjalan; diterima sebagian Partial; diterima Selesai.
export function buildPurchaseOrderRows(state: AppState): OrderRow[] {
  const staffName = (id: string): string =>
    state.data.users.find((user) => user.id === id)?.name ?? id;
  return newestFirst(
    state.purchaseOrders.map((order): OrderRow => {
      let status: OrderStatus = 'on-proses';
      if (order.status === 'diterima-sebagian') {
        status = 'partial';
      } else if (order.status === 'diterima') {
        status = 'selesai';
      }
      return {
        kind: 'po',
        number: order.number,
        date: wibDate(new Date(order.createdAt)),
        partyName: state.data.suppliers.find((item) => item.id === order.supplierId)?.name ?? '-',
        notes: order.notes ?? '',
        status,
        total: order.total,
        createdBy: staffName(order.createdBy),
      };
    }),
  );
}

// Model SO hanya mengenal draf. SO yang sudah diimpor ke Faktur Penjualan pada sesi ini Selesai.
export function buildSalesOrderRows(
  state: AppState,
  importedNumbers: ReadonlySet<string>,
): OrderRow[] {
  const staffName = (id: string): string =>
    state.data.users.find((user) => user.id === id)?.name ?? id;
  return newestFirst(
    state.salesOrders.map((order): OrderRow => ({
      kind: 'so',
      number: order.number,
      date: wibDate(new Date(order.createdAt)),
      partyName: state.data.customers.find((item) => item.id === order.customerId)?.name ?? 'Umum',
      notes: order.notes ?? '',
      status: importedNumbers.has(order.number) ? 'selesai' : 'on-proses',
      total: order.total,
      createdBy: staffName(order.createdBy),
    })),
  );
}

export function filterOrderRows(rows: readonly OrderRow[], filter: OrderFilter): OrderRow[] {
  const text = filter.text.trim().toLowerCase();
  const party = filter.party ?? '';
  return rows.filter((row) => {
    if (filter.status !== 'semua' && row.status !== filter.status) {
      return false;
    }
    if (party !== '' && row.partyName !== party) {
      return false;
    }
    if (filter.start !== undefined && row.date < filter.start) {
      return false;
    }
    if (filter.end !== undefined && row.date > filter.end) {
      return false;
    }
    return (
      text === '' ||
      row.number.toLowerCase().includes(text) ||
      row.partyName.toLowerCase().includes(text) ||
      row.notes.toLowerCase().includes(text)
    );
  });
}

export function validateOrderDraft(input: {
  readonly partyId: string | undefined;
  readonly lines: number;
}): 'ok' | 'party' | 'lines' {
  if (input.partyId === undefined || input.partyId === '') {
    return 'party';
  }
  return input.lines > 0 ? 'ok' : 'lines';
}

// Nomor PO atau SO buatan BO: PO atau SO, tahun dan bulan dua digit, lalu urutan mulai 1001.
// Nomor berformat lain (SO-0001 dari aplikasi Owner dan Sales) diabaikan.
export function nextOrderNumber(
  kind: OrderKind,
  existing: readonly string[],
  today: string,
): string {
  const prefix = `${kind === 'po' ? 'PO' : 'SO'}${today.slice(2, 4)}${today.slice(5, 7)}`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const last = existing.reduce((max, number) => {
    const found = pattern.exec(number);
    return found?.[1] === undefined ? max : Math.max(max, Number(found[1]));
  }, 1000);
  return `${prefix}${String(last + 1)}`;
}
