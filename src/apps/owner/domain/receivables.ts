import { balanceOf, wibDate } from '../../../shared/data/receivable';
import type { Customer, ReceivableInvoice } from '../../../shared/data/types';
import { daysBetweenDates } from '../../../shared/domain/receivables';

export interface ReceivableRow {
  readonly customer: Customer;
  readonly balance: number;
  /** Invoice yang masih punya sisa, jatuh tempo tertua lebih dahulu. */
  readonly openInvoices: readonly ReceivableInvoice[];
  readonly overdueAmount: number;
  /** Hari keterlambatan invoice tertua yang lewat jatuh tempo; 0 bila belum ada. */
  readonly daysLate: number;
  readonly oldestDue: string;
}

export function openInvoicesOf(customer: Customer): ReceivableInvoice[] {
  return customer.invoices
    .filter((invoice) => balanceOf(invoice) > 0)
    .sort((first, second) => first.dueAt.localeCompare(second.dueAt));
}

// Semua pelanggan yang masih punya piutang; yang terlambat lebih dahulu, lalu sisa terbesar.
export function receivableRows(customers: readonly Customer[], now: Date): ReceivableRow[] {
  const today = wibDate(now);
  const rows: ReceivableRow[] = [];
  for (const customer of customers) {
    const open = openInvoicesOf(customer);
    const oldest = open[0];
    if (oldest === undefined) {
      continue;
    }
    const late = open.filter((invoice) => invoice.dueAt < today);
    rows.push({
      customer,
      balance: open.reduce((sum, invoice) => sum + balanceOf(invoice), 0),
      openInvoices: open,
      overdueAmount: late.reduce((sum, invoice) => sum + balanceOf(invoice), 0),
      daysLate: late[0] === undefined ? 0 : daysBetweenDates(late[0].dueAt, today),
      oldestDue: oldest.dueAt,
    });
  }
  return rows.sort(
    (first, second) => second.daysLate - first.daysLate || second.balance - first.balance,
  );
}

export function totalReceivable(rows: readonly ReceivableRow[]): number {
  return rows.reduce((sum, row) => sum + row.balance, 0);
}

export function totalReceivableOverdue(rows: readonly ReceivableRow[]): number {
  return rows.reduce((sum, row) => sum + row.overdueAmount, 0);
}

export * from '../../../shared/domain/receivables';
