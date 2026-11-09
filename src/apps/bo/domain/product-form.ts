import type { Product } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';

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
  readonly satuan2?: string;
  readonly rasio2?: string;
  readonly satuan3?: string;
  readonly rasio3?: string;
  readonly minStockAll?: string;
  readonly minStockToko?: string;
  readonly rak?: string;
  readonly berat?: string;
  readonly komisiSalesPersen?: string;
  readonly komisiSalesNominal?: string;
  readonly promoPersen?: string;
  readonly promoNominal?: string;
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
  | { readonly field: 'codeLength'; readonly messageId: undefined };

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
  if (draft.baseUnit === '') {
    return { field: 'baseUnit', messageId: 'MSG-061' };
  }
  const display = parseMin(draft.minDisplay);
  const besar = parseMin(draft.minBesar);
  if (display === undefined || besar === undefined || display < 0 || besar < 0) {
    return { field: 'minStock', messageId: 'MSG-062' };
  }
  if (draft.photoBytes > MAX_PHOTO_BYTES) {
    return { field: 'photo', messageId: 'MSG-063' };
  }
  return undefined;
}

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
    satuan2: unit2?.code ?? '',
    rasio2: unit2 ? String(unit2.factor) : '',
    satuan3: unit3?.code ?? '',
    rasio3: unit3 ? String(unit3.factor) : '',
    minStockAll: text(product.minStock),
    minStockToko: text(min.display),
    rak: product.rak ?? '',
    berat: text(product.weight),
    komisiSalesPersen: product.salesCommission ? String(product.salesCommission.percent) : '',
    komisiSalesNominal: product.salesCommission ? String(product.salesCommission.nominal) : '',
    promoPersen: product.promo ? String(product.promo.percent) : '',
    promoNominal: product.promo ? String(product.promo.nominal) : '',
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
    satuan2: '',
    rasio2: '',
    satuan3: '',
    rasio3: '',
    minStockAll: '',
    minStockToko: '',
    rak: '',
    berat: '',
    komisiSalesPersen: '',
    komisiSalesNominal: '',
    promoPersen: '',
    promoNominal: '',
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

export function buildProduct(draft: ProductDraft, base: Product | undefined, id: string): Product {
  const display = parseMin(draft.minDisplay) ?? parseMin(draft.minStockToko ?? '') ?? 0;
  const besar = parseMin(draft.minBesar) ?? 0;
  const keep = base?.baseUnit === draft.baseUnit ? base : undefined;

  // Bangun unit bertingkat bila satuan 2 / 3 diisi
  const units = [...(keep?.units ?? [{ code: draft.baseUnit, name: draft.baseUnit, factor: 1 }])];
  const r2 = Number(draft.rasio2 !== '' ? draft.rasio2 : '0');
  if (draft.satuan2 && r2 > 1 && !units.some((u) => u.code === draft.satuan2)) {
    units.push({ code: draft.satuan2, name: draft.satuan2, factor: r2 });
  }
  const r3 = Number(draft.rasio3 !== '' ? draft.rasio3 : '0');
  if (draft.satuan3 && r3 > 1 && !units.some((u) => u.code === draft.satuan3)) {
    units.push({ code: draft.satuan3, name: draft.satuan3, factor: r3 });
  }

  // Bangun prices
  let prices: Record<string, { eceran: number; grosir: number; kontraktor: number }>;
  if (keep?.prices) {
    prices = { ...keep.prices };
  } else {
    prices = { [draft.baseUnit]: { eceran: 0, grosir: 0, kontraktor: 0 } };
    const ecer1 = Number(draft.hargaEcer1 !== '' ? draft.hargaEcer1 : '0');
    const grosir1 = Number(draft.hargaGrosir1 !== '' ? draft.hargaGrosir1 : '0');
    if (ecer1 > 0 || grosir1 > 0) {
      prices[draft.baseUnit] = {
        eceran: ecer1,
        grosir: grosir1,
        kontraktor: Math.round(grosir1 * 0.95),
      };
    }
    if (draft.satuan2) {
      const ecer2 = Number(draft.hargaEcer2 !== '' ? draft.hargaEcer2 : '0');
      const grosir2 = Number(draft.hargaGrosir2 !== '' ? draft.hargaGrosir2 : '0');
      if (ecer2 > 0 || grosir2 > 0) {
        prices[draft.satuan2] = {
          eceran: ecer2,
          grosir: grosir2,
          kontraktor: Math.round(grosir2 * 0.95),
        };
      }
    }
    if (draft.satuan3) {
      const ecer3 = Number(draft.hargaEcer3 !== '' ? draft.hargaEcer3 : '0');
      const grosir3 = Number(draft.hargaGrosir3 !== '' ? draft.hargaGrosir3 : '0');
      if (ecer3 > 0 || grosir3 > 0) {
        prices[draft.satuan3] = {
          eceran: ecer3,
          grosir: grosir3,
          kontraktor: Math.round(grosir3 * 0.95),
        };
      }
    }
  }

  const hppVal =
    base !== undefined
      ? base.hpp
      : Number(
          draft.hppAvg !== ''
            ? draft.hppAvg
            : draft.hargaBeliAkhir !== ''
              ? draft.hargaBeliAkhir
              : 0,
        );

  return {
    id,
    code: draft.code.trim(),
    barcode: draft.barcode.trim(),
    name: draft.name.trim(),
    brand: draft.brand.trim(),
    category: draft.category.trim(),
    baseUnit: draft.baseUnit,
    allowDecimal: draft.allowDecimal,
    units,
    prices,
    hpp: hppVal,
    minStock: round3(display + besar),
    stock: base?.stock ?? { display: 0, besar: 0 },
    active: base?.active ?? true,
    defaultUnit: draft.defaultUnit === '' ? undefined : draft.defaultUnit,
    photoName: draft.photoName === '' ? undefined : draft.photoName,
    minByWarehouse: { display, besar },
    rak: draft.rak && draft.rak.trim() !== '' ? draft.rak.trim() : base?.rak,
    weight: draft.berat ? Number(draft.berat.replace(',', '.')) : base?.weight,
    salesCommission: draft.komisiSalesPersen
      ? {
          percent: Number(draft.komisiSalesPersen),
          nominal: Number(draft.komisiSalesNominal !== '' ? draft.komisiSalesNominal : '0'),
        }
      : base?.salesCommission,
    promo: draft.promoPersen
      ? {
          percent: Number(draft.promoPersen),
          nominal: Number(draft.promoNominal !== '' ? draft.promoNominal : '0'),
        }
      : base?.promo,
    notes: draft.catatan && draft.catatan.trim() !== '' ? draft.catatan.trim() : base?.notes,
    supplierName:
      draft.supplierName && draft.supplierName.trim() !== ''
        ? draft.supplierName.trim()
        : base?.supplierName,
    lastPurchaseDate: draft.tglBeliAkhir !== '' ? draft.tglBeliAkhir : base?.lastPurchaseDate,
    lastPurchasePrice: draft.hargaBeliAkhir
      ? Number(draft.hargaBeliAkhir)
      : base?.lastPurchasePrice,
    hppAvg: hppVal,
    incoming: base?.incoming ?? 0,
    initialStock: base?.initialStock,
  };
}
