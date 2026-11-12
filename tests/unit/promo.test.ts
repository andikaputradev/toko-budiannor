import { describe, expect, it } from 'vitest';
import {
  commissionPercent,
  parseOptionalPercent,
  promoDiscount,
} from '../../src/shared/domain/promo';

describe('parseOptionalPercent', () => {
  it('kosong berarti tidak diisi (null)', () => {
    expect(parseOptionalPercent('')).toBeNull();
    expect(parseOptionalPercent('  ')).toBeNull();
  });

  it('menerima persen dengan tanda %, koma, atau titik desimal', () => {
    expect(parseOptionalPercent('20%')).toBe(20);
    expect(parseOptionalPercent('20,5')).toBe(20.5);
    expect(parseOptionalPercent('20.5')).toBe(20.5);
    expect(parseOptionalPercent('0')).toBe(0);
    expect(parseOptionalPercent('100')).toBe(100);
  });

  it('menolak di luar 0 sampai 100, negatif, teks, dan lebih dari dua desimal', () => {
    for (const bad of ['101', '-5', 'abc', '10 persen', '1,2,3', '20,567']) {
      expect(parseOptionalPercent(bad), bad).toBeUndefined();
    }
  });
});

describe('promoDiscount', () => {
  it('memakai persen promo sebagai diskon persen', () => {
    expect(promoDiscount({ promo: { percent: 10, nominal: 3000 } }, 12)).toEqual({
      kind: 'persen',
      value: 10,
    });
  });

  it('bila hanya nominal lama, diskon nominal per satuan dasar dikali faktor satuan', () => {
    expect(promoDiscount({ promo: { percent: 0, nominal: 3000 } }, 12)).toEqual({
      kind: 'nominal',
      value: 36_000,
    });
  });

  it('tanpa promo atau promo nol tidak menghasilkan diskon', () => {
    expect(promoDiscount({}, 1)).toBeUndefined();
    expect(promoDiscount({ promo: { percent: 0, nominal: 0 } }, 1)).toBeUndefined();
  });
});

describe('commissionPercent', () => {
  it('memakai persen barang bila terisi', () => {
    expect(commissionPercent({ salesCommission: { percent: 2, nominal: 0 } }, 1)).toBe(2);
  });

  it('memakai persen profil sales bila komisi barang kosong atau nol', () => {
    expect(commissionPercent({}, 1.5)).toBe(1.5);
    expect(commissionPercent({ salesCommission: { percent: 0, nominal: 0 } }, 1.5)).toBe(1.5);
    expect(commissionPercent(undefined, 1)).toBe(1);
  });
});
