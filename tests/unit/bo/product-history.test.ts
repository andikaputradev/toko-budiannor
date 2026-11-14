import { describe, expect, it } from 'vitest';
import {
  buildMutationHistory,
  buildProductHistory,
  defaultRange,
  filterByParty,
  normalizeRange,
} from '../../../src/apps/bo/domain/product-history';
import type { MovementSources } from '../../../src/apps/bo/domain/stock-report';
import { stockIn } from '../../../src/apps/bo/domain/stock-view';
import type { CorrectionDoc, CorrectionLine } from '../../../src/apps/bo/domain/stock-correction';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Dataset, Product, Sale, Supplier } from '../../../src/shared/data/types';
import { createStore, type AppState } from '../../../src/shared/store/store';

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
  it('rentang bawaan: tanggal 1 pada tiga bulan sebelumnya sampai hari ini (gambar klien)', () => {
    expect(defaultRange('2026-11-12')).toEqual({ from: '2026-08-01', to: '2026-11-12' });
    expect(defaultRange('2026-10-19')).toEqual({ from: '2026-07-01', to: '2026-10-19' });
    expect(defaultRange('2026-02-10')).toEqual({ from: '2025-11-01', to: '2026-02-10' });
    expect(defaultRange('2026-01-05')).toEqual({ from: '2025-10-01', to: '2026-01-05' });
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

  it('koreksi memuat qty awal, aksi, qty mutlak, dan qty akhir', () => {
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
      qtyBefore: 10,
      action: 'kurang',
      qty: 3,
      qtyAfter: 7,
      unit: target.baseUnit,
    });
  });

  it('koreksi yang menambah stok bernilai aksi tambah dengan qty positif', () => {
    const { store, other, corrections } = fixture();
    const history = buildProductHistory({
      product: other,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history.koreksi[0]).toMatchObject({
      action: 'tambah',
      qty: 1,
      qtyBefore: 10,
      qtyAfter: 11,
    });
  });

  it('harga satuan baris adalah jumlah dibagi kuantitas, dibulatkan', () => {
    const { store, target, corrections } = fixture();
    const history = buildProductHistory({
      product: target,
      state: store.getState(),
      corrections,
      range: RANGE,
    });
    expect(history.penjualan.map((row) => row.unitPrice)).toEqual([5000, 5000]);
    expect(history.pembelian.map((row) => row.unitPrice)).toEqual([1200, 1000]);
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

describe('filterByParty', () => {
  const rows = [
    {
      at: '',
      number: 'A',
      party: 'PT Aica Indira',
      quantity: 1,
      unit: 'PCS',
      amount: 1,
      unitPrice: 1,
    },
    { at: '', number: 'B', party: 'PT ABC', quantity: 1, unit: 'PCS', amount: 1, unitPrice: 1 },
  ];

  it('menyaring sebagian nama tanpa membedakan huruf besar dan kecil', () => {
    expect(filterByParty(rows, 'aica').map((row) => row.number)).toEqual(['A']);
    expect(filterByParty(rows, 'PT').map((row) => row.number)).toEqual(['A', 'B']);
  });

  it('teks kosong atau spasi mengembalikan semua baris', () => {
    expect(filterByParty(rows, '')).toHaveLength(2);
    expect(filterByParty(rows, '   ')).toHaveLength(2);
  });

  it('tanpa kecocokan menghasilkan daftar kosong', () => {
    expect(filterByParty(rows, 'zzz')).toEqual([]);
  });
});

describe('buildMutationHistory', () => {
  function sourcesOf(state: AppState, corrections: readonly CorrectionDoc[]): MovementSources {
    return {
      sales: state.data.sales,
      customers: state.data.customers,
      suppliers: state.data.suppliers,
      purchaseOrders: state.purchaseOrders,
      transfers: [],
      opname: undefined,
      corrections,
      extra: [],
    };
  }

  it('barang tanpa gerak: satu baris SALDO AWAL bersaldo stok sekarang', () => {
    const { store, corrections } = fixture();
    const product = store.getState().data.products.at(-1);
    if (product === undefined) {
      throw new Error('dataset kosong');
    }
    const result = buildMutationHistory({
      product,
      sources: sourcesOf(store.getState(), corrections),
      range: RANGE,
      warehouse: 'semua',
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kind: 'saldo-awal', name: 'SALDO AWAL' });
    expect(result.rows[0]?.balance).toBe(stockIn(product, 'semua'));
    expect(result.opening).toBe(stockIn(product, 'semua'));
  });

  it('gudang toko: saldo berjalan berakhir di stok toko sekarang', () => {
    const { store, target, corrections } = fixture();
    const result = buildMutationHistory({
      product: target,
      sources: sourcesOf(store.getState(), corrections),
      range: RANGE,
      warehouse: 'display',
    });
    expect(result.rows.map((row) => row.kind)).toEqual([
      'saldo-awal',
      'koreksi',
      'penjualan',
      'penjualan',
    ]);
    expect(result.rows.slice(1).map((row) => row.number)).toEqual(['KS-IN', 'T-IN-1', 'T-IN-2']);
    expect(result.rows[0]?.balance).toBe(target.stock.display + 6);
    expect(result.rows.at(-1)?.balance).toBe(target.stock.display);
    expect(result.rows[2]).toMatchObject({ outQty: 2, inQty: 0 });
    expect(result.rows[1]).toMatchObject({ name: 'KOREKSI', outQty: 3 });
  });

  it('gudang besar hanya memuat gerak gudang besar (pembelian dengan nama pemasok)', () => {
    const { store, target, corrections } = fixture();
    const result = buildMutationHistory({
      product: target,
      sources: sourcesOf(store.getState(), corrections),
      range: RANGE,
      warehouse: 'besar',
    });
    expect(result.rows.map((row) => row.kind)).toEqual(['saldo-awal', 'pembelian']);
    expect(result.rows[1]).toMatchObject({ number: 'FB-IN', inQty: 10 });
    expect(result.rows[1]?.name).not.toBe('');
  });

  it('semua gudang memuat gerak kedua gudang dan satuan dasar barang', () => {
    const { store, target, corrections } = fixture();
    const result = buildMutationHistory({
      product: target,
      sources: sourcesOf(store.getState(), corrections),
      range: RANGE,
      warehouse: 'semua',
    });
    expect(result.rows.map((row) => row.kind)).toEqual([
      'saldo-awal',
      'koreksi',
      'penjualan',
      'pembelian',
      'penjualan',
    ]);
    expect(result.unit).toBe(target.baseUnit);
  });
});
