import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_PROFILE,
  DEFAULT_SYSTEM_USERS,
  DEFAULT_AUDIT_LOGS,
  filterAuditLogs,
  getStructuredRbacMatrix,
} from '../../../src/apps/bo/domain/settings-rbac';

describe('Domain Pengaturan, RBAC, Barcode, & Audit Trail Back Office', () => {
  it('memiliki data profil toko dan konfigurasi hardware yang valid', () => {
    expect(DEFAULT_STORE_PROFILE.name).toBe('Toko Budiannor');
    expect(DEFAULT_STORE_PROFILE.address).toContain('Banjarbaru');
    expect(DEFAULT_STORE_PROFILE.bankAccounts.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_STORE_PROFILE.hardware.printerType).toBe('thermal-80');
    expect(DEFAULT_STORE_PROFILE.cloudBackup.provider).toBe('Google Drive');
  });

  it('memiliki daftar staf sistem dengan peran berjenjang lengkap', () => {
    expect(DEFAULT_SYSTEM_USERS.length).toBeGreaterThanOrEqual(5);
    const roles = DEFAULT_SYSTEM_USERS.map((u) => u.role);
    expect(roles).toContain('owner');
    expect(roles).toContain('supervisor');
    expect(roles).toContain('kasir');
    expect(roles).toContain('frontliner');
  });

  it('memastikan aturan keamanan Frontliner/Pramuniaga dibatasi secara ketat di RBAC', () => {
    const matrix = getStructuredRbacMatrix();
    expect(matrix.length).toBeGreaterThan(0);

    const pos04 = matrix.find((m) => m.screenCode === 'POS-04');
    expect(pos04).toBeDefined();

    // Di POS-04 (pembayaran & closing), Frontliner dilarang
    pos04?.items.forEach((item) => {
      expect(item.frontliner).toBe(false);
      expect(item.owner).toBe(true);
    });

    // Di POS-05 (hold bill), Frontliner diizinkan simpan draf
    const pos05 = matrix.find((m) => m.screenCode === 'POS-05');
    const draftAction = pos05?.items.find((it) => it.action.includes('Cetak Struk Draf'));
    expect(draftAction?.frontliner).toBe(true);
  });

  it('dapat memfilter log aktivitas audit trail dengan kriteria tertentu', () => {
    expect(DEFAULT_AUDIT_LOGS.length).toBeGreaterThanOrEqual(8);

    const filterKasir = filterAuditLogs(DEFAULT_AUDIT_LOGS, { username: 'kasir_siti' });
    expect(filterKasir.length).toBeGreaterThanOrEqual(2);

    const filterDitolak = filterAuditLogs(DEFAULT_AUDIT_LOGS, { status: 'ditolak' });
    expect(filterDitolak).toHaveLength(1);
    expect(filterDitolak[0]?.username).toBe('pramuniaga_dani');

    const searchNeraca = filterAuditLogs(DEFAULT_AUDIT_LOGS, { searchQuery: 'Neraca' });
    expect(searchNeraca.length).toBeGreaterThan(0);
  });
});
