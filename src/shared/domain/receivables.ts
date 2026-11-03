import { balanceOf, outstanding, wibDate } from '../data/receivable';
import type { Customer, ReceivableInvoice } from '../data/types';
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

export function validatePayment(customer: Customer, raw: string): PaymentCheck {
  const amount = parseAmount(raw);
  if (amount <= 0) {
    return { ok: false, messageId: 'MSG-029', values: {} };
  }
  const balance = outstanding(customer);
  if (amount > balance) {
    return { ok: false, messageId: 'MSG-087', values: { saldo: formatRupiah(balance) } };
  }
  return { ok: true, amount };
}

export function applyPayment(customer: Customer, amount: number): ReceivableInvoice[] {
  let remaining = amount;
  const order = [...customer.invoices].sort((first, second) =>
    first.dueAt.localeCompare(second.dueAt),
  );
  const paidNow = new Map<string, number>();
  for (const invoice of order) {
    if (remaining <= 0) {
      break;
    }
    const pay = Math.min(balanceOf(invoice), remaining);
    paidNow.set(invoice.id, pay);
    remaining -= pay;
  }
  return customer.invoices.map((invoice) => ({
    ...invoice,
    paid: invoice.paid + (paidNow.get(invoice.id) ?? 0),
  }));
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
