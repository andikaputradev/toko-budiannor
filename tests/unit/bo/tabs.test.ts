import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_PATH,
  MAX_TABS,
  closeTab,
  initialTabs,
  openTab,
  tabKey,
  tabTitleKey,
  type TabState,
} from '../../../src/apps/bo/domain/tabs';

const keys = (state: TabState): string[] => state.tabs.map((tab) => tab.key);

function openAll(paths: readonly string[], from: TabState = initialTabs(DASHBOARD_PATH)): TabState {
  return paths.reduce((state, path) => openTab(state, path).state, from);
}

describe('tabKey', () => {
  it('membuang query dan garis miring penutup', () => {
    expect(tabKey('/bo/stok?filter=minimum')).toBe('/bo/stok');
    expect(tabKey('/bo/barang/')).toBe('/bo/barang');
  });
});

describe('initialTabs', () => {
  it('menaruh Dashboard di kiri dan mengaktifkan rute yang dibuka', () => {
    const state = initialTabs('/bo/barang');
    expect(keys(state)).toEqual([DASHBOARD_PATH, '/bo/barang']);
    expect(state.activeKey).toBe('/bo/barang');
  });

  it('hanya memuat satu tab bila rute awal adalah Dashboard', () => {
    const state = initialTabs(DASHBOARD_PATH);
    expect(keys(state)).toEqual([DASHBOARD_PATH]);
    expect(state.activeKey).toBe(DASHBOARD_PATH);
  });
});

describe('openTab', () => {
  it('menambah tab di kanan dan mengaktifkannya', () => {
    const { state, evicted, changedQuery } = openTab(initialTabs(DASHBOARD_PATH), '/bo/barang');
    expect(keys(state)).toEqual([DASHBOARD_PATH, '/bo/barang']);
    expect(state.activeKey).toBe('/bo/barang');
    expect(evicted).toEqual([]);
    expect(changedQuery).toBe(false);
  });

  it('pada rute yang sudah ada hanya mengaktifkan; query berbeda menandai changedQuery', () => {
    const first = openTab(initialTabs(DASHBOARD_PATH), '/bo/stok?filter=minimum').state;
    const same = openTab(first, '/bo/stok?filter=minimum');
    expect(same.changedQuery).toBe(false);
    expect(keys(same.state)).toEqual([DASHBOARD_PATH, '/bo/stok']);

    const other = openTab(openTab(same.state, '/bo/barang').state, '/bo/stok');
    expect(other.changedQuery).toBe(true);
    expect(keys(other.state)).toEqual([DASHBOARD_PATH, '/bo/stok', '/bo/barang']);
    expect(other.state.activeKey).toBe('/bo/stok');
    expect(other.state.tabs.find((tab) => tab.key === '/bo/stok')?.path).toBe('/bo/stok');
  });

  it('tab ke-11 mengeluarkan tab nonaktif terlama selain Dashboard', () => {
    const paths = Array.from({ length: MAX_TABS - 1 }, (_, index) => `/bo/uji/${String(index)}`);
    const full = openAll(paths);
    expect(full.tabs).toHaveLength(MAX_TABS);

    const result = openTab(full, '/bo/uji/baru');
    expect(result.evicted).toEqual(['/bo/uji/0']);
    expect(result.state.tabs).toHaveLength(MAX_TABS);
    expect(keys(result.state)).toContain(DASHBOARD_PATH);
    expect(result.state.activeKey).toBe('/bo/uji/baru');
  });

  it('memakai urutan pemakaian terakhir, bukan urutan buka, saat mengeluarkan tab', () => {
    const paths = Array.from({ length: MAX_TABS - 1 }, (_, index) => `/bo/uji/${String(index)}`);
    const reused = openTab(openAll(paths), '/bo/uji/0').state;
    const result = openTab(reused, '/bo/uji/baru');
    expect(result.evicted).toEqual(['/bo/uji/1']);
  });
});

describe('closeTab', () => {
  it('tidak menutup Dashboard', () => {
    const state = openAll(['/bo/barang']);
    const result = closeTab(state, DASHBOARD_PATH);
    expect(result.state).toBe(state);
    expect(result.activate).toBeUndefined();
  });

  it('pada tab aktif mengaktifkan tetangga kanan', () => {
    const state = { ...openAll(['/bo/barang', '/bo/stok', '/bo/opname']), activeKey: '/bo/stok' };
    const result = closeTab(state, '/bo/stok');
    expect(result.activate?.key).toBe('/bo/opname');
    expect(result.state.activeKey).toBe('/bo/opname');
    expect(keys(result.state)).toEqual([DASHBOARD_PATH, '/bo/barang', '/bo/opname']);
  });

  it('pada tab aktif paling kanan mengaktifkan tetangga kiri', () => {
    const state = openAll(['/bo/barang', '/bo/stok']);
    const result = closeTab(state, '/bo/stok');
    expect(result.activate?.key).toBe('/bo/barang');
    expect(result.state.activeKey).toBe('/bo/barang');
  });

  it('pada tab nonaktif tidak mengubah tab aktif', () => {
    const state = openAll(['/bo/barang', '/bo/stok']);
    const result = closeTab(state, '/bo/barang');
    expect(result.activate).toBeUndefined();
    expect(result.state.activeKey).toBe('/bo/stok');
    expect(keys(result.state)).toEqual([DASHBOARD_PATH, '/bo/stok']);
  });

  it('mengabaikan kunci yang tidak ada', () => {
    const state = openAll(['/bo/barang']);
    const result = closeTab(state, '/bo/tidak-ada');
    expect(result.state).toBe(state);
    expect(result.activate).toBeUndefined();
  });
});

describe('tabTitleKey', () => {
  it('memakai label entri menu', () => {
    expect(tabTitleKey('/bo/barang')).toBe('menuDataBarang');
    expect(tabTitleKey('/bo/stok?filter=minimum')).toBe('menuDaftarStokMinim');
  });

  it('memakai alias untuk rute di luar menu', () => {
    expect(tabTitleKey('/bo/laporan/arus-kas')).toBe('menuArusKas');
    expect(tabTitleKey('/bo/laporan/neraca')).toBe('menuNeraca');
    expect(tabTitleKey('/bo/master/cetak-barcode')).toBe('menuCetakBarcode');
    expect(tabTitleKey('/bo/pengaturan/rekening')).toBe('menuNoRekening');
  });

  it('mengembalikan undefined untuk rute tak dikenal', () => {
    expect(tabTitleKey('/bo/tidak-ada')).toBeUndefined();
  });
});
