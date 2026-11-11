import { checkReceivable, type ReceivableDecision } from '../../../shared/data/receivable';
import type { Customer, PaidMethod, PaymentMethod } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import type { SystemMessageId } from '../../../shared/messages';
import { rowKey } from './channels';

export interface PaymentRow {
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly via?: PaidMethod | undefined;
  readonly channel?: string | undefined;
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

export const METHODS: readonly PaymentMethod[] = [
  'tunai',
  'qris',
  'edc',
  'transfer',
  'dp',
  'piutang',
];
export const CASH_METHODS: readonly PaidMethod[] = ['tunai', 'qris', 'edc', 'transfer'];
const NOTES: readonly number[] = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const BIG_STEP = 50000;

// Dua pecahan uang di atas total untuk tombol cepat Tunai (di samping Uang Pas). Pecahan pertama
// adalah lembar tunggal terkecil yang lebih besar dari total (kelipatan 50.000 bila total sudah
// 100.000 ke atas); pecahan kedua adalah kelipatan 50.000 berikutnya yang lebih besar dari pertama.
// Contoh: 3.500 jadi 5.000 dan 50.000; 8.000 jadi 10.000 dan 50.000; 141.000 jadi 150.000 dan 200.000.
export function cashSuggestions(total: number): readonly number[] {
  if (!(total > 0) || !Number.isFinite(total)) {
    return [];
  }
  const nextBig = (above: number): number => (Math.floor(above / BIG_STEP) + 1) * BIG_STEP;
  const note = NOTES.find((value) => value > total);
  const first = note ?? nextBig(total);
  return [first, nextBig(first)];
}

const PAID_METHODS = new Set<PaymentMethod>(['tunai', 'qris', 'edc', 'transfer', 'dp']);

export function paidAmount(rows: readonly PaymentRow[]): number {
  return rows
    .filter((row) => PAID_METHODS.has(row.method))
    .reduce((sum, row) => sum + row.amount, 0);
}

export function usesReceivable(rows: readonly PaymentRow[]): boolean {
  return rows.some((row) => row.method === 'dp' || row.method === 'piutang');
}

function rowOf(method: PaymentMethod, amount: number, channel?: string): PaymentRow {
  return channel === undefined ? { method, amount } : { method, amount, channel };
}

export function withMethodAmount(
  rows: readonly PaymentRow[],
  method: PaymentMethod,
  amount: number,
  channel?: string,
): readonly PaymentRow[] {
  const key = rowKey({ method, channel });
  const others = rows.filter((row) => rowKey(row) !== key);
  return amount > 0 || method === 'piutang' ? [...others, rowOf(method, amount, channel)] : others;
}

export function withoutMethod(
  rows: readonly PaymentRow[],
  method: PaymentMethod,
  channel?: string,
): readonly PaymentRow[] {
  const key = rowKey({ method, channel });
  return rows.filter((row) => rowKey(row) !== key);
}

export function withDownPayment(
  rows: readonly PaymentRow[],
  amount: number,
  via: PaidMethod,
): readonly PaymentRow[] {
  const others = rows.filter((row) => row.method !== 'dp');
  return amount > 0 ? [...others, { method: 'dp', amount, via }] : others;
}

export function remainingDue(
  total: number,
  rows: readonly PaymentRow[],
  skip?: { readonly method: PaymentMethod; readonly channel?: string | undefined },
): number {
  const skipKey = skip === undefined ? undefined : rowKey(skip);
  const counted = rows.filter((row) => rowKey(row) !== skipKey && row.method !== 'piutang');
  return Math.max(0, total - paidAmount(counted));
}

// Batas nominal satu baris pada mode split: tunai tanpa batas (kembalian), selain tunai
// paling banyak sisa tagihan.
export function maxAmount(
  method: PaidMethod,
  total: number,
  rows: readonly PaymentRow[],
  channel?: string,
): number | undefined {
  return method === 'tunai' ? undefined : remainingDue(total, rows, { method, channel });
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
