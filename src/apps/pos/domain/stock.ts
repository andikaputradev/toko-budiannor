import { toBase, totalStock } from '../../../shared/data/units';
import type { BillLine, Product } from '../../../shared/data/types';

export function availableBase(product: Product, sold: number): number {
  return totalStock(product) - sold;
}

export function billBaseQuantity(lines: readonly BillLine[], product: Product): number {
  return lines
    .filter((line) => line.productId === product.id)
    .reduce((sum, line) => sum + toBase(product, line.unit, line.quantity), 0);
}

export function isShort(lines: readonly BillLine[], product: Product, sold: number): boolean {
  return billBaseQuantity(lines, product) > availableBase(product, sold);
}
