import type { Product, WarehouseId } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';

export type OpnameStatus = 'draf' | 'diterapkan';

export interface OpnameLine {
  readonly productId: string;
  readonly physical: string;
  readonly note: string;
  readonly systemSnapshot: number | undefined;
}

export interface OpnameDoc {
  readonly number: string;
  readonly warehouse: WarehouseId;
  readonly date: string;
  readonly status: OpnameStatus;
  readonly lines: readonly OpnameLine[];
  readonly appliedBy: string | undefined;
  readonly journalValue: number;
}

export function parsePhysical(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

export function systemStock(product: Product, warehouse: WarehouseId, line: OpnameLine): number {
  return line.systemSnapshot ?? product.stock[warehouse];
}

export function difference(system: number, physical: number): number {
  const value = round3(physical - system);
  return value === 0 ? 0 : value;
}

export interface OpnameIssue {
  readonly messageId: SystemMessageId;
  readonly productId: string | undefined;
}

export function validateDoc(doc: OpnameDoc): OpnameIssue | undefined {
  if (doc.status === 'diterapkan') {
    return { messageId: 'MSG-077', productId: undefined };
  }
  for (const line of doc.lines) {
    if (line.physical.trim() === '') {
      return { messageId: 'MSG-074', productId: line.productId };
    }
    const value = parsePhysical(line.physical);
    if (value === undefined || value < 0) {
      return { messageId: 'MSG-075', productId: line.productId };
    }
  }
  return undefined;
}

export function filledCount(doc: OpnameDoc): number {
  return doc.lines.filter((line) => line.physical.trim() !== '').length;
}
