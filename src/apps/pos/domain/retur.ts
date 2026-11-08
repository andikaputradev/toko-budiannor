import type { RefundMethod, Sale } from '../../../shared/data/types';
import { discountAmount, lineSubtotal } from './bill';
import { label, type LabelKey } from '../../../shared/messages';

export const REFUND_METHODS: readonly RefundMethod[] = ['tunai', 'qris', 'edc', 'transfer'];
export const RETUR_REASONS = ['barang', 'batal', 'salah-bayar', 'lainnya'] as const;
export type ReturReason = (typeof RETUR_REASONS)[number];

export const REASON_LABELS: Readonly<Record<ReturReason, LabelKey>> = {
  barang: 'alasanBarang',
  batal: 'alasanBatal',
  'salah-bayar': 'alasanSalahBayar',
  lainnya: 'alasanLainnya',
};

export interface ReturnInput {
  readonly items: readonly { readonly index: number; readonly quantity: number }[];
  readonly reason: ReturReason;
  readonly note: string;
  readonly refund:
    | {
        readonly method: RefundMethod;
        readonly amount: number;
        readonly channel?: string | undefined;
      }
    | undefined;
  readonly photoName?: string | undefined;
}

function isRefundMethod(method: string): method is RefundMethod {
  return (REFUND_METHODS as readonly string[]).includes(method);
}

// Nilai barang yang diretur: jumlah kali harga transaksi asal, dibulatkan per baris. Baris
// berdiskon dihitung proporsional dari subtotal setelah diskon dan tidak melebihi subtotal itu.
export function itemsValue(sale: Sale, items: ReturnInput['items']): number {
  return items.reduce((sum, item) => {
    const line = sale.lines[item.index];
    if (line === undefined) {
      return sum;
    }
    if (discountAmount(line) === 0) {
      return sum + Math.round(item.quantity * line.unitPrice);
    }
    const subtotal = lineSubtotal(line);
    const share = line.quantity > 0 ? Math.round((subtotal * item.quantity) / line.quantity) : 0;
    return sum + Math.min(subtotal, share);
  }, 0);
}

// Cara kembali bawaan: cara bayar terbesar yang termasuk empat cara kembali (DP memakai
// cara bayar DP-nya); selain itu Tunai. Penjualan lama tanpa rincian memakai `payment`.
export function defaultRefundMethod(sale: Sale): RefundMethod {
  if (sale.payments === undefined) {
    return isRefundMethod(sale.payment) ? sale.payment : 'tunai';
  }
  let best: RefundMethod | undefined;
  let bestAmount = 0;
  for (const row of sale.payments) {
    const method = row.method === 'dp' ? row.via : row.method;
    if (method !== undefined && isRefundMethod(method) && row.amount > bestAmount) {
      best = method;
      bestAmount = row.amount;
    }
  }
  return best ?? 'tunai';
}

export function validateRefundAmount(
  amount: number,
  value: number,
): 'ok' | 'not-positive' | 'too-high' {
  if (!(amount > 0)) {
    return 'not-positive';
  }
  return amount > value ? 'too-high' : 'ok';
}

export function reasonText(reason: ReturReason, note: string): string {
  return reason === 'lainnya' ? note.trim() : label(REASON_LABELS[reason]);
}
