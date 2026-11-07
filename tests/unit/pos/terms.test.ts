import { describe, expect, it } from 'vitest';
import { dueDateOf, parseTermDays, TERM_CHOICES } from '../../../src/apps/pos/domain/terms';

describe('tempo piutang', () => {
  it('menyediakan pilihan 7, 30, dan 45 hari dari proposal', () => {
    expect(TERM_CHOICES).toEqual([7, 30, 45]);
  });

  it('dueDateOf menambah hari ke tanggal demo', () => {
    const now = new Date('2026-10-19T03:00:00Z');
    expect(dueDateOf(now, 30)).toBe('2026-11-18T03:00:00.000Z');
    expect(dueDateOf(now, 45)).toBe('2026-12-03T03:00:00.000Z');
    expect(dueDateOf(now, 0)).toBe('2026-10-19T03:00:00.000Z');
  });

  it('parseTermDays memakai nilai bawaan saat kosong dan menolak yang tidak sah', () => {
    expect(parseTermDays('', 30)).toBe(30);
    expect(parseTermDays('  ', 14)).toBe(14);
    expect(parseTermDays('0', 30)).toBe(0);
    expect(parseTermDays('365', 30)).toBe(365);
    expect(parseTermDays('366', 30)).toBeUndefined();
    expect(parseTermDays('abc', 30)).toBeUndefined();
    expect(parseTermDays('-1', 30)).toBeUndefined();
    expect(parseTermDays('1,5', 30)).toBeUndefined();
  });
});
