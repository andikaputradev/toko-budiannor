import { describe, expect, it } from 'vitest';
import type { Sale, SyncItem } from '../../../src/shared/data/types';
import {
  filterSales,
  isPending,
  isUnsynced,
  pageCount,
  pageSlice,
  PAGE_SIZE,
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
