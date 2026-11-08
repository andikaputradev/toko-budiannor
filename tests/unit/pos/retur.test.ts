import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import type { Product, Sale } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import {
  defaultRefundMethod,
  itemsValue,
  reasonText,
  refundableCash,
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

  it('Frontliner tetap tidak berhak meretur (MSG-003)', () => {
    const { session } = setup('U-5');
    expect(
      session.returnItems('T-000101', {
        items: [{ index: 0, quantity: 1 }],
        reason: 'barang',
        note: '',
        refund: undefined,
      }),
    ).toMatchObject({ ok: false, messageId: 'MSG-003' });
  });

  it('Kasir boleh menyimpan retur', () => {
    const { session } = setup('U-3');
    const sale = sellThree(session);
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 70000 },
    });
    expect(result).toMatchObject({ ok: true, value: 70000 });
    expect(session.state().returns).toHaveLength(1);
  });

  it('retur tunai oleh Kasir tetap memerlukan shift dan saldo laci cukup', () => {
    const store = createStore({ dataset });
    store.setUser('U-3');
    const noShift = createPosSession(store, { clock: () => 1_000_000 });
    const sale = sellThree(noShift, 'qris');
    expect(
      noShift.returnItems(sale.number, {
        items: [{ index: 0, quantity: 1 }],
        reason: 'barang',
        note: '',
        refund: { method: 'tunai', amount: 70000 },
      }),
    ).toMatchObject({ ok: false, labelKey: 'butuhShift' });
    noShift.startShift(0);
    expect(
      noShift.returnItems(sale.number, {
        items: [{ index: 0, quantity: 1 }],
        reason: 'barang',
        note: '',
        refund: { method: 'tunai', amount: 70000 },
      }),
    ).toMatchObject({ ok: false, messageId: 'MSG-041' });
  });

  it('kanal pengembalian hanya sah untuk QRIS dan Transfer', () => {
    const { session } = setup('U-3');
    const sale = sellThree(session, 'qris');
    const attempt = (method: 'tunai' | 'qris' | 'edc' | 'transfer', channel: string) =>
      session.returnItems(sale.number, {
        items: [{ index: 0, quantity: 1 }],
        reason: 'barang',
        note: '',
        refund: { method, amount: 70000, channel },
      });
    expect(attempt('transfer', 'OVO')).toMatchObject({ ok: false, labelKey: 'kanalTidakSah' });
    expect(attempt('tunai', 'BCA')).toMatchObject({ ok: false, labelKey: 'kanalTidakSah' });
    expect(attempt('edc', 'Gopay')).toMatchObject({ ok: false, labelKey: 'kanalTidakSah' });
    expect(session.state().returns).toHaveLength(0);
    expect(attempt('transfer', 'BCA')).toMatchObject({ ok: true });
  });

  it('retur mencatat kanal pada ReturnRecord.refund', () => {
    const { session } = setup('U-3');
    const sale = sellThree(session, 'qris');
    session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'qris', amount: 70000, channel: 'Gopay' },
    });
    expect(session.state().returns[0]?.refund).toEqual({
      method: 'qris',
      amount: 70000,
      channel: 'Gopay',
    });
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

describe('nilai retur atas baris berdiskon', () => {
  const discounted: Sale = {
    ...baseSale,
    lines: [{ ...lineOf(3), discount: { kind: 'persen', value: 10 } }],
    total: 189000,
    paid: 189000,
  };

  it('proporsional dengan jumlah yang diretur dan tidak melebihi yang dibayar', () => {
    expect(itemsValue(discounted, [{ index: 0, quantity: 1 }])).toBe(63000);
    expect(itemsValue(discounted, [{ index: 0, quantity: 2 }])).toBe(126000);
    expect(itemsValue(discounted, [{ index: 0, quantity: 3 }])).toBe(189000);
    expect(itemsValue(discounted, [{ index: 0, quantity: 3 }])).toBeLessThanOrEqual(
      discounted.paid,
    );
  });

  it('nilai gabungan seluruh jumlah sama dengan subtotal baris walau pembagiannya tidak bulat', () => {
    const oddLine = { productId: 'P-01', unit: 'SAK', quantity: 3, unitPrice: 33334 };
    const odd: Sale = {
      ...baseSale,
      lines: [oddLine],
      total: 100002,
      paid: 100002,
    };
    const value = itemsValue(odd, [{ index: 0, quantity: 3 }]);
    expect(value).toBe(100002);
    expect(itemsValue(odd, [{ index: 0, quantity: 1 }])).toBe(33334);
    const withNominal: Sale = {
      ...odd,
      lines: [{ ...oddLine, discount: { kind: 'nominal', value: 1 } }],
      total: 100001,
      paid: 100001,
    };
    expect(itemsValue(withNominal, [{ index: 0, quantity: 3 }])).toBe(100001);
    expect(itemsValue(withNominal, [{ index: 0, quantity: 1 }])).toBe(33334);
  });

  it('baris tanpa diskon tetap jumlah kali harga dan baris yang tidak ada dilewati', () => {
    expect(itemsValue(baseSale, [{ index: 0, quantity: 2 }])).toBe(140000);
    expect(itemsValue(baseSale, [{ index: 9, quantity: 2 }])).toBe(0);
  });

  it('sesi: retur sebagian atas baris berdiskon bernilai proporsional dan dapat disimpan', () => {
    const { session } = setup('U-2');
    session.addProduct(semen(), 'SAK', 3);
    session.setLineDetail(0, { discount: { kind: 'persen', value: 10 } });
    session.exactAmount();
    const sale = session.finish();
    if (sale === undefined) {
      throw new Error('penjualan gagal');
    }
    expect(sale.total).toBe(189000);
    const result = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 63000 },
    });
    expect(result).toMatchObject({ ok: true, value: 63000 });
    const tooHigh = session.returnItems(sale.number, {
      items: [{ index: 0, quantity: 1 }],
      reason: 'barang',
      note: '',
      refund: { method: 'tunai', amount: 70000 },
    });
    expect(tooHigh).toMatchObject({ ok: false, labelKey: 'nominalMelebihi' });
  });
});

describe('refundableCash', () => {
  it('sebesar uang yang sudah dibayar dikurangi pengembalian tercatat penjualan itu dan tidak negatif', () => {
    expect(refundableCash(baseSale, [])).toBe(210000);
    const returns = [
      { saleNumber: 'T-x', refund: { amount: 50000 } },
      { saleNumber: 'T-lain', refund: { amount: 99999 } },
      { saleNumber: 'T-x', refund: undefined },
    ];
    expect(refundableCash(baseSale, returns)).toBe(160000);
    expect(refundableCash({ ...baseSale, paid: 0, payment: 'piutang' }, [])).toBe(0);
    expect(refundableCash(baseSale, [{ saleNumber: 'T-x', refund: { amount: 300000 } }])).toBe(0);
  });
});

describe('sesi: retur atas penjualan yang belum dibayar penuh', () => {
  it('menolak pengembalian melebihi uang yang sudah dibayar pada penjualan DP dan menerima sebesar yang dibayar', () => {
    const { session } = setup();
    const sale = session
      .state()
      .sales.find((item) => item.payment === 'dp' && item.paid > 0 && item.paid < item.total);
    if (sale === undefined) {
      throw new Error('penjualan DP bawaan tidak ada');
    }
    const items = sale.lines.map((line, index) => ({ index, quantity: line.quantity }));
    expect(itemsValue(sale, items)).toBeGreaterThan(sale.paid);
    const attempt = (amount: number) =>
      session.returnItems(sale.number, {
        items,
        reason: 'barang',
        note: '',
        refund: { method: 'qris', amount },
      });
    expect(attempt(sale.paid + 1)).toEqual({ ok: false, labelKey: 'nominalMelebihiDibayar' });
    expect(session.state().returns).toHaveLength(0);
    expect(attempt(sale.paid)).toMatchObject({ ok: true });
    expect(session.state().returns.at(-1)?.refund?.amount).toBe(sale.paid);
  });
});
