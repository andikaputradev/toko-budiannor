import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import type { Product } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import {
  evaluatePayment,
  maxAmount,
  withDownPayment,
  type PaymentRow,
} from '../../../src/apps/pos/domain/payment';
import { createPosSession } from '../../../src/apps/pos/pos-session';

const dataset = withProposalData(generateDataset());

function semen(): Product {
  const found = dataset.products.find((item) => item.id === 'P-01');
  if (found === undefined) {
    throw new Error('barang proposal tidak ada');
  }
  return found;
}

function setup() {
  const store = createStore({ dataset });
  store.setOnline(true);
  const session = createPosSession(store, { clock: () => 1_000_000 });
  session.attemptLogin('U-3', '2468');
  session.startShift(100000);
  session.addProduct(semen());
  return { store, session };
}

const now = new Date('2026-10-19T03:00:00Z');

describe('domain: EDC, DP, dan split', () => {
  it('EDC dihitung sebagai pembayaran terbayar', () => {
    const rows: readonly PaymentRow[] = [{ method: 'edc', amount: 100000 }];
    expect(
      evaluatePayment({ total: 100000, rows, customer: undefined, now, ownerApproved: false }),
    ).toMatchObject({ status: 'ready', change: 0 });
  });

  it('withDownPayment menyimpan cara bayar, mengganti baris lama, dan menghapus saat 0', () => {
    const base: readonly PaymentRow[] = [{ method: 'piutang', amount: 0 }];
    const withDp = withDownPayment(base, 20000, 'qris');
    expect(withDp.find((row) => row.method === 'dp')).toEqual({
      method: 'dp',
      amount: 20000,
      via: 'qris',
    });
    const replaced = withDownPayment(withDp, 30000, 'tunai');
    expect(replaced.filter((row) => row.method === 'dp')).toEqual([
      { method: 'dp', amount: 30000, via: 'tunai' },
    ]);
    expect(withDownPayment(replaced, 0, 'tunai').some((row) => row.method === 'dp')).toBe(false);
  });

  it('maxAmount: tunai tanpa batas, selain tunai paling banyak sisa', () => {
    const rows: readonly PaymentRow[] = [{ method: 'tunai', amount: 60000 }];
    expect(maxAmount('tunai', 100000, rows)).toBeUndefined();
    expect(maxAmount('qris', 100000, rows)).toBe(40000);
    expect(maxAmount('edc', 100000, [])).toBe(100000);
  });

  it('split tunai 60.000 dan QRIS 40.000 melunasi 100.000 tanpa kembalian', () => {
    const rows: readonly PaymentRow[] = [
      { method: 'tunai', amount: 60000 },
      { method: 'qris', amount: 40000 },
    ];
    expect(
      evaluatePayment({ total: 100000, rows, customer: undefined, now, ownerApproved: false }),
    ).toMatchObject({ status: 'ready', change: 0, shortfall: 0 });
  });
});

describe('sesi: piutang dengan tempo dan DP', () => {
  it('finish mengisi payments, dp, dan terms untuk piutang Bu Sherly dengan DP QRIS', () => {
    const { session } = setup();
    session.setCustomer('C-062');
    session.chooseReceivable('piutang');
    expect(session.state().terms).toEqual({ dueDays: 30 });
    session.setDownPayment(20000, 'qris');
    expect(session.summary()).toMatchObject({ status: 'ready', receivable: 50000 });
    const sale = session.finish();
    expect(sale?.dp).toBe(20000);
    expect(sale?.terms).toEqual({ dueDays: 30, dueDate: '2026-11-18T03:00:00.000Z' });
    expect(sale?.payments).toEqual([
      { method: 'dp', amount: 20000, via: 'qris' },
      { method: 'piutang', amount: 50000 },
    ]);
  });

  it('setTerms mengubah tempo dan tanggal jatuh tempo', () => {
    const { session } = setup();
    session.setCustomer('C-062');
    session.chooseReceivable('piutang');
    session.setTerms(45);
    const sale = session.finish();
    expect(sale?.terms).toEqual({ dueDays: 45, dueDate: '2026-12-03T03:00:00.000Z' });
  });

  it('setTerms mengabaikan nilai tidak terhingga dan membatasi 0 sampai 365', () => {
    const { session } = setup();
    session.setCustomer('C-062');
    session.chooseReceivable('piutang');
    session.setTerms(Number.NaN);
    expect(session.state().terms).toEqual({ dueDays: 30 });
    session.setTerms(9999);
    expect(session.state().terms).toEqual({ dueDays: 365 });
    session.setTerms(-5);
    expect(session.state().terms).toEqual({ dueDays: 0 });
  });

  it('DP melebihi total dibatasi sebesar total dan tidak meninggalkan piutang', () => {
    const { session } = setup();
    session.setCustomer('C-062');
    session.chooseReceivable('piutang');
    session.setDownPayment(999_999, 'tunai');
    expect(session.state().rows.find((row) => row.method === 'dp')?.amount).toBe(70000);
    expect(session.summary()).toMatchObject({ status: 'ready', receivable: 0 });
    expect(session.finish()?.terms).toBeUndefined();
  });

  it('DP bukan angka tidak mengubah baris pembayaran', () => {
    const { session } = setup();
    session.setCustomer('C-062');
    session.chooseReceivable('piutang');
    const before = session.state().rows;
    session.setDownPayment(Number.NaN, 'tunai');
    session.setDownPayment(Number.POSITIVE_INFINITY, 'tunai');
    expect(session.state().rows).toEqual(before);
  });

  it('piutang untuk Pak Wahyudi tetap diblokir MSG-036', () => {
    const { session } = setup();
    session.setCustomer('C-064');
    session.chooseReceivable('piutang');
    expect(session.summary()).toMatchObject({ status: 'blocked', messageId: 'MSG-036' });
  });
});

describe('sesi: split payment dan EDC', () => {
  it('split tunai dan QRIS melunasi dan hanya tunai yang menambah laci', () => {
    const { session } = setup();
    session.setAmount('tunai', 30000);
    session.setMethod('qris');
    session.setAmount('qris', 40000);
    expect(session.summary()).toMatchObject({ status: 'ready', change: 0 });
    const sale = session.finish();
    expect(sale?.payments).toEqual([
      { method: 'tunai', amount: 30000 },
      { method: 'qris', amount: 40000 },
    ]);
    expect(session.cashBalance()).toBe(130000);
  });

  it('EDC melunasi dan tidak menambah laci', () => {
    const { session } = setup();
    session.setMethod('edc');
    session.setAmount('edc', 70000);
    expect(session.summary().status).toBe('ready');
    const sale = session.finish();
    expect(sale?.payment).toBe('edc');
    expect(session.cashBalance()).toBe(100000);
  });
});
