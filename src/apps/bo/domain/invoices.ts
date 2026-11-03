import { wibDate } from '../../../shared/data/receivable';
import type {
  BillLine,
  Dataset,
  PaymentMethod,
  Product,
  SalesOrder,
} from '../../../shared/data/types';

export type InvoiceStatus = 'lunas' | 'pending' | 'draf';
export type InvoiceSource = 'pos' | 'sales' | 'owner';

export interface InvoiceRow {
  readonly number: string;
  readonly at: string;
  readonly customerName: string | undefined;
  readonly total: number;
  readonly status: InvoiceStatus;
  readonly source: InvoiceSource;
  readonly staff: string;
  readonly payment: PaymentMethod;
  readonly paid: number;
  readonly lines: readonly BillLine[];
}

export interface InvoiceFilter {
  readonly start: string;
  readonly end: string;
  readonly status: 'semua' | InvoiceStatus;
  readonly text: string;
}

export const PAGE_SIZE = 50;

export function buildInvoices(data: Dataset, orders: readonly SalesOrder[]): InvoiceRow[] {
  const customerName = (id: string | undefined): string | undefined =>
    data.customers.find((item) => item.id === id)?.name;
  const staffName = (id: string): string => data.users.find((item) => item.id === id)?.name ?? id;
  const posRows: InvoiceRow[] = data.sales.map((sale) => ({
    number: sale.number,
    at: sale.createdAt,
    customerName: customerName(sale.customerId),
    total: sale.total,
    status: sale.paid >= sale.total ? 'lunas' : 'pending',
    source: 'pos',
    staff: staffName(sale.cashierId),
    payment: sale.payment,
    paid: sale.paid,
    lines: sale.lines,
  }));
  const draftRows: InvoiceRow[] = orders
    .filter((order) => order.synced !== false)
    .map((order) => ({
      number: order.number,
      at: order.createdAt,
      customerName: customerName(order.customerId),
      total: order.total,
      status: 'draf',
      source: order.source,
      staff: staffName(order.createdBy),
      payment: order.payment,
      paid: order.downPayment,
      lines: order.lines,
    }));
  return [...posRows, ...draftRows].sort((first, second) => second.at.localeCompare(first.at));
}

export function filterInvoices(
  rows: readonly InvoiceRow[],
  filter: InvoiceFilter,
  customerFallback: string,
): InvoiceRow[] {
  const query = filter.text.trim().toLowerCase();
  return rows.filter((row) => {
    const day = wibDate(new Date(row.at));
    if (day < filter.start || day > filter.end) {
      return false;
    }
    if (filter.status !== 'semua' && row.status !== filter.status) {
      return false;
    }
    if (query === '') {
      return true;
    }
    return (
      row.number.toLowerCase().includes(query) ||
      (row.customerName ?? customerFallback).toLowerCase().includes(query)
    );
  });
}

export function grossProfit(row: InvoiceRow, products: readonly Product[]): number {
  const byId = new Map(products.map((product) => [product.id, product]));
  const cost = row.lines.reduce((sum, line) => {
    const product = byId.get(line.productId);
    const factor = product?.units.find((unit) => unit.code === line.unit)?.factor ?? 1;
    return sum + line.quantity * (product?.hpp ?? 0) * factor;
  }, 0);
  return row.total - Math.round(cost);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
