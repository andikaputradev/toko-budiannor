import { describe, expect, it } from 'vitest';
import {
  MENU_GROUPS,
  MENU_ENTRIES,
  entryFor,
  menuFor,
  groupFor,
} from '../../../src/apps/bo/domain/menu';

describe('Menu Navigasi Back-Office', () => {
  it('memiliki 8 grup menu utama sesuai bo-menu.png', () => {
    expect(MENU_GROUPS.length).toBe(8);
    expect(MENU_ENTRIES.length).toBeGreaterThan(0);
    const groupIds = MENU_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual([
      'dashboard',
      'master-data',
      'transaksi',
      'mutasi-stok',
      'hutang-piutang',
      'akuntansi',
      'laporan',
      'pengaturan',
    ]);
  });

  it('memetakan path rute ke entri menu dengan benar', () => {
    const dashboard = entryFor('/bo/dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard?.group).toBe('dashboard');

    const barang = entryFor('/bo/barang');
    expect(barang).toBeDefined();
    expect(barang?.group).toBe('master-data');

    const penjualan = entryFor('/bo/penjualan');
    expect(penjualan).toBeDefined();
    expect(penjualan?.group).toBe('transaksi');

    const stok = entryFor('/bo/stok?filter=minimum');
    expect(stok).toBeDefined();
    expect(stok?.group).toBe('mutasi-stok');
  });

  it('menemukan grup berdasarkan ID grup', () => {
    const akuntansi = groupFor('akuntansi');
    expect(akuntansi).toBeDefined();
    expect(akuntansi?.entries.length).toBe(5);
    expect(akuntansi?.entries.map((e) => e.label)).toContain('menuJurnalOtomatis');
  });

  it('menu Master Data tanpa No Rekening: rekening toko dipakai dari Profil Toko (M2)', () => {
    const master = groupFor('master-data');
    expect(master?.entries.map((entry) => entry.path)).toEqual([
      '/bo/barang',
      '/bo/master/kategori',
      '/bo/master/merk',
      '/bo/master/pemasok',
      '/bo/master/pelanggan',
      '/bo/master/sales',
      '/bo/master/ekspedisi',
    ]);
    expect(entryFor('/bo/master/rekening')).toBeUndefined();
    expect(entryFor('/bo/pengaturan/profil')?.group).toBe('pengaturan');
  });

  it('hanya menampilkan menu penuh untuk peran yang berwenang (owner dan supervisor)', () => {
    expect(menuFor('owner').length).toBe(8);
    expect(menuFor('supervisor').length).toBe(8);
    expect(menuFor('kasir').length).toBe(0);
    expect(menuFor('frontliner').length).toBe(0);
  });
});
