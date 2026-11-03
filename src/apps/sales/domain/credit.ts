import type { ReceivableDecision } from '../../../shared/data/receivable';
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
