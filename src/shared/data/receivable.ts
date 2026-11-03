import { formatRupiah } from '../format';
import type { SystemMessageId } from '../messages';
import type { Customer, ReceivableInvoice } from './types';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type ReceivableDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unregistered' | 'over-limit' | 'overdue';
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string>>;
    };

export function wibDate(date: Date): string {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function balanceOf(invoice: ReceivableInvoice): number {
  return Math.max(0, invoice.amount - invoice.paid);
}

export function outstanding(customer: Customer): number {
  return customer.invoices.reduce((sum, invoice) => sum + balanceOf(invoice), 0);
}

export function remainingLimit(customer: Customer): number {
  return customer.limit - outstanding(customer);
}

export function overdueInvoices(customer: Customer, now: Date): ReceivableInvoice[] {
  const today = wibDate(now);
  return customer.invoices.filter((invoice) => balanceOf(invoice) > 0 && invoice.dueAt < today);
}

export function receivableAmount(total: number, downPayment: number): number {
  return Math.max(0, total - Math.max(0, downPayment));
}

export function checkReceivable(
  customer: Customer | undefined,
  amount: number,
  now: Date,
): ReceivableDecision {
  if (customer === undefined) {
    return { ok: false, reason: 'unregistered', messageId: 'MSG-034', values: {} };
  }
  const remaining = remainingLimit(customer);
  if (amount > remaining) {
    return {
      ok: false,
      reason: 'over-limit',
      messageId: 'MSG-035',
      values: { piutang: formatRupiah(amount), sisaLimit: formatRupiah(Math.max(0, remaining)) },
    };
  }
  if (overdueInvoices(customer, now).length > 0) {
    return { ok: false, reason: 'overdue', messageId: 'MSG-036', values: {} };
  }
  return { ok: true };
}
