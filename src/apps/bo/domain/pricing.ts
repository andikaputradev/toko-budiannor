import type { Product, TierPrices, UnitDef } from '../../../shared/data/types';
import type { LabelKey, SystemMessageId } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';

export interface PriceRow {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly factor: string;
  readonly barcode: string;
  readonly eceran: string;
  readonly grosir: string;
  readonly kontraktor: string;
  readonly isBase: boolean;
  readonly isNew: boolean;
}

export type PricingField = 'factor' | 'name' | 'barcode' | 'eceran' | 'grosir' | 'kontraktor';

export type PricingIssue =
  | { readonly row: number; readonly field: PricingField; readonly messageId: SystemMessageId }
  | { readonly row: number; readonly field: PricingField; readonly labelKey: LabelKey };

export const BARCODE_PATTERN = /^\d{8,14}$/;

function text(value: number): string {
  return String(value).replace('.', ',');
}

export function rowsOf(product: Product): PriceRow[] {
  return product.units.map((unit, index) => {
    const prices = product.prices[unit.code] ?? { eceran: 0, grosir: 0, kontraktor: 0 };
    return {
      key: `u${String(index)}`,
      code: unit.code,
      name: unit.name,
      factor: text(unit.factor),
      barcode: unit.barcode ?? '',
      eceran: String(prices.eceran),
      grosir: String(prices.grosir),
      kontraktor: String(prices.kontraktor),
      isBase: unit.factor === 1 && index === 0,
      isNew: false,
    };
  });
}

export function parseFactor(raw: string): number | undefined {
  const value = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

export function parsePrice(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

export function validatePricing(rows: readonly PriceRow[]): PricingIssue | undefined {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const name = row.name.trim();
    if (name === '') {
      return { row: index, field: 'name', labelKey: 'namaSatuanKosong' };
    }
    if (seen.has(name.toLowerCase())) {
      return { row: index, field: 'name', messageId: 'MSG-065' };
    }
    seen.add(name.toLowerCase());
    if (!row.isBase) {
      const raw = row.factor.trim().replace(',', '.');
      if (/^\d+\.\d{4,}$/.test(raw)) {
        return { row: index, field: 'factor', messageId: 'MSG-031' };
      }
      const factor = parseFactor(row.factor);
      if (factor === undefined || factor <= 0) {
        return { row: index, field: 'factor', messageId: 'MSG-064' };
      }
    }
    if (row.barcode.trim() !== '' && !BARCODE_PATTERN.test(row.barcode.trim())) {
      return { row: index, field: 'barcode', labelKey: 'barcodeSatuanSalah' };
    }
    const tiers = [
      ['eceran', parsePrice(row.eceran)],
      ['grosir', parsePrice(row.grosir)],
      ['kontraktor', parsePrice(row.kontraktor)],
    ] as const;
    for (const [field, value] of tiers) {
      if (value <= 0) {
        return { row: index, field, messageId: 'MSG-066' };
      }
    }
    if (parsePrice(row.grosir) > parsePrice(row.eceran)) {
      return { row: index, field: 'grosir', messageId: 'MSG-067' };
    }
  }
  return undefined;
}

export function factorOf(row: PriceRow): number {
  return row.isBase ? 1 : (parseFactor(row.factor) ?? 0);
}

export function belowHpp(rows: readonly PriceRow[], hpp: number): number[] {
  const flagged: number[] = [];
  rows.forEach((row, index) => {
    const floor = hpp * factorOf(row);
    if (
      floor > 0 &&
      [row.eceran, row.grosir, row.kontraktor].some((value) => parsePrice(value) < floor)
    ) {
      flagged.push(index);
    }
  });
  return flagged;
}

export function marginPercent(eceran: number, hppUnit: number): number | undefined {
  if (eceran <= 0) {
    return undefined;
  }
  return round3(((eceran - hppUnit) / eceran) * 100);
}

export function buildUnits(rows: readonly PriceRow[]): {
  readonly units: UnitDef[];
  readonly prices: Record<string, TierPrices>;
} {
  const base = rows.filter((row) => row.isBase);
  const others = rows
    .filter((row) => !row.isBase)
    .sort((first, second) => factorOf(first) - factorOf(second));
  const units: UnitDef[] = [];
  const prices: Record<string, TierPrices> = {};
  for (const row of [...base, ...others]) {
    const code = row.isNew || row.code === '' ? row.name.trim() : row.code;
    const barcode = row.barcode.trim();
    units.push({
      code,
      name: row.isNew || row.code === '' ? row.name.trim() : row.name,
      factor: factorOf(row),
      ...(barcode === '' ? {} : { barcode }),
    });
    prices[code] = {
      eceran: parsePrice(row.eceran),
      grosir: parsePrice(row.grosir),
      kontraktor: parsePrice(row.kontraktor),
    };
  }
  return { units, prices };
}

export function describeChanges(product: Product, rows: readonly PriceRow[]): string[] {
  const next = buildUnits(rows);
  const notes: string[] = [];
  for (const unit of next.units) {
    const before = product.prices[unit.code];
    const after = next.prices[unit.code];
    if (after === undefined) {
      continue;
    }
    if (before === undefined) {
      notes.push(`${unit.code} baru`);
      continue;
    }
    for (const tier of ['eceran', 'grosir', 'kontraktor'] as const) {
      if (before[tier] !== after[tier]) {
        notes.push(`${unit.code} ${tier} ${String(before[tier])} menjadi ${String(after[tier])}`);
      }
    }
  }
  return notes;
}
