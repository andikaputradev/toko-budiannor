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

// Foto kategori hanya untuk barang bangkitan tanpa foto sendiri. Daftar ini eksplisit dan sesuai
// berkas di public/kategori; kategori tanpa slug di sini memakai kotak placeholder.
const CATEGORY_PHOTOS: ReadonlySet<string> = new Set([
  'bahan-dasar',
  'listrik',
  'atap',
  'besi-dan-baja',
  'pengikat',
  'pipa-dan-fitting',
  'cat',
  'perekat',
  'lantai-dan-dinding',
  'kayu',
  'aksesoris-pintu',
  'alat-tangan',
]);

export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryPhoto(category: string): string | undefined {
  const slug = categorySlug(category);
  return CATEGORY_PHOTOS.has(slug) ? `kategori/${slug}.webp` : undefined;
}

export type StockKey = 'toko' | 'gudang';

export interface StockLine {
  readonly key: StockKey;
  readonly quantity: number | undefined;
  readonly unit: string;
}

// Stok pada kartu mengikuti proposal: dalam satuan dasar, bukan dikonversi ke satuan jual. POS
// hanya menampilkan stok Toko dan Gudang; stok PO tidak ditampilkan dan diganti No Rak.
export function stockLines(product: Product): readonly [StockLine, StockLine] {
  const unit = product.baseUnit;
  return [
    { key: 'toko', quantity: product.stock.display, unit },
    { key: 'gudang', quantity: product.stock.besar, unit },
  ];
}

export function rackOf(product: Product): string {
  const rak = product.rak?.trim();
  return rak === undefined || rak === '' ? '-' : rak;
}

// Barang promo: nilai promo persen atau nominal lebih dari nol (kolom Promo pada Data Barang).
export function isPromo(product: Product): boolean {
  return (product.promo?.percent ?? 0) > 0 || (product.promo?.nominal ?? 0) > 0;
}

export const NAME_MAX = 32;

// Nama barang satu baris: lebih dari batas dipotong dan diakhiri elipsis agar tidak turun baris.
export function clipName(name: string, max: number = NAME_MAX): string {
  const clean = name.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

const TIER_TEXT: Readonly<Record<Tier, string>> = {
  eceran: 'ECERAN',
  grosir: 'GROSIR',
};

// Pelanggan terpilih tampil "KODE - NAMA (KATEGORI)"; pelanggan Umum tidak punya kode.
export function customerLabel(customer: Customer | undefined): string {
  return customer === undefined
    ? `${label('pelangganUmum').toUpperCase()} (${TIER_TEXT.eceran})`
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
