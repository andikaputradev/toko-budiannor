import type { DepositEntry } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import {
  applyTopUp,
  applyUse,
  checkTopUp,
  checkUse,
  depositOf,
  previewUse,
  type UseAllocation,
} from '../domain/deposit';

export type DepositResult =
  | {
      readonly ok: true;
      readonly entry: DepositEntry;
      readonly allocations: readonly UseAllocation[];
    }
  | { readonly ok: false; readonly text: string };

function actorOf(session: BoSession): string {
  return session.state().user?.id ?? session.store.getState().userId;
}

function guard(session: BoSession): string | undefined {
  if (!session.allowed('BO-11', 'Catat Pembayaran Piutang')) {
    return message('MSG-003');
  }
  return session.store.getState().online ? undefined : message('MSG-001');
}

function record(session: BoSession, text: string): void {
  session.store.logActivity({
    at: session.now().toISOString(),
    userId: actorOf(session),
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'transaksi',
    detail: text,
  });
}

export function topUpDeposit(
  session: BoSession,
  customerId: string,
  raw: string,
  method: 'tunai' | 'transfer',
  note: string,
): DepositResult {
  const blocked = guard(session);
  if (blocked !== undefined) {
    return { ok: false, text: blocked };
  }
  const store = session.store;
  const customer = store.getState().data.customers.find((item) => item.id === customerId);
  if (customer === undefined) {
    return { ok: false, text: message('MSG-003') };
  }
  const check = checkTopUp(raw);
  if (!check.ok) {
    return check;
  }
  const updated = applyTopUp(customer, check.amount);
  const number = store.takeNumber('DEP');
  const entry: DepositEntry = {
    id: number,
    number,
    kind: 'setor',
    at: session.now().toISOString(),
    userId: actorOf(session),
    customerId,
    amount: check.amount,
    balanceAfter: depositOf(updated),
    method,
    reference: '',
    note: note.trim(),
  };
  store.saveCustomer(updated);
  store.addDepositEntry(entry);
  record(
    session,
    label('boDepositLogSetor', {
      nomor: number,
      pelanggan: customer.name,
      nilai: formatRupiah(check.amount),
    }),
  );
  return { ok: true, entry, allocations: [] };
}

// Memakai deposit untuk melunasi piutang: faktur dengan jatuh tempo terlama lunas lebih dulu.
export function spendDeposit(session: BoSession, customerId: string, raw: string): DepositResult {
  const blocked = guard(session);
  if (blocked !== undefined) {
    return { ok: false, text: blocked };
  }
  const store = session.store;
  const customer = store.getState().data.customers.find((item) => item.id === customerId);
  if (customer === undefined) {
    return { ok: false, text: message('MSG-003') };
  }
  const check = checkUse(customer, raw);
  if (!check.ok) {
    return check;
  }
  const allocations = previewUse(customer, check.amount).filter((row) => row.pay > 0);
  const updated = applyUse(customer, check.amount);
  const number = store.takeNumber('DEP');
  const entry: DepositEntry = {
    id: number,
    number,
    kind: 'pakai',
    at: session.now().toISOString(),
    userId: actorOf(session),
    customerId,
    amount: check.amount,
    balanceAfter: depositOf(updated),
    method: undefined,
    reference: allocations.map((row) => row.id).join(', '),
    note: '',
  };
  store.saveCustomer(updated);
  store.addDepositEntry(entry);
  record(
    session,
    label('boDepositLogPakai', {
      nomor: number,
      pelanggan: customer.name,
      nilai: formatRupiah(check.amount),
    }),
  );
  return { ok: true, entry, allocations };
}

export function logDepositPrint(session: BoSession, entry: DepositEntry): void {
  session.store.logActivity({
    at: session.now().toISOString(),
    userId: actorOf(session),
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'cetak',
    detail: label('boDepositLogCetak', { nomor: entry.number }),
  });
}
