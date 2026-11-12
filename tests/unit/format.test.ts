import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDayDateTime,
  formatDecimal,
  formatDocumentNumber,
  formatPercent,
  formatRange,
  formatRupiah,
  formatTime,
  parseDecimal,
} from '../../src/shared/format';

describe('formatRupiah', () => {
  it('memakai awalan Rp, spasi, dan titik ribuan', () => {
    expect(formatRupiah(1337000)).toBe('Rp 1.337.000');
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(999)).toBe('Rp 999');
  });

  it('menaruh tanda minus di depan Rp', () => {
    expect(formatRupiah(-337000)).toBe('-Rp 337.000');
  });

  it('membulatkan tanpa angka desimal dan tanpa minus nol', () => {
    expect(formatRupiah(1999.6)).toBe('Rp 2.000');
    expect(formatRupiah(-0.4)).toBe('Rp 0');
  });
});

describe('formatDecimal', () => {
  it('memakai koma dan memangkas nol di belakang', () => {
    expect(formatDecimal(12.5)).toBe('12,5');
    expect(formatDecimal(12)).toBe('12');
    expect(formatDecimal(0.125)).toBe('0,125');
  });

  it('membatasi maksimal tiga angka di belakang koma', () => {
    expect(formatDecimal(1.23456)).toBe('1,235');
  });

  it('menjaga jumlah angka minimum bila diminta', () => {
    expect(formatDecimal(40, 3, 1)).toBe('40,0');
    expect(formatDecimal(20, 3, 1)).toBe('20,0');
  });

  it('memberi titik ribuan dan tanda minus', () => {
    expect(formatDecimal(-1234.5)).toBe('-1.234,5');
  });
});

describe('formatPercent', () => {
  it('memakai koma tanpa spasi sebelum persen', () => {
    expect(formatPercent(12.5)).toBe('12,5%');
    expect(formatPercent(30)).toBe('30%');
  });
});

describe('formatDate dan formatTime', () => {
  it('memakai tanggal WIB dengan bulan tiga huruf', () => {
    expect(formatDate(new Date('2026-10-17T03:00:00Z'))).toBe('17 Okt 2026');
    expect(formatDate(new Date('2026-08-05T00:00:00Z'))).toBe('5 Agu 2026');
  });

  it('menggeser tanggal bila WIB melewati tengah malam UTC', () => {
    expect(formatDate(new Date('2026-10-17T20:00:00Z'))).toBe('18 Okt 2026');
  });

  it('memakai jam 24 WIB', () => {
    expect(formatTime(new Date('2026-10-17T07:32:00Z'))).toBe('14:32');
    expect(formatTime(new Date('2026-10-17T17:05:00Z'))).toBe('00:05');
  });
});

describe('formatDayDateTime', () => {
  it('menaruh hari di depan tanggal, bulan tiga huruf, dan jam WIB', () => {
    expect(formatDayDateTime(new Date('2026-10-19T03:02:00Z'))).toBe(
      'Senin, 19 Okt 2026, 10:02 WIB',
    );
  });

  it('menggeser hari dan tanggal bersama jam saat WIB melewati tengah malam UTC', () => {
    expect(formatDayDateTime(new Date('2026-10-19T17:30:00Z'))).toBe(
      'Selasa, 20 Okt 2026, 00:30 WIB',
    );
  });
});

describe('formatRange', () => {
  it('memakai kata sampai', () => {
    expect(formatRange('17 Okt 2026', '18 Okt 2026')).toBe('17 Okt 2026 sampai 18 Okt 2026');
  });
});

describe('formatDocumentNumber', () => {
  it('memberi awalan dan nomor urut berlebar tetap', () => {
    expect(formatDocumentNumber('T', 103)).toBe('T-000103');
    expect(formatDocumentNumber('B', 3)).toBe('B-0003');
    expect(formatDocumentNumber('M', 2)).toBe('M-0002');
    expect(formatDocumentNumber('SJ', 1)).toBe('SJ-0001');
    expect(formatDocumentNumber('PO', 2)).toBe('PO-0002');
  });

  it('menolak nomor urut tidak valid', () => {
    expect(() => formatDocumentNumber('B', -1)).toThrow(RangeError);
    expect(() => formatDocumentNumber('B', 1.5)).toThrow(RangeError);
  });
});

describe('parseDecimal', () => {
  it('membaca koma desimal dan titik ribuan', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('-3')).toBe(-3);
  });

  it('menolak teks tidak valid dan lebih dari tiga angka di belakang koma', () => {
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('1,2345')).toBeUndefined();
    expect(parseDecimal('')).toBeUndefined();
  });
});
