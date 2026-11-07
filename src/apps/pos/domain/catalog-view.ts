import type { Customer, Product, Tier } from '../../../shared/data/types';
import { label } from '../../../shared/messages';

// Barang dan pelanggan dari proposal (pinned) tampil lebih dulu; urutan relatif dijaga.
export function proposalFirst<T extends { readonly pinned?: boolean | undefined }>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((item) => item.pinned === true),
    ...items.filter((item) => item.pinned !== true),
  ];
}

export function categoriesOf(products: readonly Product[]): string[] {
  return [...new Set(proposalFirst(products).map((product) => product.category))];
}

export type StockKey = 'toko' | 'gudang' | 'po';

export interface StockLine {
  readonly key: StockKey;
  readonly quantity: number | undefined;
  readonly unit: string;
}

// Stok pada kartu mengikuti proposal: dalam satuan dasar, bukan dikonversi ke satuan jual.
export function stockLines(product: Product): readonly [StockLine, StockLine, StockLine] {
  const unit = product.baseUnit;
  return [
    { key: 'toko', quantity: product.stock.display, unit },
    { key: 'gudang', quantity: product.stock.besar, unit },
    { key: 'po', quantity: product.incoming, unit },
  ];
}

const TIER_TEXT: Readonly<Record<Tier, string>> = {
  eceran: 'RETAIL',
  grosir: 'GROSIR',
  kontraktor: 'KONTRAKTOR',
};

export function customerLabel(customer: Customer | undefined): string {
  return customer === undefined
    ? label('pelangganUmum')
    : `${customer.code} - ${customer.name.toUpperCase()} (${TIER_TEXT[customer.tier]})`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.slice(0, 1).toUpperCase())
    .join('');
}
