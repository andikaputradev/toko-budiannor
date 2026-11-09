import { wibDate } from '../../../shared/data/receivable';
import type { PayableInvoice, Supplier } from '../../../shared/data/types';
import {
  daysBetweenDates,
  parseAmount,
  settleInvoices,
  type PaymentOptions,
} from '../../../shared/domain/receivables';
import type { LabelKey, SystemMessageId } from '../../../shared/messages';
import { formatRupiah } from '../../../shared/format';

export function remainingOf(invoice: PayableInvoice): number {
  return Math.max(0, invoice.amount - invoice.paid);
}

// Hutang supplier diturunkan dari faktur; supplier tanpa faktur memakai angka payable apa adanya.
export function supplierBalance(supplier: Supplier): number {
  return supplier.invoices === undefined
    ? supplier.payable
    : supplier.invoices.reduce((sum, invoice) => sum + remainingOf(invoice), 0);
}

export function openPayables(supplier: Supplier): PayableInvoice[] {
  return (supplier.invoices ?? [])
    .filter((invoice) => remainingOf(invoice) > 0)
    .sort((first, second) => first.dueAt.localeCompare(second.dueAt));
}

export interface PayableRow {
  readonly supplier: Supplier;
  readonly balance: number;
  readonly open: readonly PayableInvoice[];
  readonly oldestDue: string | undefined;
  /** Hari keterlambatan faktur tertua yang lewat jatuh tempo; 0 bila belum ada. */
  readonly daysLate: number;
  readonly overdueAmount: number;
}

// Supplier yang masih berhutang; yang terlambat lebih dahulu, lalu hutang terbesar.
export function payableRows(suppliers: readonly Supplier[], now: Date): PayableRow[] {
  const today = wibDate(now);
  const rows: PayableRow[] = [];
  for (const supplier of suppliers) {
    const balance = supplierBalance(supplier);
    if (balance <= 0) {
      continue;
    }
    const open = openPayables(supplier);
    const late = open.filter((invoice) => invoice.dueAt < today);
    rows.push({
      supplier,
      balance,
      open,
      oldestDue: open[0]?.dueAt,
      daysLate: late[0] === undefined ? 0 : daysBetweenDates(late[0].dueAt, today),
      overdueAmount: late.reduce((sum, invoice) => sum + remainingOf(invoice), 0),
    });
  }
  return rows.sort(
    (first, second) => second.daysLate - first.daysLate || second.balance - first.balance,
  );
}

export function totalPayable(rows: readonly PayableRow[]): number {
  return rows.reduce((sum, row) => sum + row.balance, 0);
}

export function openInvoiceCount(rows: readonly PayableRow[]): number {
  return rows.reduce((sum, row) => sum + row.open.length, 0);
}

export type PayableCheck =
  | { readonly ok: true; readonly amount: number }
  | {
      readonly ok: false;
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string>>;
    }
  | {
      readonly ok: false;
      readonly labelKey: LabelKey;
      readonly values: Readonly<Record<string, string>>;
    };

// Bila invoiceId diberikan, batas pembayaran adalah sisa faktur itu saja.
export function validatePayablePayment(
  supplier: Supplier,
  raw: string,
  invoiceId?: string,
): PayableCheck {
  const amount = parseAmount(raw);
  if (amount <= 0) {
    return { ok: false, messageId: 'MSG-029', values: {} };
  }
  const target =
    invoiceId === undefined
      ? undefined
      : supplier.invoices?.find((invoice) => invoice.id === invoiceId);
  const balance = target === undefined ? supplierBalance(supplier) : remainingOf(target);
  if (amount > balance) {
    return {
      ok: false,
      labelKey: 'htgMelebihiSaldo',
      values: { saldo: formatRupiah(balance) },
    };
  }
  return { ok: true, amount };
}

// Mengurangi faktur tertua lebih dahulu (atau faktur pilihan lebih dahulu); payable ikut turun.
export function applyPayablePayment(
  supplier: Supplier,
  amount: number,
  options: PaymentOptions = {},
): Supplier {
  if (supplier.invoices === undefined) {
    return { ...supplier, payable: Math.max(0, supplier.payable - amount) };
  }
  const invoices = settleInvoices(supplier.invoices, amount, options);
  return {
    ...supplier,
    invoices,
    payable: invoices.reduce((sum, invoice) => sum + remainingOf(invoice), 0),
  };
}
