import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  PROPOSAL_CUSTOMERS,
  PROPOSAL_PRODUCTS,
  withProposalData,
} from '../../../src/shared/data/proposal';
import type { Product } from '../../../src/shared/data/types';
import { label } from '../../../src/shared/messages';
import {
  categoriesOf,
  categoryPhoto,
  categorySlug,
  customerLabel,
  initialsOf,
  proposalFirst,
  stockLines,
} from '../../../src/apps/pos/domain/catalog-view';

function named(name: string): Product {
  const found = PROPOSAL_PRODUCTS.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`barang tidak ada: ${name}`);
  }
  return found;
}

describe('proposalFirst', () => {
  it('menaruh yang pinned lebih dulu dan menjaga urutan relatif', () => {
    const items = [
      { id: 'a' },
      { id: 'b', pinned: true },
      { id: 'c' },
      { id: 'd', pinned: true },
      { id: 'e', pinned: false },
    ];
    expect(proposalFirst(items).map((item) => item.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('pada dataset aplikasi, tujuh barang proposal berada di depan', () => {
    const data = withProposalData(generateDataset());
    expect(
      proposalFirst(data.products)
        .slice(0, 7)
        .map((item) => item.id),
    ).toEqual(PROPOSAL_PRODUCTS.map((item) => item.id));
  });
});

describe('categoriesOf', () => {
  it('memberi kategori unik dengan kategori proposal lebih dulu', () => {
    const data = withProposalData(generateDataset());
    const categories = categoriesOf(data.products);
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories[0]).toBe('Bahan Dasar');
    expect(categories).toContain('Door & Window');
  });
});

describe('stockLines', () => {
  it('memberi toko, gudang, dan PO dalam satuan dasar', () => {
    expect(stockLines(named('SEMEN GRESIK 40KG'))).toEqual([
      { key: 'toko', quantity: 28, unit: 'SAK' },
      { key: 'gudang', quantity: 800, unit: 'SAK' },
      { key: 'po', quantity: undefined, unit: 'SAK' },
    ]);
    expect(stockLines(named('GEMBOK KODAI 30MM'))).toEqual([
      { key: 'toko', quantity: 0, unit: 'PCS' },
      { key: 'gudang', quantity: 0, unit: 'PCS' },
      { key: 'po', quantity: 240, unit: 'PCS' },
    ]);
  });
});

describe('customerLabel dan initialsOf', () => {
  it('menulis KODE - NAMA (TIER) seperti sketsa proposal', () => {
    const kevin = PROPOSAL_CUSTOMERS.find((item) => item.code === 'PL387');
    expect(customerLabel(kevin)).toBe('PL387 - KEVIN WAHYUDI (RETAIL)');
  });

  it('memakai Pelanggan Umum tanpa pelanggan', () => {
    expect(customerLabel(undefined)).toBe(label('pelangganUmum'));
  });

  it('menulis tier Grosir dan Kontraktor dengan huruf besar', () => {
    const base = PROPOSAL_CUSTOMERS[0];
    if (base === undefined) {
      throw new Error('pelanggan kosong');
    }
    expect(customerLabel({ ...base, tier: 'grosir' })).toContain('(GROSIR)');
    expect(customerLabel({ ...base, tier: 'kontraktor' })).toContain('(KONTRAKTOR)');
  });

  it('inisial dari dua kata pertama', () => {
    expect(initialsOf('Kevin Wahyudi')).toBe('KW');
    expect(initialsOf('CV Laut Mas')).toBe('CL');
    expect(initialsOf('Udin')).toBe('U');
    expect(initialsOf('')).toBe('');
  });
});

describe('foto kategori', () => {
  it('categorySlug mengubah nama kategori menjadi nama berkas', () => {
    expect(categorySlug('Pipa dan Fitting')).toBe('pipa-dan-fitting');
    expect(categorySlug('Besi dan Baja')).toBe('besi-dan-baja');
    expect(categorySlug('Cat')).toBe('cat');
  });

  it('categoryPhoto mengembalikan undefined untuk kategori tanpa foto', () => {
    expect(categoryPhoto('Kategori Fiktif')).toBeUndefined();
    expect(categoryPhoto('')).toBeUndefined();
  });

  it('setiap foto kategori yang terdaftar ada sebagai berkas di public', () => {
    const categories = categoriesOf(generateDataset().products);
    const withPhoto = categories.filter((category) => categoryPhoto(category) !== undefined);
    for (const category of withPhoto) {
      expect(existsSync(`public/${categoryPhoto(category) ?? ''}`), category).toBe(true);
    }
  });

  it('kedua belas kategori barang bangkitan punya foto', () => {
    const categories = categoriesOf(generateDataset().products);
    expect(categories).toHaveLength(12);
    expect(categories.filter((category) => categoryPhoto(category) === undefined)).toEqual([]);
  });
});
