import { describe, expect, it } from 'vitest';
import { buildOrderCopy } from '../../../src/apps/sales/domain/copy';
import {
  approvalLook,
  orderLineRows,
  orderOwed,
  syncState,
} from '../../../src/apps/sales/domain/history';
import type { SalesOrder } from '../../../src/shared/data/types';
import { fixtureProduct } from './support';

const product = fixtureProduct();
const lookup = (id: string) => (id === product.id ? product : undefined);

const order = (extra: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'SO-0001',
  number: 'SO-0001',
  createdAt: '2026-10-19T03:00:00.000Z',
  createdBy: 'U-6',
  customerId: undefined,
  lines: [
    { productId: product.id, unit: 'Sak', quantity: 2, unitPrice: 50000, listPrice: 54900 },
    { productId: product.id, unit: 'Kg', quantity: 1.5, unitPrice: 1400 },
  ],
  total: 102100,
  payment: 'tunai',
  downPayment: 0,
  status: 'draf',
  source: 'sales',
  synced: true,
  ...extra,
});

describe('riwayat SO Sales', () => {
  it('memetakan status persetujuan ke nada, ikon, dan teks', () => {
    expect(approvalLook('tidak')).toEqual({
      tone: 'netral',
      icon: 'file-text',
      labelKey: 'statusDraf',
    });
    expect(approvalLook('menunggu').tone).toBe('peringatan');
    expect(approvalLook('disetujui').tone).toBe('sukses');
    expect(approvalLook('ditolak')).toMatchObject({ tone: 'bahaya', labelKey: 'statusSoDitolak' });
  });

  it('menandai SO yang belum terkirim sebagai menunggu sinkron', () => {
    expect(syncState(order())).toBe('tersinkron');
    expect(syncState(order({ synced: false }))).toBe('menunggu');
    expect(syncState(order({ synced: undefined }))).toBe('tersinkron');
  });

  it('menyusun baris rincian dengan subtotal dan harga tier asli', () => {
    const rows = orderLineRows(order(), lookup);
    expect(rows).toEqual([
      {
        name: 'Semen Uji',
        code: 'U0001',
        quantity: 2,
        unit: 'Sak',
        price: 50000,
        listPrice: 54900,
        subtotal: 100000,
      },
      {
        name: 'Semen Uji',
        code: 'U0001',
        quantity: 1.5,
        unit: 'Kg',
        price: 1400,
        listPrice: undefined,
        subtotal: 2100,
      },
    ]);
  });

  it('menghitung sisa tagihan menurut cara bayar', () => {
    expect(orderOwed(order())).toBe(0);
    expect(orderOwed(order({ payment: 'piutang' }))).toBe(102100);
    expect(orderOwed(order({ payment: 'dp', downPayment: 40000 }))).toBe(62100);
    expect(orderOwed(order({ payment: 'dp', downPayment: 900000 }))).toBe(0);
  });

  it('menampilkan harga tier asli pada salinan PDF hanya untuk baris yang harganya diubah', () => {
    const lines = buildOrderCopy(order(), {
      salesName: 'Budi Lapangan',
      customerName: 'Umum',
      product: lookup,
      statusText: 'Draf',
    });
    const changed = lines.find((line) => line.startsWith('Semen Uji\n  2 Sak'));
    expect(changed).toContain('Harga asli Rp 54.900');
    const plain = lines.find((line) => line.startsWith('Semen Uji\n  1,5 Kg'));
    expect(plain).toBeDefined();
    expect(plain).not.toContain('Harga asli');
  });
});
