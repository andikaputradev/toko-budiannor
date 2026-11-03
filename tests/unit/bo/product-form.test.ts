import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  buildProduct,
  draftOf,
  emptyDraft,
  MAX_PHOTO_BYTES,
  nextProductId,
  parseMin,
  splitMin,
  validateProduct,
} from '../../../src/apps/bo/domain/product-form';

const products = generateDataset().products;
const base = { ...emptyDraft(), code: 'B9001', name: 'Barang Uji', baseUnit: 'Pcs' };

describe('formulir barang', () => {
  it('memeriksa kode, nama, satuan dasar, stok minimum, dan foto sesuai urutan Lampiran C', () => {
    expect(validateProduct({ ...base, code: ' ' }, products, undefined)).toEqual({
      field: 'code',
      messageId: 'MSG-058',
    });
    expect(validateProduct({ ...base, code: 'B0001' }, products, undefined)).toEqual({
      field: 'code',
      messageId: 'MSG-059',
    });
    expect(validateProduct({ ...base, name: ' ' }, products, undefined)).toEqual({
      field: 'name',
      messageId: 'MSG-060',
    });
    expect(validateProduct({ ...base, baseUnit: '' }, products, undefined)).toEqual({
      field: 'baseUnit',
      messageId: 'MSG-061',
    });
    expect(validateProduct({ ...base, minDisplay: '-1' }, products, undefined)).toEqual({
      field: 'minStock',
      messageId: 'MSG-062',
    });
    expect(
      validateProduct({ ...base, photoBytes: MAX_PHOTO_BYTES + 1 }, products, undefined),
    ).toEqual({ field: 'photo', messageId: 'MSG-063' });
    expect(validateProduct(base, products, undefined)).toBeUndefined();
  });

  it('membatasi panjang kode 3 sampai 20 dan mengizinkan kode milik barang yang sedang diubah', () => {
    expect(validateProduct({ ...base, code: 'AB' }, products, undefined)?.field).toBe('codeLength');
    expect(validateProduct({ ...base, code: 'A'.repeat(21) }, products, undefined)?.field).toBe(
      'codeLength',
    );
    const first = products[0];
    expect(validateProduct({ ...base, code: 'b0001' }, products, first?.id)).toBeUndefined();
    expect(validateProduct({ ...base, code: 'b0001' }, products, 'P-0002')?.messageId).toBe(
      'MSG-059',
    );
  });

  it('mengurai stok minimum desimal berkoma dan menolak yang tidak valid', () => {
    expect(parseMin('')).toBe(0);
    expect(parseMin('2,5')).toBe(2.5);
    expect(parseMin('abc')).toBeUndefined();
    expect(parseMin('1,2345')).toBeUndefined();
  });

  it('membangun barang baru dengan satuan dasar, harga nol, dan minimum total', () => {
    const product = buildProduct(
      { ...base, minDisplay: '3', minBesar: '7,5', defaultUnit: '' },
      undefined,
      nextProductId(3600),
    );
    expect(product.id).toBe('P-3601');
    expect(product.units).toEqual([{ code: 'Pcs', name: 'Pcs', factor: 1 }]);
    expect(product.prices['Pcs']).toEqual({ eceran: 0, grosir: 0, kontraktor: 0 });
    expect(product.minStock).toBe(10.5);
    expect(product.minByWarehouse).toEqual({ display: 3, besar: 7.5 });
    expect(product.stock).toEqual({ display: 0, besar: 0 });
  });

  it('mempertahankan satuan, harga, HPP, dan stok saat barang diubah', () => {
    const first = products[0];
    if (first === undefined) {
      throw new Error('data kosong');
    }
    const draft = { ...draftOf(first), name: 'Nama Baru' };
    const product = buildProduct(draft, first, first.id);
    expect(product.name).toBe('Nama Baru');
    expect(product.units).toEqual(first.units);
    expect(product.prices).toEqual(first.prices);
    expect(product.hpp).toBe(first.hpp);
    expect(product.stock).toEqual(first.stock);
  });

  it('membagi stok minimum per gudang bila belum diatur', () => {
    const first = products[0];
    if (first === undefined) {
      throw new Error('data kosong');
    }
    const split = splitMin(first);
    expect(split.display + split.besar).toBeCloseTo(first.minStock, 3);
    expect(splitMin({ ...first, minByWarehouse: { display: 1, besar: 2 } })).toEqual({
      display: 1,
      besar: 2,
    });
  });
});
