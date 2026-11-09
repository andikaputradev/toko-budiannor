import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { unitPrice } from '../../../src/shared/data/units';
import { checkSalesOrder, parsePriceOverride } from '../../../src/shared/domain/orders';

const data = generateDataset(20261018);
const product = data.products[0];
if (product === undefined) {
  throw new Error('Data contoh kosong');
}
const lookup = (id: string) => data.products.find((item) => item.id === id);
const now = new Date(data.referenceDate);
const base = { customerId: '', payment: 'tunai' as const, downPayment: '' };
const unit = product.baseUnit;
const list = unitPrice(product, unit, 'eceran');

describe('harga ubah pada Sales Order', () => {
  it('memakai harga tier bila kolom harga kosong', () => {
    const result = checkSalesOrder(
      { ...base, lines: [{ productId: product.id, unit, quantity: '2' }] },
      lookup,
      undefined,
      now,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.lines[0]?.unitPrice).toBe(list);
      expect(result.lines[0]?.listPrice).toBeUndefined();
      expect(result.belowList).toBe(false);
    }
  });

  it('memakai harga ubah dan menyimpan harga asli sebagai listPrice', () => {
    const result = checkSalesOrder(
      {
        ...base,
        lines: [{ productId: product.id, unit, quantity: '2', price: String(list + 500) }],
      },
      lookup,
      undefined,
      now,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.lines[0]?.unitPrice).toBe(list + 500);
      expect(result.lines[0]?.listPrice).toBe(list);
      expect(result.total).toBe(Math.round(2 * (list + 500)));
      expect(result.belowList).toBe(false);
    }
  });

  it('menandai harga di bawah tier', () => {
    const result = checkSalesOrder(
      {
        ...base,
        lines: [{ productId: product.id, unit, quantity: '1', price: String(list - 100) }],
      },
      lookup,
      undefined,
      now,
    );
    expect(result.kind === 'ok' && result.belowList).toBe(true);
  });

  it('menolak harga nol', () => {
    const result = checkSalesOrder(
      { ...base, lines: [{ productId: product.id, unit, quantity: '1', price: '0' }] },
      lookup,
      undefined,
      now,
    );
    expect(result.kind).toBe('error');
  });

  it('mengurai harga berpemisah ribuan', () => {
    expect(parsePriceOverride('Rp 12.500')).toBe(12500);
    expect(parsePriceOverride('')).toBeUndefined();
    expect(parsePriceOverride(undefined)).toBeUndefined();
  });
});
