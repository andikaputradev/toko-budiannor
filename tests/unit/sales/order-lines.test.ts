import { describe, expect, it } from 'vitest';
import {
  changeUnit,
  draftTotals,
  formatPriceInput,
  lineView,
  patchLine,
  priceFromInput,
  replaceLine,
  withoutLine,
} from '../../../src/apps/sales/domain/order-lines';
import type { OrderLineDraft } from '../../../src/shared/domain/orders';
import { fixtureProduct } from './support';

const product = fixtureProduct();
const lookup = (id: string) => (id === product.id ? product : undefined);
const line = (extra: Partial<OrderLineDraft> = {}): OrderLineDraft => ({
  productId: product.id,
  unit: 'Sak',
  quantity: '2',
  ...extra,
});

describe('baris order Sales', () => {
  it('memakai harga tier bila harga tidak diubah', () => {
    const view = lineView(product, line(), 'grosir');
    expect(view).toMatchObject({
      quantity: 2,
      listPrice: 51000,
      price: 51000,
      changed: false,
      below: false,
      subtotal: 102000,
    });
  });

  it('menandai harga ubah di atas dan di bawah harga tier', () => {
    const above = lineView(product, line({ price: '60000' }), 'eceran');
    expect(above).toMatchObject({ changed: true, below: false, subtotal: 120000 });
    const below = lineView(product, line({ price: '50.000' }), 'eceran');
    expect(below).toMatchObject({ price: 50000, changed: true, below: true, subtotal: 100000 });
  });

  it('menghitung jumlah desimal dan memberi subtotal nol bila jumlah tidak valid', () => {
    expect(lineView(product, line({ unit: 'Kg', quantity: '2,5' }), 'eceran').subtotal).toBe(3500);
    expect(lineView(product, line({ quantity: 'abc' }), 'eceran')).toMatchObject({
      quantity: undefined,
      subtotal: 0,
    });
  });

  it('menjumlah total, hitungan barang, dan baris yang harganya diubah', () => {
    const totals = draftTotals(
      [line(), line({ unit: 'Kg', quantity: '10', price: '1000' }), { ...line(), productId: 'x' }],
      lookup,
      'eceran',
    );
    expect(totals).toEqual({ total: 109800 + 10000, items: 3, changed: 1, below: 1 });
  });

  it('memformat isian harga dan menerjemahkannya ke nilai draf', () => {
    expect(formatPriceInput('50000')).toBe('50.000');
    expect(formatPriceInput('Rp 1.234.567')).toBe('1.234.567');
    expect(formatPriceInput('007')).toBe('7');
    expect(formatPriceInput('')).toBe('');
    expect(priceFromInput('', 54900)).toBeUndefined();
    expect(priceFromInput('54.900', 54900)).toBeUndefined();
    expect(priceFromInput('51.000', 54900)).toBe('51000');
    expect(priceFromInput('0', 54900)).toBe('0');
  });

  it('membuang harga ubah saat satuan diganti dan menyunting daftar tanpa mengubah aslinya', () => {
    expect(changeUnit(line({ price: '50000' }), 'Kg')).toEqual({
      productId: product.id,
      unit: 'Kg',
      quantity: '2',
    });
    const lines = [line(), line({ unit: 'Kg' })];
    expect(patchLine(lines, 1, { quantity: '9' })[1]?.quantity).toBe('9');
    expect(replaceLine(lines, 0, line({ quantity: '5' }))[0]?.quantity).toBe('5');
    expect(withoutLine(lines, 0)).toEqual([line({ unit: 'Kg' })]);
    expect(lines[0]?.quantity).toBe('2');
  });
});
