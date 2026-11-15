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

// Dua perintah opname lama yang sudah diterapkan: contoh isi Daftar Perintah Stok Opname. Stok sistem
// sudah mencerminkannya (jumlah fisik = stok sekarang); stok sebelum opname dihitung dari selisih contoh.
export function seedOpnames(
  products: readonly Product[],
  users: readonly { readonly id: string; readonly role: string }[],
): readonly OpnameDoc[] {
  const stocked = products.filter(
    (product) => product.active !== false && Number.isInteger(product.stock.display),
  );
  const owner = users.find((user) => user.role === 'owner')?.id ?? 'U-1';
  const supervisor = users.find((user) => user.role === 'supervisor')?.id ?? 'U-2';
  const build = (
    number: string,
    date: string,
    warehouse: WarehouseId,
    appliedBy: string,
    deltas: readonly number[],
  ): OpnameDoc => {
    const lines: OpnameLine[] = [];
    let journalValue = 0;
    deltas.forEach((delta, index) => {
      const product = stocked[index];
      if (product === undefined) {
        return;
      }
      const physical = product.stock[warehouse];
      lines.push({
        productId: product.id,
        physical: String(physical).replace('.', ','),
        note: '',
        systemSnapshot: round3(physical - delta),
      });
      journalValue += delta * product.hpp;
    });
    return {
      number,
      warehouse,
      date,
      status: 'diterapkan',
      lines,
      appliedBy,
      journalValue: Math.round(journalValue),
    };
  };
  return [
    build('OP-0001', '2026-10-05', 'besar', owner, [3, -2, 4]),
    build('OP-0002', '2026-10-12', 'display', supervisor, [-1, 2, -3]),
  ];
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
