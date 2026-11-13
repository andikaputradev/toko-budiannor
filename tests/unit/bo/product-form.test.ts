import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
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

describe('formulir barang: satuan bertahap, komisi, promo, dan biaya', () => {
  const row = (code: string, factor = '') => ({ code, factor });

  function firstProduct() {
    const first = products[0];
    if (first === undefined) {
      throw new Error('data kosong');
    }
    return first;
  }

  it('menyimpan tiga baris satuan menjadi tiga satuan dan tiga harga turunan', () => {
    const product = buildProduct(
      {
        ...base,
        unitRows: [row('Pcs'), row('LSN', '12'), row('DOS', '60')],
        hargaEcer1: '1000',
        hargaGrosir1: '900',
      },
      undefined,
      'P-9001',
    );
    expect(product.units.map((unit) => [unit.code, unit.factor])).toEqual([
      ['Pcs', 1],
      ['LSN', 12],
      ['DOS', 60],
    ]);
    expect(product.prices['Pcs']).toEqual({ eceran: 1000, grosir: 900, kontraktor: 855 });
    expect(product.prices['LSN']).toEqual({ eceran: 12_000, grosir: 10_800, kontraktor: 10_260 });
    expect(product.prices['DOS']?.eceran).toBe(60_000);
  });

  it('mengubah satuan pada barang lama mempertahankan harga dasar dan menurunkan harga satuan baru', () => {
    const first = firstProduct();
    const basePrice = first.prices[first.baseUnit];
    if (basePrice === undefined) {
      throw new Error('barang tanpa harga satuan dasar');
    }
    const product = buildProduct(
      { ...draftOf(first), unitRows: [row(first.baseUnit), row('UJI', '10')] },
      first,
      first.id,
    );
    expect(product.units).toHaveLength(2);
    expect(product.prices[first.baseUnit]).toEqual(basePrice);
    expect(product.prices['UJI']?.eceran).toBe(Math.round(basePrice.eceran * 10));
    expect(product.prices['UJI']?.grosir).toBe(Math.round(basePrice.grosir * 10));
  });

  it('menandai satuan ganda dan konversi tidak valid pada baris yang salah', () => {
    expect(
      validateProduct({ ...base, unitRows: [row('Pcs'), row('pcs', '12')] }, products, undefined),
    ).toEqual({
      field: 'units',
      messageId: undefined,
      labelKey: 'produkErrSatuanGanda',
      row: 1,
    });
    expect(
      validateProduct({ ...base, unitRows: [row('Pcs'), row('LSN', '0')] }, products, undefined),
    ).toEqual({ field: 'units', messageId: undefined, labelKey: 'produkErrKonversi', row: 1 });
  });

  it('menolak komisi dan promo di luar 0 sampai 100 persen', () => {
    expect(validateProduct({ ...base, promoPersen: '101' }, products, undefined)).toEqual({
      field: 'promo',
      messageId: undefined,
      labelKey: 'produkErrPromo',
    });
    expect(validateProduct({ ...base, komisiSalesPersen: 'abc' }, products, undefined)).toEqual({
      field: 'commission',
      messageId: undefined,
      labelKey: 'produkErrKomisi',
    });
    expect(
      validateProduct(
        { ...base, komisiSalesPersen: '2,5', promoPersen: '20%' },
        products,
        undefined,
      ),
    ).toBeUndefined();
  });

  it('komisi kosong menghapus komisi barang, terisi tersimpan sebagai persen', () => {
    const withOwn = products.find((item) => (item.salesCommission?.percent ?? 0) > 0);
    if (withOwn === undefined) {
      throw new Error('tidak ada barang berkomisi');
    }
    const cleared = buildProduct(
      { ...draftOf(withOwn), komisiSalesPersen: '' },
      withOwn,
      withOwn.id,
    );
    expect(cleared.salesCommission).toBeUndefined();
    const filled = buildProduct(
      { ...draftOf(withOwn), komisiSalesPersen: '2,5' },
      withOwn,
      withOwn.id,
    );
    expect(filled.salesCommission).toEqual({ percent: 2.5, nominal: 0 });
  });

  it('promo kosong atau nol menghapus promo, terisi tersimpan sebagai persen', () => {
    const first = firstProduct();
    expect(
      buildProduct({ ...draftOf(first), promoPersen: '' }, first, first.id).promo,
    ).toBeUndefined();
    expect(
      buildProduct({ ...draftOf(first), promoPersen: '0' }, first, first.id).promo,
    ).toBeUndefined();
    expect(buildProduct({ ...draftOf(first), promoPersen: '20' }, first, first.id).promo).toEqual({
      percent: 20,
      nominal: 0,
    });
  });

  it('tanpa hak ubah biaya, harga beli akhir dan HPP rata-rata tidak berubah', () => {
    const first = firstProduct();
    const product = buildProduct(
      { ...draftOf(first), hargaBeliAkhir: '1', hppAvg: '1' },
      first,
      first.id,
      false,
    );
    expect(product.lastPurchasePrice).toBe(first.lastPurchasePrice);
    expect(product.hppAvg).toBe(first.hppAvg);
    const owner = buildProduct({ ...draftOf(first), hargaBeliAkhir: '1' }, first, first.id, true);
    expect(owner.lastPurchasePrice).toBe(1);
  });

  it('draftOf memuat baris satuan serta komisi dan promo dalam persen berkoma', () => {
    const first = firstProduct();
    const draft = draftOf({
      ...first,
      promo: { percent: 12.5, nominal: 0 },
      salesCommission: undefined,
    });
    expect(draft.unitRows?.[0]?.code).toBe(first.baseUnit);
    expect(draft.promoPersen).toBe('12,5');
    expect(draft.komisiSalesPersen).toBe('');
  });
});

describe('menyimpan barang tidak menjatuhkan penanda dan foto bawaan', () => {
  it('mempertahankan pinned (barang proposal) dan photoUrl saat barang diubah', () => {
    const first = products[0];
    if (first === undefined) {
      throw new Error('data kosong');
    }
    const proposal: Product = { ...first, pinned: true, photoUrl: 'produk/uji.webp' };
    const saved = buildProduct({ ...draftOf(proposal), name: 'Nama Baru' }, proposal, proposal.id);
    expect(saved.pinned).toBe(true);
    expect(saved.photoUrl).toBe('produk/uji.webp');
  });

  it('barang baru tidak punya penanda proposal maupun photoUrl', () => {
    const created = buildProduct({ ...base }, undefined, 'P-9100');
    expect(created.pinned).toBeUndefined();
    expect(created.photoUrl).toBeUndefined();
  });
});

describe('satuan dasar barang yang sudah ada', () => {
  const first = products[0];
  if (first === undefined) {
    throw new Error('data kosong');
  }
  const row = (code: string, factor = '') => ({ code, factor });

  it('menolak penggantian satuan dasar dan tetap menerima satuan dasar yang sama', () => {
    const draft = draftOf(first);
    expect(validateProduct(draft, products, first.id, first)).toBeUndefined();
    const swapped = { ...draft, unitRows: [row('UJI'), row(first.baseUnit, '10')] };
    expect(validateProduct(swapped, products, first.id, first)).toEqual({
      field: 'baseUnit',
      messageId: undefined,
      labelKey: 'produkErrSatuanDasarTetap',
    });
  });

  it('barang baru bebas memilih satuan dasar', () => {
    const draft = { ...base, unitRows: [row('Kg')] };
    expect(validateProduct(draft, products, undefined, undefined)).toBeUndefined();
  });
});
