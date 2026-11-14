import type { Product } from '../../../shared/data/types';
import { promoDiscountExpr } from '../../../shared/domain/promo';
import { lineTotal, unitPriceFor } from './line-detail';

// Baris dokumen Transaksi (faktur, PO, SO) yang dipakai bersama tabel baris dan dialog Rincian Barang.
export interface DocLine {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly code: string;
  readonly warehouse: 'toko' | 'gudang';
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  // Ekspresi diskon BO: "10%", "Rp 2000", atau bertingkat "5+5".
  readonly discountExpr: string;
  // Ongkos kirim per baris (dokumen pembelian dan PO).
  readonly shipping: number;
  // Penanda barang yang dikirim lewat ekspedisi (Faktur Penjualan, kolom Koli).
  readonly koli: boolean;
}

let lineCounter = 0;

export function nextLineId(): string {
  lineCounter += 1;
  return `DL-${String(lineCounter)}`;
}

export function lineAmount(line: DocLine): number {
  return lineTotal(line.unitPrice, line.quantity, line.discountExpr);
}

export function docSummary(lines: readonly DocLine[]): {
  readonly count: number;
  readonly quantity: number;
  readonly subtotal: number;
} {
  return {
    count: lines.length,
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + lineAmount(line), 0),
  };
}

// Total = sub total dikurangi diskon nota ditambah total biaya (ongkos, dan lain-lain), minimal nol.
export function docGrandTotal(subtotal: number, discount: number, extra: number): number {
  return Math.max(0, subtotal - Math.max(0, discount) + Math.max(0, extra));
}

export function moveLine<T>(lines: readonly T[], from: number, to: number): T[] {
  const moved = lines[from];
  if (moved === undefined || from === to || to < 0 || to >= lines.length) {
    return [...lines];
  }
  const rest = lines.filter((_, index) => index !== from);
  rest.splice(to, 0, moved);
  return rest;
}

// Diskon promo bawaan ditulis "15" pada data lama dan "15%" dari dialog; keduanya sama.
export function isPromoExpr(product: Pick<Product, 'promo'>, expr: string): boolean {
  const promo = promoDiscountExpr(product);
  return promo !== '' && (expr === promo || expr === `${promo}%`);
}

// Baris baru dari barang terpilih. Penjualan membawa harga eceran dan diskon promo barang.
// Pembelian mulai dari harga beli terakhir (hanya bila pengguna boleh melihat biaya, yaitu Owner),
// selain itu kosong supaya Supervisor mengetik sendiri tanpa melihat harga beli.
export function createDocLine(
  product: Product,
  kind: 'jual' | 'beli',
  canSeeCost = false,
): DocLine {
  const unit = product.defaultUnit ?? product.baseUnit;
  const promo = kind === 'jual' ? promoDiscountExpr(product) : '';
  const factor = product.units.find((item) => item.code === unit)?.factor ?? 1;
  const unitPrice =
    kind === 'jual'
      ? unitPriceFor(product, unit)
      : canSeeCost
        ? Math.round((product.lastPurchasePrice ?? 0) * factor)
        : 0;
  return {
    id: nextLineId(),
    productId: product.id,
    productName: product.name,
    code: product.code,
    warehouse: product.stock.display > 0 ? 'toko' : 'gudang',
    unit,
    quantity: 1,
    unitPrice,
    discountExpr: promo === '' ? '' : `${promo}%`,
    shipping: 0,
    koli: false,
  };
}
