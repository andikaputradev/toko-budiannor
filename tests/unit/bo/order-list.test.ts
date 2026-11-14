import { describe, expect, it } from 'vitest';
import {
  buildPurchaseOrderRows,
  buildSalesOrderRows,
  filterOrderRows,
  nextOrderNumber,
  orderCreatedAt,
  validateOrderDraft,
  type OrderRow,
} from '../../../src/apps/bo/domain/order-list';
import { generateDataset } from '../../../src/shared/data/generator';
import type { PurchaseOrder, SalesOrder } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { need } from './support';

function fixture() {
  const dataset = generateDataset();
  const supplier = need(dataset.suppliers[0]);
  const customer = need(dataset.customers[0]);
  const product = need(dataset.products[0]);
  const user = need(dataset.users[0]);
  const store = createStore({ dataset });
  const po = (
    number: string,
    createdAt: string,
    status: PurchaseOrder['status'],
  ): PurchaseOrder => ({
    id: `id-${number}`,
    number,
    createdAt,
    createdBy: user.id,
    supplierId: supplier.id,
    warehouse: 'besar',
    lines: [{ productId: product.id, unit: product.baseUnit, quantity: 2, unitPrice: 1000 }],
    total: 2000,
    status,
    notes: `catatan ${number}`,
  });
  const so = (number: string, createdAt: string, customerId: string | undefined): SalesOrder => ({
    id: `id-${number}`,
    number,
    createdAt,
    createdBy: user.id,
    customerId,
    lines: [{ productId: product.id, unit: product.baseUnit, quantity: 1, unitPrice: 5000 }],
    total: 5000,
    payment: 'piutang',
    downPayment: 0,
    status: 'draf',
    source: 'owner',
  });
  return { dataset, supplier, customer, user, store, po, so };
}

describe('buildPurchaseOrderRows', () => {
  it('memetakan status PO ke On Proses, Partial, dan Selesai, terbaru dahulu', () => {
    const { store, po, supplier, user } = fixture();
    store.addPurchaseOrder(po('PO-1', '2026-10-01T03:00:00.000Z', 'draf'));
    store.addPurchaseOrder(po('PO-2', '2026-10-02T03:00:00.000Z', 'dipesan'));
    store.addPurchaseOrder(po('PO-3', '2026-10-03T03:00:00.000Z', 'diterima-sebagian'));
    store.addPurchaseOrder(po('PO-4', '2026-10-04T03:00:00.000Z', 'diterima'));
    const rows = buildPurchaseOrderRows(store.getState());
    expect(rows.map((row) => [row.number, row.status])).toEqual([
      ['PO-4', 'selesai'],
      ['PO-3', 'partial'],
      ['PO-2', 'on-proses'],
      ['PO-1', 'on-proses'],
    ]);
    expect(rows[0]).toMatchObject({
      kind: 'po',
      date: '2026-10-04',
      partyName: supplier.name,
      notes: 'catatan PO-4',
      total: 2000,
      createdBy: user.name,
    });
  });

  it('tanpa PO menghasilkan daftar kosong', () => {
    const { store } = fixture();
    expect(buildPurchaseOrderRows(store.getState())).toEqual([]);
  });
});

describe('buildSalesOrderRows', () => {
  it('SO yang sudah diimpor ke faktur Selesai, selain itu On Proses', () => {
    const { store, so, customer } = fixture();
    store.addSalesOrder(so('SO-1', '2026-10-01T03:00:00.000Z', customer.id));
    store.addSalesOrder(so('SO-2', '2026-10-02T03:00:00.000Z', undefined));
    const rows = buildSalesOrderRows(store.getState(), new Set(['SO-1']));
    expect(rows.map((row) => [row.number, row.status])).toEqual([
      ['SO-2', 'on-proses'],
      ['SO-1', 'selesai'],
    ]);
    expect(rows[0]?.partyName).toBe('Umum');
    expect(rows[1]).toMatchObject({ kind: 'so', partyName: customer.name });
  });
});

describe('filterOrderRows', () => {
  const row = (over: Partial<OrderRow>): OrderRow => ({
    kind: 'po',
    number: 'PO-1',
    date: '2026-10-19',
    partyName: 'PT Aica Indira',
    notes: '',
    status: 'on-proses',
    total: 100,
    createdBy: 'Haris',
    ...over,
  });
  const rows = [
    row({ number: 'PO-1', date: '2026-10-19', status: 'on-proses' }),
    row({ number: 'PO-2', date: '2026-10-05', status: 'partial', partyName: 'PT ABC' }),
    row({ number: 'PO-3', date: '2026-09-01', status: 'selesai', notes: 'Urgen Developer' }),
  ];
  const base = { status: 'semua', text: '' } as const;

  it('menyaring menurut status, pihak, rentang tanggal, dan teks', () => {
    expect(filterOrderRows(rows, { ...base, status: 'partial' }).map((r) => r.number)).toEqual([
      'PO-2',
    ]);
    expect(filterOrderRows(rows, { ...base, party: 'PT ABC' }).map((r) => r.number)).toEqual([
      'PO-2',
    ]);
    expect(
      filterOrderRows(rows, { ...base, start: '2026-10-01', end: '2026-10-19' }).map(
        (r) => r.number,
      ),
    ).toEqual(['PO-1', 'PO-2']);
    expect(filterOrderRows(rows, { ...base, text: 'urgen' }).map((r) => r.number)).toEqual([
      'PO-3',
    ]);
    expect(filterOrderRows(rows, { ...base, text: 'abc' }).map((r) => r.number)).toEqual(['PO-2']);
  });

  it('tanpa syarat mengembalikan semua baris; tanpa kecocokan daftar kosong', () => {
    expect(filterOrderRows(rows, base)).toHaveLength(3);
    expect(filterOrderRows(rows, { ...base, text: 'zzz' })).toEqual([]);
  });
});

describe('validateOrderDraft', () => {
  it('menolak tanpa pemasok atau pelanggan, lalu tanpa baris', () => {
    expect(validateOrderDraft({ partyId: undefined, lines: 2 })).toBe('party');
    expect(validateOrderDraft({ partyId: '', lines: 2 })).toBe('party');
    expect(validateOrderDraft({ partyId: 'S-1', lines: 0 })).toBe('lines');
    expect(validateOrderDraft({ partyId: 'S-1', lines: 1 })).toBe('ok');
  });
});

describe('nextOrderNumber', () => {
  it('memulai dari 1001 pada bulan berjalan dan menaikkan dari nomor terbesar', () => {
    expect(nextOrderNumber('po', [], '2026-10-19')).toBe('PO26101001');
    expect(nextOrderNumber('so', [], '2026-10-19')).toBe('SO26101001');
    expect(nextOrderNumber('po', ['PO26101001', 'PO26101007', 'PO26091099'], '2026-10-19')).toBe(
      'PO26101008',
    );
  });

  it('mengabaikan nomor berformat lain seperti SO-0001 dari aplikasi Owner dan Sales', () => {
    expect(nextOrderNumber('so', ['SO-0001', 'SO-0002'], '2026-10-19')).toBe('SO26101001');
  });
});

describe('orderCreatedAt', () => {
  const now = new Date('2026-10-19T03:30:00.000Z');

  it('tanggal hari ini memakai jam sekarang', () => {
    expect(orderCreatedAt('2026-10-19', now)).toBe('2026-10-19T03:30:00.000Z');
  });

  it('tanggal lain memakai tengah hari WIB pada tanggal itu', () => {
    expect(orderCreatedAt('2026-11-01', now)).toBe('2026-11-01T05:00:00.000Z');
    expect(orderCreatedAt('2026-10-01', now)).toBe('2026-10-01T05:00:00.000Z');
  });

  it('tanggal kosong atau tidak valid jatuh ke saat ini', () => {
    expect(orderCreatedAt('', now)).toBe('2026-10-19T03:30:00.000Z');
    expect(orderCreatedAt('bukan-tanggal', now)).toBe('2026-10-19T03:30:00.000Z');
  });
});
