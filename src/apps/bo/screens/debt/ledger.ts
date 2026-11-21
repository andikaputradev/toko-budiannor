import { isAllowed } from '../../../../shared/permissions';
import type { BoSession } from '../../bo-session';
import {
  applyToCustomer,
  applyToSupplier,
  checkPayment,
  formatPaymentNumber,
  nextPaymentSequence,
  seedDebtPayments,
  type DebtPayment,
  type DebtPaymentDraft,
  type PaymentIssue,
} from '../../domain/debt-payments';
import { getUnpaidInvoicesForParty } from '../../domain/receivable-payable';

export type DebtPaymentResult =
  | { readonly ok: true; readonly number: string; readonly total: number }
  | { readonly ok: false; readonly denied: true }
  | { readonly ok: false; readonly issue: PaymentIssue; readonly invoiceNumber?: string };

// Riwayat pembayaran contoh diisi sekali saat layar Hutang Piutang atau Laporan pertama dibuka.
export function ensurePayments(session: BoSession): readonly DebtPayment[] {
  if (!session.state().debtReady) {
    const data = session.store.getState().data;
    session.initDebtPayments(
      seedDebtPayments(data, data.users.find((user) => user.role === 'owner')?.id ?? 'U-1'),
    );
  }
  return session.state().debtPayments;
}

// Mencatat pembayaran: memeriksa, memperbarui saldo pelanggan atau pemasok, lalu menyimpan dokumennya.
export function recordPayment(session: BoSession, draft: DebtPaymentDraft): DebtPaymentResult {
  const store = session.store;
  if (!isAllowed(store.getState().role, 'BO-11', 'Catat Pembayaran Piutang')) {
    return { ok: false, denied: true };
  }
  const payments = ensurePayments(session);
  const data = store.getState().data;
  const check = checkPayment(draft, getUnpaidInvoicesForParty(draft.partyId, draft.type, data));
  if (!check.ok) {
    return check;
  }
  let partyName = '';
  if (draft.type === 'pelanggan') {
    const customer = data.customers.find((item) => item.id === draft.partyId);
    if (customer === undefined) {
      return { ok: false, issue: 'pihak' };
    }
    partyName = customer.name;
    store.saveCustomer(
      applyToCustomer(customer, check.allocations, draft.date, check.parts ?? draft.method),
    );
  } else {
    const supplier = data.suppliers.find((item) => item.id === draft.partyId);
    if (supplier === undefined) {
      return { ok: false, issue: 'pihak' };
    }
    partyName = supplier.name;
    store.saveSupplier(applyToSupplier(supplier, check.total));
  }
  const number = formatPaymentNumber(draft.type, nextPaymentSequence(payments, draft.type));
  session.addDebtPayment({
    number,
    type: draft.type,
    date: draft.date,
    partyId: draft.partyId,
    partyName,
    method: draft.method,
    account: draft.account,
    total: check.total,
    note: draft.note.trim(),
    userId: session.state().user?.id ?? store.getState().userId,
    allocations: check.allocations,
    ...(check.parts === undefined ? {} : { parts: check.parts }),
  });
  return { ok: true, number, total: check.total };
}
