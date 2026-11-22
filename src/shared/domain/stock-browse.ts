import type { Product, UnitDef, WarehouseId } from '../data/types';
import { TIERS, type Tier } from '../data/types';
import { unitPrice } from '../data/units';
import { matchesFilter, type WarehouseFilter } from './stock';

// Logika murni layar Stok Barang (Owner) dan Katalog (Sales): satu daftar, dua peran.

export interface BrowseFilter {
  readonly text: string;
  readonly warehouse: WarehouseFilter;
  /** Kosong berarti semua kategori. */
  readonly category: string;
  /** Kosong berarti semua merk. */
  readonly brand: string;
  readonly belowMinimum: boolean;
}

export const EMPTY_FILTER: BrowseFilter = {
  text: '',
  warehouse: 'semua',
  category: '',
  brand: '',
  belowMinimum: false,
};

export type StockFlag = 'ada' | 'habis';

// Stok tersedia berwarna hijau, stok kosong (nol atau negatif) berwarna merah.
export function stockFlag(product: Product, warehouse: WarehouseId): StockFlag {
  return product.stock[warehouse] > 0 ? 'ada' : 'habis';
}

// Nilai unik yang tidak kosong, urut abjad; dipakai untuk pilihan Kategori dan Merk.
export function distinct(
  products: readonly Product[],
  pick: (product: Product) => string,
): string[] {
  return [
    ...new Set(
      products
        .filter((product) => product.active !== false)
        .map((product) => pick(product).trim())
        .filter((value) => value !== ''),
    ),
  ].sort((first, second) => first.localeCompare(second, 'id'));
}

// Barcode (barang atau satuan) yang persis sama dengan teks pencarian; hasil pindai selalu persis.
export function barcodeMatches(products: readonly Product[], text: string): Product[] {
  const code = text.trim().replaceAll(' ', '');
  if (code.length < 4) {
    return [];
  }
  return products.filter(
    (product) => product.barcode === code || product.units.some((unit) => unit.barcode === code),
  );
}

export type ProductSearch = (products: readonly Product[], query: string) => Product[];

export function browseProducts(
  products: readonly Product[],
  filter: BrowseFilter,
  search: ProductSearch,
): Product[] {
  const scanned = barcodeMatches(products, filter.text);
  const found = scanned.length > 0 ? scanned : search(products, filter.text);
  return found.filter(
    (product) =>
      matchesFilter(product, {
        warehouse: filter.warehouse,
        below: filter.belowMinimum,
        negative: false,
      }) &&
      (filter.warehouse === 'semua' || product.stock[filter.warehouse] > 0) &&
      (filter.category === '' || product.category === filter.category) &&
      (filter.brand === '' || product.brand === filter.brand),
  );
}

// Tanggal ISO (2026-09-12) menjadi 12/09/26 seperti kolom Tgl Beli.
export function shortDate(iso: string | undefined): string {
  if (iso === undefined || !/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    return '-';
  }
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

export interface CostView {
  readonly lastPrice: number | undefined;
  readonly lastDate: string;
  readonly average: number;
}

// Harga beli terakhir (dengan tanggalnya) dan HPP rata-rata per satuan dasar; hanya untuk Owner.
export function costView(product: Product): CostView {
  return {
    lastPrice: product.lastPurchasePrice,
    lastDate: shortDate(product.lastPurchaseDate),
    average: Math.round(product.hppAvg ?? product.hpp),
  };
}

// Judul satuan pada tabel harga: "GLN" untuk satuan dasar, "DOS (4)" untuk satuan berisi 4 dasar.
export function unitCaption(unit: UnitDef): string {
  return unit.factor === 1 ? unit.code : `${unit.code} (${String(unit.factor)})`;
}

export interface PriceRow {
  readonly unit: string;
  readonly prices: Readonly<Record<Tier, number>> | undefined;
}

export const MIN_PRICE_ROWS = 3;

// Satu baris per satuan jual, dilengkapi baris kosong ("-") sampai tiga baris agar kartu seragam.
export function priceRows(product: Product, minimum = MIN_PRICE_ROWS): PriceRow[] {
  const rows: PriceRow[] = product.units.map((unit) => ({
    unit: unitCaption(unit),
    prices: Object.fromEntries(
      TIERS.map((tier) => [tier, unitPrice(product, unit.code, tier)]),
    ) as Record<Tier, number>,
  }));
  while (rows.length < minimum) {
    rows.push({ unit: '', prices: undefined });
  }
  return rows;
}
