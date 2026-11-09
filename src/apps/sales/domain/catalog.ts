import type { Product, Tier, WarehouseId } from '../../../shared/data/types';
import { TIERS } from '../../../shared/data/types';
import { breakdownStock, findUnit, unitPrice } from '../../../shared/data/units';
import { warehouseTone, type StockTone } from '../../../shared/domain/product-view';
import { matchesFilter, type WarehouseFilter } from '../../../shared/domain/stock';
import { formatDecimal } from '../../../shared/format';
import type { LabelKey } from '../../../shared/messages';

export const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
  kontraktor: 'tierKontraktor',
};

export interface CatalogFilter {
  readonly warehouse: WarehouseFilter;
  readonly below: boolean;
}

// Filter stok katalog. Gudang tertentu tanpa filter minimum hanya menampilkan barang yang
// stoknya ada di gudang itu; dengan filter minimum, yang dinilai stok gudang itu saja.
export function filterCatalog(products: readonly Product[], filter: CatalogFilter): Product[] {
  return products.filter((product) => {
    if (
      !matchesFilter(product, { warehouse: filter.warehouse, below: filter.below, negative: false })
    ) {
      return false;
    }
    return filter.warehouse === 'semua' || filter.below || product.stock[filter.warehouse] > 0;
  });
}

// Stok satu gudang dipecah ke satuan jual terbesar lebih dulu, mis. "62 Sak 16,67 Kg".
export function stockText(product: Product, warehouse: WarehouseId): string {
  const parts = breakdownStock(product, product.stock[warehouse]);
  if (parts.length === 0) {
    return `0 ${product.baseUnit}`;
  }
  return parts.map((part) => `${formatDecimal(part.quantity, 2)} ${part.unit}`).join(' ');
}

export function stockTone(product: Product, warehouse: WarehouseId): StockTone {
  return warehouseTone(product, warehouse);
}

export interface TierPrice {
  readonly tier: Tier;
  readonly price: number;
  readonly active: boolean;
}

// Harga ketiga tier untuk satu satuan jual; tier aktif (pelanggan atau pilihan Sales) ditandai.
export function tierPrices(product: Product, unit: string, active: Tier): readonly TierPrice[] {
  return TIERS.map((tier) => ({
    tier,
    price: unitPrice(product, unit, tier),
    active: tier === active,
  }));
}

export interface UnitNote {
  readonly factor: number;
  readonly base: string;
}

// Isi satuan terhadap satuan dasar (mis. 1 Sak = 40 Kg); kosong untuk satuan dasar itu sendiri.
export function unitNote(product: Product, unit: string): UnitNote | undefined {
  const factor = findUnit(product, unit)?.factor ?? 1;
  return factor === 1 ? undefined : { factor, base: product.baseUnit };
}
