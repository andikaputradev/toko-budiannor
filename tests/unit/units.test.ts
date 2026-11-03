import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../src/shared/data/generator';
import {
  breakdownStock,
  convertQuantity,
  fromBase,
  QUANTITY_MESSAGES,
  round3,
  toBase,
  totalStock,
  unitPrice,
  validateQuantity,
} from '../../src/shared/data/units';
import type { Product } from '../../src/shared/data/types';

const dataset = generateDataset();

function find(prefix: string): Product {
  const product = dataset.products.find((item) => item.name.startsWith(prefix));
  if (product === undefined) {
    throw new Error(`Barang ${prefix} tidak ditemukan`);
  }
  return product;
}

const semen = find('Semen');
const kabel = find('Kabel NYM');
const bata = find('Bata Merah');
const cat = find('Cat Kayu dan Besi');

describe('konversi satuan bertingkat', () => {
  it('mengubah Sak ke Kg dan sebaliknya', () => {
    expect(toBase(semen, 'Sak', 1)).toBe(40);
    expect(toBase(semen, 'Sak', 2.5)).toBe(100);
    expect(fromBase(semen, 'Sak', 100)).toBe(2.5);
    expect(convertQuantity(semen, 3, 'Sak', 'Kg')).toBe(120);
    expect(convertQuantity(semen, 10, 'Kg', 'Sak')).toBe(0.25);
  });

  it('mengubah Roll ke Meter dengan pecahan desimal', () => {
    expect(toBase(kabel, 'Roll', 1)).toBe(100);
    expect(toBase(kabel, 'Roll', 0.755)).toBe(75.5);
    expect(convertQuantity(kabel, 12.5, 'Meter', 'Roll')).toBe(0.125);
  });

  it('menangani faktor desimal tiga angka tanpa galat apung', () => {
    expect(toBase(cat, 'Galon', 3)).toBe(11.355);
    expect(fromBase(cat, 'Galon', 11.355)).toBe(3);
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });

  it('menolak satuan yang tidak dikenal', () => {
    expect(() => toBase(semen, 'Truk', 1)).toThrow(RangeError);
    expect(() => unitPrice(semen, 'Truk', 'eceran')).toThrow(RangeError);
  });

  it('mengambil harga per satuan dan tier', () => {
    const eceran = unitPrice(semen, 'Sak', 'eceran');
    const grosir = unitPrice(semen, 'Sak', 'grosir');
    expect(eceran).toBeGreaterThan(grosir);
    expect(unitPrice(semen, 'Kg', 'kontraktor')).toBeLessThanOrEqual(
      unitPrice(semen, 'Kg', 'grosir'),
    );
  });

  it('memecah stok dasar menjadi satuan terbesar lebih dahulu', () => {
    expect(breakdownStock(semen, 85)).toEqual([
      { unit: 'Sak', quantity: 2 },
      { unit: 'Kg', quantity: 5 },
    ]);
    expect(breakdownStock(kabel, 250.5)).toEqual([
      { unit: 'Roll', quantity: 2 },
      { unit: 'Meter', quantity: 50.5 },
    ]);
    expect(breakdownStock(semen, 0)).toEqual([]);
    expect(breakdownStock(semen, -4)).toEqual([{ unit: 'Kg', quantity: -4 }]);
  });

  it('menjumlahkan stok dua gudang', () => {
    expect(totalStock(semen)).toBe(
      Math.round((semen.stock.display + semen.stock.besar) * 1000) / 1000,
    );
  });
});

describe('validasi jumlah', () => {
  it('menerima jumlah desimal sampai tiga angka pada barang desimal', () => {
    expect(validateQuantity(semen, 12.5)).toBe('ok');
    expect(validateQuantity(semen, 0.125)).toBe('ok');
  });

  it('menolak nol, negatif, dan bukan angka', () => {
    expect(validateQuantity(semen, 0)).toBe('not-positive');
    expect(validateQuantity(semen, -1)).toBe('not-positive');
    expect(validateQuantity(semen, Number.NaN)).toBe('invalid');
  });

  it('menolak lebih dari tiga angka di belakang koma', () => {
    expect(validateQuantity(semen, 1.2345)).toBe('too-many-decimals');
  });

  it('menolak pecahan pada barang yang hanya dijual bulat', () => {
    expect(validateQuantity(bata, 2)).toBe('ok');
    expect(validateQuantity(bata, 2.5)).toBe('integer-only');
  });

  it('memetakan setiap masalah ke pesan Lampiran C', () => {
    expect(QUANTITY_MESSAGES).toEqual({
      invalid: 'MSG-030',
      'not-positive': 'MSG-029',
      'too-many-decimals': 'MSG-031',
      'integer-only': 'MSG-032',
    });
  });
});
