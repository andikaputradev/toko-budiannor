import { balanceOf, outstanding, wibDate } from '../data/receivable';
import type { Customer, InvoicePayment, ReceivableInvoice } from '../data/types';
import { formatRupiah } from '../format';
import type { SystemMessageId } from '../messages';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OverdueRow {
  readonly customer: Customer;
  readonly oldestDue: string;
  readonly daysLate: number;
  readonly amount: number;
  readonly invoices: readonly ReceivableInvoice[];
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function overdueRows(customers: readonly Customer[], now: Date): OverdueRow[] {
  const today = wibDate(now);
  const rows: OverdueRow[] = [];
  for (const customer of customers) {
    const invoices = customer.invoices
      .filter((invoice) => balanceOf(invoice) > 0 && invoice.dueAt < today)
      .sort((first, second) => first.dueAt.localeCompare(second.dueAt));
    const oldest = invoices[0];
    if (oldest === undefined) {
      continue;
    }
    rows.push({
      customer,
      oldestDue: oldest.dueAt,
      daysLate: daysBetweenDates(oldest.dueAt, today),
      amount: invoices.reduce((sum, invoice) => sum + balanceOf(invoice), 0),
      invoices,
    });
  }
  return rows.sort(
    (first, second) => second.daysLate - first.daysLate || second.amount - first.amount,
  );
}

export function totalOverdue(rows: readonly OverdueRow[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export function parseAmount(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

export type PaymentCheck =
  | { readonly ok: true; readonly amount: number }
  | {
      readonly ok: false;
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string>>;
    };

// Bila invoiceId diberikan, batas pembayaran adalah sisa invoice itu saja.
export function validatePayment(customer: Customer, raw: string, invoiceId?: string): PaymentCheck {
  const amount = parseAmount(raw);
  if (amount <= 0) {
    return { ok: false, messageId: 'MSG-029', values: {} };
  }
  const target =
    invoiceId === undefined ? undefined : customer.invoices.find((item) => item.id === invoiceId);
  const balance = target === undefined ? outstanding(customer) : balanceOf(target);
  if (amount > balance) {
    return { ok: false, messageId: 'MSG-087', values: { saldo: formatRupiah(balance) } };
  }
  return { ok: true, amount };
}

export interface PaymentOptions {
  /** Invoice yang dilunasi lebih dahulu; sisanya mengalir ke invoice tertua. */
  readonly firstId?: string | undefined;
  /** Bila diisi, pembayaran dicatat pada riwayat invoice. */
  readonly record?: { readonly method: InvoicePayment['method']; readonly at: string } | undefined;
}

interface SettleableInvoice {
  readonly id: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
  readonly payments?: readonly InvoicePayment[] | undefined;
}

// Dipakai bersama oleh piutang pelanggan dan hutang supplier: melunasi invoice tertua lebih dahulu.
export function settleInvoices<T extends SettleableInvoice>(
  invoices: readonly T[],
  amount: number,
  options: PaymentOptions = {},
): T[] {
  let remaining = amount;
  const order = [...invoices].sort(
    (first, second) =>
      Number(second.id === options.firstId) - Number(first.id === options.firstId) ||
      first.dueAt.localeCompare(second.dueAt),
  );
  const paidNow = new Map<string, number>();
  for (const invoice of order) {
    if (remaining <= 0) {
      break;
    }
    const pay = Math.min(Math.max(0, invoice.amount - invoice.paid), remaining);
    paidNow.set(invoice.id, pay);
    remaining -= pay;
  }
  const record = options.record;
  return invoices.map((invoice) => {
    const pay = paidNow.get(invoice.id) ?? 0;
    const payments =
      record === undefined || pay <= 0
        ? invoice.payments
        : [...(invoice.payments ?? []), { at: record.at, amount: pay, method: record.method }];
    return {
      ...invoice,
      paid: invoice.paid + pay,
      ...(payments === undefined ? {} : { payments }),
    };
  });
}

export function applyPayment(
  customer: Customer,
  amount: number,
  options: PaymentOptions = {},
): ReceivableInvoice[] {
  return settleInvoices(customer.invoices, amount, options);
}

function international(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

export function telUrl(phone: string): string {
  return `tel:+${international(phone)}`;
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${international(phone)}?text=${encodeURIComponent(text)}`;
}
