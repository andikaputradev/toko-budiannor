export const CATALOG_VIEWS = ['kartu', 'daftar'] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export const DEFAULT_CATALOG_VIEW: CatalogView = 'kartu';
export const CATALOG_VIEW_KEY = 'toko-budiannor-katalog-pos';

export function parseCatalogView(raw: string | null): CatalogView {
  return CATALOG_VIEWS.find((view) => view === raw) ?? DEFAULT_CATALOG_VIEW;
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Tampilan katalog layar jual: kartu atau daftar. Nilai rusak atau penyimpanan terblokir memberi kartu.
export function loadCatalogView(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
): CatalogView {
  try {
    return parseCatalogView(storage?.getItem(CATALOG_VIEW_KEY) ?? null);
  } catch {
    return DEFAULT_CATALOG_VIEW;
  }
}

export function saveCatalogView(
  view: CatalogView,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(CATALOG_VIEW_KEY, view);
  } catch {
    // Penyimpanan bisa diblokir atau penuh; pilihan tetap berlaku sampai halaman dimuat ulang.
  }
}
