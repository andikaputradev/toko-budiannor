import { formatDocumentNumber } from '../../../shared/format';

export const EXPENSE_KINDS = ['bensin', 'parkir', 'ekspedisi', 'lainnya'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

// Catatan biaya opsional dibatasi 144 karakter (penghitung 0/144 pada Catat Biaya).
export const EXPENSE_NOTE_MAX = 144;

// Nomor pembayaran biaya, mis. BY-000003, diturunkan dari id biaya "E-3".
export function expenseNumber(id: string): string {
  const sequence = Number(id.replace(/^E-/, ''));
  return formatDocumentNumber('BY', Number.isInteger(sequence) && sequence >= 0 ? sequence : 0);
}

export const MAX_DUE_DAYS = 365;
export const DEFAULT_DUE_DAYS = 30;
export const MAX_NAME_LENGTH = 60;

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

export function isValidPhone(raw: string): boolean {
  const value = normalizePhone(raw);
  if (!/^(\+62|08)\d+$/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, '').length;
  return digits >= 9 && digits <= 14;
}

// Pola sederhana: bagian nama dan domain dipisah satu @, tiap bagian berupa label bertitik tanpa
// titik di awal, akhir, atau ganda; domain minimal dua label dengan label terakhir 2 huruf atau lebih.
const EMAIL_PATTERN = /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(raw: string): boolean {
  const value = raw.trim();
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}

export function isRangeValid(start: string, end: string): boolean {
  return start === '' || end === '' || start <= end;
}

export function parseDueDays(raw: string): number | undefined {
  const text = raw.trim();
  if (text === '') {
    return DEFAULT_DUE_DAYS;
  }
  if (!/^\d+$/.test(text)) {
    return undefined;
  }
  const value = Number(text);
  return value <= MAX_DUE_DAYS ? value : undefined;
}

export function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits === '' ? 0 : Number(digits);
}
