import { describe, expect, it, vi } from 'vitest';
import {
  applyAppearance,
  applyTheme,
  DEFAULT_THEME,
  loadMode,
  loadTheme,
  migrateLegacyTheme,
  MODE_KEY,
  parseMode,
  parseTheme,
  POS_MODES,
  POS_THEMES,
  prefersDark,
  resolveScheme,
  saveMode,
  saveTheme,
  THEME_KEY,
  watchScheme,
} from '../../src/apps/pos/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function fakeQuery(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    matches,
    listeners,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener);
    },
    emit(next: boolean) {
      for (const listener of [...listeners]) {
        listener({ matches: next });
      }
    },
  };
}

describe('tema POS', () => {
  it('POS_THEMES berisi delapan palet: enam awal lalu Merah dan Kuning', () => {
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
    expect(DEFAULT_THEME).toBe('oranye');
    expect(POS_MODES).toEqual(['otomatis', 'terang', 'gelap']);
  });

  it('parseTheme jatuh ke Oranye untuk nilai kosong, rusak, atau gelap lama', () => {
    expect(parseTheme(null)).toBe('oranye');
    expect(parseTheme('gelap')).toBe('oranye');
    expect(parseTheme('<script>')).toBe('oranye');
    expect(parseTheme('teal')).toBe('teal');
    expect(parseTheme('ungu')).toBe('ungu');
  });

  it('parseMode jatuh ke otomatis untuk nilai kosong atau tidak dikenal', () => {
    expect(parseMode(null)).toBe('otomatis');
    expect(parseMode('rusak')).toBe('otomatis');
    expect(parseMode('gelap')).toBe('gelap');
    expect(parseMode('terang')).toBe('terang');
  });

  it('resolveScheme: otomatis mengikuti perangkat, terang dan gelap memaksa', () => {
    expect(resolveScheme('otomatis', true)).toBe('gelap');
    expect(resolveScheme('otomatis', false)).toBe('terang');
    expect(resolveScheme('terang', true)).toBe('terang');
    expect(resolveScheme('gelap', false)).toBe('gelap');
  });

  it('migrateLegacyTheme mengubah tema gelap lama menjadi Oranye dengan mode gelap', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'gelap' });
    migrateLegacyTheme(storage);
    expect(storage.data.get(THEME_KEY)).toBe('oranye');
    expect(storage.data.get(MODE_KEY)).toBe('gelap');
  });

  it('migrateLegacyTheme tidak menimpa mode yang sudah dipilih', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'gelap', [MODE_KEY]: 'terang' });
    migrateLegacyTheme(storage);
    expect(storage.data.get(THEME_KEY)).toBe('oranye');
    expect(storage.data.get(MODE_KEY)).toBe('terang');
  });

  it('migrateLegacyTheme tidak menyentuh tema lain dan menelan galat penyimpanan', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'teal' });
    migrateLegacyTheme(storage);
    expect(storage.data.get(THEME_KEY)).toBe('teal');
    expect(storage.data.has(MODE_KEY)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('diblokir');
      },
      setItem: () => {
        throw new Error('penuh');
      },
    };
    expect(() => {
      migrateLegacyTheme(broken);
    }).not.toThrow();
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
    expect(loadTheme({ getItem: () => 'biru' })).toBe('biru');
    expect(loadTheme({ getItem: () => 'gelap' })).toBe('oranye');
    expect(loadTheme({ getItem: () => 'rusak' })).toBe('oranye');
  });

  it('saveTheme menulis kunci dan menelan galat penyimpanan', () => {
    const written: [string, string][] = [];
    saveTheme('hijau', {
      setItem: (key, value) => {
        written.push([key, value]);
      },
    });
    expect(written).toEqual([[THEME_KEY, 'hijau']]);
    const full = {
      setItem: () => {
        throw new Error('penuh');
      },
    };
    expect(() => {
      saveTheme('teal', full);
    }).not.toThrow();
  });

  it('loadMode dan saveMode menelan galat penyimpanan', () => {
    const blocked = {
      getItem: () => {
        throw new Error('diblokir');
      },
      setItem: () => {
        throw new Error('penuh');
      },
    };
    expect(loadMode(blocked)).toBe('otomatis');
    expect(() => {
      saveMode('gelap', blocked);
    }).not.toThrow();
    const storage = memoryStorage();
    saveMode('terang', storage);
    expect(storage.data.get(MODE_KEY)).toBe('terang');
    expect(loadMode(storage)).toBe('terang');
  });

  it('applyTheme menyetel atribut data-pos-theme pada elemen akar', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyTheme(root, 'teal');
    expect(root.dataset['posTheme']).toBe('teal');
  });

  it('applyAppearance menyetel data-pos-theme, data-pos-mode, dan data-pos-scheme pada akar', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyAppearance(root, 'biru', 'otomatis', true);
    expect(root.dataset['posTheme']).toBe('biru');
    expect(root.dataset['posMode']).toBe('otomatis');
    expect(root.dataset['posScheme']).toBe('gelap');
    applyAppearance(root, 'biru', 'terang', true);
    expect(root.dataset['posScheme']).toBe('terang');
  });

  it('watchScheme memanggil pendengar saat perangkat berubah dan berhenti setelah dibatalkan', () => {
    const query = fakeQuery(false);
    const seen: boolean[] = [];
    const stop = watchScheme((dark) => {
      seen.push(dark);
    }, query);
    query.emit(true);
    query.emit(false);
    expect(seen).toEqual([true, false]);
    stop();
    query.emit(true);
    expect(seen).toEqual([true, false]);
    expect(query.listeners.size).toBe(0);
  });

  it('prefersDark membaca hasil kueri dan aman tanpa matchMedia', () => {
    expect(prefersDark(fakeQuery(true))).toBe(true);
    expect(prefersDark(fakeQuery(false))).toBe(false);
    vi.stubGlobal('window', {});
    try {
      expect(prefersDark()).toBe(false);
      const stop = watchScheme(() => undefined);
      expect(() => {
        stop();
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('prefersDark dan watchScheme aman tanpa objek window sama sekali', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(prefersDark()).toBe(false);
      expect(() => {
        watchScheme(() => undefined)();
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
