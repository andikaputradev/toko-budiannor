import { describe, expect, it } from 'vitest';
import {
  createDocLine,
  docGrandTotal,
  docSummary,
  isPromoExpr,
  lineAmount,
  moveLine,
  type DocLine,
} from '../../../src/apps/bo/domain/doc-line';
import { generateDataset } from '../../../src/shared/data/generator';
import { need } from './support';

const line = (over: Partial<DocLine> = {}): DocLine => ({
  id: 'L-1',
  productId: 'P-1',
  productName: 'SEMEN',
  code: '0001',
  warehouse: 'toko',
  unit: 'SAK',
  quantity: 10,
  unitPrice: 70_000,
  discountExpr: '',
  shipping: 0,
  koli: false,
  ...over,
});

describe('lineAmount', () => {
  it('harga kali kuantitas dikurangi diskon per satuan', () => {
    expect(lineAmount(line())).toBe(700_000);
    expect(lineAmount(line({ discountExpr: 'Rp 2000' }))).toBe(680_000);
    expect(lineAmount(line({ discountExpr: '10%' }))).toBe(630_000);
  });
});

describe('docSummary dan docGrandTotal', () => {
  it('menghitung jumlah baris, total kuantitas, dan sub total', () => {
    const lines = [line(), line({ id: 'L-2', quantity: 5, unitPrice: 1000 })];
    expect(docSummary(lines)).toEqual({ count: 2, quantity: 15, subtotal: 705_000 });
  });

  it('daftar kosong memberi nol', () => {
    expect(docSummary([])).toEqual({ count: 0, quantity: 0, subtotal: 0 });
  });

  it('total = sub total dikurangi diskon ditambah total biaya, tidak pernah negatif', () => {
    expect(docGrandTotal(1_717_500, 85_875, 100_000)).toBe(1_731_625);
    expect(docGrandTotal(1000, 5000, 0)).toBe(0);
    expect(docGrandTotal(1000, -50, -10)).toBe(1000);
  });
});

describe('moveLine', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('memindahkan elemen ke indeks tujuan tanpa mengubah asal', () => {
    expect(moveLine(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveLine(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('indeks di luar batas atau sama tidak mengubah urutan', () => {
    expect(moveLine(items, 1, 1)).toEqual(items);
    expect(moveLine(items, -1, 2)).toEqual(items);
    expect(moveLine(items, 1, 9)).toEqual(items);
  });
});

describe('createDocLine dan isPromoExpr', () => {
  const dataset = generateDataset();
  const promoted = need(dataset.products.find((product) => (product.promo?.percent ?? 0) > 0));
  const plain = need(dataset.products.find((product) => (product.promo?.percent ?? 0) === 0));

  it('baris penjualan barang berpromo terisi diskon promo, dan dikenali sebagai promo', () => {
    const created = createDocLine(promoted, 'jual');
    expect(created.discountExpr).toBe(`${String(promoted.promo?.percent)}%`);
    expect(isPromoExpr(promoted, created.discountExpr)).toBe(true);
    expect(isPromoExpr(promoted, String(promoted.promo?.percent))).toBe(true);
    expect(isPromoExpr(promoted, '1%')).toBe(false);
  });

  it('baris pembelian: harga awal = harga beli terakhir bagi Owner, kosong bagi Supervisor', () => {
    const bought = need(dataset.products.find((product) => (product.lastPurchasePrice ?? 0) > 0));
    expect(createDocLine(bought, 'beli', true).unitPrice).toBe(bought.lastPurchasePrice);
    expect(createDocLine(bought, 'beli', false).unitPrice).toBe(0);
    expect(createDocLine(bought, 'beli').unitPrice).toBe(0);
  });

  it('baris penjualan tetap memakai harga eceran, tidak peduli hak lihat biaya', () => {
    const created = createDocLine(plain, 'jual', false);
    expect(created.unitPrice).toBe(plain.prices[plain.defaultUnit ?? plain.baseUnit]?.eceran ?? 0);
  });

  it('baris pembelian tidak membawa promo', () => {
    expect(createDocLine(promoted, 'beli').discountExpr).toBe('');
  });

  it('baris baru memakai satuan bawaan, harga eceran, dan gudang yang punya stok', () => {
    const created = createDocLine(plain, 'jual');
    expect(created.productId).toBe(plain.id);
    expect(created.code).toBe(plain.code);
    expect(created.unit).toBe(plain.defaultUnit ?? plain.baseUnit);
    expect(created.quantity).toBe(1);
    expect(created.koli).toBe(false);
    expect(created.warehouse).toBe(plain.stock.display > 0 ? 'toko' : 'gudang');
    expect(created.id).not.toBe(createDocLine(plain, 'jual').id);
  });
});
