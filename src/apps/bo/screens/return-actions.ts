import type { ReturnNote } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import { depositOf } from '../domain/deposit';
import {
  buildNoteLines,
  customerBalance,
  describeIssue,
  issueIndex,
  planSettlement,
  planStock,
  potongCustomer,
  potongSupplier,
  returnSources,
  settlementLabelKey,
  statusOf,
  supplierBalance,
  validateReturn,
  type ReturnDraft,
  type ReturnKind,
} from '../domain/returns';

export type ReturnResult =
  | { readonly ok: true; readonly note: ReturnNote }
  | { readonly ok: false; readonly text: string; readonly index: number | undefined };

function failure(text: string, index?: number): ReturnResult & { readonly ok: false } {
  return { ok: false, text, index };
}

function actorOf(session: BoSession): string {
  return session.state().user?.id ?? session.store.getState().userId;
}

// Menyimpan retur: memvalidasi, lalu menggeser stok, memotong piutang atau hutang, mengkreditkan
// deposit, mencatat nomor retur, dan menulis log aktivitas dalam satu langkah.
export function saveReturn(session: BoSession, kind: ReturnKind, draft: ReturnDraft): ReturnResult {
  const store = session.store;
  if (!session.allowed('BO-10', 'Simpan Retur')) {
    return failure(message('MSG-003'));
  }
  if (!store.getState().online) {
    return failure(message('MSG-001'));
  }
  const state = store.getState();
  const data = state.data;
  const products = new Map(data.products.map((product) => [product.id, product]));
  const wanted = draft.source?.number;
  const source = returnSources(kind, data, state.returnNotes).find(
    (item) => wanted !== undefined && item.number === wanted,
  );
  const current: ReturnDraft = { ...draft, source };
  const issue = validateReturn(kind, current, products);
  if (issue !== undefined || source === undefined) {
    return failure(
      issue === undefined ? label('boReturPilihFaktur') : describeIssue(issue),
      issue === undefined ? undefined : issueIndex(issue),
    );
  }

  const lines = buildNoteLines(source, current.picks);
  const total = lines.reduce((sum, line) => sum + line.value, 0);
  const customer =
    kind === 'penjualan' ? data.customers.find((item) => item.id === source.partyId) : undefined;
  const supplier =
    kind === 'pembelian' ? data.suppliers.find((item) => item.id === source.partyId) : undefined;
  const balance = kind === 'penjualan' ? customerBalance(customer) : supplierBalance(supplier);
  const plan = planSettlement(kind, current.settlement, total, balance);
  const at = session.now().toISOString();
  const userId = actorOf(session);
  const number = store.takeNumber(kind === 'penjualan' ? 'RJ' : 'RB');

  for (const change of planStock(kind, current.warehouse, source, current.picks, products)) {
    store.setStock(change.productId, change.stock);
  }
  if (customer !== undefined) {
    let updated = plan.applied > 0 ? potongCustomer(customer, plan.applied) : customer;
    if (plan.toDeposit > 0) {
      updated = { ...updated, deposit: depositOf(updated) + plan.toDeposit };
      const entryNumber = store.takeNumber('DEP');
      store.addDepositEntry({
        id: entryNumber,
        number: entryNumber,
        kind: 'retur',
        at,
        userId,
        customerId: customer.id,
        amount: plan.toDeposit,
        balanceAfter: depositOf(updated),
        method: undefined,
        reference: number,
        note: '',
      });
    }
    if (updated !== customer) {
      store.saveCustomer(updated);
    }
  }
  if (supplier !== undefined && plan.applied > 0) {
    store.saveSupplier(potongSupplier(supplier, plan.applied));
  }

  const note: ReturnNote = {
    id: number,
    number,
    kind,
    at,
    userId,
    sourceNumber: source.number,
    partyId: source.partyId,
    partyName: source.partyName,
    lines,
    total,
    settlement: current.settlement,
    warehouse: current.warehouse,
    applied: plan.applied,
    toDeposit: plan.toDeposit,
    cash: plan.cash,
    reason: current.reason.trim(),
    status: statusOf(kind, plan),
  };
  store.saveReturnNote(note);
  store.logActivity({
    at,
    userId,
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'transaksi',
    detail: label('boReturLogSimpan', {
      nomor: number,
      jenis: label(kind === 'penjualan' ? 'returPenjualan' : 'menuReturPembelian'),
      faktur: source.number,
      nilai: formatRupiah(total),
      cara: label(settlementLabelKey(kind, current.settlement)),
    }),
  });
  return { ok: true, note };
}

// Menandai uang kembali dari pemasok sudah diterima, sehingga retur pembelian berstatus selesai.
export function confirmRefund(session: BoSession, noteId: string): ReturnResult {
  const store = session.store;
  if (!session.allowed('BO-10', 'Simpan Retur')) {
    return failure(message('MSG-003'));
  }
  const note = store.getState().returnNotes.find((item) => item.id === noteId);
  if (note?.status !== 'menunggu') {
    return failure(message('MSG-003'));
  }
  const updated: ReturnNote = { ...note, status: 'selesai' };
  store.saveReturnNote(updated);
  store.logActivity({
    at: session.now().toISOString(),
    userId: actorOf(session),
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'transaksi',
    detail: label('boReturLogDanaDiterima', {
      nomor: note.number,
      nilai: formatRupiah(note.cash),
    }),
  });
  return { ok: true, note: updated };
}

export function logReturnPrint(session: BoSession, note: ReturnNote): void {
  session.store.logActivity({
    at: session.now().toISOString(),
    userId: actorOf(session),
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'cetak',
    detail: label('boReturLogCetak', { nomor: note.number }),
  });
}
