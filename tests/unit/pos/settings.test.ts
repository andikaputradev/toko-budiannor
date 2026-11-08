import { describe, expect, it } from 'vitest';
import {
  CATALOG_VIEW_KEY,
  CATALOG_VIEWS,
  loadCatalogView,
  parseCatalogView,
  saveCatalogView,
} from '../../../src/apps/pos/settings';

function memory(initial: string | null = null) {
  const data = new Map<string, string>();
  if (initial !== null) {
    data.set(CATALOG_VIEW_KEY, initial);
  }
  return {
    data,
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
  };
}

describe('tampilan katalog POS', () => {
  it('menyediakan dua tampilan dengan kartu sebagai bawaan', () => {
    expect([...CATALOG_VIEWS]).toEqual(['kartu', 'daftar']);
    expect(CATALOG_VIEW_KEY).toBe('toko-budiannor-katalog-pos');
    expect(loadCatalogView(memory())).toBe('kartu');
  });

  it('loadCatalogView jatuh ke kartu untuk nilai rusak', () => {
    for (const bad of ['', 'tabel', 'DAFTAR', '1', 'null']) {
      expect(loadCatalogView(memory(bad)), bad).toBe('kartu');
    }
    expect(parseCatalogView(null)).toBe('kartu');
    expect(parseCatalogView('daftar')).toBe('daftar');
    const broken = {
      getItem: (): string | null => {
        throw new Error('penyimpanan diblokir');
      },
    };
    expect(loadCatalogView(broken)).toBe('kartu');
    expect(loadCatalogView(undefined)).toBe('kartu');
  });

  it('saveCatalogView menyimpan pilihan dan tidak melempar saat penyimpanan diblokir', () => {
    const storage = memory();
    saveCatalogView('daftar', storage);
    expect(storage.data.get(CATALOG_VIEW_KEY)).toBe('daftar');
    expect(loadCatalogView(storage)).toBe('daftar');
    const broken = {
      setItem: (): void => {
        throw new Error('penuh');
      },
    };
    expect(() => {
      saveCatalogView('kartu', broken);
    }).not.toThrow();
  });
});
