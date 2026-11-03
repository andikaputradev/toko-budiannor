import { checkReceivable, type ReceivableDecision } from '../../../shared/data/receivable';
import type { Customer, PaymentMethod } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import type { SystemMessageId } from '../../../shared/messages';

export interface PaymentRow {
  readonly method: PaymentMethod;
  readonly amount: number;
}

export type PaymentStatus = 'empty' | 'short' | 'blocked' | 'ready';

export interface PaymentSummary {
  readonly status: PaymentStatus;
  readonly total: number;
  readonly paid: number;
  readonly change: number;
  readonly shortfall: number;
  readonly receivable: number;
  readonly messageId: SystemMessageId | undefined;
  readonly values: Readonly<Record<string, string>>;
  readonly decision: ReceivableDecision | undefined;
}

export interface PaymentInput {
  readonly total: number;
  readonly rows: readonly PaymentRow[];
  readonly customer: Customer | undefined;
  readonly now: Date;
  readonly ownerApproved: boolean;
}

export const METHODS: readonly PaymentMethod[] = ['tunai', 'qris', 'transfer', 'dp', 'piutang'];
export const QUICK_AMOUNTS: readonly number[] = [50000, 100000, 200000];

const PAID_METHODS = new Set<PaymentMethod>(['tunai', 'qris', 'transfer', 'dp']);

export function paidAmount(rows: readonly PaymentRow[]): number {
  return rows
    .filter((row) => PAID_METHODS.has(row.method))
    .reduce((sum, row) => sum + row.amount, 0);
}

export function usesReceivable(rows: readonly PaymentRow[]): boolean {
  return rows.some((row) => row.method === 'dp' || row.method === 'piutang');
}

export function withMethodAmount(
  rows: readonly PaymentRow[],
  method: PaymentMethod,
  amount: number,
): readonly PaymentRow[] {
  const others = rows.filter((row) => row.method !== method);
  return amount > 0 || method === 'piutang' ? [...others, { method, amount }] : others;
}

export function withoutMethod(
  rows: readonly PaymentRow[],
  method: PaymentMethod,
): readonly PaymentRow[] {
  return rows.filter((row) => row.method !== method);
}

export function remainingDue(
  total: number,
  rows: readonly PaymentRow[],
  skip?: PaymentMethod,
): number {
  const counted = rows.filter((row) => row.method !== skip && row.method !== 'piutang');
  return Math.max(0, total - paidAmount(counted));
}

export function syncReceivableRow(
  rows: readonly PaymentRow[],
  total: number,
): readonly PaymentRow[] {
  if (!rows.some((row) => row.method === 'piutang')) {
    return rows;
  }
  const rest = rows.filter((row) => row.method !== 'piutang');
  return [...rest, { method: 'piutang', amount: Math.max(0, total - paidAmount(rest)) }];
}

export function evaluatePayment(input: PaymentInput): PaymentSummary {
  const { total, rows } = input;
  const paid = paidAmount(rows);
  const base = {
    total,
    paid,
    change: 0,
    shortfall: Math.max(0, total - paid),
    receivable: 0,
    messageId: undefined,
    values: {},
    decision: undefined,
  };
  if (total <= 0) {
    return { ...base, status: 'empty', shortfall: 0 };
  }
  if (!usesReceivable(rows)) {
    if (paid >= total) {
      return { ...base, status: 'ready', change: paid - total, shortfall: 0 };
    }
    return {
      ...base,
      status: 'short',
      messageId: 'MSG-033',
      values: { jumlah: formatRupiah(total - paid) },
    };
  }
  const receivable = Math.max(0, total - paid);
  if (receivable === 0) {
    return { ...base, status: 'ready', shortfall: 0, change: paid - total };
  }
  const decision = checkReceivable(input.customer, receivable, input.now);
  if (decision.ok || input.ownerApproved) {
    return { ...base, status: 'ready', shortfall: 0, receivable, decision };
  }
  return {
    ...base,
    status: 'blocked',
    shortfall: 0,
    receivable,
    messageId: decision.messageId,
    values: decision.values,
    decision,
  };
}
