import type { Product, TierPrices, UnitDef } from '../../../shared/data/types';
import type { LabelKey, SystemMessageId } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';
import { parseOptionalPercent } from '../../../shared/domain/promo';
import {
  normalizeRows,
  rowsOf,
  toUnitDefs,
  validateUnitRows,
  type UnitRowDraft,
} from './product-units';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const CODE_MIN = 3;
export const CODE_MAX = 20;
export const BASE_UNITS: readonly string[] = [
  'Pcs',
  'Kg',
  'Meter',
  'Kubik',
  'Batang',
  'Liter',
  'M2',
  'Lembar',
];

export interface ProductDraft {
  readonly code: string;
  readonly barcode: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly baseUnit: string;
  readonly allowDecimal: boolean;
  readonly defaultUnit: string;
  readonly minDisplay: string;
  readonly minBesar: string;
  readonly photoName: string;
  readonly photoBytes: number;
  // Baris satuan (1 sampai 3). Bila ada, baris pertama menjadi satuan dasar menggantikan baseUnit.
  readonly unitRows?: readonly UnitRowDraft[];
  readonly minStockAll?: string;
  readonly minStockToko?: string;
  readonly rak?: string;
  readonly berat?: string;
  // Persen 0 sampai 100. Kosong berarti tidak diisi (komisi ikut profil sales, tanpa promo).
  readonly komisiSalesPersen?: string;
  readonly promoPersen?: string;
  readonly catatan?: string;
  readonly supplierName?: string;
  readonly tglBeliAkhir?: string;
  readonly hargaBeliAkhir?: string;
  readonly hppAvg?: string;
  readonly hargaEcer1?: string;
  readonly hargaGrosir1?: string;
  readonly hargaEcer2?: string;
  readonly hargaGrosir2?: string;
  readonly hargaEcer3?: string;
  readonly hargaGrosir3?: string;
}

export type ProductField = 'code' | 'name' | 'baseUnit' | 'minStock' | 'photo';

export type ProductIssue =
  | { readonly field: ProductField; readonly messageId: SystemMessageId }
  | { readonly field: 'codeLength'; readonly messageId: undefined }
  | {
      readonly field: 'units';
      readonly messageId: undefined;
      readonly labelKey: LabelKey;
      readonly row: number;
    }
  | {
      readonly field: 'commission' | 'promo' | 'baseUnit';
      readonly messageId: undefined;
      readonly labelKey: LabelKey;
    };

export function parseMin(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  if (text === '') {
    return 0;
  }
  if (!/^-?\d+(\.\d{1,3})?$/.test(text)) {
    return undefined;
  }
  return Number(text);
}

export { splitMin } from '../../../shared/domain/stock';
import { splitMin } from '../../../shared/domain/stock';

export function validateProduct(
  draft: ProductDraft,
  products: readonly Pick<Product, 'id' | 'code'>[],
  editingId: string | undefined,
  editing?: Pick<Product, 'baseUnit'>,
): ProductIssue | undefined {
  const code = draft.code.trim();
  if (code === '') {
    return { field: 'code', messageId: 'MSG-058' };
  }
  if (code.length < CODE_MIN || code.length > CODE_MAX) {
    return { field: 'codeLength', messageId: undefined };
  }
  if (
    products.some((item) => item.code.toLowerCase() === code.toLowerCase() && item.id !== editingId)
  ) {
    return { field: 'code', messageId: 'MSG-059' };
  }
  if (draft.name.trim() === '') {
    return { field: 'name', messageId: 'MSG-060' };
  }
  const baseUnit =
    draft.unitRows === undefined ? draft.baseUnit : (normalizeRows(draft.unitRows)[0]?.code ?? '');
  if (baseUnit === '') {
    return { field: 'baseUnit', messageId: 'MSG-061' };
  }
  // Stok, HPP, dan harga barang lama tercatat dalam satuan dasarnya; mengganti satuan dasar akan
  // membuat harga satuan baru bernilai nol, jadi tidak diizinkan dari formulir ini.
  if (editing !== undefined && baseUnit !== editing.baseUnit) {
    return { field: 'baseUnit', messageId: undefined, labelKey: 'produkErrSatuanDasarTetap' };
  }
  const unitIssue = draft.unitRows === undefined ? undefined : validateUnitRows(draft.unitRows);
  if (unitIssue !== undefined && unitIssue.field !== 'base') {
    return {
      field: 'units',
      messageId: undefined,
      labelKey: unitIssue.field === 'duplicate' ? 'produkErrSatuanGanda' : 'produkErrKonversi',
      row: unitIssue.row,
    };
  }
  const display = parseMin(draft.minDisplay);
  const besar = parseMin(draft.minBesar);
  if (display === undefined || besar === undefined || display < 0 || besar < 0) {
    return { field: 'minStock', messageId: 'MSG-062' };
  }
  if (draft.photoBytes > MAX_PHOTO_BYTES) {
    return { field: 'photo', messageId: 'MSG-063' };
  }
  if (
    draft.komisiSalesPersen !== undefined &&
    parseOptionalPercent(draft.komisiSalesPersen) === undefined
  ) {
    return { field: 'commission', messageId: undefined, labelKey: 'produkErrKomisi' };
  }
  if (draft.promoPersen !== undefined && parseOptionalPercent(draft.promoPersen) === undefined) {
    return { field: 'promo', messageId: undefined, labelKey: 'produkErrPromo' };
  }
  return undefined;
}

const percentText = (value: number | undefined): string =>
  value !== undefined && value > 0 ? String(value).replace('.', ',') : '';

export function draftOf(product: Product): ProductDraft {
  const min = splitMin(product);
  const text = (value: number | undefined): string =>
    value === undefined ? '' : String(value).replace('.', ',');
  const unit2 = product.units[1];
  const unit3 = product.units[2];
  const price1 = product.prices[product.baseUnit];
  const price2 = unit2 ? product.prices[unit2.code] : undefined;
  const price3 = unit3 ? product.prices[unit3.code] : undefined;

  return {
    code: product.code,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    category: product.category,
    baseUnit: product.baseUnit,
    allowDecimal: product.allowDecimal,
    defaultUnit: product.defaultUnit ?? product.baseUnit,
    minDisplay: text(min.display),
    minBesar: text(min.besar),
    photoName: product.photoName ?? '',
    photoBytes: 0,
    unitRows: rowsOf(product),
    minStockAll: text(product.minStock),
    minStockToko: text(min.display),
    rak: product.rak ?? '',
    berat: text(product.weight),
    komisiSalesPersen: percentText(product.salesCommission?.percent),
    promoPersen: percentText(product.promo?.percent),
    catatan: product.notes ?? '',
    supplierName: product.supplierName ?? '',
    tglBeliAkhir: product.lastPurchaseDate ?? '',
    hargaBeliAkhir:
      product.lastPurchasePrice !== undefined ? String(product.lastPurchasePrice) : '',
    hppAvg: product.hppAvg !== undefined ? String(product.hppAvg) : String(product.hpp),
    hargaEcer1: price1 ? String(price1.eceran) : '',
    hargaGrosir1: price1 ? String(price1.grosir) : '',
    hargaEcer2: price2 ? String(price2.eceran) : '',
    hargaGrosir2: price2 ? String(price2.grosir) : '',
    hargaEcer3: price3 ? String(price3.eceran) : '',
    hargaGrosir3: price3 ? String(price3.grosir) : '',
  };
}

export function emptyDraft(): ProductDraft {
  return {
    code: '',
    barcode: '',
    name: '',
    brand: '',
    category: '',
    baseUnit: '',
    allowDecimal: true,
    defaultUnit: '',
    minDisplay: '',
    minBesar: '',
    photoName: '',
    photoBytes: 0,
    minStockAll: '',
    minStockToko: '',
    rak: '',
    berat: '',
    komisiSalesPersen: '',
    promoPersen: '',
    catatan: '',
    supplierName: '',
    tglBeliAkhir: '',
    hargaBeliAkhir: '',
    hppAvg: '',
    hargaEcer1: '',
    hargaGrosir1: '',
    hargaEcer2: '',
    hargaGrosir2: '',
    hargaEcer3: '',
    hargaGrosir3: '',
  };
}

export function nextProductId(count: number): string {
  return `P-${String(count + 1).padStart(4, '0')}`;
}

const amountOf = (text: string | undefined): number => {
  const value = Number((text ?? '').trim() === '' ? '0' : text);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const nonEmpty = (text: string | undefined): string | undefined =>
  text === undefined || text === '' ? undefined : text;

const tierOf = (eceran: number, grosir: number): TierPrices => ({ eceran, grosir });

// Harga satuan baru yang belum diisi mengikuti harga satuan dasar dikali konversi.
const derivedTier = (base: TierPrices | undefined, factor: number): TierPrices => ({
  eceran: Math.round((base?.eceran ?? 0) * factor),
  grosir: Math.round((base?.grosir ?? 0) * factor),
});

// Isian persen: tidak dikirim berarti dipertahankan; kosong atau nol berarti dihapus.
function percentField(
  text: string | undefined,
  current: { readonly percent: number; readonly nominal: number } | undefined,
): { readonly percent: number; readonly nominal: number } | undefined {
  if (text === undefined) {
    return current;
  }
  const value = parseOptionalPercent(text);
  return value === null || value === undefined || value === 0
    ? undefined
    : { percent: value, nominal: 0 };
}

// canEditCost: hanya Owner boleh mengubah harga beli akhir dan HPP rata-rata.
export function buildProduct(
  draft: ProductDraft,
  base: Product | undefined,
  id: string,
  canEditCost = true,
): Product {
  const display = parseMin(draft.minDisplay) ?? parseMin(draft.minStockToko ?? '') ?? 0;
  const besar = parseMin(draft.minBesar) ?? 0;

  const defs = draft.unitRows === undefined ? [] : toUnitDefs(draft.unitRows);
  const baseUnit = defs[0]?.code ?? draft.baseUnit;
  const keep = base?.baseUnit === baseUnit ? base : undefined;
  const units: UnitDef[] =
    defs.length > 0
      ? defs.map(
          (def) =>
            base?.units.find((unit) => unit.code === def.code && unit.factor === def.factor) ?? def,
        )
      : [...(keep?.units ?? [{ code: baseUnit, name: baseUnit, factor: 1 }])];

  const typed: readonly (readonly [string | undefined, string | undefined])[] = [
    [draft.hargaEcer1, draft.hargaGrosir1],
    [draft.hargaEcer2, draft.hargaGrosir2],
    [draft.hargaEcer3, draft.hargaGrosir3],
  ];
  const prices: Record<string, TierPrices> = {};
  units.forEach((unit, index) => {
    const existing = base?.prices[unit.code];
    if (existing !== undefined) {
      prices[unit.code] = existing;
      return;
    }
    const [ecer, grosir] = typed[index] ?? [undefined, undefined];
    // Isian harga pada draf hanya bermakna saat barang baru ditambah; pada barang lama isian itu
    // masih membawa harga satuan sebelumnya, jadi satuan baru diturunkan dari harga satuan dasar.
    const typedPrice = base === undefined && (amountOf(ecer) > 0 || amountOf(grosir) > 0);
    if (index === 0 || typedPrice) {
      prices[unit.code] = tierOf(amountOf(ecer), amountOf(grosir));
      return;
    }
    prices[unit.code] = derivedTier(prices[units[0]?.code ?? baseUnit], unit.factor);
  });

  const hppVal =
    base !== undefined
      ? base.hpp
      : canEditCost
        ? amountOf(draft.hppAvg) || amountOf(draft.hargaBeliAkhir)
        : 0;

  return {
    id,
    code: draft.code.trim(),
    barcode: draft.barcode.trim(),
    name: draft.name.trim(),
    brand: draft.brand.trim(),
    category: draft.category.trim(),
    baseUnit,
    allowDecimal: draft.allowDecimal,
    units,
    prices,
    hpp: hppVal,
    minStock: round3(display + besar),
    stock: base?.stock ?? { display: 0, besar: 0 },
    active: base?.active ?? true,
    defaultUnit: draft.defaultUnit === '' ? undefined : draft.defaultUnit,
    photoName: draft.photoName === '' ? undefined : draft.photoName,
    // Penanda barang proposal (tampil paling depan di POS) dan foto bawaan tidak ada di formulir,
    // jadi dibawa dari barang lama; tanpa ini mengubah barang menjatuhkan keduanya.
    pinned: base?.pinned,
    photoUrl: base?.photoUrl,
    minByWarehouse: { display, besar },
    rak: draft.rak && draft.rak.trim() !== '' ? draft.rak.trim() : base?.rak,
    weight: draft.berat ? Number(draft.berat.replace(',', '.')) : base?.weight,
    salesCommission: percentField(draft.komisiSalesPersen, base?.salesCommission),
    promo: percentField(draft.promoPersen, base?.promo),
    notes: draft.catatan && draft.catatan.trim() !== '' ? draft.catatan.trim() : base?.notes,
    supplierName:
      draft.supplierName && draft.supplierName.trim() !== ''
        ? draft.supplierName.trim()
        : base?.supplierName,
    lastPurchaseDate: nonEmpty(draft.tglBeliAkhir) ?? base?.lastPurchaseDate,
    lastPurchasePrice:
      canEditCost && draft.hargaBeliAkhir ? Number(draft.hargaBeliAkhir) : base?.lastPurchasePrice,
    hppAvg: canEditCost ? hppVal : (base?.hppAvg ?? hppVal),
    incoming: base?.incoming ?? 0,
    initialStock: base?.initialStock,
  };
}
