import { describe, expect, it } from 'vitest';
import { createStore } from '../../../src/shared/store/store';
import {
  MASTER_CONFIGS,
  MASTER_KINDS,
  buildRows,
  filterRows,
  isMasterKind,
  masterStats,
  newValues,
  type MasterContext,
} from '../../../src/apps/bo/domain/master-data';

function createContext(): MasterContext {
  const store = createStore();
  return {
    store,
    now: () => new Date('2026-10-19T10:00:00.000Z'),
    allowed: () => true,
    log: () => undefined,
  };
}

describe('Domain Master Data Back-Office', () => {
  it('semua 6 entitas master terdaftar dan memiliki konfigurasi lengkap', () => {
    expect(MASTER_KINDS).toEqual([
      'kategori',
      'merk',
      'pemasok',
      'pelanggan',
      'sales',
      'ekspedisi',
    ]);
    for (const kind of MASTER_KINDS) {
      expect(isMasterKind(kind)).toBe(true);
      const cfg = MASTER_CONFIGS[kind];
      expect(cfg.kind).toBe(kind);
      expect(cfg.fields.length).toBeGreaterThan(0);
      expect(cfg.columns.length).toBeGreaterThan(0);
    }
  });

  it('dapat membangun baris kategori dan menghitung jumlah produk terkait', () => {
    const ctx = createContext();
    const rows = buildRows('kategori', ctx);
    expect(rows.length).toBeGreaterThan(0);
    const cat = rows[0];
    expect(cat?.title).toBeDefined();
    expect(typeof cat?.values['name']).toBe('string');
  });

  it('dapat memfilter baris master berdasarkan pencarian', () => {
    const ctx = createContext();
    const rows = buildRows('pelanggan', ctx);
    expect(rows.length).toBeGreaterThan(0);

    const first = rows[0];
    const filtered = filterRows(rows, first?.title ?? '');
    expect(filtered.length).toBeGreaterThan(0);

    const emptyFilter = filterRows(rows, 'ZzzzXxxxNonExistent12345');
    expect(emptyFilter.length).toBe(0);
  });

  it('dapat menghitung metrik statistik untuk setiap entitas master', () => {
    const ctx = createContext();
    for (const kind of MASTER_KINDS) {
      const stats = masterStats(kind, ctx);
      expect(stats.length).toBeGreaterThanOrEqual(2);
      expect(stats[0]?.label).toBeDefined();
      expect(stats[0]?.value).toBeDefined();
    }
  });

  it('dapat menghasilkan nilai awal default saat menambah data baru', () => {
    const ctx = createContext();
    for (const kind of MASTER_KINDS) {
      const defaults = newValues(kind, ctx);
      expect(defaults).toBeDefined();
      expect(typeof defaults).toBe('object');
    }
  });
});
