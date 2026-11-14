import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { tierRows, warehouseTone } from '../../../src/shared/domain/product-view';

const data = generateDataset(20261018);
const product = data.products[0];
if (product === undefined) {
  throw new Error('Data contoh kosong');
}

describe('tierRows', () => {
  it('memberi satu baris per satuan dengan dua tier', () => {
    const rows = tierRows(product);
    expect(rows).toHaveLength(product.units.length);
    for (const row of rows) {
      expect(Object.keys(row.prices).sort()).toEqual(['eceran', 'grosir']);
      expect(row.prices.eceran).toBeGreaterThanOrEqual(row.prices.grosir);
    }
  });
});

describe('warehouseTone', () => {
  it('merah bila habis, kuning di bawah minimum, hijau bila cukup', () => {
    expect(warehouseTone({ ...product, stock: { display: 0, besar: 0 } }, 'display')).toBe(
      'bahaya',
    );
    expect(warehouseTone({ ...product, stock: { display: -2, besar: 0 } }, 'display')).toBe(
      'bahaya',
    );
    expect(
      warehouseTone({ ...product, minStock: 100, stock: { display: 1, besar: 500 } }, 'display'),
    ).toBe('peringatan');
    expect(
      warehouseTone({ ...product, minStock: 100, stock: { display: 500, besar: 500 } }, 'besar'),
    ).toBe('sukses');
  });
});
