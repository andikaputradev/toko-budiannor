import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import type { Product, Sale } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import {
  defaultRefundMethod,
  itemsValue,
  reasonText,
  REFUND_METHODS,
  RETUR_REASONS,
  validateRefundAmount,
} from '../../../src/apps/pos/domain/retur';
import { createPosSession } from '../../../src/apps/pos/pos-session';

const dataset = withProposalData(generateDataset());

function semen(): Product {
  const found = dataset.products.find((item) => item.id === 'P-01');
  if (found === undefined) {
    throw new Error('barang proposal tidak ada');
  }
  return found;
}

function setup(userId = 'U-2') {
  const store = createStore({ dataset });
  store.setUser(userId);
  const session = createPosSession(store, { clock: () => 1_000_000 });
  session.startShift(100000);
  return { store, session };
}

function sellThree(
  session: ReturnType<typeof setup>['session'],
  how: 'tunai' | 'qris' = 'tunai',
): Sale {
  session.addProduct(semen(), 'SAK', 3);
  if (how === 'qris') {
    session.chooseSingle('qris');
  } else {
    session.exactAmount();
  }
  const sale = session.finish();
  if (sale === undefined) {
    throw new Error('penjualan gagal');
  }
  return sale;
}

const lineOf = (quantity: number) => ({
  productId: 'P-01',
  unit: 'SAK',
  quantity,
  unitPrice: 70000,
});

const baseSale: Sale = {
  id: 'S-x',
  number: 'T-x',
  createdAt: '2026-10-19T03:00:00.000Z',
  cashierId: 'U-3',
  customerId: undefined,
  lines: [lineOf(3)],
  total: 210000,
  payment: 'tunai',
  paid: 210000,
};

describe('domain retur', () => {
  it('menyediakan empat cara kembali dan empat alasan', () => {
    expect(REFUND_METHODS).toEqual(['tunai', 'qris', 'edc', 'transfer']);
    expect(RETUR_REASONS).toEqual(['barang', 'batal', 'salah-bayar', 'lainnya']);
  });

  it('itemsValue menjumlahkan jumlah kali harga transaksi asal', () => {
    expect(itemsValue(baseSale, [{ index: 0, quantity: 2 }])).toBe(140000);
    expect(itemsValue({ ...baseSale, lines: [lineOf(2.5)] }, [{ index: 0, quantity: 1.5 }])).toBe(
      105000,
    );
  });

  it('defaultRefundMethod mengikuti cara bayar utama atau jatuh ke tunai', () => {
    expect(
      defaultRefundMethod({ ...baseSale, payments: [{ method: 'qris', amount: 210000 }] }),
    ).toBe('qris');
    expect(
      defaultRefundMethod({
        ...baseSale,
        payments: [
          { method: 'tunai', amount: 50000 },
          { method: 'edc', amount: 160000 },
        ],
      }),
    ).toBe('edc');
    expect(
      defaultRefundMethod({
        ...baseSale,
        payments: [
          { method: 'dp', amount: 50000, via: 'transfer' },
          { method: 'piutang', amount: 160000 },
        ],
      }),
    ).toBe('transfer');
    expect(
      defaultRefundMethod({ ...baseSale, payments: [{ method: 'piutang', amount: 210000 }] }),
    ).toBe('tunai');
  });

  it('defaultRefundMethod memakai payment untuk penjualan lama tanpa payments', () => {
    expect(defaultRefundMethod({ ...baseSale, payment: 'transfer' })).toBe('transfer');
    expect(defaultRefundMethod({ ...baseSale, payment: 'dp' })).toBe('tunai');
    expect(defaultRefundMethod({ ...baseSale, payment: 'piutang' })).toBe('tunai');
  });

  it('validateRefundAmount memeriksa batas nominal', () => {
    expect(validateRefundAmount(0, 100)).toBe('not-positive');
    expect(validateRefundAmount(Number.NaN, 100)).toBe('not-positive');
    expect(validateRefundAmount(101, 100)).toBe('too-high');
    expect(validateRefundAmount(100, 100)).toBe('ok');
    expect(validateRefundAmount(1, 100)).toBe('ok');
  });

  it('reasonText memakai keterangan untuk Lainnya dan label untuk alasan lain', () => {
    expect(reasonText('barang', '')).toBe('Pengembalian Barang');
    expect(reasonText('batal', 'abaikan')).toBe('Pembatalan Transaksi');
    expect(reasonText('lainnya', '  rusak di jalan ')).toBe('rusak di jalan');
  });
});

describe('sesi: returnItems', () => {
  it('retur tunai menambah stok Display dan mengurangi laci sebesar nominal', () => {
    const { session, store } = setup();
    const sale = sellThree(session);
    const before =
      store.getState().data.products.find((item) => item.id === 'P-01')?.stock.display ?? 0;
    expect(session.cashBalance()).toBe(310000);
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 2 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 140000 },
    });
    expect(result).toMatchObject({ ok: true, value: 140000 });
    const after =
      store.getState().data.products.find((item) => item.id === 'P-01')?.stock.display ?? 0;
    expect(after - before).toBe(2);
    expect(session.cashBalance()).toBe(170000);
    expect(session.shiftSummary()?.cashReturns).toBe(140000);
  });

  it('retur QRIS tidak mengubah laci dan tercatat lengkap', () => {
    const { session } = setup();
    const sale = sellThree(session, 'qris');
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'salah-bayar',
      note: '',
      refund: { method: 'qris', amount: 70000 },
      photoName: 'bukti.jpg',
    });
    expect(result.ok).toBe(true);
    expect(session.cashBalance()).toBe(100000);
    expect(session.state().returns.at(-1)).toMatchObject({
      saleNumber: sale.number,
      reason: 'Kesalahan Pembayaran',
      reasonKind: 'salah-bayar',
      refund: { method: 'qris', amount: 70000 },
      photoName: 'bukti.jpg',
      value: 70000,
    });
  });

  it('nominal boleh lebih kecil dari nilai barang dan nilai barang tetap tercatat', () => {
    const { session } = setup();
    const sale = sellThree(session);
    session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 2 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 100000 },
    });
    expect(session.state().returns.at(-1)).toMatchObject({
      value: 140000,
      refund: { method: 'tunai', amount: 100000 },
    });
  });

  it('menolak nominal 0, nominal melebihi nilai barang, dan nominal bukan angka', () => {
    const { session } = setup();
    const sale = sellThree(session);
    const attempt = (amount: number) =>
      session.returnItems(sale.number, {
        items: [{ index: 0, quantity: 2 }],
        reason: 'barang',
        note: '',
        refund: { method: 'qris', amount },
      });
    expect(attempt(0)).toMatchObject({ ok: false, messageId: 'MSG-029' });
    expect(attempt(Number.NaN)).toMatchObject({ ok: false, messageId: 'MSG-029' });
    expect(attempt(140001)).toEqual({ ok: false, labelKey: 'nominalMelebihi' });
    expect(session.state().returns).toHaveLength(0);
  });

  it('retur tunai tanpa shift ditolak, dan tunai melebihi saldo laci memberi MSG-041', () => {
    const { session } = setup();
    const sale = sellThree(session, 'qris');
    const input = {
      items: [{ index: 0, quantity: 3 }],
      reason: 'barang' as const,
      note: '',
      refund: { method: 'tunai' as const, amount: 210000 },
    };
    expect(session.returnItems(sale.number, input)).toMatchObject({
      ok: false,
      messageId: 'MSG-041',
      values: { saldo: 'Rp 100.000' },
    });
    session.endShift();
    expect(session.returnItems(sale.number, input)).toEqual({ ok: false, labelKey: 'butuhShift' });
  });

  it('alasan Lainnya wajib diberi keterangan (MSG-086)', () => {
    const { session } = setup();
    const sale = sellThree(session);
    const input = {
      items: [{ index: 0, quantity: 1 }],
      reason: 'lainnya' as const,
      refund: undefined,
    };
    expect(session.returnItems(sale.number, { ...input, note: '  ' })).toMatchObject({
      ok: false,
      messageId: 'MSG-086',
    });
    expect(session.returnItems(sale.number, { ...input, note: 'warna tidak cocok' })).toMatchObject(
      { ok: true },
    );
    expect(session.state().returns.at(-1)?.reason).toBe('warna tidak cocok');
  });

  it('jumlah melebihi sisa yang belum diretur memberi MSG-085', () => {
    const { session } = setup();
    const sale = sellThree(session);
    session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 2 }],
      reason: 'barang',
      note: '',
      refund: undefined,
    });
    expect(
      session.returnItems(sale.number, {
        items: [{ index: 0, quantity: 2 }],
        reason: 'barang',
        note: '',
        refund: undefined,
      }),
    ).toMatchObject({ ok: false, messageId: 'MSG-085' });
  });

  it('Kasir tidak berhak meretur (MSG-003)', () => {
    const { session } = setup('U-3');
    expect(
      session.returnItems('T-000101', {
        items: [{ index: 0, quantity: 1 }],
        reason: 'barang',
        note: '',
        refund: undefined,
      }),
    ).toMatchObject({ ok: false, messageId: 'MSG-003' });
  });

  it('transaksi bawaan lama tanpa payments dapat diretur dengan cara kembali pilihan', () => {
    const { session } = setup();
    const legacy = session.state().sales.find((item) => item.number === 'T-000101');
    expect(legacy?.payments).toBeUndefined();
    const value = itemsValue(legacy ?? baseSale, [{ index: 0, quantity: 1 }]);
    const result = session.returnItems('T-000101', {
      items: [{ index: 0, quantity: 1 }],
      reason: 'batal',
      note: '',
      refund: { method: 'transfer', amount: value },
    });
    expect(result).toMatchObject({ ok: true, value });
  });

  it('returnSale lama tetap bekerja tanpa rincian pengembalian', () => {
    const { session } = setup();
    const sale = sellThree(session);
    expect(session.returnSale(sale.number, [{ index: 0, quantity: 1 }], 'rusak')).toMatchObject({
      ok: true,
      value: 70000,
    });
    expect(session.state().returns.at(-1)?.refund).toBeUndefined();
  });
});
