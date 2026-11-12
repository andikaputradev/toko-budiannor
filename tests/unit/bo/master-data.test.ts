import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { AppUser, Dataset, Product, Sale } from '../../../src/shared/data/types';
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

describe('Komisi Sales per barang', () => {
  function contextWith(extra: {
    readonly products: readonly Product[];
    readonly sales: readonly Sale[];
  }): MasterContext {
    const base = generateDataset();
    const seller: AppUser = {
      id: 'U-KOM',
      name: 'Penjual Uji',
      role: 'sales',
      pin: '123456',
      username: 'penjual.uji',
      password: 'Kunci2026X',
      active: true,
    };
    const dataset: Dataset = {
      ...base,
      users: [...base.users, seller],
      products: [...base.products, ...extra.products],
      sales: extra.sales,
    };
    return {
      store: createStore({ dataset }),
      now: () => new Date('2026-10-19T10:00:00.000Z'),
      allowed: () => true,
      log: () => undefined,
    };
  }

  const sale = (lines: Sale['lines']): Sale => ({
    id: 'S-KOM',
    number: 'T-KOM',
    createdAt: '2026-10-10T03:00:00.000Z',
    cashierId: 'U-KOM',
    customerId: undefined,
    lines,
    total: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    payment: 'tunai',
    paid: 0,
  });

  const commissionOf = (ctx: MasterContext): string | undefined =>
    buildRows('sales', ctx)
      .find((row) => row.id === 'U-KOM')
      ?.metrics.find((metric) => metric.label === 'masterMetKomisiBulan')?.value;

  it('memakai persen barang bila terisi dan persen profil sales bila kosong, per baris', () => {
    const base = generateDataset();
    const own: Product = {
      ...base.products[0]!,
      id: 'T-A',
      salesCommission: { percent: 5, nominal: 0 },
    };
    const none: Product = {
      ...base.products[1]!,
      id: 'T-B',
      salesCommission: undefined,
    };
    const ctx = contextWith({
      products: [own, none],
      sales: [
        sale([
          { productId: 'T-A', unit: 'Pcs', quantity: 1, unitPrice: 100_000 },
          { productId: 'T-B', unit: 'Pcs', quantity: 2, unitPrice: 100_000 },
        ]),
      ],
    });
    // 100.000 x 5 persen (barang) + 200.000 x 1 persen (profil sales bawaan).
    expect(commissionOf(ctx)).toBe('Rp 7.000');
  });

  it('barang yang tidak ditemukan memakai persen profil sales', () => {
    const ctx = contextWith({
      products: [],
      sales: [sale([{ productId: 'T-HILANG', unit: 'Pcs', quantity: 1, unitPrice: 100_000 }])],
    });
    expect(commissionOf(ctx)).toBe('Rp 1.000');
  });
});
