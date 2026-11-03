import type { SystemMessageId } from '../messages';
import type { Product, Tier, UnitDef } from './types';

export type QuantityIssue =
  'ok' | 'invalid' | 'not-positive' | 'too-many-decimals' | 'integer-only';

export const QUANTITY_MESSAGES: Readonly<Record<Exclude<QuantityIssue, 'ok'>, SystemMessageId>> = {
  invalid: 'MSG-030',
  'not-positive': 'MSG-029',
  'too-many-decimals': 'MSG-031',
  'integer-only': 'MSG-032',
};

export interface StockPart {
  readonly unit: string;
  readonly quantity: number;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function findUnit(product: Product, code: string): UnitDef | undefined {
  return product.units.find((unit) => unit.code === code);
}

function factorOf(product: Product, code: string): number {
  const unit = findUnit(product, code);
  if (unit === undefined) {
    throw new RangeError(`Satuan ${code} tidak dikenal pada ${product.code}`);
  }
  return unit.factor;
}

export function toBase(product: Product, unit: string, quantity: number): number {
  return round3(quantity * factorOf(product, unit));
}

export function fromBase(product: Product, unit: string, baseQuantity: number): number {
  return round3(baseQuantity / factorOf(product, unit));
}

export function convertQuantity(
  product: Product,
  quantity: number,
  from: string,
  to: string,
): number {
  return fromBase(product, to, toBase(product, from, quantity));
}

export function unitPrice(product: Product, unit: string, tier: Tier): number {
  const prices = product.prices[unit];
  if (prices === undefined) {
    throw new RangeError(`Harga untuk satuan ${unit} tidak ada pada ${product.code}`);
  }
  return prices[tier];
}

export function validateQuantity(product: Product, quantity: number): QuantityIssue {
  if (!Number.isFinite(quantity)) {
    return 'invalid';
  }
  if (quantity <= 0) {
    return 'not-positive';
  }
  if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6) {
    return 'too-many-decimals';
  }
  if (!product.allowDecimal && !Number.isInteger(quantity)) {
    return 'integer-only';
  }
  return 'ok';
}

export function breakdownStock(product: Product, baseQuantity: number): StockPart[] {
  if (baseQuantity < 0) {
    return [{ unit: product.baseUnit, quantity: round3(baseQuantity) }];
  }
  let remaining = Math.round(baseQuantity * 1000);
  const parts: StockPart[] = [];
  const descending = [...product.units].sort((first, second) => second.factor - first.factor);
  for (const unit of descending) {
    const size = Math.round(unit.factor * 1000);
    const isBase = unit.factor === 1;
    const count = isBase ? remaining / 1000 : Math.floor(remaining / size);
    if (isBase) {
      remaining = 0;
    } else {
      remaining -= count * size;
    }
    if (count > 0) {
      parts.push({ unit: unit.code, quantity: count });
    }
  }
  return parts;
}

export function totalStock(product: Product): number {
  return round3(product.stock.display + product.stock.besar);
}
