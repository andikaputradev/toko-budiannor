import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
import { need } from '../owner/support';
import {
  barcodeMatches,
  browseProducts,
  costView,
  distinct,
  EMPTY_FILTER,
  priceRows,
  shortDate,
  stockFlag,
  unitCaption,
} from '../../../src/shared/domain/stock-browse';

const data = generateDataset();
const products = data.products;
const first = need(products[0]);

const exact = (all: readonly Product[], text: string): Product[] =>
  all.filter((product) => product.name.toLowerCase().includes(text.toLowerCase()));

const withStock = (patch: Partial<Product>): Product => ({ ...first, ...patch });

describe('warna stok', () => {
  it('hijau bila tersedia, merah bila nol atau negatif', () => {
    expect(stockFlag(withStock({ stock: { display: 5, besar: 0 } }), 'display')).toBe('ada');
    expect(stockFlag(withStock({ stock: { display: 5, besar: 0 } }), 'besar')).toBe('habis');
    expect(stockFlag(withStock({ stock: { display: -3, besar: 0 } }), 'display')).toBe('habis');
  });
});

describe('pilihan filter', () => {
  it('Kategori dan Merk unik, tidak kosong, dan urut abjad', () => {
    const categories = distinct(products, (item) => item.category);
    expect(categories.length).toBeGreaterThan(1);
    expect(new Set(categories).size).toBe(categories.length);
    expect([...categories].sort((a, b) => a.localeCompare(b, 'id'))).toEqual(categories);
    expect(categories.every((value) => value !== '')).toBe(true);
  });

  it('barang nonaktif tidak ikut menjadi pilihan', () => {
    const only = [withStock({ category: 'KATEGORI-NONAKTIF', active: false })];
    expect(distinct(only, (item) => item.category)).toEqual([]);
  });
});

describe('daftar stok dengan filter', () => {
  it('tanpa filter menampilkan semua barang aktif', () => {
    const rows = browseProducts(products, EMPTY_FILTER, (all) => [...all]);
    expect(rows.length).toBe(products.filter((item) => item.active !== false).length);
  });

  it('filter Kategori dan Merk menyaring persis', () => {
    const category = first.category;
    const byCategory = browseProducts(products, { ...EMPTY_FILTER, category }, (all) => [...all]);
    expect(byCategory.length).toBeGreaterThan(0);
    expect(byCategory.every((item) => item.category === category)).toBe(true);
    const brand = first.brand;
    const both = browseProducts(products, { ...EMPTY_FILTER, category, brand }, (all) => [...all]);
    expect(both.every((item) => item.category === category && item.brand === brand)).toBe(true);
  });

  it('filter Gudang hanya memuat barang yang stoknya ada di gudang itu', () => {
    const rows = browseProducts(products, { ...EMPTY_FILTER, warehouse: 'display' }, (all) => [
      ...all,
    ]);
    expect(rows.every((item) => item.stock.display > 0)).toBe(true);
    const gudang = browseProducts(products, { ...EMPTY_FILTER, warehouse: 'besar' }, (all) => [
      ...all,
    ]);
    expect(gudang.every((item) => item.stock.besar > 0)).toBe(true);
  });

  it('di bawah minimum dibatasi barang yang stoknya kurang dari minimum', () => {
    const rows = browseProducts(products, { ...EMPTY_FILTER, belowMinimum: true }, (all) => [
      ...all,
    ]);
    expect(
      rows.every(
        (item) =>
          item.stock.display + item.stock.besar < item.minStock ||
          item.stock.display + item.stock.besar < 0,
      ),
    ).toBe(true);
  });

  it('hasil pindai (barcode persis) menang atas pencarian teks', () => {
    const target = need(products[7]);
    const rows = browseProducts(products, { ...EMPTY_FILTER, text: target.barcode }, exact);
    expect(rows.map((item) => item.id)).toContain(target.id);
    expect(barcodeMatches(products, ` ${target.barcode} `).map((item) => item.id)).toContain(
      target.id,
    );
  });

  it('teks pendek bukan barcode', () => {
    expect(barcodeMatches(products, '12')).toEqual([]);
  });
});

describe('harga beli dan Hpp Avg (Owner)', () => {
  it('menulis tanggal beli terakhir sebagai dd/mm/yy', () => {
    expect(shortDate('2026-09-12')).toBe('12/09/26');
    expect(shortDate(undefined)).toBe('-');
    expect(shortDate('')).toBe('-');
  });

  it('memakai hppAvg bila ada, selain itu HPP', () => {
    expect(costView(withStock({ hppAvg: 84_333.4, hpp: 1 })).average).toBe(84_333);
    expect(costView(withStock({ hppAvg: undefined, hpp: 7_885 })).average).toBe(7_885);
    expect(
      costView(withStock({ lastPurchasePrice: 87_500, lastPurchaseDate: '2026-07-12' })),
    ).toMatchObject({ lastPrice: 87_500, lastDate: '12/07/26' });
  });
});

describe('tabel harga kartu', () => {
  it('judul satuan: satuan dasar polos, satuan lain memuat isinya', () => {
    expect(unitCaption({ code: 'GLN', name: 'Galon', factor: 1 })).toBe('GLN');
    expect(unitCaption({ code: 'DOS', name: 'Dus', factor: 4 })).toBe('DOS (4)');
  });

  it('selalu minimal tiga baris, kekurangannya baris kosong', () => {
    const single = withStock({
      units: [{ code: 'SAK', name: 'Sak', factor: 1 }],
      prices: { SAK: { eceran: 70_000, grosir: 68_000 } },
    });
    const rows = priceRows(single);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.prices).toEqual({ eceran: 70_000, grosir: 68_000 });
    expect(rows[1]?.prices).toBeUndefined();
    expect(rows[2]?.unit).toBe('');
  });

  it('barang berisi banyak satuan menampilkan semuanya', () => {
    const many = products.find((item) => item.units.length > 3);
    if (many !== undefined) {
      expect(priceRows(many)).toHaveLength(many.units.length);
    }
  });
});
