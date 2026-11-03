import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import { createPosSession } from '../../../src/apps/pos/pos-session';
import { createOwnerSession } from '../../../src/apps/owner/owner-session';

const dataset = generateDataset();

function setup() {
  const store = createStore({ dataset });
  store.setUser('U-3');
  const session = createPosSession(store, {
    clock: () => 1_000_000,
    schedule: (run) => {
      run();
    },
  });
  return { store, session };
}

function approveFromPhone(
  store: ReturnType<typeof createStore>,
  id: string,
  decision: 'disetujui' | 'ditolak',
) {
  const owner = createOwnerSession(store, {
    schedule: (run) => {
      run();
    },
  });
  expect(owner.login('haris.owner', 'Kunci2026A')).toEqual({ ok: true });
  expect(owner.decide(id, decision, 'Pelanggan lama', '482916')).toEqual({ ok: true });
  store.setUser('U-3');
}

describe('persetujuan Owner dari HP pada POS (F-09)', () => {
  it('membangkitkan permintaan piutang B-0002 sesuai total bill dan melebihi sisa limit', () => {
    const request = dataset.approvals.find((item) => item.id === 'AP-2');
    const bill = dataset.bills.find((item) => item.number === 'B-0002');
    const total = (bill?.lines ?? []).reduce(
      (sum, line) => sum + Math.round(line.quantity * line.unitPrice),
      0,
    );
    expect(request).toMatchObject({ kind: 'piutang', reference: 'B-0002', customerId: 'C-003' });
    expect(request?.amount).toBe(total);
    expect(dataset.approvals.find((item) => item.id === 'AP-1')?.amount).toBe(
      Math.round(total * 0.05),
    );
  });

  it('menolak piutang over-limit tanpa persetujuan lalu meneruskannya setelah Owner menyetujui dari HP', () => {
    const { store, session } = setup();
    expect(session.recallBill('H-2')).toEqual({ ok: true });
    expect(session.state().billRef).toBe('B-0002');
    session.chooseReceivable('piutang');
    expect(session.mobileApproval()).toBeUndefined();
    expect(session.summary().status).toBe('blocked');
    expect(session.summary().messageId).toBe('MSG-035');

    approveFromPhone(store, 'AP-2', 'disetujui');
    expect(session.mobileApproval()?.id).toBe('AP-2');
    expect(session.summary().status).toBe('ready');
    const sale = session.finish();
    expect(sale?.number).toBe('T-000141');
    expect(sale?.payment).toBe('piutang');
    expect(session.state().activity.at(-1)?.action).toBe('Otorisasi piutang dari HP');
    expect(session.state().billRef).toBeUndefined();
  });

  it('tetap menolak bila Owner menolak dari HP atau bill bukan yang disetujui', () => {
    const rejected = setup();
    rejected.session.recallBill('H-2');
    rejected.session.chooseReceivable('piutang');
    approveFromPhone(rejected.store, 'AP-2', 'ditolak');
    expect(rejected.session.mobileApproval()).toBeUndefined();
    expect(rejected.session.summary().status).toBe('blocked');

    const other = setup();
    approveFromPhone(other.store, 'AP-2', 'disetujui');
    other.session.recallBill('H-1');
    expect(other.session.state().billRef).toBe('B-0001');
    expect(other.session.mobileApproval()).toBeUndefined();
  });

  it('melepas rujukan bill saat bill ditahan atau transaksi selesai', () => {
    const { session } = setup();
    session.recallBill('H-2');
    expect(session.state().billRef).toBe('B-0002');
    session.holdBill();
    expect(session.state().billRef).toBeUndefined();
  });
});
