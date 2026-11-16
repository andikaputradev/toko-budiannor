import { describe, expect, it } from 'vitest';
import {
  MENU_GROUPS,
  MENU_ENTRIES,
  entryFor,
  menuFor,
  groupFor,
} from '../../../src/apps/bo/domain/menu';

describe('Menu Navigasi Back-Office', () => {
  it('memiliki 7 grup menu sesuai gambar klien 33 (Dashboard jadi tab dasar, bukan entri menu)', () => {
    expect(MENU_GROUPS.length).toBe(7);
    expect(MENU_ENTRIES.length).toBeGreaterThan(0);
    const groupIds = MENU_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual([
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
    // Dashboard dan Surat Jalan tidak ada di laci menu, tetapi rutenya tetap punya judul dan grup.
    const dashboard = entryFor('/bo/dashboard');
    expect(dashboard?.group).toBe('dashboard');
    expect(MENU_GROUPS.some((group) => group.id === 'dashboard')).toBe(false);
    expect(entryFor('/bo/transaksi/surat-jalan')?.group).toBe('transaksi');

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
    expect(menuFor('owner').length).toBe(7);
    expect(menuFor('supervisor').length).toBe(7);
    expect(menuFor('kasir').length).toBe(0);
    expect(menuFor('frontliner').length).toBe(0);
  });

  it('menu Transaksi tanpa Daftar Nota dan Surat Jalan Ekspedisi (gambar klien 33)', () => {
    const transaksi = groupFor('transaksi');
    expect(transaksi?.entries.map((entry) => entry.path)).toEqual([
      '/bo/transaksi/po-pembelian',
      '/bo/transaksi/faktur-pembelian',
      '/bo/transaksi/retur-pembelian',
      '/bo/transaksi/so-penjualan',
      '/bo/transaksi/faktur-penjualan',
      '/bo/transaksi/retur-penjualan',
      '/bo/transaksi/deposit-pelanggan',
    ]);
  });

  it('keenam entri Laporan membuka kotak pilihan (gambar klien 29 dan 33)', () => {
    const laporan = groupFor('laporan');
    expect(laporan?.entries.map((entry) => [entry.path, entry.dialog])).toEqual([
      ['/bo/laporan/laba-rugi', 'laba-rugi-kotor'],
      ['/bo/laporan/penjualan', 'penjualan'],
      ['/bo/laporan/pembelian', 'pembelian'],
      ['/bo/laporan/hutang-piutang', 'hutang-piutang'],
      ['/bo/laporan/stok', 'stok'],
      ['/bo/laporan/daftar-harga', 'harga'],
    ]);
    // Halaman Satuan dan Harga tidak lagi di laci menu, tetapi rutenya tetap dikenal.
    expect(entryFor('/bo/harga')?.group).toBe('laporan');
  });
});
