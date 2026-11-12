import { describe, expect, it } from 'vitest';
import {
  buildProductHistory,
  defaultRange,
  normalizeRange,
} from '../../../src/apps/bo/domain/product-history';
import type { CorrectionDoc, CorrectionLine } from '../../../src/apps/bo/domain/stock-correction';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Dataset, Product, Sale, Supplier } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';

const RANGE = { from: '2026-10-01', to: '2026-10-19' };
const IN_RANGE = '2026-10-10T03:00:00.000Z';
const IN_RANGE_LATER = '2026-10-15T03:00:00.000Z';
const OUT_OF_RANGE = '2026-09-20T03:00:00.000Z';

function fixture() {
  const base = generateDataset();
  const [target, other] = base.products;
  const [supplier] = base.suppliers;
  if (target === undefined || other === undefined || supplier === undefined) {
    throw new Error('dataset tanpa barang atau pemasok');
  }
  const line = (product: Product, quantity: number, unitPrice: number) => ({
    productId: product.id,
    unit: product.baseUnit,
    quantity,
    unitPrice,
  });
  const sale = (id: string, createdAt: string, lines: Sale['lines']): Sale => ({
    id,
    number: id,
    createdAt,
    cashierId: 'U-1',
    customerId: undefined,
    lines,
    total: 0,
    payment: 'tunai',
    paid: 0,
  });
  const supplierWithInvoices: Supplier = {
    ...supplier,
    invoices: [
      {
        id: 'FB-IN',
        issuedAt: IN_RANGE,
        dueAt: IN_RANGE,
        amount: 0,
        paid: 0,
        lines: [line(target, 10, 1000), line(other, 1, 1)],
      },
      {
        id: 'FB-OUT',
        issuedAt: OUT_OF_RANGE,
        dueAt: OUT_OF_RANGE,
        amount: 0,
        paid: 0,
        lines: [line(target, 3, 900)],
      },
    ],
  };
  const dataset: Dataset = {
    ...base,
    suppliers: [supplierWithInvoices, ...base.suppliers.slice(1)],
    sales: [
      sale('T-IN-1', IN_RANGE, [line(target, 2, 5000)]),
      sale('T-IN-2', IN_RANGE_LATER, [line(target, 1, 5000), line(other, 4, 100)]),
      sale('T-OUT', OUT_OF_RANGE, [line(target, 9, 5000)]),
    ],
  };
  const store = createStore({ dataset });
  store.addPurchaseOrder({
    id: 'PO-T',
    number: 'PO-T1',
    createdAt: IN_RANGE_LATER,
    createdBy: 'U-1',
    supplierId: supplier.id,
    warehouse: 'besar',
    lines: [line(target, 5, 1200)],
    total: 6000,
    status: 'dipesan',
  });
  const correctionLine = (product: Product, diffQty: number): CorrectionLine => ({
    productId: product.id,
    code: product.code,
    name: product.name,
    warehouse: 'display',
    unit: product.baseUnit,
    baseUnit: product.baseUnit,
    systemBase: 10,
    actualBase: 10 + diffQty,
    diffBase: diffQty,
    systemQty: 10,
    actualQty: 10 + diffQty,
    diffQty,
    hpp: 100,
    value: diffQty * 100,
  });
  const doc = (number: string, at: string, lines: readonly CorrectionLine[]): CorrectionDoc => ({
    number,
    at,
    userId: 'U-2',
    userName: 'Ibu Sinta',
    authorizedBy: undefined,
    reason: 'Salah hitung',
    lines,
    totalValue: 0,
    totalAbs: 0,
  });
  const corrections = [
    doc('KS-IN', IN_RANGE, [correctionLine(target, -3), correctionLine(other, 1)]),
    doc('KS-OUT', OUT_OF_RANGE, [correctionLine(target, 2)]),
  ];
  return { store, target, other, corrections };
}

describe('rentang riwayat', () => {
  it('rentang bawaan adalah 30 hari terakhir sampai hari ini', () => {
    expect(defaultRange('2026-10-19')).toEqual({ from: '2026-09-19', to: '2026-10-19' });
    expect(defaultRange('2026-03-05')).toEqual({ from: '2026-02-03', to: '2026-03-05' });
  });

  it('menukar rentang yang terbalik dan membiarkan rentang yang benar', () => {
    expect(normalizeRange({ from: '2026-10-19', to: '2026-10-01' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-19',
    });
    expect(normalizeRange(RANGE)).toEqual(RANGE);
  });
});

describe('buildProductHistory', () => {
  it('hanya memuat pembelian dalam rentang: faktur pemasok dan PO, terbaru dulu', () => {
    const { store, target, corrections } = fixture();
    const history = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history.pembelian.map((row) => row.number)).toEqual(['PO-T1', 'FB-IN']);
    expect(history.pembelian[1]).toMatchObject({ quantity: 10, amount: 10_000 });
    expect(history.pembelian[1]?.party).not.toBe('');
  });

  it('hanya memuat penjualan dalam rentang dan baris milik barang itu, terbaru dulu', () => {
    const { store, target, corrections } = fixture();
    const history = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history.penjualan.map((row) => row.number)).toEqual(['T-IN-2', 'T-IN-1']);
    expect(history.penjualan.map((row) => row.quantity)).toEqual([1, 2]);
    expect(history.penjualan[1]?.amount).toBe(10_000);
  });

  it('koreksi memuat selisih jumlah (boleh negatif), nilai, dan petugas', () => {
    const { store, target, corrections } = fixture();
    const history = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history.koreksi).toHaveLength(1);
    expect(history.koreksi[0]).toMatchObject({
      number: 'KS-IN',
      party: 'Ibu Sinta',
      quantity: -3,
      amount: -300,
    });
  });

  it('rentang yang lebih lama memuat riwayat lama, dan rentang terbalik ditukar', () => {
    const { store, target, corrections } = fixture();
    const older = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: { from: '2026-09-01', to: '2026-10-19' },
    });
    expect(older.pembelian.map((row) => row.number)).toContain('FB-OUT');
    expect(older.penjualan.map((row) => row.number)).toContain('T-OUT');
    expect(older.koreksi.map((row) => row.number)).toContain('KS-OUT');

    const reversed = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: { from: '2026-10-19', to: '2026-10-01' },
    });
    expect(reversed.penjualan.map((row) => row.number)).toEqual(['T-IN-2', 'T-IN-1']);
  });

  it('barang tanpa riwayat menghasilkan tiga daftar kosong', () => {
    const { store, corrections } = fixture();
    const product = store.getState().data.products.at(-1);
    if (product === undefined) {
      throw new Error('dataset kosong');
    }
    const history = buildProductHistory({
      product,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history).toEqual({ pembelian: [], penjualan: [], koreksi: [] });
  });
});
