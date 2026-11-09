import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { wibDate } from '../../../src/shared/data/receivable';
import { profitLoss } from '../../../src/shared/data/report';
import { totalStock } from '../../../src/shared/data/units';
import {
  HPP_LIMIT,
  hppLevel,
  hppMonitor,
  lowStockRows,
  monthProfit,
  payableSnapshot,
  rankRange,
  receivableSnapshot,
  revenueView,
  topProductRows,
} from '../../../src/apps/owner/domain/dashboard';
import { compactRupiah, juta, signedRupiah } from '../../../src/apps/owner/domain/money';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('omzet live harian', () => {
  const view = revenueView(data, now, 'harian');

  it('memakai omzet dan jumlah transaksi hari ini', () => {
    const today = wibDate(now);
    const sales = data.sales.filter((sale) => wibDate(new Date(sale.createdAt)) === today);
    expect(view.total).toBe(sales.reduce((sum, sale) => sum + sale.total, 0));
    expect(view.count).toBe(sales.length);
    expect(view.compare).toBe('kemarin');
    expect(view.comparison).not.toBeUndefined();
  });

  it('menggambar jam dagang sampai jam sekarang saja', () => {
    // 2026-10-19 10:00 WIB: jam 08, 09, 10.
    expect(view.points.map((point) => point.label)).toEqual(['08:00', '09:00', '10:00']);
    expect(view.points.reduce((sum, point) => sum + point.value, 0)).toBe(view.total);
  });

  it('menampilkan seluruh jam dagang setelah sore', () => {
    const evening = new Date('2026-10-19T11:30:00.000Z');
    expect(revenueView(data, evening, 'harian').points).toHaveLength(10);
  });

  it('menampilkan satu titik sebelum buka dan tetap tidak runtuh tanpa transaksi', () => {
    const early = new Date('2026-10-19T00:30:00.000Z');
    expect(revenueView(data, early, 'harian').points).toHaveLength(1);
    const empty = { ...data, sales: [], dailyRevenue: [] };
    expect(revenueView(empty, now, 'harian')).toMatchObject({ total: 0, count: 0 });
  });
});

describe('omzet live bulanan', () => {
  const view = revenueView(data, now, 'bulanan');

  it('memberi satu titik per hari sejak tanggal 1 sampai hari ini', () => {
    expect(view.points).toHaveLength(19);
    expect(view.points[0]?.key).toBe('2026-10-01');
    expect(view.points[18]?.key).toBe('2026-10-19');
    expect(view.points.reduce((sum, point) => sum + point.value, 0)).toBe(view.total);
  });

  it('menjumlahkan omzet bulan ini dari omzet harian', () => {
    const expected = data.dailyRevenue
      .filter((item) => item.date >= '2026-10-01' && item.date <= '2026-10-19')
      .reduce((sum, item) => sum + item.revenue, 0);
    expect(view.total).toBe(expected);
    expect(view.compare).toBe('rata-bulan-lalu');
    expect(view.comparison).not.toBeUndefined();
  });

  it('tidak memberi pembanding bila data bulan lalu kurang dari tujuh hari', () => {
    const short = { ...data, dailyRevenue: data.dailyRevenue.slice(-20) };
    expect(revenueView(short, now, 'bulanan').comparison).toBeUndefined();
  });

  it('mengisi nol untuk hari tanpa catatan', () => {
    const sparse = {
      ...data,
      dailyRevenue: data.dailyRevenue.filter((item) => item.date > '2026-10-10'),
    };
    const points = revenueView(sparse, now, 'bulanan').points;
    expect(points).toHaveLength(19);
    expect(points[0]?.value).toBe(0);
  });
});

describe('laba rugi bulan ini', () => {
  it('menjaga pendapatan dikurangi beban sama dengan laba bersih laporan', () => {
    const snapshot = monthProfit(data, now);
    const report = profitLoss(data, '2026-10-01', '2026-10-19');
    expect(snapshot).toMatchObject({ from: '2026-10-01', to: '2026-10-19' });
    expect(snapshot.net).toBe(report.net);
    expect(snapshot.revenue - snapshot.expense).toBe(snapshot.net);
    expect(snapshot.expense).toBe(report.cogs + report.expenses);
  });
});

describe('stok minim', () => {
  it('memberi lima barang paling kritis dengan sisa dalam satuan dasar', () => {
    const rows = lowStockRows(data);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.remaining).toBeLessThan(row.minimum);
    }
    const product = data.products.find((item) => item.id === rows[0]?.id);
    expect(rows[0]?.remaining).toBe(product === undefined ? -1 : totalStock(product));
    expect(rows[0]?.unit).toBe(product?.baseUnit);
  });

  it('mengurutkan dari yang paling kritis', () => {
    const rows = lowStockRows(data, 5);
    const ratios = rows.map((row) => row.remaining / row.minimum);
    expect([...ratios].sort((first, second) => first - second)).toEqual(ratios);
  });

  it('kosong bila semua stok aman', () => {
    const safe = {
      ...data,
      products: data.products.map((product) => ({
        ...product,
        stock: { display: product.minStock, besar: product.minStock },
      })),
    };
    expect(lowStockRows(safe)).toEqual([]);
  });
});

describe('produk terlaris', () => {
  it('menyusun peringkat hari ini menurut nilai penjualan dengan batang relatif', () => {
    const rows = topProductRows(data, now, 'hari-ini');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows[0]?.percent).toBe(100);
    const amounts = rows.map((row) => row.amount);
    expect([...amounts].sort((first, second) => second - first)).toEqual(amounts);
  });

  it('bulan ini mencakup sedikitnya semua penjualan hari ini', () => {
    const today = topProductRows(data, now, 'hari-ini', 50);
    const month = topProductRows(data, now, 'bulan-ini', 50);
    expect(month.length).toBeGreaterThanOrEqual(today.length);
    expect(rankRange(now, 'bulan-ini')).toEqual({ from: '2026-10-01', to: '2026-10-19' });
  });

  it('menjumlahkan jumlah dalam satuan dasar dan nilai baris tanpa diskon ganda', () => {
    const sale = data.sales[data.sales.length - 1];
    const line = sale?.lines[0];
    const rows = topProductRows(data, now, 'hari-ini', 500);
    const row = rows.find((item) => item.productId === line?.productId);
    expect(row).not.toBeUndefined();
    expect(row?.amount).toBeGreaterThanOrEqual(
      Math.round((line?.quantity ?? 0) * (line?.unitPrice ?? 0)),
    );
  });
});

describe('monitoring HPP', () => {
  it('menampilkan sedikitnya tiga barang menurun menurut persen terhadap harga eceran', () => {
    const rows = hppMonitor(data);
    expect(rows).toHaveLength(3);
    const percents = rows.map((row) => row.percent);
    expect([...percents].sort((first, second) => second - first)).toEqual(percents);
    for (const row of rows) {
      expect(row.percent).toBeCloseTo((row.hpp / row.price) * 100, 6);
    }
  });

  it('memakai satu baris per jenis barang', () => {
    const names = hppMonitor(data, 8).map((row) =>
      row.name.replace(
        / (Karya Mandiri|Sumber Makmur|Sinar Kapuas|Lestari Abadi|Artha Mulia)$/,
        '',
      ),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('menandai tingkat dengan batas 90 persen', () => {
    expect(HPP_LIMIT).toBe(90);
    expect(hppLevel(95)).toBe('lewat');
    expect(hppLevel(90)).toBe('lewat');
    expect(hppLevel(85)).toBe('waspada');
    expect(hppLevel(60)).toBe('aman');
  });

  it('mengabaikan barang nonaktif atau tanpa harga', () => {
    const rows = hppMonitor(data, 3);
    const ids = new Set(rows.map((row) => row.productId));
    const blocked = {
      ...data,
      products: data.products.map((product) =>
        ids.has(product.id) ? { ...product, active: false } : product,
      ),
    };
    for (const row of hppMonitor(blocked, 3)) {
      expect(ids.has(row.productId)).toBe(false);
    }
  });
});

describe('piutang dan hutang', () => {
  it('menghitung piutang jatuh tempo dan jumlah pelanggan yang terlambat', () => {
    const snapshot = receivableSnapshot(data, now);
    expect(snapshot.parties).toBeGreaterThan(0);
    expect(snapshot.amount).toBeGreaterThan(0);
  });

  it('nol bila tidak ada pelanggan yang terlambat', () => {
    expect(receivableSnapshot({ ...data, customers: [] }, now)).toEqual({ amount: 0, parties: 0 });
  });

  it('menjumlahkan hutang supplier yang masih berhutang', () => {
    const owing = data.suppliers.filter((supplier) => supplier.payable > 0);
    expect(payableSnapshot(data)).toEqual({
      amount: owing.reduce((sum, supplier) => sum + supplier.payable, 0),
      parties: owing.length,
    });
    expect(payableSnapshot({ ...data, suppliers: [] })).toEqual({ amount: 0, parties: 0 });
  });
});

describe('format uang ringkas', () => {
  it('meringkas jutaan dan miliaran, menulis penuh di bawah satu juta', () => {
    expect(compactRupiah(142_880_000)).toBe('Rp 142,9 jt');
    expect(compactRupiah(50_289_293_940)).toBe('Rp 50,3 M');
    expect(compactRupiah(16_000_000)).toBe('Rp 16 jt');
    expect(compactRupiah(950_000)).toBe('Rp 950.000');
    expect(compactRupiah(0)).toBe('Rp 0');
    expect(compactRupiah(-2_500_000)).toBe('-Rp 2,5 jt');
  });

  it('memberi tanda eksplisit dan label sumbu dalam juta', () => {
    expect(signedRupiah(1_500)).toBe('+Rp 1.500');
    expect(signedRupiah(-1_500)).toBe('-Rp 1.500');
    expect(juta(0)).toBe('0');
    expect(juta(12_500_000)).toBe('12,5');
  });
});
