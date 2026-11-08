import type { PaidMethod, PaymentMethod } from '../../../shared/data/types';

// Empat metode proposal tetap. Kanal adalah pilihan di bawahnya: QRIS umum tidak punya kanal,
// dompet digital memakai metode qris, dan bank memakai metode transfer.
export const CHANNELS: Readonly<Record<'qris' | 'transfer', readonly string[]>> = {
  qris: ['Gopay', 'OVO', 'Shopee Pay'],
  transfer: ['BCA', 'BRI', 'Mandiri'],
};

export function channelsOf(method: PaidMethod): readonly string[] {
  return method === 'qris' || method === 'transfer' ? CHANNELS[method] : [];
}

// Kanal kosong selalu sah: QRIS umum, EDC, tunai, dan transfer lama tanpa rincian bank.
export function isValidChannel(method: PaidMethod, channel: string | undefined): boolean {
  return channel === undefined || channelsOf(method).includes(channel);
}

// Satu baris pembayaran dikenali oleh pasangan metode dan kanal.
export function rowKey(row: {
  readonly method: PaymentMethod;
  readonly channel?: string | undefined;
}): string {
  return `${row.method}:${row.channel ?? ''}`;
}
