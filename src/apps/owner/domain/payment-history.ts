import type {
  DebtPaymentAllocation,
  DebtPaymentKind,
  DebtPaymentRecord,
  Dataset,
  InvoicePayment,
} from '../../../shared/data/types';

// Daftar bukti pembayaran hutang piutang yang dicatat di aplikasi Owner (BPT untuk piutang pelanggan,
// BHT untuk hutang pemasok), terbaru lebih dahulu.

export interface PaymentRow {
  readonly number: string;
  readonly kind: DebtPaymentKind;
  readonly at: string;
  readonly total: number;
  readonly userName: string;
  readonly partyName: string;
  readonly method: InvoicePayment['method'];
}

export function paymentRows(data: Dataset, records: readonly DebtPaymentRecord[]): PaymentRow[] {
  return records
    .map((record): PaymentRow => ({
      number: record.number,
      kind: record.kind,
      at: record.at,
      total: record.amount,
      userName: data.users.find((user) => user.id === record.userId)?.name ?? record.userId,
      partyName: record.partyName,
      method: record.method,
    }))
    .sort(
      (first, second) =>
        second.at.localeCompare(first.at) || second.number.localeCompare(first.number),
    );
}

export function findPayment(
  records: readonly DebtPaymentRecord[],
  number: string,
): DebtPaymentRecord | undefined {
  return records.find((record) => record.number === number);
}

interface Paid {
  readonly id: string;
  readonly paid: number;
}

// Faktur yang berkurang sisanya oleh satu pembayaran: selisih `paid` sebelum dan sesudah.
export function allocationsOf(
  before: readonly Paid[],
  after: readonly Paid[],
): DebtPaymentAllocation[] {
  const previous = new Map(before.map((invoice) => [invoice.id, invoice.paid]));
  return after
    .map((invoice) => ({
      invoiceId: invoice.id,
      amount: invoice.paid - (previous.get(invoice.id) ?? invoice.paid),
    }))
    .filter((item) => item.amount > 0);
}
