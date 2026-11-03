import type { Dataset } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { DAILY_TARGET, LATE_DAYS_THRESHOLD } from './constants';
import { overdueRows, totalOverdue } from './receivables';
import { summarize } from './summary';

export type NotificationKind = 'stok' | 'piutang' | 'omzet';

export interface OwnerNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly at: string;
  readonly read: boolean;
}

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['stok', 'piutang', 'omzet'];

export function buildNotification(
  kind: NotificationKind,
  data: Dataset,
  now: Date,
  id: string,
  at: Date = now,
): OwnerNotification | undefined {
  const base = { id, kind, at: at.toISOString(), read: false };
  if (kind === 'stok') {
    const low = data.products
      .filter((product) => product.active !== false && totalStock(product) < product.minStock)
      .sort(
        (first, second) =>
          totalStock(first) / Math.max(first.minStock, 1) -
          totalStock(second) / Math.max(second.minStock, 1),
      );
    const worst = low[0];
    if (worst === undefined) {
      return undefined;
    }
    return {
      ...base,
      title: label('notifStokJudul'),
      body: label('notifStokIsi', { jumlah: low.length, nama: worst.name }),
    };
  }
  if (kind === 'piutang') {
    const late = overdueRows(data.customers, now).filter(
      (row) => row.daysLate > LATE_DAYS_THRESHOLD,
    );
    const oldest = late[0];
    if (oldest === undefined) {
      return undefined;
    }
    return {
      ...base,
      title: label('notifPiutangJudul'),
      body: label('notifPiutangIsi', {
        jumlah: late.length,
        total: formatRupiah(totalOverdue(late)),
        nama: oldest.customer.name,
        hari: oldest.daysLate,
      }),
    };
  }
  const revenue = summarize(data, now, 'hari-ini').revenue;
  if (revenue >= DAILY_TARGET) {
    return undefined;
  }
  return {
    ...base,
    title: label('notifOmzetJudul'),
    body: label('notifOmzetIsi', {
      omzet: formatRupiah(revenue),
      target: formatRupiah(DAILY_TARGET),
    }),
  };
}
