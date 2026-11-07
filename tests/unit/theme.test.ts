import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  loadTheme,
  parseTheme,
  POS_THEMES,
  saveTheme,
  THEME_KEY,
} from '../../src/apps/pos/theme';

describe('tema POS', () => {
  it('memiliki empat tema dengan Oranye sebagai bawaan', () => {
    expect(POS_THEMES).toEqual(['oranye', 'terakota', 'teal', 'gelap']);
    expect(DEFAULT_THEME).toBe('oranye');
  });

  it('parseTheme jatuh ke Oranye untuk nilai kosong atau tidak dikenal', () => {
    expect(parseTheme(null)).toBe('oranye');
    expect(parseTheme('ungu')).toBe('oranye');
    expect(parseTheme('<script>')).toBe('oranye');
    expect(parseTheme('teal')).toBe('teal');
  });

  it('loadTheme memakai Oranye bila penyimpanan melempar galat', () => {
    const storage = {
      getItem: () => {
        throw new Error('diblokir');
      },
    };
    expect(loadTheme(storage)).toBe('oranye');
  });

  it('loadTheme membaca nilai tersimpan dan mengabaikan nilai rusak', () => {
    expect(loadTheme({ getItem: () => 'gelap' })).toBe('gelap');
    expect(loadTheme({ getItem: () => 'rusak' })).toBe('oranye');
  });

  it('saveTheme menulis kunci dan menelan galat penyimpanan', () => {
    const written: [string, string][] = [];
    saveTheme('gelap', {
      setItem: (key, value) => {
        written.push([key, value]);
      },
    });
    expect(written).toEqual([[THEME_KEY, 'gelap']]);
    const full = {
      setItem: () => {
        throw new Error('penuh');
      },
    };
    expect(() => {
      saveTheme('teal', full);
    }).not.toThrow();
  });

  it('applyTheme menyetel atribut data-pos-theme pada elemen akar', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyTheme(root, 'teal');
    expect(root.dataset['posTheme']).toBe('teal');
  });
});
