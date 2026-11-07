import { MAX_DUE_DAYS } from './forms';

export const TERM_CHOICES = [7, 30, 45] as const;

const DAY_MS = 86_400_000;

export function dueDateOf(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

// Kosong memakai nilai bawaan; selain itu hanya bilangan bulat 0 sampai 365.
export function parseTermDays(raw: string, fallback: number): number | undefined {
  const text = raw.trim();
  if (text === '') {
    return fallback;
  }
  if (!/^\d+$/.test(text)) {
    return undefined;
  }
  const value = Number(text);
  return value <= MAX_DUE_DAYS ? value : undefined;
}
