import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { SalesOrder } from '../../../src/shared/data/types';
import {
  buildInvoices,
  filterInvoices,
  grossProfit,
  pageCount,
  PAGE_SIZE,
} from '../../../src/apps/bo/domain/invoices';

const data = generateDataset();

function draft(number: string, synced: boolean | undefined, at = data.referenceDate): SalesOrder {
  const product = data.products[0];
  if (product === undefined) {
    throw new Error('data kosong');
  }
  return {
    id: number,
    number,
    createdAt: at,
    createdBy: 'U-6',
    customerId: undefined,
    lines: [{ productId: product.id, unit: product.baseUnit, quantity: 2, unitPrice: 1000 }],
    total: 2000,
    payment: 'tunai',
    downPayment: 0,
    status: 'draf',
    source: 'sales',
    synced,
  };
}

const ALL = { start: '2026-10-01', end: '2026-10-19', status: 'semua', text: '' } as const;

describe('invoice BO-09', () => {
  it('menggabungkan transaksi POS dan Draf SO yang sudah sinkron, terbaru lebih dulu', () => {
    const rows = buildInvoices(data, [
      draft('SO-0001', true),
      draft('SO-0002', false),
      draft('SO-0003', undefined),
    ]);
    expect(rows).toHaveLength(42);
    expect(rows.map((row) => row.number)).not.toContain('SO-0002');
    expect(rows[0]?.status).toBe('draf');
    for (let index = 1; index < rows.length; index += 1) {
      expect((rows[index - 1]?.at ?? '') >= (rows[index]?.at ?? '')).toBe(true);
    }
    const sales = rows.find((row) => row.number === 'SO-0001');
    expect(sales).toMatchObject({ source: 'sales', staff: 'Budi Lapangan', paid: 0 });
  });

  it('menandai Lunas bila terbayar penuh dan Pending bila belum', () => {
    const rows = buildInvoices(data, []);
    const statuses = new Set(rows.map((row) => row.status));
    expect(statuses.has('lunas')).toBe(true);
    for (const row of rows) {
      expect(row.status).toBe(row.paid >= row.total ? 'lunas' : 'pending');
    }
  });

  it('menyaring menurut tanggal, status, dan teks nomor atau pelanggan', () => {
    const rows = buildInvoices(data, [draft('SO-0001', true)]);
    expect(filterInvoices(rows, ALL, 'Pelanggan umum')).toHaveLength(41);
    expect(filterInvoices(rows, { ...ALL, status: 'draf' }, 'Pelanggan umum')).toHaveLength(1);
    expect(filterInvoices(rows, { ...ALL, text: 'so-0001' }, 'Pelanggan umum')).toHaveLength(1);
    expect(
      filterInvoices(rows, { ...ALL, text: 'pelanggan umum' }, 'Pelanggan umum').length,
    ).toBeGreaterThan(1);
    expect(
      filterInvoices(rows, { ...ALL, start: '2026-10-19', end: '2026-10-19' }, 'x').length,
    ).toBeLessThan(41);
    expect(filterInvoices(rows, { ...ALL, start: '2020-01-01', end: '2020-01-02' }, 'x')).toEqual(
      [],
    );
  });

  it('menghitung laba kotor dari HPP per satuan dan membagi halaman 50 baris', () => {
    const rows = buildInvoices(data, []);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('data kosong');
    }
    const profit = grossProfit(row, data.products);
    expect(profit).toBeLessThan(row.total);
    expect(grossProfit({ ...row, lines: [] }, data.products)).toBe(row.total);
    expect(PAGE_SIZE).toBe(50);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(101)).toBe(3);
  });
});
