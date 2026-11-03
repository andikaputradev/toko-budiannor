import type { Product, WarehouseId } from '../data/types';
import { round3, totalStock } from '../data/units';

export function splitMin(product: Product): Readonly<Record<WarehouseId, number>> {
  if (product.minByWarehouse !== undefined) {
    return product.minByWarehouse;
  }
  const display = round3(product.minStock * 0.3);
  return { display, besar: round3(product.minStock - display) };
}

export type WarehouseFilter = 'semua' | WarehouseId;
export type StockStatus = 'aman' | 'minimum' | 'negatif';

export interface StockFilter {
  readonly warehouse: WarehouseFilter;
  readonly below: boolean;
  readonly negative: boolean;
}

export function stockIn(product: Product, warehouse: WarehouseFilter): number {
  return warehouse === 'semua' ? totalStock(product) : product.stock[warehouse];
}

export function minimumIn(product: Product, warehouse: WarehouseFilter): number {
  return warehouse === 'semua' ? product.minStock : splitMin(product)[warehouse];
}

export function stockStatus(product: Product, warehouse: WarehouseFilter): StockStatus {
  const stock = stockIn(product, warehouse);
  if (stock < 0) {
    return 'negatif';
  }
  return stock < minimumIn(product, warehouse) ? 'minimum' : 'aman';
}

export function matchesFilter(product: Product, filter: StockFilter): boolean {
  if (product.active === false) {
    return false;
  }
  const status = stockStatus(product, filter.warehouse);
  if (filter.negative && status !== 'negatif') {
    return false;
  }
  if (filter.below && status === 'aman') {
    return false;
  }
  return true;
}

export function criticality(product: Product): number {
  const total = totalStock(product);
  if (total < 0) {
    return -1 + total / 1_000_000;
  }
  return product.minStock <= 0 ? Number.POSITIVE_INFINITY : round3(total / product.minStock);
}

export function mostCritical(products: readonly Product[], limit: number): Product[] {
  return products
    .filter((product) => product.active !== false && totalStock(product) < product.minStock)
    .sort((first, second) => criticality(first) - criticality(second))
    .slice(0, limit);
}

export function countBelowMinimum(products: readonly Product[]): number {
  return products.filter(
    (product) => product.active !== false && totalStock(product) < product.minStock,
  ).length;
}

export function countNegative(products: readonly Product[]): number {
  return products.filter((product) => product.active !== false && totalStock(product) < 0).length;
}
