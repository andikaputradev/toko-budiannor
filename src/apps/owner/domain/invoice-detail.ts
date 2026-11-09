import { buildInvoiceLines, hashText } from '../../../shared/data/invoice-lines';
import type {
  BillLine,
  Customer,
  InvoicePayment,
  PayableInvoice,
  Product,
  ReceivableInvoice,
} from '../../../shared/data/types';
import { daysBetweenDates } from '../../../shared/domain/receivables';
import { detailLines, type DetailLine } from './bills';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_METHODS: readonly InvoicePayment['method'][] = ['transfer', 'tunai', 'qris'];

export type InvoiceStatusKind = 'lunas' | 'belum-lunas' | 'terlambat';

export interface InvoiceStatus {
  readonly kind: InvoiceStatusKind;
  readonly daysLate: number;
}

export interface InvoiceDetail {
  readonly id: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
  readonly balance: number;
  readonly status: InvoiceStatus;
  readonly lines: readonly DetailLine[];
  readonly payments: readonly InvoicePayment[];
}

interface InvoiceLike {
  readonly id: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
  readonly payments?: readonly InvoicePayment[] | undefined;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function invoiceStatus(
  invoice: Pick<InvoiceLike, 'amount' | 'paid' | 'dueAt'>,
  today: string,
): InvoiceStatus {
  if (invoice.paid >= invoice.amount) {
    return { kind: 'lunas', daysLate: 0 };
  }
  if (invoice.dueAt < today) {
    return { kind: 'terlambat', daysLate: daysBetweenDates(invoice.dueAt, today) };
  }
  return { kind: 'belum-lunas', daysLate: 0 };
}

// Rincian barang invoice piutang: dibangkitkan dari katalog dengan harga tier pelanggan.
export function receivableLines(
  customer: Customer,
  invoice: ReceivableInvoice,
  products: readonly Product[],
): BillLine[] {
  return buildInvoiceLines(
    invoice.id,
    invoice.amount,
    products,
    (product, unit) => product.prices[unit.code]?.[customer.tier] ?? 0,
  );
}

// Riwayat bayar: catatan pembayaran nyata, ditambah satu entri "sebelumnya" untuk sisa nilai terbayar.
export function paymentHistory(invoice: InvoiceLike, today: string): InvoicePayment[] {
  const recorded = invoice.payments ?? [];
  const known = recorded.reduce((sum, item) => sum + item.amount, 0);
  const earlier = invoice.paid - known;
  const entries: InvoicePayment[] = [...recorded];
  if (earlier > 0) {
    const end = invoice.dueAt < today ? invoice.dueAt : today;
    const span = Math.max(0, daysBetweenDates(invoice.issuedAt, end));
    const offset = Math.min(span, Math.max(1, Math.floor(span / 2)));
    entries.unshift({
      at: addDays(invoice.issuedAt, offset),
      amount: earlier,
      method: PAYMENT_METHODS[hashText(invoice.id) % PAYMENT_METHODS.length] ?? 'transfer',
    });
  }
  return entries.sort((first, second) => first.at.localeCompare(second.at));
}

function assemble(
  invoice: InvoiceLike,
  lines: readonly BillLine[],
  lookup: (id: string) => Product | undefined,
  today: string,
): InvoiceDetail {
  return {
    id: invoice.id,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    amount: invoice.amount,
    paid: invoice.paid,
    balance: Math.max(0, invoice.amount - invoice.paid),
    status: invoiceStatus(invoice, today),
    lines: detailLines(lines, lookup),
    payments: paymentHistory(invoice, today),
  };
}

export function receivableInvoiceDetail(
  customer: Customer,
  invoice: ReceivableInvoice,
  products: readonly Product[],
  lookup: (id: string) => Product | undefined,
  today: string,
): InvoiceDetail {
  return assemble(invoice, receivableLines(customer, invoice, products), lookup, today);
}

export function payableInvoiceDetail(
  invoice: PayableInvoice,
  lookup: (id: string) => Product | undefined,
  today: string,
): InvoiceDetail {
  return assemble(invoice, invoice.lines, lookup, today);
}
