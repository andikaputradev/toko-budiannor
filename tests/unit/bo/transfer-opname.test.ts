import { describe, expect, it } from 'vitest';
import { sampleProduct } from './support';
import type { Product } from '../../../src/shared/data/types';
import {
  difference,
  filledCount,
  formatOrderNumber,
  isComplete,
  nextSequence,
  parsePhysical,
  seedOpnameOrders,
  validateResult,
  type OpnameOrder,
} from '../../../src/apps/bo/domain/opname';
import { parseQuantity, validateTransfer } from '../../../src/apps/bo/domain/transfer';

const semen = sampleProduct();
const stocked: Product = { ...semen, stock: { display: 10, besar: 80 } };
const lookup = (id: string): Product | undefined => (id === stocked.id ? stocked : undefined);

describe('validasi mutasi', () => {
  it('menolak gudang sama dan daftar kosong', () => {
    expect(validateTransfer('besar', 'besar', [], lookup)).toMatchObject({ messageId: 'MSG-071' });
    expect(validateTransfer('besar', 'display', [], lookup)).toMatchObject({
      messageId: 'MSG-073',
    });
  });

  it('menolak jumlah nol atau tidak valid dan melebihi stok asal dengan teks satuan', () => {
    const line = (quantity: string) => [{ productId: stocked.id, unit: 'Sak', quantity }];
    expect(validateTransfer('besar', 'display', line('0'), lookup)).toMatchObject({
      line: 0,
      messageId: 'MSG-029',
    });
    expect(validateTransfer('besar', 'display', line('abc'), lookup)).toMatchObject({
      messageId: 'MSG-029',
    });
    expect(validateTransfer('besar', 'display', line('3'), lookup)).toMatchObject({
      messageId: 'MSG-072',
      values: { stok: '2,0 Sak' },
    });
    expect(validateTransfer('besar', 'display', line('2'), lookup)).toBeUndefined();
  });

  it('menjumlahkan beberapa baris barang yang sama terhadap stok asal', () => {
    const lines = [
      { productId: stocked.id, unit: 'Sak', quantity: '1,5' },
      { productId: stocked.id, unit: 'Kg', quantity: '30' },
    ];
    expect(validateTransfer('besar', 'display', lines, lookup)).toMatchObject({
      messageId: 'MSG-072',
    });
    expect(parseQuantity('1,5')).toBe(1.5);
  });
});

describe('opname', () => {
  function doc(
    lines: OpnameOrder['lines'],
    status: OpnameOrder['status'] = 'perhitungan',
  ): OpnameOrder {
    return {
      pso: 'PSO-0001',
      hso: status === 'menunggu' ? undefined : 'HSO-0001',
      warehouse: 'display',
      date: '2026-10-19',
      resultDate: undefined,
      officerId: 'U-1',
      note: '',
      status,
      lines,
      appliedBy: undefined,
      journalValue: 0,
    };
  }
  const line = (physical: string) => ({
    productId: 'P-0001',
    physical,
    systemSnapshot: undefined,
  });

  it('menghitung selisih fisik dikurangi sistem dengan tanda negatif untuk kurang', () => {
    expect(difference(3, 2)).toBe(-1);
    expect(difference(2.5, 3)).toBe(0.5);
    expect(difference(0.1 + 0.2, 0.3)).toBe(0);
    expect(parsePhysical('2,0')).toBe(2);
    expect(parsePhysical('x')).toBeUndefined();
  });

  it('memeriksa hasil: kosong hanya ditolak saat penyelesaian, negatif selalu, selesai tak berubah', () => {
    expect(validateResult(doc([line('')]), false)).toBeUndefined();
    expect(validateResult(doc([line('')]), true)).toMatchObject({
      messageId: 'MSG-074',
      productId: 'P-0001',
    });
    expect(validateResult(doc([line('-1')]), false)).toMatchObject({ messageId: 'MSG-075' });
    expect(validateResult(doc([line('x')]), false)).toMatchObject({ messageId: 'MSG-075' });
    expect(validateResult(doc([line('2')]), true)).toBeUndefined();
    expect(validateResult(doc([line('2')], 'selesai'), false)).toMatchObject({
      messageId: 'MSG-077',
    });
  });

  it('menghitung baris terisi dan kelengkapan hasil', () => {
    expect(filledCount(doc([line('1'), line(''), line(' ')]))).toBe(1);
    expect(isComplete(doc([line('1'), line('2')]))).toBe(true);
    expect(isComplete(doc([line('1'), line('')]))).toBe(false);
    expect(isComplete(doc([]))).toBe(false);
  });

  it('menomori PSO dan HSO secara terpisah', () => {
    expect(formatOrderNumber('PSO', 7)).toBe('PSO-0007');
    const orders = [doc([line('1')]), { ...doc([line('1')], 'menunggu'), pso: 'PSO-0002' }];
    expect(nextSequence(orders, 'PSO')).toBe(3);
    expect(nextSequence(orders, 'HSO')).toBe(2);
    expect(nextSequence([], 'HSO')).toBe(1);
  });

  it('memuat empat perintah contoh dengan tiga status berbeda', () => {
    const products = Array.from({ length: 20 }, (_, index) => ({
      ...stocked,
      id: `P-${String(index + 1).padStart(4, '0')}`,
    }));
    const orders = seedOpnameOrders(products, [
      { id: 'U-1', role: 'owner' },
      { id: 'U-2', role: 'supervisor' },
      { id: 'U-3', role: 'kasir' },
      { id: 'U-4', role: 'kasir' },
    ]);
    expect(orders.map((order) => order.status)).toEqual([
      'selesai',
      'selesai',
      'perhitungan',
      'menunggu',
    ]);
    expect(orders.map((order) => order.hso)).toEqual([
      'HSO-0001',
      'HSO-0002',
      'HSO-0003',
      undefined,
    ]);
    expect(orders[2]?.lines.filter((item) => item.physical !== '')).toHaveLength(2);
    expect(orders[3]?.lines).toHaveLength(4);
    expect(orders[0]?.officerId).toBe('U-1');
  });
});
