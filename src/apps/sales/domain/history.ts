import type { PaymentMethod, Product, SalesOrder } from '../../../shared/data/types';
import type { IconName } from '../../../shared/icons';
import type { LabelKey } from '../../../shared/messages';
import type { MobTone } from '../../../shared/ui/mobile-card';
import type { ApprovalView } from '../sales-session';

export const APPROVAL_LABELS: Readonly<Record<ApprovalView, LabelKey>> = {
  tidak: 'statusDraf',
  menunggu: 'statusSoMenunggu',
  disetujui: 'statusSoDisetujui',
  ditolak: 'statusSoDitolak',
};

const APPROVAL_TONES: Readonly<Record<ApprovalView, MobTone>> = {
  tidak: 'netral',
  menunggu: 'peringatan',
  disetujui: 'sukses',
  ditolak: 'bahaya',
};

const APPROVAL_ICONS: Readonly<Record<ApprovalView, IconName>> = {
  tidak: 'file-text',
  menunggu: 'clock',
  disetujui: 'circle-check',
  ditolak: 'circle-x',
};

export function approvalLook(view: ApprovalView): {
  readonly tone: MobTone;
  readonly icon: IconName;
  readonly labelKey: LabelKey;
} {
  return {
    tone: APPROVAL_TONES[view],
    icon: APPROVAL_ICONS[view],
    labelKey: APPROVAL_LABELS[view],
  };
}

export const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

export type SyncState = 'tersinkron' | 'menunggu';

// SO dari HP Sales tersimpan lebih dulu di perangkat; tersinkron setelah antrean terkirim.
export function syncState(order: SalesOrder): SyncState {
  return order.synced === false ? 'menunggu' : 'tersinkron';
}

export interface OrderLineRow {
  readonly name: string;
  readonly code: string;
  readonly quantity: number;
  readonly unit: string;
  readonly price: number;
  readonly listPrice: number | undefined;
  readonly subtotal: number;
}

export function orderLineRows(
  order: SalesOrder,
  lookup: (id: string) => Product | undefined,
): OrderLineRow[] {
  return order.lines.map((line) => {
    const product = lookup(line.productId);
    return {
      name: product?.name ?? line.productId,
      code: product?.code ?? line.productId,
      quantity: line.quantity,
      unit: line.unit,
      price: line.unitPrice,
      listPrice: line.listPrice,
      subtotal: Math.round(line.quantity * line.unitPrice),
    };
  });
}

// Sisa tagihan: seluruh total untuk piutang, total dikurangi uang muka untuk DP, selain itu nol.
export function orderOwed(order: SalesOrder): number {
  if (order.payment === 'piutang') {
    return order.total;
  }
  return order.payment === 'dp' ? Math.max(0, order.total - order.downPayment) : 0;
}
