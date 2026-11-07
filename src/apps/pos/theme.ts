export const POS_THEMES = ['oranye', 'terakota', 'teal', 'gelap'] as const;
export type PosTheme = (typeof POS_THEMES)[number];

export const DEFAULT_THEME: PosTheme = 'oranye';
export const THEME_KEY = 'toko-budiannor-tema-pos';

export function parseTheme(raw: string | null): PosTheme {
  return POS_THEMES.find((theme) => theme === raw) ?? DEFAULT_THEME;
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

export function applyTheme(root: HTMLElement, theme: PosTheme): void {
  root.dataset['posTheme'] = theme;
}
