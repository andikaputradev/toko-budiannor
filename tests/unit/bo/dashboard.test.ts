import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import {
  computeFullDashboard,
  dashboardWidgets,
  hppTone,
} from '../../../src/apps/bo/domain/dashboard';
import { axisLabel, niceStep } from '../../../src/apps/bo/dashboard-charts';

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

  it('memecah omset menjadi transaksi lunas dan piutang yang jumlahnya sama dengan omset', () => {
    const store = createStore({ dataset: generateDataset() });
    const now = new Date('2026-10-19T10:00:00+07:00');
    const data = computeFullDashboard(store.getState(), now, 'owner');
    for (const info of [data.omset.dailyBreakdown, data.omset.monthlyBreakdown]) {
      expect(info.lunas).toBeGreaterThanOrEqual(0);
      expect(info.piutang).toBeGreaterThanOrEqual(0);
      expect(info.lunas + info.piutang).toBe(info.current);
    }
  });

  it('menyediakan urutan Penjualan Barang menurut nilai, frekuensi, dan laba', () => {
    const store = createStore({ dataset: generateDataset() });
    const now = new Date('2026-10-19T10:00:00+07:00');
    const period = computeFullDashboard(store.getState(), now, 'owner').rankPeriods[0];
    const by = period?.productsBy;
    expect(by?.nilai[0]?.name).toBe('THINNER CEMERLANG A 5LT');
    expect(by?.frekuensi[0]?.name).toBe('LEM QBOND XTRA');
    expect(by?.frekuensi[0]?.display).toBe('305 kali');
    expect(by?.laba[0]?.name).toBe('THINNER CEMERLANG A 5LT');
    for (const metric of ['nilai', 'frekuensi', 'laba'] as const) {
      const amounts = by?.[metric].map((item) => item.amount) ?? [];
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    }
  });

  it('skala grafik garis memakai langkah bulat dan angka sumbu ringkas', () => {
    expect(niceStep(72_150_000)).toBe(25_000_000);
    expect(niceStep(11_820_000)).toBe(5_000_000);
    expect(axisLabel(0)).toBe('0');
    expect(axisLabel(75_000_000)).toBe('75 Jt');
    expect(axisLabel(2_500_000)).toBe('2,5 Jt');
    expect(axisLabel(1_500_000_000)).toBe('1,5 M');
    expect(axisLabel(5_000)).toBe('5 Rb');
  });
});
