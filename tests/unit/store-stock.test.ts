import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../src/shared/data/generator';
import { totalStock } from '../../src/shared/data/units';
import { createStore, parseSession } from '../../src/shared/store/store';

const dataset = generateDataset();

function pick(predicate: (display: number, besar: number) => boolean) {
  const product = dataset.products.find((item) => predicate(item.stock.display, item.stock.besar));
  if (product === undefined) {
    throw new Error('barang uji tidak ditemukan');
  }
  return product;
}

describe('perubahan stok pada store', () => {
  it('mengurangi gudang Display lebih dahulu lalu gudang Besar', () => {
    const store = createStore({ dataset });
    const product = pick((display, besar) => display >= 2 && besar >= 5);
    store.applyStockChange({ [product.id]: -(product.stock.display + 1) });
    const updated = store.getState().data.products.find((item) => item.id === product.id);
    expect(updated?.stock.display).toBe(0);
    expect(updated?.stock.besar).toBeCloseTo(product.stock.besar - 1, 3);
    expect(store.getState().negativeReview).toEqual([]);
  });

  it('menandai Ditinjau (negatif) hanya saat total kurang dari 0 dan melaporkan barangnya', () => {
    const store = createStore({ dataset });
    const product = pick((display, besar) => display > 0 && besar > 0);
    const total = totalStock(product);
    expect(store.applyStockChange({ [product.id]: -total })).toEqual([]);
    expect(store.applyStockChange({ [product.id]: -2 })).toEqual([product.id]);
    const updated = store.getState().data.products.find((item) => item.id === product.id);
    expect(totalStock(updated ?? product)).toBe(-2);
    expect(updated?.stock.display).toBe(-2);
    expect(store.applyStockChange({ [product.id]: -1 })).toEqual([]);
    expect(store.getState().negativeReview).toEqual([product.id]);
  });

  it('menambah stok pada gudang Display untuk retur dan mengabaikan barang tak dikenal', () => {
    const store = createStore({ dataset });
    const product = pick((display) => display > 0);
    store.applyStockChange({ [product.id]: 3, 'P-9999': 5 });
    const updated = store.getState().data.products.find((item) => item.id === product.id);
    expect(updated?.stock.display).toBeCloseTo(product.stock.display + 3, 3);
  });

  it('mempertahankan pelanggan baru saat stok berubah dan membersihkannya saat atur ulang', () => {
    const store = createStore({ dataset });
    store.addCustomer({
      id: 'C-061',
      code: 'C0061',
      name: 'Toko Baru',
      phone: '081234567890',
      tier: 'eceran',
      limit: 0,
      invoices: [],
    });
    const product = pick((display) => display > 0);
    store.applyStockChange({ [product.id]: -1 });
    expect(store.getState().data.customers).toHaveLength(61);
    store.resetData();
    expect(store.getState().data.customers).toHaveLength(60);
    expect(store.getState().negativeReview).toEqual([]);
    expect(store.getState().data.products.find((item) => item.id === product.id)?.stock).toEqual(
      product.stock,
    );
  });

  it('menyimpan status printer dan lebar kertas pada sesi', () => {
    const store = createStore({ dataset });
    expect(store.getState().printerConnected).toBe(true);
    expect(store.getState().paperWidth).toBe(80);
    store.setPrinter(false);
    store.setPaperWidth(58);
    expect(store.getState()).toMatchObject({ printerConnected: false, paperWidth: 58 });
    store.resetData();
    expect(store.getState()).toMatchObject({ printerConnected: true, paperWidth: 58 });
  });

  it('memberi nilai bawaan printer dan lebar kertas pada sesi lama', () => {
    const parsed = parseSession({
      version: 1,
      role: 'kasir',
      online: true,
      reviewMode: false,
      scenario: {},
      negativeReview: [],
      stockOverrides: {},
    });
    expect(parsed).toMatchObject({ printerConnected: true, paperWidth: 80 });
  });
});
