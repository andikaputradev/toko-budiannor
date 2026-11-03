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
  const text = (value: number): string => String(value).replace('.', ',');
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
  };
}

export function nextProductId(count: number): string {
  return `P-${String(count + 1).padStart(4, '0')}`;
}

export function buildProduct(draft: ProductDraft, base: Product | undefined, id: string): Product {
  const display = parseMin(draft.minDisplay) ?? 0;
  const besar = parseMin(draft.minBesar) ?? 0;
  const keep = base?.baseUnit === draft.baseUnit ? base : undefined;
  return {
    id,
    code: draft.code.trim(),
    barcode: draft.barcode.trim(),
    name: draft.name.trim(),
    brand: draft.brand.trim(),
    category: draft.category.trim(),
    baseUnit: draft.baseUnit,
    allowDecimal: draft.allowDecimal,
    units: keep?.units ?? [{ code: draft.baseUnit, name: draft.baseUnit, factor: 1 }],
    prices: keep?.prices ?? { [draft.baseUnit]: { eceran: 0, grosir: 0, kontraktor: 0 } },
    hpp: base?.hpp ?? 0,
    minStock: round3(display + besar),
    stock: base?.stock ?? { display: 0, besar: 0 },
    active: base?.active ?? true,
    defaultUnit: draft.defaultUnit === '' ? undefined : draft.defaultUnit,
    photoName: draft.photoName === '' ? undefined : draft.photoName,
    minByWarehouse: { display, besar },
  };
}
