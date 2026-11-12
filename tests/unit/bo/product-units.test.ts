import { describe, expect, it } from 'vitest';
import {
  MAX_UNITS,
  UNIT_CODES,
  normalizeRows,
  parseFactor,
  rowsOf,
  toUnitDefs,
  validateUnitRows,
  visibleRows,
  type UnitRowDraft,
} from '../../../src/apps/bo/domain/product-units';
import type { Product } from '../../../src/shared/data/types';

const row = (code: string, factor = ''): UnitRowDraft => ({ code, factor });

describe('parseFactor', () => {
  it('menerima bilangan lebih dari nol dengan koma atau titik desimal', () => {
    expect(parseFactor('12')).toBe(12);
    expect(parseFactor('12,5')).toBe(12.5);
    expect(parseFactor('12.5')).toBe(12.5);
    expect(parseFactor(' 60 ')).toBe(60);
  });

  it('menolak kosong, nol, negatif, dan teks', () => {
    for (const bad of ['', '0', '-3', 'abc', '12 pcs', '1,2,3']) {
      expect(parseFactor(bad), bad).toBeUndefined();
    }
  });
});

describe('visibleRows', () => {
  it('menampilkan satu baris sampai satuan dasar dipilih', () => {
    expect(visibleRows([])).toBe(1);
    expect(visibleRows([row('')])).toBe(1);
  });

  it('menampilkan baris kedua setelah satuan dasar dipilih', () => {
    expect(visibleRows([row('PCS')])).toBe(2);
    expect(visibleRows([row('PCS'), row('LSN')])).toBe(2);
  });

  it('menampilkan baris ketiga hanya bila baris kedua punya kode dan konversi valid', () => {
    expect(visibleRows([row('PCS'), row('LSN', '0')])).toBe(2);
    expect(visibleRows([row('PCS'), row('LSN', '12')])).toBe(3);
    expect(visibleRows([row('PCS'), row('LSN', '12'), row('DOS', '60')])).toBe(MAX_UNITS);
  });
});

describe('normalizeRows', () => {
  it('memangkas spasi dan memotong sampai tiga baris', () => {
    const rows = normalizeRows([
      row(' PCS '),
      row('LSN', ' 12 '),
      row('DOS', '60'),
      row('BOX', '1'),
    ]);
    expect(rows).toEqual([row('PCS'), row('LSN', '12'), row('DOS', '60')]);
  });

  it('membersihkan baris di bawah baris yang kosong', () => {
    expect(normalizeRows([row('PCS'), row(''), row('DOS', '60')])).toEqual([
      row('PCS'),
      row(''),
      row(''),
    ]);
    expect(normalizeRows([row(''), row('LSN', '12')])).toEqual([row(''), row(''), row('')]);
  });

  it('selalu mengembalikan tiga baris', () => {
    expect(normalizeRows([])).toHaveLength(MAX_UNITS);
  });
});

describe('validateUnitRows', () => {
  it('lolos untuk satu, dua, dan tiga satuan yang benar', () => {
    expect(validateUnitRows([row('PCS')])).toBeUndefined();
    expect(validateUnitRows([row('PCS'), row('LSN', '12')])).toBeUndefined();
    expect(validateUnitRows([row('PCS'), row('LSN', '12'), row('DOS', '60')])).toBeUndefined();
  });

  it('menandai satuan dasar yang kosong', () => {
    expect(validateUnitRows([row('')])).toEqual({ field: 'base', row: 0 });
  });

  it('menandai kode ganda tanpa membedakan huruf besar kecil pada baris yang salah', () => {
    expect(validateUnitRows([row('PCS'), row('pcs', '12')])).toEqual({
      field: 'duplicate',
      row: 1,
    });
    expect(validateUnitRows([row('PCS'), row('LSN', '12'), row('lsn', '60')])).toEqual({
      field: 'duplicate',
      row: 2,
    });
  });

  it('menandai konversi yang tidak valid pada baris yang salah', () => {
    expect(validateUnitRows([row('PCS'), row('LSN', '0')])).toEqual({ field: 'factor', row: 1 });
    expect(validateUnitRows([row('PCS'), row('LSN', '12'), row('DOS', '-3')])).toEqual({
      field: 'factor',
      row: 2,
    });
    expect(validateUnitRows([row('PCS'), row('LSN', 'abc')])).toEqual({ field: 'factor', row: 1 });
    expect(validateUnitRows([row('PCS'), row('LSN', '')])).toEqual({ field: 'factor', row: 1 });
  });

  it('mengabaikan baris kosong di bawah satuan terakhir', () => {
    expect(validateUnitRows([row('PCS'), row(''), row('')])).toBeUndefined();
  });
});

describe('toUnitDefs dan rowsOf', () => {
  it('membangun satuan dengan faktor 1, 12, 60 dan mengabaikan baris kosong', () => {
    expect(toUnitDefs([row('PCS'), row('LSN', '12'), row('DOS', '60')])).toEqual([
      { code: 'PCS', name: 'PCS', factor: 1 },
      { code: 'LSN', name: 'LSN', factor: 12 },
      { code: 'DOS', name: 'DOS', factor: 60 },
    ]);
    expect(toUnitDefs([row('PCS'), row(''), row('')])).toEqual([
      { code: 'PCS', name: 'PCS', factor: 1 },
    ]);
  });

  it('rowsOf mengembalikan baris dari satuan produk, faktor desimal berkoma', () => {
    const product = {
      baseUnit: 'KLG',
      units: [
        { code: 'KLG', name: 'KLG', factor: 1 },
        { code: 'LSN', name: 'LSN', factor: 12 },
        { code: 'DOS', name: 'DOS', factor: 72.5 },
      ],
    } as unknown as Product;
    expect(rowsOf(product)).toEqual([row('KLG'), row('LSN', '12'), row('DOS', '72,5')]);
  });
});

describe('UNIT_CODES', () => {
  it('memuat kode dari video klien tanpa duplikat huruf besar kecil', () => {
    const lower = UNIT_CODES.map((code) => code.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    for (const code of ['LSN', 'DOS', 'BOX', 'PCS', 'KRG']) {
      expect(lower).toContain(code.toLowerCase());
    }
  });
});
