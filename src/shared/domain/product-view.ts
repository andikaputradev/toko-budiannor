import type { Product, Tier, WarehouseId } from '../data/types';
import { TIERS } from '../data/types';
import { unitPrice } from '../data/units';
import { splitMin } from './stock';

export type StockTone = 'sukses' | 'peringatan' | 'bahaya';

export interface TierRow {
  readonly unit: string;
  readonly factor: number;
  readonly prices: Readonly<Record<Tier, number>>;
}

// Satu baris per satuan jual; harga tiap tier dihitung dari tabel harga barang.
export function tierRows(product: Product): readonly TierRow[] {
  return product.units.map((unit) => ({
    unit: unit.code,
    factor: unit.factor,
    prices: Object.fromEntries(
      TIERS.map((tier) => [tier, unitPrice(product, unit.code, tier)]),
    ) as Record<Tier, number>,
  }));
}

// Warna stok per gudang: habis atau negatif merah, di bawah minimum kuning, selain itu hijau.
export function warehouseTone(product: Product, warehouse: WarehouseId): StockTone {
  const stock = product.stock[warehouse];
  if (stock <= 0) {
    return 'bahaya';
  }
  return stock < splitMin(product)[warehouse] ? 'peringatan' : 'sukses';
}
