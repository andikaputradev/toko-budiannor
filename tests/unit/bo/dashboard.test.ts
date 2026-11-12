import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import {
  computeFullDashboard,
  dashboardWidgets,
  hppTone,
} from '../../../src/apps/bo/domain/dashboard';

describe('Dashboard Back-Office (Full Widgets)', () => {
  it('menghitung metrik omset harian dan bulanan dengan benar', () => {
    const dataset = generateDataset();
    const store = createStore({ dataset });
    const now = new Date('2026-10-19T10:00:00+07:00');

    const data = computeFullDashboard(store.getState(), now, 'owner');
    expect(data.omset.daily).toBeGreaterThanOrEqual(0);
    expect(data.omset.monthly).toBeGreaterThanOrEqual(0);
    expect(data.omset.trendPercent).toBeDefined();
    expect(data.chartSeries.daily.length).toBeGreaterThan(0);
  });

  it('menyediakan kegiatan mendatang jatuh tempo utang dan piutang', () => {
    const dataset = generateDataset();
    const store = createStore({ dataset });
    const now = new Date('2026-10-19T10:00:00+07:00');

    const data = computeFullDashboard(store.getState(), now, 'owner');
    expect(data.upcomingEvents.length).toBeGreaterThan(0);
    expect(data.upcomingEvents[0]).toHaveProperty('dateText');
    expect(data.upcomingEvents[0]).toHaveProperty('description');
  });

  it('menyediakan daftar barang terlaris, ranking pelanggan, monitoring HPP, dan stok minim', () => {
    const dataset = generateDataset();
    const store = createStore({ dataset });
    const now = new Date('2026-10-19T10:00:00+07:00');

    const data = computeFullDashboard(store.getState(), now, 'owner');
    expect(data.topProducts.length).toBeGreaterThan(0);
    expect(data.topCustomers.length).toBeGreaterThan(0);
    expect(data.hppMonitoring.length).toBeGreaterThan(0);
    expect(data.lowStockItems.length).toBeGreaterThan(0);
  });

  it('menyediakan data keuangan lengkap untuk owner dan menyaringnya untuk supervisor', () => {
    const dataset = generateDataset();
    const store = createStore({ dataset });
    const now = new Date('2026-10-19T10:00:00+07:00');

    const ownerData = computeFullDashboard(store.getState(), now, 'owner');
    expect(ownerData.profit).toBeDefined();
    expect(ownerData.expense).toBeDefined();
    expect(ownerData.assets).toBeDefined();
    expect(ownerData.isOwner).toBe(true);

    const supervisorData = computeFullDashboard(store.getState(), now, 'supervisor');
    expect(supervisorData.isOwner).toBe(false);
  });
});

describe('Dashboard sembilan widget', () => {
  const owner = (): ReturnType<typeof computeFullDashboard> => {
    const store = createStore({ dataset: generateDataset() });
    return computeFullDashboard(store.getState(), new Date('2026-10-19T10:00:00+07:00'), 'owner');
  };

  it('Owner melihat sembilan widget berurutan menurut gambar klien', () => {
    expect(dashboardWidgets('owner')).toEqual([
      'omset',
      'grafik',
      'kegiatan',
      'laba',
      'beban',
      'aset',
      'pelanggan',
      'barang',
      'hpp',
    ]);
  });

  it('Supervisor melihat lima widget tanpa laba, beban, aset, dan hpp', () => {
    const widgets = dashboardWidgets('supervisor');
    expect(widgets).toEqual(['omset', 'grafik', 'kegiatan', 'pelanggan', 'barang']);
    for (const hidden of ['laba', 'beban', 'aset', 'hpp'] as const) {
      expect(widgets).not.toContain(hidden);
    }
  });

  it('peran tanpa akses Back-Office tidak mendapat widget', () => {
    expect(dashboardWidgets('kasir')).toEqual([]);
    expect(dashboardWidgets('frontliner')).toEqual([]);
  });

  it('laba sama dengan pendapatan dikurangi nilai HPP dan pengeluaran, harian dan bulanan', () => {
    const { profit } = owner();
    for (const period of [profit.daily, profit.monthly]) {
      expect(period.laba).toBe(period.pendapatan - period.nilaiHpp - period.pengeluaran);
    }
  });

  it('beban terdiri dari lima kategori berurutan dan jumlahnya sama dengan total beban', () => {
    const { expense, profit } = owner();
    for (const period of [expense.daily, expense.monthly]) {
      expect(period.items.map((item) => item.key)).toEqual([
        'gaji',
        'katering',
        'bensin',
        'operasional',
        'listrik',
      ]);
      expect(period.items.reduce((sum, item) => sum + item.amount, 0)).toBe(period.beban);
    }
    expect(expense.daily.beban).toBe(profit.daily.pengeluaran);
    expect(expense.monthly.beban).toBe(profit.monthly.pengeluaran);
  });

  it('peringkat punya dua periode: bulan berjalan sampai hari ini dan bulan lalu penuh', () => {
    const { rankPeriods } = owner();
    expect(rankPeriods.map((period) => period.label)).toEqual([
      '1 Okt - 19 Okt 2026',
      '1 Sep - 30 Sep 2026',
    ]);
    for (const period of rankPeriods) {
      const amounts = period.customers.map((item) => item.amount);
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
      for (const item of [...period.customers, ...period.products]) {
        expect(item.percent).toBeGreaterThanOrEqual(0);
        expect(item.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('nada HPP: 95 persen ke atas bahaya, 90 sampai 94 waspada, di bawahnya aman', () => {
    expect(hppTone(96)).toBe('bahaya');
    expect(hppTone(95)).toBe('bahaya');
    expect(hppTone(94)).toBe('waspada');
    expect(hppTone(90)).toBe('waspada');
    expect(hppTone(89)).toBe('aman');
  });
});
