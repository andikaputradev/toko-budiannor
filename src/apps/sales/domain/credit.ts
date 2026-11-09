import {
  outstanding,
  remainingLimit,
  type ReceivableDecision,
} from '../../../shared/data/receivable';
import type { Customer } from '../../../shared/data/types';
import { overdueRows } from '../../../shared/domain/receivables';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';

export type CreditReason = 'overdue' | 'over-limit';

export interface CreditWarning {
  readonly reason: CreditReason;
  readonly text: string;
}

export function creditWarning(
  decision: ReceivableDecision,
  customer: Customer | undefined,
  now: Date,
): CreditWarning | undefined {
  if (decision.ok || customer === undefined) {
    return undefined;
  }
  if (decision.reason === 'overdue') {
    const row = overdueRows([customer], now)[0];
    return {
      reason: 'overdue',
      text: label('piutangTerlambatSales', {
        jumlah: formatRupiah(row?.amount ?? 0),
        hari: row?.daysLate ?? 0,
      }),
    };
  }
  if (decision.reason === 'over-limit') {
    return {
      reason: 'over-limit',
      text: `${message(decision.messageId, decision.values)} ${label('butuhApprovalOwner')}`,
    };
  }
  return undefined;
}

export interface CreditSummary {
  readonly limit: number;
  readonly outstanding: number;
  readonly remaining: number;
  readonly overdue: { readonly amount: number; readonly daysLate: number } | undefined;
}

// Ringkasan piutang pelanggan untuk validasi di layar Order: limit, terpakai, sisa, dan keterlambatan.
export function creditSummary(customer: Customer, now: Date): CreditSummary {
  const row = overdueRows([customer], now)[0];
  return {
    limit: customer.limit,
    outstanding: outstanding(customer),
    remaining: remainingLimit(customer),
    overdue: row === undefined ? undefined : { amount: row.amount, daysLate: row.daysLate },
  };
}

// Teks banner validasi piutang; ditambah syarat persetujuan bila order berupa piutang atau DP.
export function overdueBanner(summary: CreditSummary, creditSale: boolean): string | undefined {
  if (summary.overdue === undefined) {
    return undefined;
  }
  const base = label('slsPiutangTerlambat', {
    jumlah: formatRupiah(summary.overdue.amount),
    hari: summary.overdue.daysLate,
  });
  return creditSale ? `${base} ${label('butuhApprovalOwner')}` : base;
}
