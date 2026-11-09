import type { Product, Tier } from '../../../shared/data/types';
import { unitPrice } from '../../../shared/data/units';
import { parsePriceOverride, type OrderLineDraft } from '../../../shared/domain/orders';
import { parseQuantity } from '../../../shared/domain/transfer';
import { formatDecimal } from '../../../shared/format';

export interface LineView {
  readonly quantity: number | undefined;
  /** Harga tier untuk satuan dan tier yang berlaku. */
  readonly listPrice: number;
  /** Harga yang dipakai: harga ubah bila ada, selain itu harga tier. */
  readonly price: number;
  readonly changed: boolean;
  readonly below: boolean;
  readonly subtotal: number;
}

export function lineView(product: Product, line: OrderLineDraft, tier: Tier): LineView {
  const listPrice = unitPrice(product, line.unit, tier);
  const override = parsePriceOverride(line.price);
  const price = override ?? listPrice;
  const quantity = parseQuantity(line.quantity);
  return {
    quantity,
    listPrice,
    price,
    changed: price !== listPrice,
    below: price < listPrice,
    subtotal: quantity === undefined ? 0 : Math.round(quantity * price),
  };
}

export interface DraftTotals {
  readonly total: number;
  readonly items: number;
  readonly changed: number;
  readonly below: number;
}

export function draftTotals(
  lines: readonly OrderLineDraft[],
  lookup: (id: string) => Product | undefined,
  tier: Tier,
): DraftTotals {
  let total = 0;
  let changed = 0;
  let below = 0;
  for (const line of lines) {
    const product = lookup(line.productId);
    if (product === undefined) {
      continue;
    }
    const view = lineView(product, line, tier);
    total += view.subtotal;
    changed += view.changed ? 1 : 0;
    below += view.below ? 1 : 0;
  }
  return { total, items: lines.length, changed, below };
}

// Kolom harga menampilkan angka berpemisah ribuan; selain angka dibuang.
export function formatPriceInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits === '' ? '' : formatDecimal(Number(digits), 0);
}

// Nilai draf dari isi kolom harga: kosong atau sama dengan harga tier berarti tidak diubah.
export function priceFromInput(raw: string, listPrice: number): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (digits === '' || Number(digits) === listPrice) {
    return undefined;
  }
  return String(Number(digits));
}

// Ganti satuan: harga ubah dibuang karena harga tier tiap satuan berbeda.
export function changeUnit(line: OrderLineDraft, unit: string): OrderLineDraft {
  return { productId: line.productId, quantity: line.quantity, unit };
}

export function patchLine(
  lines: readonly OrderLineDraft[],
  index: number,
  patch: Partial<OrderLineDraft>,
): OrderLineDraft[] {
  return lines.map((line, position) => (position === index ? { ...line, ...patch } : line));
}

export function replaceLine(
  lines: readonly OrderLineDraft[],
  index: number,
  next: OrderLineDraft,
): OrderLineDraft[] {
  return lines.map((line, position) => (position === index ? next : line));
}

export function withoutLine(lines: readonly OrderLineDraft[], index: number): OrderLineDraft[] {
  return lines.filter((_, position) => position !== index);
}
