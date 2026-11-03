import type { Role } from '../../../shared/data/types';
import type { LabelKey } from '../../../shared/messages';

export interface MenuEntry {
  readonly path: string;
  readonly label: LabelKey;
  readonly group: LabelKey;
  readonly screenId: string;
}

export const MENU_ENTRIES: readonly MenuEntry[] = [
  {
    path: '/bo/dashboard',
    label: 'menuDashboard',
    group: 'grupRingkasan',
    screenId: 'BO-02',
  },
  {
    path: '/bo/barang',
    label: 'menuBarang',
    group: 'grupBarangStok',
    screenId: 'BO-03',
  },
  {
    path: '/bo/harga',
    label: 'menuHarga',
    group: 'grupBarangStok',
    screenId: 'BO-04',
  },
  {
    path: '/bo/stok',
    label: 'menuStok',
    group: 'grupBarangStok',
    screenId: 'BO-05',
  },
  {
    path: '/bo/mutasi',
    label: 'menuMutasi',
    group: 'grupBarangStok',
    screenId: 'BO-06',
  },
  {
    path: '/bo/opname',
    label: 'menuOpname',
    group: 'grupBarangStok',
    screenId: 'BO-07',
  },
  {
    path: '/bo/penjualan',
    label: 'menuPenjualan',
    group: 'grupPenjualan',
    screenId: 'BO-09',
  },
];

export function menuFor(role: Role): readonly MenuEntry[] {
  if (role !== 'owner' && role !== 'supervisor') {
    return [];
  }
  return MENU_ENTRIES;
}

export function entryFor(path: string): MenuEntry | undefined {
  const normalized = path.split('?')[0] ?? path;
  return MENU_ENTRIES.find((entry) => entry.path === normalized);
}
