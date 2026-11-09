import { describe, expect, it } from 'vitest';
import { MENU_ENTRIES, entryFor } from '../../../src/apps/bo/domain/menu';

describe('Rute Navigasi Back-Office', () => {
  it('semua entri di MENU_ENTRIES memiliki screenId yang valid', () => {
    for (const entry of MENU_ENTRIES) {
      expect(entry.path).toMatch(/^\/bo\//);
      expect(entry.screenId).toMatch(/^BO-\d{2}$/);
    }
  });

  it('semua submenu dapat dicari dengan entryFor', () => {
    expect(entryFor('/bo/transaksi/po-pembelian')?.screenId).toBe('BO-08');
    expect(entryFor('/bo/akuntansi/jurnal')?.screenId).toBe('BO-18');
    expect(entryFor('/bo/hutang-piutang/saldo-piutang')?.screenId).toBe('BO-11');
    expect(entryFor('/bo/laporan/laba-rugi')?.screenId).toBe('BO-17');
    expect(entryFor('/bo/pengaturan/profil')?.screenId).toBe('BO-22');
  });

  it('memastikan rute hutang piutang terdaftar di BO', () => {
    expect(entryFor('/bo/hutang-piutang/saldo-hutang')?.screenId).toBe('BO-11');
    expect(entryFor('/bo/hutang-piutang/bayar-hutang')?.screenId).toBe('BO-11');
    expect(entryFor('/bo/hutang-piutang/saldo-piutang')?.screenId).toBe('BO-11');
    expect(entryFor('/bo/hutang-piutang/bayar-piutang')?.screenId).toBe('BO-11');
  });

  it('memastikan rute akuntansi dan laporan keuangan terdaftar di BO', () => {
    expect(entryFor('/bo/akuntansi/jurnal')?.screenId).toBe('BO-18');
    expect(entryFor('/bo/akuntansi/beban')?.screenId).toBe('BO-19');
    expect(entryFor('/bo/akuntansi/arus-kas')?.screenId).toBe('BO-18');
    expect(entryFor('/bo/akuntansi/neraca')?.screenId).toBe('BO-18');
    expect(entryFor('/bo/akuntansi/laba-rugi')?.screenId).toBe('BO-17');
    expect(entryFor('/bo/laporan/laba-rugi')?.screenId).toBe('BO-17');
  });

  it('memastikan rute pengaturan, RBAC, barcode, dan audit log terdaftar di BO', () => {
    expect(entryFor('/bo/pengaturan/profil')?.screenId).toBe('BO-22');
    expect(entryFor('/bo/pengaturan/pengguna')?.screenId).toBe('BO-20');
    expect(entryFor('/bo/pengaturan/hak-akses')?.screenId).toBe('BO-20');
    expect(entryFor('/bo/pengaturan/audit-log')?.screenId).toBe('BO-21');
    expect(entryFor('/bo/pengaturan/barcode')?.screenId).toBe('BO-13');
  });
});
