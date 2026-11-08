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
  it('memuat 156 aturan untuk 43 layar', () => {
    expect(PERMISSION_RULES).toHaveLength(156);
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

  it('menolak seluruh aksi Back-Office bagi Kasir kecuali menampilkan kata sandi dan Simpan Retur', () => {
    const boRules = PERMISSION_RULES.filter((rule) => rule.screen.startsWith('BO-'));
    for (const rule of boRules) {
      const allowed =
        (rule.screen === 'BO-01' && rule.action === 'Tampilkan') ||
        (rule.screen === 'BO-10' && rule.action === 'Simpan Retur');
      expect(rule.kasir, `${rule.screen} ${rule.action}`).toBe(allowed ? 'ya' : 'tidak');
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

describe('hak Retur (perubahan atas proposal, keputusan pemilik proyek 7 November 2026)', () => {
  it('Owner, Supervisor, dan Kasir boleh Simpan Retur; Frontliner dan Sales tidak', () => {
    expect(accessFor('owner', 'BO-10', 'Simpan Retur')).toBe('ya');
    expect(accessFor('supervisor', 'BO-10', 'Simpan Retur')).toBe('ya');
    expect(accessFor('kasir', 'BO-10', 'Simpan Retur')).toBe('ya');
    expect(accessFor('frontliner', 'BO-10', 'Simpan Retur')).toBe('tidak');
    expect(accessFor('sales', 'BO-10', 'Simpan Retur')).toBe('tidak');
  });

  it('jumlah aturan matriks tidak berubah oleh perubahan hak Retur (156 setelah baris Detail Barang dan Open Bill)', () => {
    expect(PERMISSION_RULES).toHaveLength(156);
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

describe('hak Detail Barang POS-03 (revisi POS putaran kedua)', () => {
  it('Diskon dan Ubah Harga: Owner dan Supervisor ya, Kasir otorisasi, Frontliner dan Sales tidak', () => {
    for (const action of ['Diskon', 'Ubah Harga']) {
      expect(accessFor('owner', 'POS-03', action)).toBe('ya');
      expect(accessFor('supervisor', 'POS-03', action)).toBe('ya');
      expect(accessFor('kasir', 'POS-03', action)).toBe('otorisasi');
      expect(needsOwnerAuthorization('kasir', 'POS-03', action)).toBe(true);
      expect(accessFor('frontliner', 'POS-03', action)).toBe('tidak');
      expect(accessFor('sales', 'POS-03', action)).toBe('tidak');
    }
  });

  it('Catatan, Tenaga Penjual, dan Cek Stok terbuka bagi semua peran POS termasuk Frontliner', () => {
    for (const action of ['Catatan', 'Tenaga Penjual', 'Cek Stok']) {
      for (const role of ['owner', 'supervisor', 'kasir', 'frontliner'] as const) {
        expect(accessFor(role, 'POS-03', action)).toBe('ya');
      }
      expect(accessFor('sales', 'POS-03', action)).toBe('tidak');
    }
  });
});

describe('hak Open Bill POS-05 (revisi POS putaran kedua)', () => {
  it('Ubah, Split Bill, dan Merge Bill terbuka bagi Owner, Supervisor, Kasir, dan Frontliner', () => {
    for (const action of ['Ubah', 'Split Bill', 'Merge Bill']) {
      for (const role of ['owner', 'supervisor', 'kasir', 'frontliner'] as const) {
        expect(accessFor(role, 'POS-05', action)).toBe('ya');
      }
      expect(accessFor('sales', 'POS-05', action)).toBe('tidak');
    }
  });

  it('Hapus Bill tetap hanya Owner dan Supervisor sebagai dasar tombol Batalkan', () => {
    expect(accessFor('owner', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(accessFor('kasir', 'POS-05', 'Hapus Bill')).toBe('tidak');
    expect(accessFor('frontliner', 'POS-05', 'Hapus Bill')).toBe('tidak');
  });
});
