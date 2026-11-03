import { round3, unitPrice } from '../../../shared/data/units';
import type { BillLine, Product, Tier, UnitDef } from '../../../shared/data/types';

export const MAX_BILL_LINES = 200;

export type AddResult =
  | { readonly ok: true; readonly lines: readonly BillLine[]; readonly index: number }
  | { readonly ok: false; readonly reason: 'max-lines' };

export function lineSubtotal(line: BillLine): number {
  return Math.round(line.quantity * line.unitPrice);
}

export function billTotal(lines: readonly BillLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

export function itemCount(lines: readonly BillLine[]): number {
  return new Set(lines.map((line) => line.productId)).size;
}

export function defaultUnitOf(product: Product): UnitDef {
  const packaged = product.units[1];
  const base = product.units[0];
  if (base === undefined) {
    throw new RangeError(`Barang ${product.code} tidak punya satuan`);
  }
  return product.baseUnit === 'Kg' && packaged !== undefined ? packaged : base;
}

export function addLine(lines: readonly BillLine[], line: BillLine): AddResult {
  const index = lines.findIndex(
    (item) => item.productId === line.productId && item.unit === line.unit,
  );
  if (index >= 0) {
    const next = lines.map((item, position) =>
      position === index ? { ...item, quantity: round3(item.quantity + line.quantity) } : item,
    );
    return { ok: true, lines: next, index };
  }
  if (lines.length >= MAX_BILL_LINES) {
    return { ok: false, reason: 'max-lines' };
  }
  return { ok: true, lines: [...lines, line], index: lines.length };
}

export function replaceLine(
  lines: readonly BillLine[],
  index: number,
  line: BillLine,
): readonly BillLine[] {
  return lines.map((item, position) => (position === index ? line : item));
}

export function removeLine(lines: readonly BillLine[], index: number): readonly BillLine[] {
  return lines.filter((_, position) => position !== index);
}

export function repriceLines(
  lines: readonly BillLine[],
  products: ReadonlyMap<string, Product>,
  tier: Tier,
): readonly BillLine[] {
  return lines.map((line) => {
    const product = products.get(line.productId);
    return product === undefined
      ? line
      : { ...line, unitPrice: unitPrice(product, line.unit, tier) };
  });
}
