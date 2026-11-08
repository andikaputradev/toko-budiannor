import { describe, expect, it } from 'vitest';
import type { Sale, SyncItem } from '../../../src/shared/data/types';
import {
  filterSales,
  groupByDay,
  isPending,
  isUnsynced,
  methodSummary,
  pageCount,
  pageSlice,
  PAGE_SIZE,
  paymentKeyOf,
  paymentRowsOf,
  receivableInfo,
  saleBreakdown,
  visibleReceipts,
  type HistoryFilter,
} from '../../../src/apps/pos/domain/history';

function sale(number: string, at: string, payment: Sale['payment'], paid: number): Sale {
  return {
    id: number,
    number,
    createdAt: at,
    cashierId: 'U-3',
    customerId: payment === 'piutang' ? 'C-001' : undefined,
    lines: [],
    total: 100000,
    payment,
    paid,
  };
}

const paid = sale('T-000101', '2026-10-19T01:00:00Z', 'tunai', 100000);
const owes = sale('T-000102', '2026-10-19T02:00:00Z', 'piutang', 0);
const deposit = sale('T-000103', '2026-10-18T05:00:00Z', 'dp', 30000);
const queued = sale('T-000104', '2026-10-19T02:30:00Z', 'qris', 100000);
const sales = [paid, owes, deposit, queued];
const queue: SyncItem[] = [
  {
    id: 'Q-1',
    saleNumber: 'T-000104',
    createdAt: '2026-10-19T02:30:00Z',
    status: 'menunggu',
    kind: 'transaksi',
    total: 100000,
  },
  {
    id: 'Q-2',
    saleNumber: 'T-000101',
    createdAt: '2026-10-19T01:00:00Z',
    status: 'terkirim',
    kind: 'transaksi',
    total: 100000,
  },
];
const base: HistoryFilter = {
  start: '2026-10-19',
  end: '2026-10-19',
  status: 'semua',
  query: '',
  onlyDevice: undefined,
};
const name = (id: string | undefined): string => (id === undefined ? 'Umum' : 'Toko Maju');

describe('riwayat penjualan', () => {
  it('menandai Pending bagi sisa piutang atau transaksi yang belum tersinkron', () => {
    expect(isPending(paid, queue)).toBe(false);
    expect(isPending(owes, queue)).toBe(true);
    expect(isPending(deposit, queue)).toBe(true);
    expect(isPending(queued, queue)).toBe(true);
    expect(isUnsynced(queued, queue)).toBe(true);
    expect(isUnsynced(paid, queue)).toBe(false);
  });

  it('menyaring menurut tanggal WIB dan mengurutkan terbaru di atas', () => {
    const rows = filterSales(sales, queue, base, name);
    expect(rows.map((item) => item.number)).toEqual(['T-000104', 'T-000102', 'T-000101']);
    const wide = filterSales(sales, queue, { ...base, start: '2026-10-18' }, name);
    expect(wide).toHaveLength(4);
  });

  it('menyaring status Lunas dan Pending', () => {
    expect(filterSales(sales, queue, { ...base, status: 'lunas' }, name)).toHaveLength(1);
    const pending = filterSales(sales, queue, { ...base, status: 'pending' }, name);
    expect(pending.map((item) => item.number)).toEqual(['T-000104', 'T-000102']);
  });

  it('mencari nomor dan nama pelanggan serta membatasi pada transaksi perangkat saat offline', () => {
    expect(filterSales(sales, queue, { ...base, query: 't-000102' }, name)).toHaveLength(1);
    expect(filterSales(sales, queue, { ...base, query: 'maju' }, name)).toHaveLength(1);
    const device = filterSales(sales, queue, { ...base, onlyDevice: new Set(['T-000104']) }, name);
    expect(device.map((item) => item.number)).toEqual(['T-000104']);
  });

  it('memaginasi 50 baris per halaman', () => {
    const rows = Array.from({ length: 120 }, (_, index) => index);
    expect(PAGE_SIZE).toBe(50);
    expect(pageCount(rows.length)).toBe(3);
    expect(pageCount(0)).toBe(1);
    expect(pageSlice(rows, 1)).toHaveLength(50);
    expect(pageSlice(rows, 3)).toHaveLength(20);
  });
});

describe('riwayat dua panel: domain', () => {
  it('groupByDay mengelompokkan per hari WIB, hari terbaru dulu, terbaru dulu dalam hari', () => {
    const a = sale('T-1', '2026-10-19T01:00:00Z', 'tunai', 100000);
    const b = sale('T-2', '2026-10-19T09:00:00Z', 'tunai', 100000);
    const c = sale('T-3', '2026-10-18T05:00:00Z', 'tunai', 100000);
    const d = sale('T-4', '2026-10-18T18:30:00Z', 'tunai', 100000);
    const groups = groupByDay([a, c, d, b]);
    expect(groups.map((group) => group.day)).toEqual(['2026-10-19', '2026-10-18']);
    expect(groups[0]?.sales.map((item) => item.number)).toEqual(['T-2', 'T-1', 'T-4']);
    expect(groups[1]?.sales.map((item) => item.number)).toEqual(['T-3']);
    expect(groupByDay([])).toEqual([]);
  });

  it('paymentKeyOf menulis split bila lebih dari satu baris terbayar', () => {
    const split: Sale = {
      ...sale('T-5', '2026-10-19T01:00:00Z', 'tunai', 100000),
      payments: [
        { method: 'tunai', amount: 60000 },
        { method: 'qris', amount: 40000 },
      ],
    };
    expect(paymentKeyOf(split)).toBe('split');
    expect(paymentKeyOf({ ...split, payments: [{ method: 'tunai', amount: 100000 }] })).toBe(
      'tunai',
    );
    const credit: Sale = {
      ...sale('T-6', '2026-10-19T01:00:00Z', 'piutang', 20000),
      payments: [
        { method: 'dp', amount: 20000, via: 'qris' },
        { method: 'piutang', amount: 80000 },
      ],
    };
    expect(paymentKeyOf(credit)).toBe('piutang');
  });

  it('paymentKeyOf memakai payment untuk transaksi bawaan lama tanpa payments', () => {
    expect(paymentKeyOf(sale('T-7', '2026-10-19T01:00:00Z', 'qris', 100000))).toBe('qris');
  });

  it('paymentRowsOf membuang baris bernilai 0 dan menyusun baris untuk transaksi lama', () => {
    expect(paymentRowsOf(sale('T-8', '2026-10-19T01:00:00Z', 'qris', 100000))).toEqual([
      { method: 'qris', amount: 100000 },
    ]);
    expect(paymentRowsOf(sale('T-9', '2026-10-19T01:00:00Z', 'dp', 30000))).toEqual([
      { method: 'dp', amount: 30000 },
      { method: 'piutang', amount: 70000 },
    ]);
    const withZero: Sale = {
      ...sale('T-10', '2026-10-19T01:00:00Z', 'tunai', 100000),
      payments: [
        { method: 'tunai', amount: 100000 },
        { method: 'piutang', amount: 0 },
      ],
    };
    expect(paymentRowsOf(withZero)).toEqual([{ method: 'tunai', amount: 100000 }]);
  });

  it('receivableInfo ada hanya bila masih ada sisa tagihan', () => {
    const owing: Sale = {
      ...sale('T-11', '2026-10-19T01:00:00Z', 'piutang', 30000),
      terms: { dueDays: 30, dueDate: '2026-11-18T03:00:00.000Z' },
    };
    expect(receivableInfo(owing)).toEqual({ sisa: 70000, dueDate: '2026-11-18T03:00:00.000Z' });
    expect(receivableInfo({ ...owing, terms: undefined })).toEqual({
      sisa: 70000,
      dueDate: undefined,
    });
    expect(receivableInfo(sale('T-12', '2026-10-19T01:00:00Z', 'tunai', 100000))).toBeUndefined();
  });
});

describe('kanal pada riwayat', () => {
  it('paymentRowsOf membawa kanal ke riwayat', () => {
    const withChannel: Sale = {
      ...sale('T-9', '2026-10-19T03:00:00Z', 'transfer', 100000),
      payments: [
        { method: 'transfer', amount: 60000, channel: 'BCA' },
        { method: 'qris', amount: 40000, channel: 'Gopay' },
      ],
    };
    expect(paymentRowsOf(withChannel)).toEqual([
      { method: 'transfer', amount: 60000, channel: 'BCA' },
      { method: 'qris', amount: 40000, channel: 'Gopay' },
    ]);
  });
});

describe('ringkasan metode dan penerimaan', () => {
  it('methodSummary mengembalikan Split, nama kanal, atau metode', () => {
    const split: Sale = {
      ...sale('T-1', '2026-10-19T03:00:00Z', 'tunai', 100000),
      payments: [
        { method: 'tunai', amount: 30000 },
        { method: 'qris', amount: 70000 },
      ],
    };
    expect(methodSummary(split)).toEqual({ kind: 'split' });
    const bank: Sale = {
      ...sale('T-2', '2026-10-19T03:00:00Z', 'transfer', 100000),
      payments: [{ method: 'transfer', amount: 100000, channel: 'BCA' }],
    };
    expect(methodSummary(bank)).toEqual({ kind: 'transfer', channel: 'BCA' });
    const plain: Sale = {
      ...sale('T-3', '2026-10-19T03:00:00Z', 'qris', 100000),
      payments: [{ method: 'qris', amount: 100000 }],
    };
    expect(methodSummary(plain)).toEqual({ kind: 'qris' });
    expect(methodSummary(sale('T-4', '2026-10-19T03:00:00Z', 'tunai', 100000))).toEqual({
      kind: 'tunai',
    });
  });

  it('visibleReceipts menampilkan dua baris dan menghitung sisa', () => {
    const rows = [1, 2, 3, 4].map((n) => ({ method: 'tunai' as const, amount: n * 1000 }));
    expect(visibleReceipts(rows, false)).toMatchObject({ hidden: 2, extra: 2 });
    expect(visibleReceipts(rows, false).shown).toHaveLength(2);
    expect(visibleReceipts(rows, true)).toMatchObject({ hidden: 0, extra: 2 });
    expect(visibleReceipts(rows, true).shown).toHaveLength(4);
    expect(visibleReceipts(rows.slice(0, 2), false)).toMatchObject({ hidden: 0, extra: 0 });
  });

  it('saleBreakdown memisahkan subtotal, diskon, dan grand total', () => {
    const line = { productId: 'P-01', unit: 'SAK', quantity: 2, unitPrice: 50000 };
    const discounted: Sale = {
      ...sale('T-5', '2026-10-19T03:00:00Z', 'tunai', 90000),
      lines: [line],
      total: 90000,
    };
    expect(saleBreakdown(discounted)).toEqual({
      subtotal: 100000,
      discount: 10000,
      grandTotal: 90000,
    });
    const full: Sale = { ...discounted, total: 100000 };
    expect(saleBreakdown(full)).toEqual({ subtotal: 100000, discount: 0, grandTotal: 100000 });
    expect(saleBreakdown(sale('T-6', '2026-10-19T03:00:00Z', 'tunai', 100000))).toEqual({
      subtotal: 100000,
      discount: 0,
      grandTotal: 100000,
    });
  });

  it('filterSales menyaring menurut metode, Split, dan piutang termasuk DP', () => {
    const tunai = sale('T-7', '2026-10-19T03:00:00Z', 'tunai', 100000);
    const qris = sale('T-8', '2026-10-19T04:00:00Z', 'qris', 100000);
    const dp = sale('T-9', '2026-10-19T05:00:00Z', 'dp', 20000);
    const credit = sale('T-10', '2026-10-19T06:00:00Z', 'piutang', 0);
    const split: Sale = {
      ...sale('T-11', '2026-10-19T07:00:00Z', 'tunai', 100000),
      payments: [
        { method: 'tunai', amount: 50000 },
        { method: 'qris', amount: 50000 },
      ],
    };
    const all = [tunai, qris, dp, credit, split];
    const base: HistoryFilter = {
      start: '',
      end: '',
      status: 'semua',
      query: '',
      onlyDevice: undefined,
    };
    const numbers = (method: HistoryFilter['method']) =>
      filterSales(all, [], { ...base, method }, () => '').map((item) => item.number);
    expect(numbers('semua').sort()).toEqual(['T-10', 'T-11', 'T-7', 'T-8', 'T-9']);
    expect(numbers(undefined)).toHaveLength(5);
    expect(numbers('tunai')).toEqual(['T-7']);
    expect(numbers('qris')).toEqual(['T-8']);
    expect(numbers('split')).toEqual(['T-11']);
    expect(numbers('piutang').sort()).toEqual(['T-10', 'T-9']);
  });
});
