import { wibDate } from '../../../shared/data/receivable';
import type { BillLine, Product } from '../../../shared/data/types';
import { label } from '../../../shared/messages';
import type { AppState } from '../../../shared/store/store';
import { lineSubtotal } from '../../pos/domain/bill';
import { buildInvoices } from './invoices';
import type { CorrectionDoc } from './stock-correction';

// Tanggal WIB berformat YYYY-MM-DD, batas awal dan akhir sama-sama termasuk.
export interface HistoryRange {
  readonly from: string;
  readonly to: string;
}

export interface HistoryRow {
  readonly at: string;
  readonly number: string;
  // Pemasok (pembelian), pelanggan (penjualan), atau petugas (koreksi).
  readonly party: string;
  readonly quantity: number;
  readonly unit: string;
  readonly amount: number;
}

export interface ProductHistory {
  readonly pembelian: readonly HistoryRow[];
  readonly penjualan: readonly HistoryRow[];
  readonly koreksi: readonly HistoryRow[];
}

export const DEFAULT_RANGE_DAYS = 30;

export function defaultRange(today: string): HistoryRange {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - DEFAULT_RANGE_DAYS);
  return { from: start.toISOString().slice(0, 10), to: today };
}

// Rentang yang terbalik (Dari lebih besar dari Sampai) ditukar, bukan ditolak.
export function normalizeRange(range: HistoryRange): HistoryRange {
  return range.from > range.to ? { from: range.to, to: range.from } : range;
}

const newestFirst = (rows: readonly HistoryRow[]): HistoryRow[] =>
  [...rows].sort((first, second) => second.at.localeCompare(first.at));

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
  const billRow = (at: string, number: string, party: string, line: BillLine): HistoryRow => ({
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
        pembelian.push({
          at: order.createdAt,
          number: order.number,
          party: supplierName,
          quantity: line.quantity,
          unit: line.unit,
          amount: line.quantity * line.unitPrice,
        });
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

  const koreksi: HistoryRow[] = [];
  for (const doc of input.corrections) {
    if (inRange(doc.at)) {
      for (const line of doc.lines.filter(ofProduct)) {
        koreksi.push({
          at: doc.at,
          number: doc.number,
          party: doc.userName,
          quantity: line.diffQty,
          unit: line.unit,
          amount: line.value,
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
