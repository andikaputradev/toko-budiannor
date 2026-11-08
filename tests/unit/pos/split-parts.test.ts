import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import { createStore } from '../../../src/shared/store/store';
import type { PaymentRow } from '../../../src/apps/pos/domain/payment';
import { applyPart, checkPart, partLimit } from '../../../src/apps/pos/domain/split';
import { createPosSession } from '../../../src/apps/pos/pos-session';

const dataset = withProposalData(generateDataset());

const TUNAI: PaymentRow = { method: 'tunai', amount: 30000 };
const BCA: PaymentRow = { method: 'transfer', amount: 40000, channel: 'BCA' };

describe('applyPart', () => {
  it('mengganti baris pada tempatnya sehingga urutan Pembayaran tidak berubah', () => {
    const rows = applyPart([TUNAI, BCA], 0, { method: 'tunai', amount: 10000 });
    expect(rows).toEqual([{ method: 'tunai', amount: 10000 }, BCA]);
  });

  it('mengganti metode pada slot yang sama dan menambah di akhir bila indeks melewati daftar', () => {
    expect(applyPart([TUNAI, BCA], 1, { method: 'edc', amount: 40000 })).toEqual([
      TUNAI,
      { method: 'edc', amount: 40000 },
    ]);
    expect(applyPart([TUNAI], 1, { method: 'qris', amount: 5000, channel: 'Gopay' })).toEqual([
      TUNAI,
      { method: 'qris', amount: 5000, channel: 'Gopay' },
    ]);
    expect(applyPart([], 3, { method: 'tunai', amount: 1 })).toEqual([
      { method: 'tunai', amount: 1 },
    ]);
  });

  it('menghapus baris bila bagian dikosongkan atau nominalnya nol', () => {
    expect(applyPart([TUNAI, BCA], 0, undefined)).toEqual([BCA]);
    expect(applyPart([TUNAI, BCA], 1, { method: 'transfer', amount: 0, channel: 'BCA' })).toEqual([
      TUNAI,
    ]);
  });

  it('tidak mengubah baris piutang atau DP di luar slot', () => {
    const dp: PaymentRow = { method: 'dp', amount: 1000, via: 'tunai' };
    expect(applyPart([dp, TUNAI], 1, undefined)).toEqual([dp]);
  });
});

describe('checkPart', () => {
  it('menolak nominal nol, negatif, atau pecahan', () => {
    for (const amount of [0, -1, 2.5, Number.NaN]) {
      expect(checkPart([], 0, { method: 'tunai', amount })).toEqual({
        ok: false,
        reason: 'nominal',
      });
    }
  });

  it('menolak kanal yang tidak sah untuk metodenya', () => {
    expect(checkPart([], 0, { method: 'transfer', amount: 1, channel: 'Gopay' })).toEqual({
      ok: false,
      reason: 'kanal',
    });
    expect(checkPart([], 0, { method: 'tunai', amount: 1, channel: 'BCA' })).toEqual({
      ok: false,
      reason: 'kanal',
    });
  });

  it('menolak pasangan metode dan kanal yang sudah dipakai slot lain', () => {
    expect(
      checkPart([TUNAI, BCA], 0, { method: 'transfer', amount: 5000, channel: 'BCA' }),
    ).toEqual({
      ok: false,
      reason: 'duplikat',
    });
  });

  it('mengizinkan slot yang sama diubah dan dua kanal Transfer berbeda bersamaan', () => {
    expect(
      checkPart([TUNAI, BCA], 1, { method: 'transfer', amount: 20000, channel: 'BCA' }),
    ).toEqual({
      ok: true,
    });
    expect(
      checkPart([TUNAI, BCA], 0, { method: 'transfer', amount: 5000, channel: 'BRI' }),
    ).toEqual({
      ok: true,
    });
  });
});

describe('partLimit', () => {
  it('tunai tanpa batas, selain tunai paling banyak sisa tanpa baris slotnya sendiri', () => {
    expect(partLimit([TUNAI, BCA], 1, 'tunai', 70000)).toBeUndefined();
    expect(partLimit([TUNAI, BCA], 1, 'transfer', 70000)).toBe(40000);
    expect(partLimit([TUNAI, BCA], 0, 'qris', 70000)).toBe(30000);
    expect(partLimit([TUNAI], 1, 'edc', 70000)).toBe(40000);
    expect(partLimit([{ method: 'tunai', amount: 100000 }], 1, 'edc', 70000)).toBe(0);
  });
});

describe('setPart pada sesi', () => {
  function setup() {
    const store = createStore({ dataset });
    store.setUser('U-3');
    const session = createPosSession(store, { clock: () => 1_000_000 });
    session.startShift(100000);
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 1);
    return session;
  }

  it('menyimpan bagian pada tempatnya dan menghitung sisa dari semua bagian', () => {
    const session = setup();
    session.setPart(0, { method: 'tunai', amount: 30000 });
    session.setPart(1, { method: 'transfer', amount: 20000, channel: 'BCA' });
    session.setPart(0, { method: 'tunai', amount: 10000 });
    expect(session.state().rows).toEqual([
      { method: 'tunai', amount: 10000 },
      { method: 'transfer', amount: 20000, channel: 'BCA' },
    ]);
    expect(session.summary().shortfall).toBe(session.total() - 30000);
  });

  it('memotong bagian non-tunai sebesar sisa dan menolak yang tidak sah', () => {
    const session = setup();
    const total = session.total();
    session.setPart(0, { method: 'tunai', amount: total - 40000 });
    session.setPart(1, { method: 'transfer', amount: 999999, channel: 'BCA' });
    expect(session.state().rows[1]).toEqual({ method: 'transfer', amount: 40000, channel: 'BCA' });
    session.setPart(2, { method: 'transfer', amount: 5000, channel: 'BCA' });
    expect(session.state().rows).toHaveLength(2);
    session.setPart(2, { method: 'edc', amount: 5000 });
    expect(session.state().rows).toHaveLength(2);
  });
});
