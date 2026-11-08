import type { PaymentMethod } from '../../shared/data/types';
import { label, type LabelKey } from '../../shared/messages';

export const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

// "Tunai", "QRIS Gopay", "Transfer BCA": nama metode diikuti kanalnya bila ada.
export function methodText(method: PaymentMethod, channel: string | undefined): string {
  const base = label(METHOD_LABELS[method]);
  return channel === undefined ? base : `${base} ${channel}`;
}
