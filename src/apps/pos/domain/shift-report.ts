import type { PaymentMethod, Sale } from '../../../shared/data/types';
import { rowKey } from './channels';
import type { Shift } from './shift';

export interface MethodTotal {
  readonly key: string;
  readonly method: PaymentMethod | 'retur';
  readonly channel?: string | undefined;
  readonly receipts: number;
  readonly amount: number;
  readonly returns: number;
  readonly refunded: number;
}

export interface ShiftReport {
  readonly byMethod: readonly MethodTotal[];
  readonly receipts: { readonly count: number; readonly amount: number };
  readonly returns: { readonly count: number; readonly amount: number };
  readonly expenses: { readonly count: number; readonly amount: number };
}

export interface ClosedShift {
  readonly id: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly openingCash: number;
  readonly expectedCash: number;
  readonly countedCash: number;
  readonly difference: number;
  readonly report: ShiftReport;
  readonly review: {
    readonly status: 'belum' | 'sudah';
    readonly by?: string | undefined;
    readonly at?: string | undefined;
  };
}

interface ReturnLike {
  readonly at: string;
  readonly refund?:
    | {
        readonly method: PaymentMethod;
        readonly amount: number;
        readonly channel?: string | undefined;
      }
    | undefined;
}

interface Mutable {
  readonly key: string;
  readonly method: PaymentMethod | 'retur';
  readonly channel: string | undefined;
  receipts: number;
  amount: number;
  returns: number;
  refunded: number;
}

const ORDER: readonly (PaymentMethod | 'retur')[] = [
  'tunai',
  'qris',
  'edc',
  'transfer',
  'dp',
  'piutang',
  'retur',
];

// Penerimaan satu penjualan per pasangan metode dan kanal. DP dihitung pada cara bayarnya, baris
// piutang bukan penerimaan, dan kembalian mengurangi tunai.
function received(
  sale: Sale,
): Map<string, { method: PaymentMethod; channel?: string; amount: number }> {
  const rows = new Map<string, { method: PaymentMethod; channel?: string; amount: number }>();
  let paid = 0;
  for (const row of sale.payments ?? []) {
    if (row.method === 'piutang') {
      continue;
    }
    paid += row.amount;
    const method = row.method === 'dp' ? (row.via ?? 'tunai') : row.method;
    const key = rowKey({ method, channel: row.channel });
    const existing = rows.get(key);
    if (existing === undefined) {
      rows.set(key, {
        method,
        ...(row.channel === undefined ? {} : { channel: row.channel }),
        amount: row.amount,
      });
    } else {
      existing.amount += row.amount;
    }
  }
  const change = Math.max(0, paid - sale.total);
  const cash = rows.get(rowKey({ method: 'tunai' }));
  if (cash !== undefined && change > 0) {
    cash.amount = Math.max(0, cash.amount - change);
  }
  return rows;
}

export function buildShiftReport(
  shift: Shift,
  sales: readonly Sale[],
  deviceSales: readonly string[],
  expenses: readonly { readonly at: string; readonly amount: number }[],
  returns: readonly ReturnLike[],
): ShiftReport {
  const mine = new Set(deviceSales);
  const totals = new Map<string, Mutable>();
  const entry = (method: PaymentMethod | 'retur', channel: string | undefined): Mutable => {
    const key = method === 'retur' ? 'retur:' : rowKey({ method, channel });
    let found = totals.get(key);
    if (found === undefined) {
      found = { key, method, channel, receipts: 0, amount: 0, returns: 0, refunded: 0 };
      totals.set(key, found);
    }
    return found;
  };

  let receiptCount = 0;
  let receiptAmount = 0;
  for (const sale of sales) {
    if (!mine.has(sale.number) || sale.createdAt < shift.startedAt) {
      continue;
    }
    const rows = received(sale);
    if (rows.size === 0) {
      continue;
    }
    receiptCount += 1;
    for (const row of rows.values()) {
      const item = entry(row.method, row.channel);
      item.receipts += 1;
      item.amount += row.amount;
      receiptAmount += row.amount;
    }
  }

  let returnCount = 0;
  let returnAmount = 0;
  for (const item of returns) {
    if (item.at < shift.startedAt) {
      continue;
    }
    returnCount += 1;
    const amount = item.refund?.amount ?? 0;
    returnAmount += amount;
    const target =
      item.refund === undefined
        ? entry('retur', undefined)
        : entry(item.refund.method, item.refund.channel);
    target.returns += 1;
    target.refunded += amount;
  }

  const spent = expenses.filter((item) => item.at >= shift.startedAt);
  const byMethod = [...totals.values()].sort((first, second) => {
    const rank = ORDER.indexOf(first.method) - ORDER.indexOf(second.method);
    return rank !== 0 ? rank : (first.channel ?? '').localeCompare(second.channel ?? '');
  });
  return {
    byMethod,
    receipts: { count: receiptCount, amount: receiptAmount },
    returns: { count: returnCount, amount: returnAmount },
    expenses: { count: spent.length, amount: spent.reduce((sum, item) => sum + item.amount, 0) },
  };
}
