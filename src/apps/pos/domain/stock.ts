import { toBase } from '../../../shared/data/units';
import type { BillLine, Product } from '../../../shared/data/types';

// Kasir hanya boleh menjual stok toko (rak display), dalam satuan dasar. Stok gudang dan PO tidak
// ikut dihitung.
export function storeStock(product: Product): number {
  return product.stock.display;
}

export function isOutOfStock(product: Product): boolean {
  return !(storeStock(product) > 0);
}

export function availableBase(product: Product, sold: number): number {
  return storeStock(product) - sold;
}

export function billBaseQuantity(lines: readonly BillLine[], product: Product): number {
  return lines
    .filter((line) => line.productId === product.id)
    .reduce((sum, line) => sum + toBase(product, line.unit, line.quantity), 0);
}

export function isShort(lines: readonly BillLine[], product: Product, sold: number): boolean {
  return billBaseQuantity(lines, product) > availableBase(product, sold);
}
