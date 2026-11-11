import type { RefundMethod, Role, Sale } from '../../../shared/data/types';

export interface Shift {
  readonly userId: string;
  readonly startedAt: string;
  readonly openingCash: number;
}

export interface ShiftSummary {
  readonly openingCash: number;
  readonly cashSales: number;
  readonly expenses: number;
  readonly cashReturns: number;
  readonly closingCash: number;
}

export type MoneyKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000' | 'C' | 'Backspace';

export const REVIEW_OPENING_CASH = 500_000;

const MAX_DIGITS = 12;
const PAID_METHODS = new Set(['tunai', 'qris', 'edc', 'transfer', 'dp']);

export function applyMoneyKey(current: number, key: MoneyKey): number {
  if (key === 'C') {
    return 0;
  }
  if (key === 'Backspace') {
    return Math.floor(current / 10);
  }
  const next = `${current === 0 ? '' : String(current)}${key}`;
  return next.length > MAX_DIGITS ? current : Number(next === '' ? '0' : next);
}

export function needsShift(role: Role, shift: Shift | undefined): boolean {
  return role !== 'frontliner' && shift === undefined;
}

// Tunai bersih sebuah penjualan: baris tunai dan DP bercara tunai, dikurangi kembalian.
// Penjualan tanpa rincian pembayaran (data bawaan lama) tidak menyentuh laci.
export function cashFromSale(sale: Sale): number {
  const rows = sale.payments ?? [];
  const paid = rows
    .filter((row) => PAID_METHODS.has(row.method))
    .reduce((sum, row) => sum + row.amount, 0);
  const cash = rows
    .filter((row) => row.method === 'tunai' || (row.method === 'dp' && row.via === 'tunai'))
    .reduce((sum, row) => sum + row.amount, 0);
  const change = Math.max(0, paid - sale.total);
  return Math.max(0, cash - change);
}

export function summarizeShift(
  shift: Shift,
  sales: readonly Sale[],
  deviceSales: readonly string[],
  expenses: readonly { readonly at: string; readonly amount: number }[],
  returns: readonly {
    readonly at: string;
    readonly refund?: { readonly method: RefundMethod; readonly amount: number } | undefined;
  }[],
): ShiftSummary {
  const mine = new Set(deviceSales);
  const cashSales = sales
    .filter((sale) => mine.has(sale.number) && sale.createdAt >= shift.startedAt)
    .reduce((sum, sale) => sum + cashFromSale(sale), 0);
  const spent = expenses
    .filter((item) => item.at >= shift.startedAt)
    .reduce((sum, item) => sum + item.amount, 0);
  const cashReturns = returns
    .filter((item) => item.at >= shift.startedAt && item.refund?.method === 'tunai')
    .reduce((sum, item) => sum + (item.refund?.amount ?? 0), 0);
  return {
    openingCash: shift.openingCash,
    cashSales,
    expenses: spent,
    cashReturns,
    closingCash: shift.openingCash + cashSales - spent - cashReturns,
  };
}
