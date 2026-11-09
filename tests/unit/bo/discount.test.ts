import { describe, expect, it } from 'vitest';
import { calculateTieredDiscount, formatDiscountLabel } from '../../../src/apps/bo/domain/discount';

describe('kalkulasi diskon bertingkat (BO-09/BO-08)', () => {
  it('menghitung diskon bertingkat 5+5 secara akurat', () => {
    // Harga dasar 100.000 x qty 1
    // Diskon ke-1 (5%): 100.000 - 5.000 = 95.000
    // Diskon ke-2 (5%): 95.000 - 4.750 = 90.250
    // Total diskon: 9.750 (efektif 9.75%)
    const res = calculateTieredDiscount(100_000, '5+5', 1);
    expect(res.discountPerUnit).toBe(9_750);
    expect(res.finalUnitPrice).toBe(90_250);
    expect(res.totalDiscount).toBe(9_750);
    expect(res.finalTotal).toBe(90_250);
    expect(res.effectivePercent).toBeCloseTo(9.75, 2);
    expect(res.isTiered).toBe(true);
    expect(res.tiers).toEqual([5, 5]);
  });

  it('menghitung diskon bertingkat untuk qty jamak (20 unit)', () => {
    // Sesuai contoh di form-penjualan.png: Qty 20 x 50.000 = 1.000.000
    // Diskon 5+5:
    // Satuan: 50.000 -> diskon 5% = 2.500 -> 47.500 -> diskon 5% = 2.375 -> 45.125 (diskon per unit: 4.875)
    // Total: 20 x 45.125 = 902.500
    const res = calculateTieredDiscount(50_000, '5+5', 20);
    expect(res.finalUnitPrice).toBe(45_125);
    expect(res.finalTotal).toBe(902_500);
    expect(res.totalDiscount).toBe(97_500);
  });

  it('menghitung diskon bertingkat 3 level 10+5+2.5', () => {
    // 200.000 -> -10% = 180.000 -> -5% = 171.000 -> -2.5% = 166.725
    const res = calculateTieredDiscount(200_000, '10+5+2.5', 1);
    expect(res.finalUnitPrice).toBe(166_725);
    expect(res.discountPerUnit).toBe(33_275);
    expect(res.tiers).toEqual([10, 5, 2.5]);
  });

  it('menghitung diskon persentase tunggal (10% atau 10)', () => {
    const withPercent = calculateTieredDiscount(80_000, '10%', 2);
    expect(withPercent.finalUnitPrice).toBe(72_000);
    expect(withPercent.finalTotal).toBe(144_000);
    expect(withPercent.effectivePercent).toBe(10);

    const withoutPercent = calculateTieredDiscount(80_000, '10', 2);
    expect(withoutPercent.finalUnitPrice).toBe(72_000);
    expect(withoutPercent.finalTotal).toBe(144_000);
  });

  it('menghitung diskon nominal rupiah langsung (> 100 atau diawali Rp)', () => {
    const nominal = calculateTieredDiscount(70_000, '5000', 3);
    expect(nominal.discountPerUnit).toBe(5_000);
    expect(nominal.finalUnitPrice).toBe(65_000);
    expect(nominal.finalTotal).toBe(195_000);
    expect(nominal.isTiered).toBe(false);

    const withPrefix = calculateTieredDiscount(70_000, 'Rp 7.500', 1);
    expect(withPrefix.discountPerUnit).toBe(7_500);
    expect(withPrefix.finalUnitPrice).toBe(62_500);
  });

  it('menangani input kosong atau 0 secara aman tanpa error', () => {
    const empty = calculateTieredDiscount(50_000, '', 5);
    expect(empty.finalUnitPrice).toBe(50_000);
    expect(empty.finalTotal).toBe(250_000);
    expect(empty.discountPerUnit).toBe(0);
    expect(empty.effectivePercent).toBe(0);

    const zero = calculateTieredDiscount(50_000, '0', 1);
    expect(zero.finalUnitPrice).toBe(50_000);
    expect(zero.discountPerUnit).toBe(0);
  });

  it('memformat label ringkas untuk tampilan nota', () => {
    expect(formatDiscountLabel('5+5', 9_750)).toBe('5+5% (Rp 9.750)');
    expect(formatDiscountLabel('10%', 10_000)).toBe('10% (Rp 10.000)');
    expect(formatDiscountLabel('5000', 5_000)).toBe('Rp 5.000');
    expect(formatDiscountLabel('', 0)).toBe('-');
  });
});
