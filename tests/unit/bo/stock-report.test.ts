import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product, PurchaseOrder, Sale, Supplier } from '../../../src/shared/data/types';
import type { OpnameDoc } from '../../../src/apps/bo/domain/opname';
import {
  addDays,
  ALL_CATEGORIES,
  buildStockCard,
  buildStockRows,
  categoriesOf,
  clampPage,
  extraMovements,
  monthStart,
  movementsFor,
  pageCount,
  pageSlice,
  productsWithMovement,
  registerMovementProvider,
  summarize,
  validateRange,
  valueByCategory,
  type MovementSources,
  type StockMovement,
} from '../../../src/apps/bo/domain/stock-report';
import { seedCorrections, type CorrectionDoc } from '../../../src/apps/bo/domain/stock-correction';
import { totalStock } from '../../../src/shared/data/units';
import { need, sampleProduct } from './support';

const dataset = generateDataset();

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    ...sampleProduct(),
    category: 'CAT',
    hpp: 1000,
    minStock: 10,
    minByWarehouse: undefined,
    stock: { display: 20, besar: 40 },
    active: true,
    ...overrides,
  };
}

describe('posisi stok', () => {
  const a = product({
    id: 'P-A',
    name: 'Bata Merah',
    category: 'BATA',
    stock: { display: 2, besar: 30 },
  });
  const b = product({
    id: 'P-B',
    name: 'Cat Tembok',
    category: 'CAT',
    stock: { display: 50, besar: 100 },
    hpp: 2000,
  });
  const c = product({
    id: 'P-C',
    name: 'Amplas',
    category: 'CAT',
    stock: { display: -2, besar: 0 },
  });
  const d = product({ id: 'P-D', name: 'Barang Mati', category: 'CAT', active: false });
  const all = [a, b, c, d];
  const base = { warehouse: 'semua', category: ALL_CATEGORIES, below: false } as const;

  it('mengabaikan barang nonaktif dan mengurutkan menurut nama', () => {
    const rows = buildStockRows(all, base);
    expect(rows.map((row) => row.product.name)).toEqual(['Amplas', 'Bata Merah', 'Cat Tembok']);
  });

  it('menghitung nilai persediaan stok kali HPP pada gudang terpilih', () => {
    const semua = buildStockRows([b], base)[0];
    expect(semua).toMatchObject({ quantity: 150, value: 300000, minimum: 10, status: 'aman' });
    const display = buildStockRows([b], { ...base, warehouse: 'display' })[0];
    expect(display).toMatchObject({ quantity: 50, value: 100000 });
    const besar = buildStockRows([b], { ...base, warehouse: 'besar' })[0];
    expect(besar?.value).toBe(200000);
  });

  it('menyaring kategori dan hanya barang di bawah minimum atau negatif', () => {
    expect(buildStockRows(all, { ...base, category: 'BATA' }).map((row) => row.product.id)).toEqual(
      ['P-A'],
    );
    const below = buildStockRows(all, { ...base, below: true });
    expect(below.map((row) => row.product.id)).toEqual(['P-C']);
    const displayBelow = buildStockRows(all, { ...base, warehouse: 'display', below: true });
    expect(displayBelow.map((row) => row.status)).toEqual(['negatif', 'minimum']);
  });

  it('merangkum nilai per gudang, jumlah barang, dan peringatan', () => {
    const summary = summarize(buildStockRows(all, base));
    expect(summary).toMatchObject({
      items: 3,
      valueDisplay: 2000 + 100000 - 2000,
      valueBesar: 30000 + 200000,
      belowMinimum: 0,
      negative: 1,
    });
    expect(summary.valueTotal).toBe(summary.valueDisplay + summary.valueBesar);
  });

  it('mengelompokkan nilai per kategori, memotong ke batas, dan menjumlahkan sisanya', () => {
    const rows = buildStockRows(all, base);
    const full = valueByCategory(rows, 5);
    expect(full.map((item) => item.category)).toEqual(['CAT', 'BATA']);
    expect(full.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1, 10);
    const cut = valueByCategory(rows, 1);
    expect(cut).toHaveLength(2);
    expect(cut[1]).toMatchObject({ other: true, category: '' });
    expect(valueByCategory([], 3)).toEqual([]);
  });

  it('mendaftar kategori unik terurut dari barang aktif saja', () => {
    expect(categoriesOf([...all, product({ id: 'P-E', name: 'Z', category: 'ATAP' })])).toEqual([
      'ATAP',
      'BATA',
      'CAT',
    ]);
    expect(categoriesOf([d])).toEqual([]);
  });

  it('membagi halaman lima puluh baris dan membatasi nomor halaman', () => {
    const rows = Array.from({ length: 120 }, (_, index) => index);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(120)).toBe(3);
    expect(clampPage(9, 120)).toBe(3);
    expect(clampPage(-1, 120)).toBe(1);
    expect(pageSlice(rows, 3)).toHaveLength(20);
    expect(pageSlice(rows, 2)[0]).toBe(50);
  });

  it('memakai data contoh: total nilai sama dengan jumlah stok kali HPP seluruh barang aktif', () => {
    const rows = buildStockRows(dataset.products, base);
    const expected = dataset.products
      .filter((item) => item.active !== false)
      .reduce((sum, item) => sum + Math.round(totalStock(item) * item.hpp), 0);
    expect(summarize(rows).valueTotal).toBe(expected);
  });
});

describe('kartu stok', () => {
  // Stok sekarang: Display 10, Besar 80 (total 90). Satuan dasar Kg, 1 Sak = 40 Kg.
  const semen = product({ id: 'P-S', name: 'Semen', stock: { display: 10, besar: 80 } });
  const sale = (id: string, at: string, quantity: number, unit: string): Sale => ({
    id,
    number: `T-${id}`,
    createdAt: at,
    cashierId: 'U-3',
    customerId: 'C-001',
    lines: [{ productId: semen.id, unit, quantity, unitPrice: 0 }],
    total: 0,
    payment: 'tunai',
    paid: 0,
  });
  const supplier: Supplier = {
    id: 'V-1',
    name: 'CV Sumber',
    phone: '0',
    payable: 0,
    invoices: [
      {
        id: 'FB-1',
        issuedAt: '2026-10-10',
        dueAt: '2026-11-10',
        amount: 0,
        paid: 0,
        lines: [{ productId: semen.id, unit: 'Sak', quantity: 1, unitPrice: 0 }],
      },
    ],
  };
  const correction: CorrectionDoc = {
    number: 'KS-0001',
    at: '2026-10-15T03:00:00.000Z',
    userId: 'U-2',
    userName: 'Ibu Sinta',
    authorizedBy: undefined,
    reason: 'Barang ditemukan',
    totalValue: 0,
    totalAbs: 0,
    lines: [
      {
        productId: semen.id,
        code: semen.code,
        name: semen.name,
        warehouse: 'besar',
        unit: 'Kg',
        baseUnit: 'Kg',
        systemBase: 75,
        actualBase: 80,
        diffBase: 5,
        systemQty: 75,
        actualQty: 80,
        diffQty: 5,
        hpp: 1000,
        value: 5000,
      },
    ],
  };
  const opname: OpnameDoc = {
    number: 'OP-0001',
    warehouse: 'display',
    date: '2026-10-19',
    status: 'diterapkan',
    appliedBy: 'U-1',
    journalValue: 0,
    lines: [{ productId: semen.id, physical: '10', note: 'Hitung ulang', systemSnapshot: 12 }],
  };
  const sources: MovementSources = {
    sales: [
      sale('1', '2026-10-17T03:00:00.000Z', 10, 'Kg'),
      sale('2', '2026-10-19T02:00:00.000Z', 0.25, 'Sak'),
    ],
    customers: [{ id: 'C-001', name: 'Budi' }],
    suppliers: [supplier],
    purchaseOrders: [],
    transfers: [
      {
        number: 'M-0001',
        at: '2026-10-18T04:10:00.000Z',
        from: 'besar',
        to: 'display',
        lines: [{ productId: semen.id, baseQuantity: 20 }],
      },
    ],
    opname,
    corrections: [correction],
    extra: [],
  };
  const movements = movementsFor(semen, sources);
  const range = { start: '2026-10-01', end: '2026-10-19', warehouse: 'semua' } as const;

  it('mengumpulkan pergerakan dari semua sumber dalam satuan dasar dan terurut waktu', () => {
    expect(movements.map((item) => [item.document, item.warehouse, item.delta])).toEqual([
      ['FB-1', 'besar', 40],
      ['KS-0001', 'besar', 5],
      ['T-1', 'display', -10],
      ['M-0001', 'display', 20],
      ['M-0001', 'besar', -20],
      ['T-2', 'display', -10],
      ['OP-0001', 'display', -2],
    ]);
    expect(movements.find((item) => item.document === 'T-1')?.party).toBe('Budi');
    expect(movements.find((item) => item.document === 'M-0001' && item.delta < 0)?.counter).toBe(
      'display',
    );
  });

  it('mencatat PO hanya bila sudah diterima dan opname hanya bila diterapkan', () => {
    const order = (status: PurchaseOrder['status']): PurchaseOrder => ({
      id: `PO-${status}`,
      number: `PO-${status}`,
      createdAt: '2026-10-12T03:00:00.000Z',
      createdBy: 'U-1',
      supplierId: 'V-1',
      warehouse: 'display',
      lines: [{ productId: semen.id, unit: 'Sak', quantity: 2, unitPrice: 0 }],
      total: 0,
      status,
    });
    const withOrders = movementsFor(semen, {
      ...sources,
      purchaseOrders: [
        order('draf'),
        order('dipesan'),
        order('diterima-sebagian'),
        order('diterima'),
      ],
      opname: { ...opname, status: 'draf' },
    });
    expect(withOrders.filter((item) => item.document.startsWith('PO-'))).toHaveLength(1);
    expect(withOrders.some((item) => item.kind === 'opname')).toBe(false);
    expect(withOrders.find((item) => item.document.startsWith('PO-'))).toMatchObject({
      warehouse: 'display',
      delta: 80,
      party: 'CV Sumber',
    });
  });

  it('menghitung saldo awal mundur dari stok sistem dan saldo akhir sama dengan stok sekarang', () => {
    const card = buildStockCard(semen, movements, range);
    expect(card.current).toBe(90);
    expect(card.opening).toBe(67);
    expect(card.rows.map((row) => row.balance)).toEqual([107, 112, 102, 102, 92, 90]);
    expect(card.totalIn).toBe(45);
    expect(card.totalOut).toBe(22);
    expect(card.closing).toBe(card.current);
  });

  it('menampilkan mutasi sebagai satu baris netral pada kartu semua gudang', () => {
    const card = buildStockCard(semen, movements, range);
    const transfer = need(card.rows.find((row) => row.kind === 'mutasi'));
    expect(transfer).toMatchObject({
      internal: true,
      inQty: 0,
      outQty: 0,
      from: 'besar',
      to: 'display',
    });
    expect(card.rows.filter((row) => row.kind === 'mutasi')).toHaveLength(1);
  });

  it('memisahkan kartu per gudang dengan saldo awal masing-masing', () => {
    const display = buildStockCard(semen, movements, { ...range, warehouse: 'display' });
    expect(display.opening).toBe(12);
    expect(display.rows.map((row) => row.balance)).toEqual([2, 22, 12, 10]);
    expect(display.closing).toBe(10);
    const besar = buildStockCard(semen, movements, { ...range, warehouse: 'besar' });
    expect(besar.opening).toBe(55);
    expect(besar.rows.map((row) => row.balance)).toEqual([95, 100, 80]);
    expect(besar.rows.find((row) => row.kind === 'mutasi')).toMatchObject({
      internal: false,
      outQty: 20,
      from: 'besar',
      to: 'display',
    });
  });

  it('memotong periode: saldo awal tanggal mulai dan saldo akhir pada tanggal akhir', () => {
    const late = buildStockCard(semen, movements, { ...range, start: '2026-10-18' });
    expect(late.opening).toBe(102);
    expect(late.rows).toHaveLength(3);
    expect(late.closing).toBe(90);
    const early = buildStockCard(semen, movements, { ...range, end: '2026-10-17' });
    expect(early.opening).toBe(67);
    expect(early.closing).toBe(102);
    expect(early.closing).not.toBe(early.current);
    const empty = buildStockCard(semen, movements, {
      ...range,
      start: '2026-10-20',
      end: '2026-10-21',
    });
    expect(empty.rows).toEqual([]);
    expect(empty.opening).toBe(90);
  });

  it('menyertakan pergerakan yang didaftarkan modul lain, misalnya retur', () => {
    const retur: StockMovement = {
      id: 'R-1',
      productId: semen.id,
      at: '2026-10-19T01:00:00.000Z',
      kind: 'retur-penjualan',
      document: 'R-0001',
      warehouse: 'display',
      delta: 4,
      party: 'Budi',
      counter: undefined,
      note: undefined,
    };
    const stop = registerMovementProvider(() => [retur]);
    expect(extraMovements()).toEqual([retur]);
    const card = buildStockCard(
      semen,
      movementsFor(semen, { ...sources, extra: extraMovements() }),
      range,
    );
    expect(card.rows.some((row) => row.kind === 'retur-penjualan')).toBe(true);
    expect(card.opening).toBe(63);
    expect(card.closing).toBe(90);
    stop();
    expect(extraMovements()).toEqual([]);
  });

  it('mengurutkan barang berpergerakan menurut jumlah pergerakan', () => {
    const quiet = product({ id: 'P-Q', name: 'Sepi' });
    const list = productsWithMovement([quiet, semen], sources, 5);
    expect(list.map((item) => item.id)).toEqual(['P-S']);
    expect(productsWithMovement([semen], sources, 0)).toEqual([]);
  });

  it('pada data contoh saldo akhir periode berjalan selalu sama dengan stok sistem', () => {
    const real: MovementSources = {
      sales: dataset.sales,
      customers: dataset.customers,
      suppliers: dataset.suppliers,
      purchaseOrders: [],
      transfers: [],
      opname: undefined,
      corrections: seedCorrections(dataset),
      extra: [],
    };
    const listed = productsWithMovement(dataset.products, real, 8);
    expect(listed.length).toBeGreaterThan(0);
    for (const item of listed) {
      for (const warehouse of ['semua', 'display', 'besar'] as const) {
        const card = buildStockCard(item, movementsFor(item, real), {
          start: '2026-10-01',
          end: '2026-10-19',
          warehouse,
        });
        expect(card.closing).toBeCloseTo(card.current, 6);
      }
    }
  });
});

describe('periode laporan', () => {
  it('memeriksa urutan tanggal, batas hari ini, dan rentang maksimal 366 hari', () => {
    expect(validateRange('2026-10-10', '2026-10-05', '2026-10-19')).toBe('order');
    expect(validateRange('2026-10-01', '2026-10-20', '2026-10-19')).toBe('future');
    expect(validateRange('2025-01-01', '2026-10-19', '2026-10-19')).toBe('long');
    expect(validateRange('2025-10-18', '2026-10-19', '2026-10-19')).toBe('long');
    expect(validateRange('2025-10-19', '2026-10-19', '2026-10-19')).toBeUndefined();
    expect(validateRange('2026-10-19', '2026-10-19', '2026-10-19')).toBeUndefined();
    expect(monthStart('2026-10-19')).toBe('2026-10-01');
    expect(addDays('2026-10-19', -29)).toBe('2026-09-20');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
