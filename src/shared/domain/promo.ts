import type { BillLine, LineDiscount, Product } from '../data/types';
import { findUnit } from '../data/units';

// Isian persen pada Data Barang (Komisi Sales dan Promo). Kosong berarti tidak diisi (null);
// tidak valid (di luar 0 sampai 100, bukan angka, lebih dari dua desimal) mengembalikan undefined.
export function parseOptionalPercent(text: string): number | null | undefined {
  const cleaned = text.replace('%', '').trim().replace(',', '.');
  if (cleaned === '') {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return undefined;
  }
  const value = Number(cleaned);
  return value <= 100 ? value : undefined;
}

// Diskon bawaan pada baris penjualan untuk barang berpromo. Persen berlaku apa adanya; data lama
// yang hanya bernominal dihitung per satuan dasar dan dikali faktor satuan yang dijual.
export function promoDiscount(
  product: Pick<Product, 'promo'>,
  unitFactor: number,
): LineDiscount | undefined {
  const promo = product.promo;
  if (promo === undefined) {
    return undefined;
  }
  if (promo.percent > 0) {
    return { kind: 'persen', value: promo.percent };
  }
  if (promo.nominal > 0) {
    return { kind: 'nominal', value: Math.round(promo.nominal * unitFactor) };
  }
  return undefined;
}

// Komisi sales per baris: persen pada barang bila terisi, selain itu persen pada profil sales.
export function commissionPercent(
  product: Pick<Product, 'salesCommission'> | undefined,
  profilePercent: number,
): number {
  const own = product?.salesCommission?.percent ?? 0;
  return own > 0 ? own : profilePercent;
}

// Baris keranjang yang masih memakai diskon promo bawaan barangnya (belum diubah atau dihapus).
export function isPromoLine(line: BillLine, product: Product): boolean {
  const expected = promoDiscount(product, findUnit(product, line.unit)?.factor ?? 1);
  return (
    expected !== undefined &&
    line.discount?.kind === expected.kind &&
    line.discount.value === expected.value
  );
}

// Ekspresi diskon bertingkat pada Faktur Penjualan BO (mis. "10" atau "10+5"): persen promo barang,
// atau kosong bila barang tidak berpromo persen.
export function promoDiscountExpr(product: Pick<Product, 'promo'>): string {
  const percent = product.promo?.percent ?? 0;
  return percent > 0 ? String(percent) : '';
}
