import { describe, expect, it } from 'vitest';
import { sampleProduct } from './support';
import {
  belowHpp,
  buildUnits,
  describeChanges,
  marginPercent,
  parseFactor,
  rowsOf,
  validatePricing,
  type PriceRow,
} from '../../../src/apps/bo/domain/pricing';

const semen = sampleProduct();

function fresh(): PriceRow[] {
  return rowsOf(semen);
}

describe('harga bertingkat', () => {
  it('memuat satuan dasar terlebih dahulu dengan harga dua tier', () => {
    const rows = fresh();
    expect(rows.map((row) => row.name)).toEqual(['Kg', 'Sak']);
    expect(rows[0]?.isBase).toBe(true);
    expect(rows[1]?.factor).toBe('40');
    expect(validatePricing(rows)).toBeUndefined();
  });

  it('menolak isi satuan nol, banyak desimal, dan nama ganda', () => {
    const rows = fresh();
    const bad = (patch: Partial<PriceRow>): PriceRow[] =>
      rows.map((row, index) => (index === 1 ? { ...row, ...patch } : row));
    expect(validatePricing(bad({ factor: '0' }))).toMatchObject({ row: 1, messageId: 'MSG-064' });
    expect(validatePricing(bad({ factor: '' }))).toMatchObject({ row: 1, messageId: 'MSG-064' });
    expect(validatePricing(bad({ factor: '1,2345' }))).toMatchObject({ messageId: 'MSG-031' });
    expect(validatePricing(bad({ name: 'kg' }))).toMatchObject({ row: 1, messageId: 'MSG-065' });
    expect(validatePricing(bad({ name: ' ' }))).toMatchObject({ labelKey: 'namaSatuanKosong' });
  });

  it('menolak harga kosong atau nol dan Grosir lebih tinggi dari Eceran', () => {
    const rows = fresh();
    const withPrice = (field: 'eceran' | 'grosir', value: string): PriceRow[] =>
      rows.map((row, index) => (index === 0 ? { ...row, [field]: value } : row));
    expect(validatePricing(withPrice('eceran', '0'))).toMatchObject({
      field: 'eceran',
      messageId: 'MSG-066',
    });
    expect(validatePricing(withPrice('grosir', ''))).toMatchObject({
      field: 'grosir',
      messageId: 'MSG-066',
    });
    const higher = rows.map((row, index) =>
      index === 0 ? { ...row, eceran: '1000', grosir: '1001' } : row,
    );
    expect(validatePricing(higher)).toMatchObject({ field: 'grosir', messageId: 'MSG-067' });
  });

  it('memeriksa format barcode satuan 8 sampai 14 angka', () => {
    const rows = fresh().map((row, index) => (index === 1 ? { ...row, barcode: '123' } : row));
    expect(validatePricing(rows)).toMatchObject({
      field: 'barcode',
      labelKey: 'barcodeSatuanSalah',
    });
    const ok = rows.map((row, index) => (index === 1 ? { ...row, barcode: '12345678' } : row));
    expect(validatePricing(ok)).toBeUndefined();
  });

  it('menandai harga di bawah HPP per satuan dan menghitung margin Eceran', () => {
    const rows = fresh();
    expect(belowHpp(rows, 0)).toEqual([]);
    const cheap = rows.map((row) => ({ ...row, eceran: '1', grosir: '1' }));
    expect(belowHpp(cheap, semen.hpp)).toEqual([0, 1]);
    expect(marginPercent(1000, 800)).toBe(20);
    expect(marginPercent(0, 800)).toBeUndefined();
    expect(parseFactor('0,02')).toBe(0.02);
    expect(parseFactor('abc')).toBeUndefined();
  });

  it('membangun satuan baru berurutan menurut isi dan menjelaskan perubahan harga', () => {
    const rows: PriceRow[] = [
      ...fresh(),
      {
        key: 'n1',
        code: '',
        name: 'Zak Kecil',
        factor: '0,5',
        barcode: '12345678',
        eceran: '2000',
        grosir: '1800',
        isBase: false,
        isNew: true,
      },
    ];
    const built = buildUnits(rows);
    expect(built.units.map((unit) => unit.code)).toEqual(['Kg', 'Zak Kecil', 'Sak']);
    expect(built.units[1]).toMatchObject({ factor: 0.5, barcode: '12345678' });
    expect(built.prices['Zak Kecil']).toEqual({ eceran: 2000, grosir: 1800 });
    const notes = describeChanges(semen, rows);
    expect(notes).toContain('Zak Kecil baru');
    const changed = rows.map((row, index) => (index === 0 ? { ...row, eceran: '999999' } : row));
    expect(describeChanges(semen, changed)[0]).toContain('Kg eceran');
  });
});
