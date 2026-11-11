export const POS_THEMES = [
  'oranye',
  'terakota',
  'teal',
  'biru',
  'hijau',
  'ungu',
  'merah',
  'kuning',
] as const;
export type PosTheme = (typeof POS_THEMES)[number];

export const POS_MODES = ['otomatis', 'terang', 'gelap'] as const;
export type PosMode = (typeof POS_MODES)[number];
export type PosScheme = 'terang' | 'gelap';

export const DEFAULT_THEME: PosTheme = 'oranye';
export const DEFAULT_MODE: PosMode = 'otomatis';
export const THEME_KEY = 'toko-budiannor-tema-pos';
export const MODE_KEY = 'toko-budiannor-mode-pos';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: { readonly matches: boolean }) => void): void;
  removeEventListener(
    type: 'change',
    listener: (event: { readonly matches: boolean }) => void,
  ): void;
}

export function parseTheme(raw: string | null): PosTheme {
  return POS_THEMES.find((theme) => theme === raw) ?? DEFAULT_THEME;
}

export function parseMode(raw: string | null): PosMode {
  return POS_MODES.find((mode) => mode === raw) ?? DEFAULT_MODE;
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadTheme(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
): PosTheme {
  try {
    return parseTheme(storage?.getItem(THEME_KEY) ?? null);
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(
  theme: PosTheme,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // Penyimpanan bisa diblokir atau penuh; tema tetap berlaku untuk sesi ini.
  }
}

export function loadMode(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
): PosMode {
  try {
    return parseMode(storage?.getItem(MODE_KEY) ?? null);
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveMode(
  mode: PosMode,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(MODE_KEY, mode);
  } catch {
    // Penyimpanan bisa diblokir atau penuh; mode tetap berlaku untuk sesi ini.
  }
}

// Tema "gelap" putaran pertama kini adalah mode. Pilihan lama dipindahkan satu kali:
// palet Oranye dengan mode gelap, tanpa menimpa mode yang sudah dipilih.
export function migrateLegacyTheme(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage(),
): void {
  try {
    if (storage?.getItem(THEME_KEY) !== 'gelap') {
      return;
    }
    storage.setItem(THEME_KEY, DEFAULT_THEME);
    if (storage.getItem(MODE_KEY) === null) {
      storage.setItem(MODE_KEY, 'gelap');
    }
  } catch {
    // Penyimpanan bisa diblokir atau penuh; pilihan lama jatuh ke bawaan lewat parseTheme.
  }
}

export function resolveScheme(mode: PosMode, dark: boolean): PosScheme {
  if (mode === 'otomatis') {
    return dark ? 'gelap' : 'terang';
  }
  return mode;
}

function deviceQuery(): MediaQueryListLike | undefined {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : undefined;
  } catch {
    return undefined;
  }
}

export function prefersDark(
  query: Pick<MediaQueryListLike, 'matches'> | undefined = deviceQuery(),
): boolean {
  return query?.matches ?? false;
}

export function watchScheme(
  onChange: (dark: boolean) => void,
  query: MediaQueryListLike | undefined = deviceQuery(),
): () => void {
  if (query === undefined) {
    return () => undefined;
  }
  const listener = (event: { readonly matches: boolean }): void => {
    onChange(event.matches);
  };
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

export function applyTheme(root: HTMLElement, theme: PosTheme): void {
  root.dataset['posTheme'] = theme;
}

export function applyAppearance(
  root: HTMLElement,
  theme: PosTheme,
  mode: PosMode,
  dark: boolean,
): void {
  applyTheme(root, theme);
  root.dataset['posMode'] = mode;
  root.dataset['posScheme'] = resolveScheme(mode, dark);
}
