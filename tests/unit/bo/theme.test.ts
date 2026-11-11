import { describe, expect, it } from 'vitest';
import { applyAppearance, loadTheme, saveTheme, POS_THEMES } from '../../../src/shared/theme';

describe('Tema Back-Office', () => {
  it('menyimpan dan memuat pilihan tema yang sama dengan POS', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
    };
    saveTheme('biru', storage);
    expect(loadTheme(storage)).toBe('biru');
  });

  it('memasang atribut tema dan mode pada root Back-Office', () => {
    const root = { dataset: { app: 'bo' } as Record<string, string> } as unknown as HTMLElement;
    applyAppearance(root, 'hijau', 'terang', false);
    expect(root.dataset['posTheme']).toBe('hijau');
    expect(root.dataset['posMode']).toBe('terang');
    expect(root.dataset['posScheme']).toBe('terang');
  });

  it('mendukung seluruh 8 palet POS', () => {
    expect(POS_THEMES).toEqual([
      'oranye',
      'terakota',
      'teal',
      'biru',
      'hijau',
      'ungu',
      'merah',
      'kuning',
    ]);
  });
});
