import type { Product } from '../../../shared/data/types';
import { round3, totalStock } from '../../../shared/data/units';
import { lineAmount, type DocLine } from './doc-line';

// Biaya pembelian per satuan dasar (revisi BO putaran 10): harga bersih per satuan setelah diskon
// ditambah ongkos kirim per satuan, dibagi faktor satuan. Ongkos kirim tidak masuk total nota,
// tetapi dialokasikan ke HPP barang.
export interface PurchaseCostPart {
  readonly productId: string;
  // Jumlah dalam satuan dasar.
  readonly baseQuantity: number;
  // Biaya masuk per satuan dasar (harga bersih + ongkos kirim).
  readonly landedCost: number;
  // Harga beli bersih per satuan dasar tanpa ongkos kirim (Harga Beli Akhir).
  readonly netCost: number;
}

function factorOf(product: Product, unit: string): number {
  return product.units.find((item) => item.code === unit)?.factor ?? 1;
}

export function costPart(product: Product, line: DocLine): PurchaseCostPart {
  const factor = factorOf(product, line.unit);
  const netPerUnit = line.quantity === 0 ? 0 : lineAmount(line) / line.quantity;
  return {
    productId: product.id,
    baseQuantity: round3(line.quantity * factor),
    landedCost: (netPerUnit + line.shipping) / factor,
    netCost: netPerUnit / factor,
  };
}

// HPP rata-rata tertimbang: stok yang ada dengan HPP lama, dicampur barang yang dibeli (termasuk
// ongkos kirimnya). Tanpa stok, HPP baru sama dengan biaya masuk rata-rata pembelian.
export function hppAfterPurchase(product: Product, parts: readonly PurchaseCostPart[]): number {
  const bought = parts.reduce((sum, part) => sum + part.baseQuantity, 0);
  const boughtValue = parts.reduce((sum, part) => sum + part.baseQuantity * part.landedCost, 0);
  const onHand = Math.max(0, totalStock(product));
  const current = product.hppAvg ?? product.hpp;
  const quantity = onHand + bought;
  if (quantity <= 0) {
    return Math.round(current);
  }
  return Math.round((onHand * current + boughtValue) / quantity);
}

export interface CostUpdate {
  readonly product: Product;
  readonly hppAvg: number;
  readonly lastPurchasePrice: number;
}

// Pembaruan HPP rata-rata dan harga beli akhir untuk setiap barang pada faktur pembelian.
export function purchaseCostUpdates(
  lines: readonly DocLine[],
  lookup: (id: string) => Product | undefined,
): CostUpdate[] {
  const groups = new Map<string, { product: Product; parts: PurchaseCostPart[] }>();
  for (const line of lines) {
    const product = lookup(line.productId);
    if (product === undefined) {
      continue;
    }
    const group = groups.get(product.id) ?? { product, parts: [] };
    group.parts.push(costPart(product, line));
    groups.set(product.id, group);
  }
  return [...groups.values()].map(({ product, parts }) => ({
    product,
    hppAvg: hppAfterPurchase(product, parts),
    lastPurchasePrice: Math.round(parts[parts.length - 1]?.netCost ?? 0),
  }));
}
