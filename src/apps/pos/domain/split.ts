import type { PaidMethod } from '../../../shared/data/types';
import { isValidChannel, rowKey } from './channels';
import { remainingDue, type PaymentRow } from './payment';

// Satu bagian pembayaran pada tab Split; urutannya mengikuti urutan baris pembayaran di sesi.
export interface PaymentPart {
  readonly method: PaidMethod;
  readonly amount: number;
  readonly channel?: string | undefined;
}

// Bagian yang tersimpan di sesi; nominal 0 berarti bagian itu dihapus.
export interface SavedPart {
  readonly method: PaidMethod;
  readonly channel: string | undefined;
  readonly amount: number;
}

export function partOf(row: PaymentRow | undefined): SavedPart | undefined {
  if (row === undefined || row.method === 'dp' || row.method === 'piutang') {
    return undefined;
  }
  return { method: row.method, channel: row.channel, amount: row.amount };
}

// Split Payment dibatasi tiga pembayaran (Pembayaran 1, 2, dan 3).
export const MAX_SPLIT_PARTS = 3;

export type PartCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'nominal' | 'kanal' | 'duplikat' | 'maksimal' };

function rowOf(part: PaymentPart): PaymentRow {
  return part.channel === undefined
    ? { method: part.method, amount: part.amount }
    : { method: part.method, amount: part.amount, channel: part.channel };
}

// Mengganti baris pada indeks itu (atau menambah di akhir bila indeks melewati daftar). Bagian
// kosong atau bernominal nol menghapus baris itu.
export function applyPart(
  rows: readonly PaymentRow[],
  index: number,
  part: PaymentPart | undefined,
): readonly PaymentRow[] {
  const remove = part === undefined || !(part.amount > 0);
  if (remove) {
    return rows.filter((_, position) => position !== index);
  }
  if (index >= rows.length) {
    return [...rows, rowOf(part)];
  }
  return rows.map((row, position) => (position === index ? rowOf(part) : row));
}

export function checkPart(
  rows: readonly PaymentRow[],
  index: number,
  part: PaymentPart,
): PartCheck {
  if (index < 0 || index >= MAX_SPLIT_PARTS) {
    return { ok: false, reason: 'maksimal' };
  }
  if (!Number.isInteger(part.amount) || part.amount <= 0) {
    return { ok: false, reason: 'nominal' };
  }
  if (!isValidChannel(part.method, part.channel)) {
    return { ok: false, reason: 'kanal' };
  }
  const key = rowKey(part);
  if (rows.some((row, position) => position !== index && rowKey(row) === key)) {
    return { ok: false, reason: 'duplikat' };
  }
  return { ok: true };
}

// Batas nominal sebuah bagian: tunai tanpa batas (kembalian), selain tunai paling banyak sisa
// tagihan tanpa menghitung baris pada slot itu sendiri.
export function partLimit(
  rows: readonly PaymentRow[],
  index: number,
  method: PaidMethod,
  total: number,
): number | undefined {
  if (method === 'tunai') {
    return undefined;
  }
  return remainingDue(
    total,
    rows.filter((_, position) => position !== index),
  );
}
