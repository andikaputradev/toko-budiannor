import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { sampleProduct } from './support';
import type { Product } from '../../../src/shared/data/types';
import {
  countBelowMinimum,
  countNegative,
  matchesFilter,
  minimumIn,
  mostCritical,
  stockIn,
  stockStatus,
} from '../../../src/apps/bo/domain/stock-view';

const base = sampleProduct();

function make(display: number, besar: number, minStock = 10): Product {
  return { ...base, stock: { display, besar }, minStock, minByWarehouse: undefined };
}

describe('tampilan stok', () => {
  it('menentukan status Aman, Di bawah minimum, dan Ditinjau (negatif)', () => {
    expect(stockStatus(make(10, 10), 'semua')).toBe('aman');
    expect(stockStatus(make(3, 4), 'semua')).toBe('minimum');
    expect(stockStatus(make(-2, 0), 'semua')).toBe('negatif');
    expect(stockStatus(make(0, 0, 0), 'semua')).toBe('aman');
  });

  it('menilai per gudang memakai minimum gudang itu', () => {
    const product = make(1, 50, 10);
    expect(stockIn(product, 'display')).toBe(1);
    expect(stockIn(product, 'besar')).toBe(50);
    expect(minimumIn(product, 'semua')).toBe(10);
    expect(stockStatus(product, 'display')).toBe('minimum');
    expect(stockStatus(product, 'besar')).toBe('aman');
    expect(stockStatus(make(-1, 50), 'display')).toBe('negatif');
  });

  it('menyaring barang di bawah minimum, negatif, dan menyembunyikan barang nonaktif', () => {
    const filter = { warehouse: 'semua' as const, below: true, negative: false };
    expect(matchesFilter(make(3, 4), filter)).toBe(true);
    expect(matchesFilter(make(10, 10), filter)).toBe(false);
    expect(matchesFilter(make(-1, 0), filter)).toBe(true);
    const onlyNegative = { warehouse: 'semua' as const, below: false, negative: true };
    expect(matchesFilter(make(3, 4), onlyNegative)).toBe(false);
    expect(matchesFilter(make(-1, 0), onlyNegative)).toBe(true);
    expect(matchesFilter({ ...make(3, 4), active: false }, filter)).toBe(false);
  });

  it('mengurutkan barang paling kritis dan menghitung jumlahnya', () => {
    const list = [make(9, 0), make(1, 0), make(-5, 0), make(50, 50), make(5, 0)];
    expect(countBelowMinimum(list)).toBe(4);
    expect(countNegative(list)).toBe(1);
    const critical = mostCritical(list, 3);
    expect(critical.map((item) => item.stock.display)).toEqual([-5, 1, 5]);
  });

  it('menghitung pada data contoh 3.600 barang', () => {
    const products = generateDataset().products;
    expect(countBelowMinimum(products)).toBeGreaterThan(0);
    expect(mostCritical(products, 4)).toHaveLength(4);
  });
});
