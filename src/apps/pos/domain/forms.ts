export const EXPENSE_KINDS = ['bensin', 'parkir', 'ekspedisi', 'lainnya'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const OPENING_CASH = 1337000;
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
