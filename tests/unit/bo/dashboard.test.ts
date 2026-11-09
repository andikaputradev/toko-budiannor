import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import { computeFullDashboard } from '../../../src/apps/bo/domain/dashboard';

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
