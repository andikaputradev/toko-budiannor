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

    const penjualan = entryFor('/bo/transaksi/faktur-penjualan');
    expect(penjualan).toBeDefined();
    expect(penjualan?.group).toBe('transaksi');
    // Daftar Nota gabungan diganti dua daftar Faktur sendiri (CATATAN klien 16 November).
    expect(entryFor('/bo/transaksi/daftar-nota')).toBeUndefined();

    const stok = entryFor('/bo/stok?filter=minimum');
    expect(stok).toBeDefined();
    expect(stok?.group).toBe('mutasi-stok');
  });

  it('menemukan grup berdasarkan ID grup', () => {
    const akuntansi = groupFor('akuntansi');
    expect(akuntansi).toBeDefined();
    // Akuntansi satu halaman (gambar klien 24 sampai 28): lima bagian berada di dalam satu tab.
    expect(akuntansi?.entries.map((e) => e.path)).toEqual(['/bo/akuntansi']);
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

  it('entri Laporan membuka kotak pilihan, kecuali halaman Price List (gambar klien 29)', () => {
    const laporan = groupFor('laporan');
    expect(laporan?.entries.map((entry) => [entry.path, entry.dialog])).toEqual([
      ['/bo/laporan/laba-rugi', 'laba-rugi-kotor'],
      ['/bo/laporan/penjualan', 'penjualan'],
      ['/bo/laporan/pembelian', 'pembelian'],
      ['/bo/laporan/hutang-piutang', 'hutang-piutang'],
      ['/bo/laporan/stok', 'stok'],
      ['/bo/laporan/daftar-harga', 'harga'],
      ['/bo/harga', undefined],
    ]);
  });
});
