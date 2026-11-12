import { totalStock } from '../../../shared/data/units';
import type { Product, Role, TierPrices } from '../../../shared/data/types';
import { formatDecimal } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';

export type ExportColumnId =
  | 'kode'
  | 'nama'
  | 'barcode'
  | 'kategori'
  | 'merk'
  | 'satuan'
  | 'stokToko'
  | 'stokGudang'
  | 'stokTotal'
  | 'minStok'
  | 'hargaEcer'
  | 'hargaGrosir'
  | 'hargaKontraktor'
  | 'hpp'
  | 'hargaBeliAkhir'
  | 'tglBeliAkhir'
  | 'pemasok'
  | 'rak'
  | 'berat'
  | 'komisi'
  | 'promo'
  | 'status';

// Susunan baku kolom pada hasil ekspor.
const COLUMN_ORDER: readonly ExportColumnId[] = [
  'kode',
  'nama',
  'barcode',
  'kategori',
  'merk',
  'satuan',
  'stokToko',
  'stokGudang',
  'stokTotal',
  'minStok',
  'hargaEcer',
  'hargaGrosir',
  'hargaKontraktor',
  'hpp',
  'hargaBeliAkhir',
  'tglBeliAkhir',
  'pemasok',
  'rak',
  'berat',
  'komisi',
  'promo',
  'status',
];

const COLUMN_LABELS: Readonly<Record<ExportColumnId, LabelKey>> = {
  kode: 'expKode',
  nama: 'expNama',
  barcode: 'expBarcode',
  kategori: 'expKategori',
  merk: 'expMerk',
  satuan: 'expSatuan',
  stokToko: 'expStokToko',
  stokGudang: 'expStokGudang',
  stokTotal: 'expStokTotal',
  minStok: 'expMinStok',
  hargaEcer: 'expHargaEcer',
  hargaGrosir: 'expHargaGrosir',
  hargaKontraktor: 'expHargaKontraktor',
  hpp: 'expHpp',
  hargaBeliAkhir: 'expHargaBeliAkhir',
  tglBeliAkhir: 'expTglBeliAkhir',
  pemasok: 'expPemasok',
  rak: 'expRak',
  berat: 'expBerat',
  komisi: 'expKomisi',
  promo: 'expPromo',
  status: 'expStatus',
};

// Informasi biaya hanya untuk Owner.
export const OWNER_ONLY_COLUMNS: ReadonlySet<ExportColumnId> = new Set<ExportColumnId>([
  'hpp',
  'hargaBeliAkhir',
]);

export interface ExportParams {
  readonly columns: readonly ExportColumnId[];
  // Teks kosong berarti semua.
  readonly category: string;
  readonly brand: string;
  readonly status: 'semua' | 'aktif' | 'nonaktif';
  readonly stock: 'semua' | 'ada' | 'kosong' | 'dibawah-minimum';
  readonly text: string;
}

export function labelOfColumn(column: ExportColumnId): string {
  return label(COLUMN_LABELS[column]);
}

export function availableColumns(role: Role): readonly ExportColumnId[] {
  return COLUMN_ORDER.filter((column) => role === 'owner' || !OWNER_ONLY_COLUMNS.has(column));
}

const number = (value: number): string => formatDecimal(value);
const money = (value: number): string => formatDecimal(value, 0);

function pricesOf(product: Product, tier: keyof TierPrices): string {
  return product.units
    .map((unit) => `${unit.code} ${money(product.prices[unit.code]?.[tier] ?? 0)}`)
    .join('; ');
}

function weightOf(product: Product): string {
  const grams = product.weight;
  if (grams === undefined) {
    return '';
  }
  return grams >= 1000 ? `${number(grams / 1000)} KG` : `${number(grams)} GR`;
}

const percentOf = (value: number | undefined): string =>
  value === undefined || value <= 0 ? '' : `${formatDecimal(value, 2)}%`;

const CELLS: Readonly<Record<ExportColumnId, (product: Product) => string>> = {
  kode: (product) => product.code,
  nama: (product) => product.name,
  barcode: (product) => product.barcode,
  kategori: (product) => product.category,
  merk: (product) => product.brand,
  satuan: (product) =>
    product.units
      .map((unit) => (unit.factor === 1 ? unit.code : `${unit.code} = ${number(unit.factor)}`))
      .join('; '),
  stokToko: (product) => number(product.stock.display),
  stokGudang: (product) => number(product.stock.besar),
  stokTotal: (product) => number(totalStock(product)),
  minStok: (product) => number(product.minStock),
  hargaEcer: (product) => pricesOf(product, 'eceran'),
  hargaGrosir: (product) => pricesOf(product, 'grosir'),
  hargaKontraktor: (product) => pricesOf(product, 'kontraktor'),
  hpp: (product) => money(product.hpp),
  hargaBeliAkhir: (product) =>
    product.lastPurchasePrice === undefined ? '' : money(product.lastPurchasePrice),
  tglBeliAkhir: (product) => product.lastPurchaseDate ?? '',
  pemasok: (product) => product.supplierName ?? '',
  rak: (product) => product.rak ?? '',
  berat: weightOf,
  komisi: (product) => percentOf(product.salesCommission?.percent),
  promo: (product) => percentOf(product.promo?.percent),
  status: (product) => label(product.active === false ? 'expNonaktif' : 'expAktif'),
};

function matches(product: Product, params: ExportParams): boolean {
  if (params.category !== '' && product.category !== params.category) {
    return false;
  }
  if (params.brand !== '' && product.brand !== params.brand) {
    return false;
  }
  if (params.status === 'aktif' && product.active === false) {
    return false;
  }
  if (params.status === 'nonaktif' && product.active !== false) {
    return false;
  }
  const total = totalStock(product);
  if (params.stock === 'ada' && !(total > 0)) {
    return false;
  }
  if (params.stock === 'kosong' && total > 0) {
    return false;
  }
  if (params.stock === 'dibawah-minimum' && !(total < product.minStock)) {
    return false;
  }
  const text = params.text.trim().toLowerCase();
  return (
    text === '' || `${product.name} ${product.code} ${product.barcode}`.toLowerCase().includes(text)
  );
}

export function buildExport(
  products: readonly Product[],
  params: ExportParams,
  role: Role,
): { columns: string[]; rows: string[][] } {
  const allowed = new Set(availableColumns(role));
  const chosen = COLUMN_ORDER.filter(
    (column) => params.columns.includes(column) && allowed.has(column),
  );
  return {
    columns: chosen.map(labelOfColumn),
    rows: products
      .filter((product) => matches(product, params))
      .map((product) => chosen.map((column) => CELLS[column](product))),
  };
}
