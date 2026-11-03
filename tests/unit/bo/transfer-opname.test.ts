import { describe, expect, it } from 'vitest';
import { sampleProduct } from './support';
import type { Product } from '../../../src/shared/data/types';
import {
  difference,
  filledCount,
  parsePhysical,
  validateDoc,
  type OpnameDoc,
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
  function doc(lines: OpnameDoc['lines'], status: OpnameDoc['status'] = 'draf'): OpnameDoc {
    return {
      number: 'OP-0001',
      warehouse: 'display',
      date: '2026-10-19',
      status,
      lines,
      appliedBy: undefined,
      journalValue: 0,
    };
  }
  const line = (physical: string) => ({
    productId: 'P-0001',
    physical,
    note: '',
    systemSnapshot: undefined,
  });

  it('menghitung selisih fisik dikurangi sistem dengan tanda negatif untuk kurang', () => {
    expect(difference(3, 2)).toBe(-1);
    expect(difference(2.5, 3)).toBe(0.5);
    expect(difference(0.1 + 0.2, 0.3)).toBe(0);
    expect(parsePhysical('2,0')).toBe(2);
    expect(parsePhysical('x')).toBeUndefined();
  });

  it('memeriksa stok fisik kosong dan negatif serta dokumen yang sudah diterapkan', () => {
    expect(validateDoc(doc([line('')]))).toMatchObject({
      messageId: 'MSG-074',
      productId: 'P-0001',
    });
    expect(validateDoc(doc([line('-1')]))).toMatchObject({ messageId: 'MSG-075' });
    expect(validateDoc(doc([line('2')]))).toBeUndefined();
    expect(validateDoc(doc([line('2')], 'diterapkan'))).toMatchObject({ messageId: 'MSG-077' });
  });

  it('menghitung baris terisi', () => {
    expect(filledCount(doc([line('1'), line(''), line(' ')]))).toBe(1);
  });
});
