import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import type { Product, Sale } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { cashFromSale, applyMoneyKey, needsShift } from '../../../src/apps/pos/domain/shift';
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
  let now = 1_000_000;
  const session = createPosSession(store, { clock: () => now });
  session.attemptLogin('U-3', '2468');
  return { store, session, advance: (ms: number) => (now += ms) };
}

function sell(session: ReturnType<typeof setup>['session'], pay: () => void): Sale {
  session.addProduct(semen());
  pay();
  const sale = session.finish();
  if (sale === undefined) {
    throw new Error('penjualan gagal');
  }
  return sale;
}

describe('papan uang modal', () => {
  it('menambah digit, tiga nol, menghapus, mengosongkan, dan membatasi 12 digit', () => {
    expect(applyMoneyKey(0, '1')).toBe(1);
    expect(applyMoneyKey(1, '000')).toBe(1000);
    expect(applyMoneyKey(1234, 'Backspace')).toBe(123);
    expect(applyMoneyKey(1234, 'C')).toBe(0);
    expect(applyMoneyKey(999_999_999_999, '5')).toBe(999_999_999_999);
    expect(applyMoneyKey(999_999_999, '000')).toBe(999_999_999_000);
  });
});

describe('memulai shift', () => {
  it('menolak modal kosong atau tidak sah, menerima 0, menolak shift ganda', () => {
    const { session } = setup();
    expect(session.startShift(undefined)).toEqual({ ok: false, labelKey: 'modalWajib' });
    expect(session.startShift(Number.NaN)).toEqual({ ok: false, labelKey: 'modalWajib' });
    expect(session.startShift(-1)).toEqual({ ok: false, labelKey: 'modalWajib' });
    expect(session.startShift(0)).toEqual({ ok: true });
    expect(session.state().shift).toMatchObject({ userId: 'U-3', openingCash: 0 });
    expect(session.startShift(5000)).toEqual({ ok: false, labelKey: 'shiftSudahBerjalan' });
  });

  it('needsShift benar untuk non-Frontliner tanpa shift saja', () => {
    expect(needsShift('kasir', undefined)).toBe(true);
    expect(needsShift('frontliner', undefined)).toBe(false);
    const shift = { userId: 'U-3', startedAt: '2026-10-19T03:00:00.000Z', openingCash: 0 };
    expect(needsShift('kasir', shift)).toBe(false);
  });

  it('shift milik perangkat: pengguna lain yang masuk melanjutkannya', () => {
    const { session } = setup();
    session.startShift(100000);
    session.logout();
    expect(session.attemptLogin('U-4', '1357')).toEqual({ ok: true });
    expect(session.state().shift).toMatchObject({ userId: 'U-3', openingCash: 100000 });
  });

  it('atur ulang data menutup shift', () => {
    const { session, store } = setup();
    session.startShift(100000);
    store.resetData();
    expect(session.state().shift).toBeUndefined();
  });
});

describe('saldo laci', () => {
  it('modal ditambah tunai bersih penjualan tunai pas', () => {
    const { session } = setup();
    session.startShift(100000);
    sell(session, () => {
      session.exactAmount();
    });
    expect(session.cashBalance()).toBe(170000);
  });

  it('kembalian tidak menambah laci: bayar tunai lebih Rp 20.000', () => {
    const { session } = setup();
    session.startShift(100000);
    sell(session, () => {
      session.setAmount('tunai', 90000);
    });
    expect(session.cashBalance()).toBe(170000);
  });

  it('penjualan QRIS tidak menambah laci', () => {
    const { session } = setup();
    session.startShift(100000);
    sell(session, () => {
      session.setMethod('qris');
      session.setAmount('qris', 70000);
    });
    expect(session.cashBalance()).toBe(100000);
  });

  it('penjualan sebelum shift dimulai tidak dihitung', () => {
    const { session, advance } = setup();
    sell(session, () => {
      session.exactAmount();
    });
    advance(1000);
    session.startShift(50000);
    expect(session.cashBalance()).toBe(50000);
  });

  it('cashBalance 0 tanpa shift', () => {
    const { session } = setup();
    expect(session.cashBalance()).toBe(0);
  });
});

describe('biaya kasir dan laci', () => {
  it('ditolak tanpa shift', () => {
    const { session } = setup();
    expect(session.saveExpense('bensin', '', 1000)).toEqual({
      ok: false,
      labelKey: 'butuhShift',
    });
  });

  it('mengurangi laci dan menolak melebihi saldo dengan MSG-041', () => {
    const { session } = setup();
    session.startShift(100000);
    expect(session.saveExpense('bensin', '', 30000)).toEqual({ ok: true });
    expect(session.cashBalance()).toBe(70000);
    expect(session.saveExpense('bensin', '', 70001)).toMatchObject({
      ok: false,
      messageId: 'MSG-041',
      values: { saldo: 'Rp 70.000' },
    });
  });
});

describe('selesai shift', () => {
  it('mengembalikan ringkasan, menutup shift, dan shift berikutnya mulai bersih', () => {
    const { session, advance } = setup();
    session.startShift(100000);
    sell(session, () => {
      session.exactAmount();
    });
    session.saveExpense('parkir', '', 5000);
    expect(session.shiftSummary()).toEqual({
      openingCash: 100000,
      cashSales: 70000,
      expenses: 5000,
      cashReturns: 0,
      closingCash: 165000,
    });
    expect(session.endShift()).toEqual({
      openingCash: 100000,
      cashSales: 70000,
      expenses: 5000,
      cashReturns: 0,
      closingCash: 165000,
    });
    expect(session.state().shift).toBeUndefined();
    expect(session.cashBalance()).toBe(0);
    expect(session.endShift()).toBeUndefined();
    advance(1000);
    session.startShift(20000);
    expect(session.cashBalance()).toBe(20000);
  });
});

describe('cashFromSale', () => {
  const base: Sale = {
    id: 'S-x',
    number: 'T-x',
    createdAt: '2026-10-19T03:00:00.000Z',
    cashierId: 'U-3',
    customerId: undefined,
    lines: [],
    total: 70000,
    payment: 'tunai',
    paid: 70000,
  };

  it('0 untuk penjualan tanpa payments (data bawaan lama)', () => {
    expect(cashFromSale(base)).toBe(0);
  });

  it('tunai ditambah QRIS: kembalian dikurangkan dari tunai', () => {
    const sale: Sale = {
      ...base,
      payments: [
        { method: 'tunai', amount: 50000 },
        { method: 'qris', amount: 30000 },
      ],
    };
    expect(cashFromSale(sale)).toBe(40000);
  });

  it('DP bercara tunai dihitung, piutang tidak', () => {
    const sale: Sale = {
      ...base,
      payments: [
        { method: 'dp', amount: 20000, via: 'tunai' },
        { method: 'piutang', amount: 50000 },
      ],
    };
    expect(cashFromSale(sale)).toBe(20000);
  });

  it('DP bercara QRIS tidak menambah laci', () => {
    const sale: Sale = {
      ...base,
      payments: [
        { method: 'dp', amount: 20000, via: 'qris' },
        { method: 'piutang', amount: 50000 },
      ],
    };
    expect(cashFromSale(sale)).toBe(0);
  });
});
