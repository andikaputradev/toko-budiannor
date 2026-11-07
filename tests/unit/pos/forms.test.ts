import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUE_DAYS,
  isRangeValid,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  parseDueDays,
  parseRupiahInput,
} from '../../../src/apps/pos/domain/forms';

describe('validasi formulir POS', () => {
  it('menerima telepon berawalan 08 atau +62 dengan 9 sampai 14 digit', () => {
    expect(isValidPhone('081234567890')).toBe(true);
    expect(isValidPhone('+6281234567890')).toBe(true);
    expect(isValidPhone('0812-3456-7890')).toBe(true);
    expect(isValidPhone('0812 3456 7890')).toBe(true);
    expect(isValidPhone('08123456')).toBe(false);
    expect(isValidPhone('081234567')).toBe(true);
    expect(isValidPhone('08123456789012')).toBe(true);
    expect(isValidPhone('081234567890123')).toBe(false);
  });

  it('menolak awalan lain dan karakter bukan angka', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('0712345678')).toBe(false);
    expect(isValidPhone('08abc123456')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(normalizePhone(' 0812 3456-7890 ')).toBe('081234567890');
  });

  it('menafsirkan jatuh tempo kosong sebagai bawaan dan membatasi 0 sampai 365', () => {
    expect(parseDueDays('')).toBe(DEFAULT_DUE_DAYS);
    expect(parseDueDays('0')).toBe(0);
    expect(parseDueDays('365')).toBe(365);
    expect(parseDueDays('366')).toBeUndefined();
    expect(parseDueDays('-1')).toBeUndefined();
    expect(parseDueDays('3,5')).toBeUndefined();
    expect(parseDueDays('abc')).toBeUndefined();
  });

  it('memeriksa rentang tanggal dan mengurai rupiah bulat', () => {
    expect(isRangeValid('2026-10-01', '2026-10-19')).toBe(true);
    expect(isRangeValid('2026-10-19', '2026-10-19')).toBe(true);
    expect(isRangeValid('2026-10-20', '2026-10-19')).toBe(false);
    expect(parseRupiahInput('Rp 1.337.000')).toBe(1337000);
    expect(parseRupiahInput('')).toBe(0);
    expect(parseRupiahInput('9'.repeat(20))).toBe(999999999999);
  });

  it('isValidEmail menerima alamat umum, termasuk titik dan tanda plus pada bagian nama', () => {
    expect(isValidEmail('budi@toko.co.id')).toBe(true);
    expect(isValidEmail('a.b+c@mail.example.com')).toBe(true);
    expect(isValidEmail('  kasir@toko-budiannor.id  ')).toBe(true);
  });

  it('isValidEmail menolak kosong, tanpa @, tanpa domain bertitik, spasi, titik ganda, dan dua @', () => {
    for (const bad of [
      '',
      '   ',
      'budi',
      'budi@',
      '@toko.com',
      'budi@toko',
      'budi @toko.com',
      'budi@toko..com',
      '.budi@toko.com',
      'budi@toko.c',
      'a@b@c.com',
    ]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
    expect(isValidEmail(`${'a'.repeat(250)}@toko.com`)).toBe(false);
  });
});
