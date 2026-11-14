import type { Product } from '../../../shared/data/types';
import { fromBase } from '../../../shared/data/units';
import { formatDecimal } from '../../../shared/format';
import type { AppState } from '../../../shared/store/store';
import { lineSubtotal } from '../../pos/domain/bill';
import { calculateTieredDiscount } from './discount';
import { buildInvoices } from './invoices';

// Logika murni dialog Rincian Barang (gambar klien 12) untuk faktur, PO, dan SO. Aturan diskon BO
// tidak berubah: persen atas harga satuan, nominal per satuan, bertingkat "5+5".

export interface DiscountFields {
  readonly percent: string;
  readonly nominal: string;
}

export type DetailIssue = 'ok' | 'quantity' | 'decimal' | 'price' | 'discount' | 'shipping';

export interface PriceHistoryRow {
  readonly at: string;
  readonly price: number;
  readonly unit: string;
}

// Kuantitas: titik atau koma sebagai desimal. NaN bila kosong atau bukan angka.
export function parseQuantityText(text: string): number {
  const clean = text.trim().replace(',', '.');
  return clean === '' ? Number.NaN : Number(clean);
}

// Harga: titik adalah pemisah ribuan, koma desimal. NaN bila kosong atau bukan angka.
export function parsePriceText(text: string): number {
  const clean = text.trim().replace(/\./g, '').replace(',', '.');
  return clean === '' ? Number.NaN : Number(clean);
}

function percentExpression(text: string): string {
  const clean = text.trim().replace(/,/g, '.').replace(/%/g, '');
  if (clean === '') {
    return '';
  }
  if (clean.includes('+')) {
    const tiers = clean.split('+').map((part) => Number(part.trim()));
    return tiers.every((tier) => Number.isFinite(tier) && tier > 0) ? tiers.join('+') : '';
  }
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? `${String(value)}%` : '';
}

// Mengisi persen mengosongkan nominal dan sebaliknya; bila keduanya terisi, persen yang dipakai.
export function discountExprFrom(input: DiscountFields): string {
  const percent = percentExpression(input.percent);
  if (percent !== '') {
    return percent;
  }
  const value = Number(input.nominal.replace(/[^0-9]/g, ''));
  return value > 0 ? `Rp ${String(value)}` : '';
}

const trimDecimals = (value: number): string => String(Number(value.toFixed(2)));

// Padanan kedua isian untuk ditampilkan saat dialog dibuka atau salah satu isian berubah.
export function discountFields(expr: string, unitPrice: number): DiscountFields {
  const clean = expr.trim();
  const calc = calculateTieredDiscount(unitPrice, clean, 1);
  if (clean === '' || calc.discountPerUnit <= 0) {
    return { percent: '', nominal: '' };
  }
  const nominal = String(calc.discountPerUnit);
  if (clean.includes('+')) {
    return { percent: clean, nominal };
  }
  const isPercent = clean.endsWith('%') || (!/^rp/i.test(clean) && calc.tiers.length > 0);
  return {
    percent: isPercent ? String(calc.tiers[0] ?? 0) : trimDecimals(calc.effectivePercent),
    nominal,
  };
}

export function lineTotal(unitPrice: number, quantity: number, expr: string): number {
  return Math.max(0, calculateTieredDiscount(unitPrice, expr, quantity).finalTotal);
}

// Diskon yang melebihi harga: persen di atas 100 (juga tiap tingkat), atau nominal per satuan di
// atas harga satuan. Ekspresi kosong tidak melebihi apa pun.
export function discountExceedsPrice(expr: string, unitPrice: number): boolean {
  const clean = expr.trim();
  if (clean === '') {
    return false;
  }
  const rupiah = /^rp\s*(\d+(?:[.,]\d+)?)$/i.exec(clean);
  if (rupiah?.[1] !== undefined) {
    return Number(rupiah[1].replace(',', '.')) > unitPrice;
  }
  return clean
    .replace(/%/g, '')
    .split('+')
    .map((part) => Number(part.trim().replace(',', '.')))
    .some((tier) => Number.isFinite(tier) && tier > 100);
}

export function validateDetail(input: {
  readonly quantity: string;
  readonly unitPrice: string;
  readonly allowDecimal: boolean;
  readonly discountExpr?: string;
  readonly shipping?: string;
}): DetailIssue {
  const quantity = parseQuantityText(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'quantity';
  }
  const fractionOk = Math.abs(quantity * 1000 - Math.round(quantity * 1000)) <= 1e-6;
  if ((!input.allowDecimal && !Number.isInteger(quantity)) || !fractionOk) {
    return 'decimal';
  }
  const price = parsePriceText(input.unitPrice);
  if (!Number.isFinite(price) || price < 0) {
    return 'price';
  }
  if (discountExceedsPrice(input.discountExpr ?? '', price)) {
    return 'discount';
  }
  const shipping = parsePriceText(input.shipping ?? '');
  if ((input.shipping ?? '').trim() !== '' && (!Number.isFinite(shipping) || shipping < 0)) {
    return 'shipping';
  }
  return 'ok';
}

export function unitOptions(product: Product): { code: string; factor: number }[] {
  const units = product.units.map((unit) => ({ code: unit.code, factor: unit.factor }));
  return units.length > 0 ? units : [{ code: product.baseUnit, factor: 1 }];
}

export function unitPriceFor(product: Product, unit: string): number {
  return product.prices[unit]?.eceran ?? 0;
}

// Stok gudang dalam satuan terpilih (satuan dasar bila tidak disebut atau tidak dikenal).
export function stockLabel(product: Product, warehouse: 'toko' | 'gudang', unit?: string): string {
  const base = warehouse === 'toko' ? product.stock.display : product.stock.besar;
  const known = unit !== undefined && product.units.some((item) => item.code === unit);
  return formatDecimal(known ? fromBase(product, unit, base) : base);
}

const unitPriceOf = (line: Parameters<typeof lineSubtotal>[0]): number =>
  line.quantity === 0 ? 0 : Math.round(lineSubtotal(line) / line.quantity);

// Harga transaksi terakhir barang: jual dari penjualan POS dan SO, beli dari faktur pemasok dan PO.
// Terbaru dahulu; `unit` menyaring satuan yang sama dengan baris yang sedang diisi.
export function priceHistory(input: {
  readonly state: AppState;
  readonly product: Product;
  readonly kind: 'jual' | 'beli';
  readonly limit: number;
  readonly unit?: string;
}): PriceHistoryRow[] {
  const { state, product } = input;
  const found: PriceHistoryRow[] = [];
  if (input.kind === 'jual') {
    for (const invoice of buildInvoices(state.data, state.salesOrders)) {
      for (const line of invoice.lines) {
        if (line.productId === product.id) {
          found.push({ at: invoice.at, price: unitPriceOf(line), unit: line.unit });
        }
      }
    }
  } else {
    for (const supplier of state.data.suppliers) {
      for (const invoice of supplier.invoices ?? []) {
        for (const line of invoice.lines) {
          if (line.productId === product.id) {
            found.push({ at: invoice.issuedAt, price: unitPriceOf(line), unit: line.unit });
          }
        }
      }
    }
    for (const order of state.purchaseOrders) {
      for (const line of order.lines) {
        if (line.productId === product.id) {
          found.push({ at: order.createdAt, price: line.unitPrice, unit: line.unit });
        }
      }
    }
  }
  return found
    .filter((row) => input.unit === undefined || row.unit === input.unit)
    .sort((first, second) => second.at.localeCompare(first.at))
    .slice(0, input.limit);
}
