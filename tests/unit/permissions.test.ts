import { describe, expect, it } from 'vitest';
import {
  accessFor,
  actionsOf,
  canOpenScreen,
  isAllowed,
  needsOwnerAuthorization,
  PERMISSION_RULES,
  SCREEN_IDS,
  screensFor,
} from '../../src/shared/permissions';
import { ROLES } from '../../src/shared/data/types';

describe('matriks hak akses Lampiran B', () => {
  it('memuat 148 aturan untuk 43 layar', () => {
    expect(PERMISSION_RULES).toHaveLength(148);
    expect(SCREEN_IDS).toHaveLength(43);
    const screens = new Set(PERMISSION_RULES.map((rule) => rule.screen));
    expect(screens.size).toBe(43);
    for (const screen of SCREEN_IDS) {
      expect(screens.has(screen)).toBe(true);
    }
  });

  it('mengizinkan Owner, Supervisor, dan Kasir pada alur jual POS-02', () => {
    for (const role of ['owner', 'supervisor', 'kasir'] as const) {
      expect(isAllowed(role, 'POS-02', 'Bayar')).toBe(true);
      expect(isAllowed(role, 'POS-02', 'Tahan Bill')).toBe(true);
    }
  });

  it('melarang Kasir menghapus bill dan mengajukan koreksi', () => {
    expect(accessFor('kasir', 'POS-05', 'Hapus Bill')).toBe('tidak');
    expect(accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(accessFor('kasir', 'POS-06', 'Ajukan Koreksi')).toBe('tidak');
    expect(accessFor('supervisor', 'POS-06', 'Ajukan Koreksi')).toBe('ya');
    expect(accessFor('owner', 'POS-06', 'Ajukan Koreksi')).toBe('tidak');
  });

  it('mewajibkan otorisasi Owner bagi Supervisor untuk koreksi transaksi', () => {
    expect(accessFor('owner', 'BO-09', 'Koreksi Transaksi (Otorisasi Owner)')).toBe('ya');
    expect(
      needsOwnerAuthorization('supervisor', 'BO-09', 'Koreksi Transaksi (Otorisasi Owner)'),
    ).toBe(true);
    expect(isAllowed('supervisor', 'BO-09', 'Koreksi Transaksi (Otorisasi Owner)')).toBe(false);
    expect(accessFor('kasir', 'BO-09', 'Koreksi Transaksi (Otorisasi Owner)')).toBe('tidak');
  });

  it('tidak mengizinkan siapa pun menghapus transaksi', () => {
    for (const role of ROLES) {
      expect(accessFor(role, 'BO-09', 'Hapus Transaksi')).toBe('tidak');
    }
  });

  it('membatasi tindakan harga, limit, dan laporan keuangan pada Owner', () => {
    expect(accessFor('owner', 'BO-04', 'Simpan Harga')).toBe('ya');
    expect(accessFor('supervisor', 'BO-04', 'Simpan Harga')).toBe('tidak');
    expect(accessFor('owner', 'BO-11', 'Ubah Limit')).toBe('ya');
    expect(accessFor('supervisor', 'BO-11', 'Ubah Limit')).toBe('tidak');
    expect(accessFor('owner', 'BO-17', 'Tab laporan')).toBe('ya');
    expect(accessFor('supervisor', 'BO-17', 'Tab laporan')).toBe('tidak');
  });

  it('menolak seluruh aksi Back-Office bagi Kasir kecuali menampilkan kata sandi', () => {
    const boRules = PERMISSION_RULES.filter((rule) => rule.screen.startsWith('BO-'));
    for (const rule of boRules) {
      const expected = rule.screen === 'BO-01' && rule.action === 'Tampilkan' ? 'ya' : 'tidak';
      expect(rule.kasir).toBe(expected);
    }
  });

  it('membatasi layar Monitoring Owner pada Owner', () => {
    for (const rule of PERMISSION_RULES.filter((item) => item.screen.startsWith('OWN-'))) {
      expect(rule.supervisor).toBe('tidak');
      expect(rule.kasir).toBe('tidak');
    }
    expect(screensFor('owner')).toHaveLength(38);
    expect(screensFor('kasir').every((screen) => screen.startsWith('POS-'))).toBe(true);
  });

  it('mengatur layar yang boleh dibuka tiap peran', () => {
    expect(canOpenScreen('kasir', 'BO-02')).toBe(false);
    expect(canOpenScreen('supervisor', 'BO-17')).toBe(false);
    expect(canOpenScreen('supervisor', 'BO-21')).toBe(true);
    expect(canOpenScreen('owner', 'OWN-05')).toBe(true);
    expect(canOpenScreen('owner', 'TIDAK-ADA')).toBe(false);
  });
});

describe('peran Frontliner', () => {
  it('hanya mencari barang, menyusun pesanan, menahan bill, dan mencetak struk draf', () => {
    expect(canOpenScreen('frontliner', 'POS-02')).toBe(true);
    expect(isAllowed('frontliner', 'POS-02', 'Cari')).toBe(true);
    expect(isAllowed('frontliner', 'POS-02', 'Kartu produk (ketuk)')).toBe(true);
    expect(isAllowed('frontliner', 'POS-03', 'Papan angka')).toBe(true);
    expect(isAllowed('frontliner', 'POS-02', 'Tahan Bill')).toBe(true);
    expect(isAllowed('frontliner', 'POS-05', 'Cetak Struk Draf')).toBe(true);
  });

  it('tidak dapat menutup pembayaran atau membuka layar pembayaran', () => {
    expect(isAllowed('frontliner', 'POS-02', 'Bayar')).toBe(false);
    expect(canOpenScreen('frontliner', 'POS-04')).toBe(false);
    for (const action of actionsOf('POS-04')) {
      expect(isAllowed('frontliner', 'POS-04', action)).toBe(false);
    }
    expect(isAllowed('frontliner', 'POS-05', 'Hapus Bill')).toBe(false);
    expect(isAllowed('frontliner', 'POS-10', 'Setujui')).toBe(false);
  });

  it('tidak dapat membuka Back-Office, riwayat, biaya kasir, atau monitoring', () => {
    for (const screen of ['POS-06', 'POS-07', 'POS-08', 'POS-09', 'BO-03', 'OWN-02']) {
      expect(canOpenScreen('frontliner', screen)).toBe(false);
    }
    expect(screensFor('frontliner')).toEqual(['POS-01', 'POS-02', 'POS-03', 'POS-05']);
  });
});
