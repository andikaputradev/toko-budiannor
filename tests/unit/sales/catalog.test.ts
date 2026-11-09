import { describe, expect, it } from 'vitest';
import {
  filterCatalog,
  stockText,
  stockTone,
  tierPrices,
  unitNote,
} from '../../../src/apps/sales/domain/catalog';
import { fixtureProduct } from './support';

const plenty = fixtureProduct();
const emptyShelf = fixtureProduct({ id: 'P-2', stock: { display: 0, besar: 500 }, minStock: 100 });
const lowStore = fixtureProduct({
  id: 'P-3',
  stock: { display: 10, besar: 900 },
  minStock: 500,
  minByWarehouse: { display: 200, besar: 300 },
});
const inactive = fixtureProduct({ id: 'P-4', active: false });
const all = [plenty, emptyShelf, lowStore, inactive];

const ids = (products: readonly { readonly id: string }[]): string[] =>
  products.map((item) => item.id);

describe('filter katalog Sales', () => {
  it('semua gudang menampilkan barang aktif saja', () => {
    expect(ids(filterCatalog(all, { warehouse: 'semua', below: false }))).toEqual([
      'P-UJI',
      'P-2',
      'P-3',
    ]);
  });

  it('gudang tertentu hanya menampilkan barang yang stoknya ada di gudang itu', () => {
    expect(ids(filterCatalog(all, { warehouse: 'display', below: false }))).toEqual([
      'P-UJI',
      'P-3',
    ]);
    expect(ids(filterCatalog(all, { warehouse: 'besar', below: false }))).toEqual([
      'P-UJI',
      'P-2',
      'P-3',
    ]);
  });

  it('di bawah minimum menilai stok gudang yang dipilih', () => {
    expect(ids(filterCatalog(all, { warehouse: 'display', below: true }))).toEqual(['P-2', 'P-3']);
    expect(filterCatalog(all, { warehouse: 'besar', below: true })).toEqual([]);
    expect(filterCatalog(all, { warehouse: 'semua', below: true })).toEqual([]);
  });
});

describe('stok dan harga pada kartu katalog', () => {
  it('memecah stok ke satuan jual terbesar dan menampilkan nol bila kosong', () => {
    expect(stockText(plenty, 'display')).toBe('62 Sak 16,67 Kg');
    expect(stockText(plenty, 'besar')).toBe('319 Sak 27,3 Kg');
    expect(stockText(emptyShelf, 'display')).toBe('0 Kg');
  });

  it('memberi nada hijau, kuning, atau merah menurut stok gudang', () => {
    expect(stockTone(plenty, 'display')).toBe('sukses');
    expect(stockTone(emptyShelf, 'display')).toBe('bahaya');
    expect(stockTone(lowStore, 'display')).toBe('peringatan');
    expect(stockTone(lowStore, 'besar')).toBe('sukses');
  });

  it('menyusun harga ketiga tier untuk satuan terpilih dan menandai tier aktif', () => {
    expect(tierPrices(plenty, 'Sak', 'grosir')).toEqual([
      { tier: 'eceran', price: 54900, active: false },
      { tier: 'grosir', price: 51000, active: true },
      { tier: 'kontraktor', price: 48300, active: false },
    ]);
    expect(tierPrices(plenty, 'Kg', 'kontraktor').find((row) => row.active)?.price).toBe(1200);
  });

  it('menjelaskan isi satuan terhadap satuan dasar', () => {
    expect(unitNote(plenty, 'Sak')).toEqual({ factor: 40, base: 'Kg' });
    expect(unitNote(plenty, 'Kg')).toBeUndefined();
  });
});
