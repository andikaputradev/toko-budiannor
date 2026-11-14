import { wibDate } from '../../../shared/data/receivable';
import type { BillLine, Product, WarehouseId } from '../../../shared/data/types';
import { label } from '../../../shared/messages';
import type { AppState } from '../../../shared/store/store';
import { lineSubtotal } from '../../pos/domain/bill';
import { buildInvoices } from './invoices';
import type { CorrectionDoc } from './stock-correction';
import {
  buildStockCard,
  movementsFor,
  type CardRow,
  type MovementKind,
  type MovementSources,
} from './stock-report';
import type { WarehouseFilter } from './stock-view';

// Tanggal WIB berformat YYYY-MM-DD, batas awal dan akhir sama-sama termasuk.
export interface HistoryRange {
  readonly from: string;
  readonly to: string;
}

export interface HistoryRow {
  readonly at: string;
  readonly number: string;
  // Pemasok (pembelian) atau pelanggan (penjualan).
  readonly party: string;
  readonly quantity: number;
  readonly unit: string;
  readonly amount: number;
  // Harga satuan setelah diskon baris: jumlah dibagi kuantitas, dibulatkan.
  readonly unitPrice: number;
}

export interface CorrectionHistoryRow {
  readonly at: string;
  readonly number: string;
  readonly qtyBefore: number;
  readonly action: 'tambah' | 'kurang';
  // Selisih mutlak, dalam satuan baris koreksi.
  readonly qty: number;
  readonly qtyAfter: number;
  readonly unit: string;
}

export interface MutationHistoryRow {
  readonly at: string;
  readonly number: string;
  readonly kind: MovementKind | 'saldo-awal';
  readonly name: string;
  readonly inQty: number;
  readonly outQty: number;
  readonly balance: number;
}

export interface ProductHistory {
  readonly pembelian: readonly HistoryRow[];
  readonly penjualan: readonly HistoryRow[];
  readonly koreksi: readonly CorrectionHistoryRow[];
}

export const DEFAULT_RANGE_MONTHS = 3;

// Bawaan menyamai gambar klien (01/08/2026 s/d 12/11/2026): tanggal 1 pada tiga bulan sebelumnya
// sampai hari ini.
export function defaultRange(today: string): HistoryRange {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - DEFAULT_RANGE_MONTHS);
  return { from: start.toISOString().slice(0, 10), to: today };
}

// Rentang yang terbalik (Dari lebih besar dari Sampai) ditukar, bukan ditolak.
export function normalizeRange(range: HistoryRange): HistoryRange {
  return range.from > range.to ? { from: range.to, to: range.from } : range;
}

const newestFirst = <T extends { readonly at: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((first, second) => second.at.localeCompare(first.at));

const withUnitPrice = (row: Omit<HistoryRow, 'unitPrice'>): HistoryRow => ({
  ...row,
  unitPrice: row.quantity === 0 ? 0 : Math.round(row.amount / row.quantity),
});

export function filterByParty(rows: readonly HistoryRow[], text: string): HistoryRow[] {
  const query = text.trim().toLowerCase();
  return query === '' ? [...rows] : rows.filter((row) => row.party.toLowerCase().includes(query));
}

export function buildProductHistory(input: {
  readonly product: Product;
  readonly state: AppState;
  readonly corrections: readonly CorrectionDoc[];
  readonly range: HistoryRange;
}): ProductHistory {
  const { product, state } = input;
  const range = normalizeRange(input.range);
  const inRange = (at: string): boolean => {
    const day = wibDate(new Date(at));
    return day >= range.from && day <= range.to;
  };
  const ofProduct = (line: { readonly productId: string }): boolean =>
    line.productId === product.id;
  const billRow = (at: string, number: string, party: string, line: BillLine): HistoryRow =>
    withUnitPrice({
      at,
      number,
      party,
      quantity: line.quantity,
      unit: line.unit,
      amount: lineSubtotal(line),
    });

  const pembelian: HistoryRow[] = [];
  for (const supplier of state.data.suppliers) {
    for (const invoice of supplier.invoices ?? []) {
      if (inRange(invoice.issuedAt)) {
        for (const line of invoice.lines.filter(ofProduct)) {
          pembelian.push(billRow(invoice.issuedAt, invoice.id, supplier.name, line));
        }
      }
    }
  }
  for (const order of state.purchaseOrders) {
    if (inRange(order.createdAt)) {
      const supplierName =
        state.data.suppliers.find((item) => item.id === order.supplierId)?.name ?? '-';
      for (const line of order.lines.filter(ofProduct)) {
        pembelian.push(
          withUnitPrice({
            at: order.createdAt,
            number: order.number,
            party: supplierName,
            quantity: line.quantity,
            unit: line.unit,
            amount: line.quantity * line.unitPrice,
          }),
        );
      }
    }
  }

  const penjualan: HistoryRow[] = [];
  for (const invoice of buildInvoices(state.data, state.salesOrders)) {
    if (inRange(invoice.at)) {
      for (const line of invoice.lines.filter(ofProduct)) {
        penjualan.push(
          billRow(invoice.at, invoice.number, invoice.customerName ?? label('pelangganUmum'), line),
        );
      }
    }
  }

  const koreksi: CorrectionHistoryRow[] = [];
  for (const doc of input.corrections) {
    if (inRange(doc.at)) {
      for (const line of doc.lines.filter(ofProduct)) {
        koreksi.push({
          at: doc.at,
          number: doc.number,
          qtyBefore: line.systemQty,
          action: line.diffQty < 0 ? 'kurang' : 'tambah',
          qty: Math.abs(line.diffQty),
          qtyAfter: line.actualQty,
          unit: line.unit,
        });
      }
    }
  }

  return {
    pembelian: newestFirst(pembelian),
    penjualan: newestFirst(penjualan),
    koreksi: newestFirst(koreksi),
  };
}

const WAREHOUSE_NAME: Readonly<Record<WarehouseId, string>> = {
  display: 'TOKO',
  besar: 'GUDANG BESAR',
};

function mutationName(row: CardRow): string {
  switch (row.kind) {
    case 'pembelian':
      return row.party ?? '-';
    case 'penjualan':
      return row.party ?? label('pelangganUmum');
    case 'retur-penjualan':
      return row.party ?? 'RETUR PENJUALAN';
    case 'retur-pembelian':
      return row.party ?? 'RETUR PEMBELIAN';
    case 'koreksi':
      return 'KOREKSI';
    case 'opname':
      return 'OPNAME';
    case 'mutasi': {
      const from = row.from === undefined ? '-' : WAREHOUSE_NAME[row.from];
      const to = row.to === undefined ? '-' : WAREHOUSE_NAME[row.to];
      if (row.internal) {
        return `${from} ke ${to}`;
      }
      // Satu gudang: tampilkan gudang lawannya (tujuan untuk keluar, asal untuk masuk).
      return row.outQty > 0 ? to : from;
    }
  }
}

// Riwayat mutasi satu barang untuk tab Mutasi: Kartu Stok dengan baris SALDO AWAL di depan. Saldo
// dihitung mundur dari stok sistem sekarang (lihat buildStockCard), satuannya satuan dasar.
export function buildMutationHistory(input: {
  readonly product: Product;
  readonly sources: MovementSources;
  readonly range: HistoryRange;
  readonly warehouse: WarehouseFilter;
}): {
  readonly opening: number;
  readonly rows: readonly MutationHistoryRow[];
  readonly unit: string;
} {
  const range = normalizeRange(input.range);
  const card = buildStockCard(input.product, movementsFor(input.product, input.sources), {
    start: range.from,
    end: range.to,
    warehouse: input.warehouse,
  });
  const opening: MutationHistoryRow = {
    at: new Date(`${range.from}T00:00:00+07:00`).toISOString(),
    number: '-',
    kind: 'saldo-awal',
    name: 'SALDO AWAL',
    inQty: Math.max(0, card.opening),
    outQty: Math.max(0, -card.opening),
    balance: card.opening,
  };
  return {
    opening: card.opening,
    unit: input.product.baseUnit,
    rows: [
      opening,
      ...card.rows.map((row): MutationHistoryRow => ({
        at: row.at,
        number: row.document,
        kind: row.kind,
        name: mutationName(row),
        inQty: row.inQty,
        outQty: row.outQty,
        balance: row.balance,
      })),
    ],
  };
}
