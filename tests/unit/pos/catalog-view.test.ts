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
  clipName,
  customerLabel,
  initialsOf,
  isPromo,
  proposalFirst,
  rackOf,
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
  it('memberi hanya toko dan gudang dalam satuan dasar; stok PO tidak ditampilkan', () => {
    expect(stockLines(named('SEMEN GRESIK 40KG'))).toEqual([
      { key: 'toko', quantity: 28, unit: 'SAK' },
      { key: 'gudang', quantity: 800, unit: 'SAK' },
    ]);
    expect(stockLines(named('GEMBOK KODAI 30MM'))).toEqual([
      { key: 'toko', quantity: 0, unit: 'PCS' },
      { key: 'gudang', quantity: 0, unit: 'PCS' },
    ]);
  });

  it('No Rak mengganti stok PO dan memakai tanda hubung bila belum diisi', () => {
    expect(rackOf(named('SEMEN GRESIK 40KG'))).toBe('257B');
    expect(rackOf(named('LEM FOX 70 GRAM'))).toBe('118A');
    expect(rackOf({ ...named('SEMEN GRESIK 40KG'), rak: undefined })).toBe('-');
    expect(rackOf({ ...named('SEMEN GRESIK 40KG'), rak: '  ' })).toBe('-');
    for (const product of PROPOSAL_PRODUCTS) {
      expect(rackOf(product), product.name).not.toBe('-');
    }
  });
});

describe('promo dan nama barang', () => {
  it('menandai barang promo hanya bila persen atau nominal promo lebih dari nol', () => {
    expect(isPromo(named('CAT SPRAY PYLOX 109 BLACK'))).toBe(true);
    expect(isPromo(named('SEMEN GRESIK 40KG'))).toBe(false);
    expect(isPromo({ ...named('SEMEN GRESIK 40KG'), promo: { percent: 0, nominal: 0 } })).toBe(
      false,
    );
    expect(isPromo({ ...named('SEMEN GRESIK 40KG'), promo: { percent: 0, nominal: 500 } })).toBe(
      true,
    );
  });

  it('clipName memotong nama panjang menjadi satu baris dengan elipsis', () => {
    expect(clipName('CAT SPRAY PYLOX 109 BLACK')).toBe('CAT SPRAY PYLOX 109 BLACK');
    const long = 'SEMEN TIGA RODA PORTLAND COMPOSITE CEMENT 40KG PREMIUM';
    const clipped = clipName(long);
    expect(clipped.length).toBeLessThanOrEqual(32);
    expect(clipped.endsWith('…')).toBe(true);
    expect(long.startsWith(clipped.slice(0, -1))).toBe(true);
    expect(clipName('ABCDEFGHIJ', 5)).toBe('ABCD…');
    expect(clipName('  ABC  ')).toBe('ABC');
  });
});

describe('customerLabel dan initialsOf', () => {
  it('menulis KODE - NAMA (TIER) seperti sketsa proposal', () => {
    const kevin = PROPOSAL_CUSTOMERS.find((item) => item.code === 'PL387');
    expect(customerLabel(kevin)).toBe('PL387 - KEVIN WAHYUDI (ECERAN)');
  });

  it('memakai Pelanggan Umum tanpa pelanggan', () => {
    expect(customerLabel(undefined)).toBe(`${label('pelangganUmum').toUpperCase()} (ECERAN)`);
  });

  it('menulis tier Eceran dan Grosir dengan huruf besar', () => {
    const base = PROPOSAL_CUSTOMERS[0];
    if (base === undefined) {
      throw new Error('pelanggan kosong');
    }
    expect(customerLabel({ ...base, tier: 'grosir' })).toContain('(GROSIR)');
    expect(customerLabel({ ...base, tier: 'eceran' })).toContain('(ECERAN)');
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
