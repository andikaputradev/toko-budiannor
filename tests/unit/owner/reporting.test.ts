import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { wibDate } from '../../../src/shared/data/receivable';
import { outstanding } from '../../../src/shared/data/receivable';
import type { BillLine, Dataset, Sale } from '../../../src/shared/data/types';
import {
  balanceSheet,
  checkRange,
  dailyPoints,
  expenseReport,
  FRESH_MS,
  hourlyPoints,
  lineAmount,
  OPENING_CASH,
  parseReportKind,
  paymentMix,
  profitReport,
  REPORT_KINDS,
  reportHeadlines,
  reportStatus,
  resolveRange,
  salesReport,
  sellerSales,
  topProducts,
} from '../../../src/apps/owner/domain/reporting';

const data = generateDataset();
const now = new Date(data.referenceDate);
const TODAY = '2026-10-19';
const MONTH = { from: '2026-10-01', to: TODAY };

function sale(overrides: Partial<Sale> & { lines: readonly BillLine[] }): Sale {
  return {
    id: 'S-X',
    number: 'T-X',
    createdAt: '2026-10-19T02:00:00.000Z',
    cashierId: 'U-3',
    customerId: undefined,
    total: 0,
    payment: 'tunai',
    paid: 0,
    ...overrides,
  };
}

describe('jenis laporan', () => {
  it('mengenali keenam jenis dan menolak yang lain', () => {
    expect(REPORT_KINDS).toHaveLength(6);
    for (const kind of REPORT_KINDS) {
      expect(parseReportKind(kind)).toBe(kind);
    }
    expect(parseReportKind('lainnya')).toBeUndefined();
    expect(parseReportKind(null)).toBeUndefined();
  });
});

describe('rentang tanggal', () => {
  const custom = { from: '2026-09-01', to: '2026-09-30' };

  it('menyelesaikan hari ini, bulan ini, dan rentang pilihan', () => {
    expect(resolveRange('hari-ini', TODAY, custom)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange('bulan-ini', TODAY, custom)).toEqual(MONTH);
    expect(resolveRange('tanggal', TODAY, custom)).toEqual(custom);
  });

  it('menolak tanggal akhir sebelum awal dan tanggal kosong (MSG-039)', () => {
    expect(checkRange({ from: '2026-10-05', to: '2026-10-01' })).toEqual({
      ok: false,
      messageId: 'MSG-039',
    });
    expect(checkRange({ from: '', to: TODAY })).toEqual({ ok: false, messageId: 'MSG-039' });
  });

  it('menolak rentang lebih dari 366 hari dan menerima tepat 366 (MSG-104)', () => {
    expect(checkRange({ from: '2025-01-01', to: '2026-10-19' })).toEqual({
      ok: false,
      messageId: 'MSG-104',
    });
    expect(checkRange({ from: '2025-10-19', to: '2026-10-19' })).toEqual({ ok: true });
    expect(checkRange({ from: '2025-10-18', to: '2026-10-19' })).toMatchObject({ ok: false });
  });
});

describe('jumlah baris dengan diskon', () => {
  const line = { productId: 'P', unit: 'Pcs', quantity: 2, unitPrice: 50_000 };

  it('mengurangi diskon persen dan nominal per satuan, tidak pernah negatif', () => {
    expect(lineAmount(line)).toBe(100_000);
    expect(lineAmount({ ...line, discount: { kind: 'persen', value: 10 } })).toBe(90_000);
    // Nominal per satuan: Rp 15.000 dikali 2 satuan.
    expect(lineAmount({ ...line, discount: { kind: 'nominal', value: 15_000 } })).toBe(70_000);
    expect(lineAmount({ ...line, discount: { kind: 'nominal', value: 500_000 } })).toBe(0);
    expect(lineAmount({ ...line, discount: { kind: 'persen', value: -5 } })).toBe(100_000);
  });
});

describe('laporan penjualan', () => {
  it('hari ini: omzet dan transaksi cocok dengan transaksi tercatat, grafik per jam', () => {
    const report = salesReport(data, { from: TODAY, to: TODAY }, now);
    const sales = data.sales.filter((item) => wibDate(new Date(item.createdAt)) === TODAY);
    expect(report.revenue).toBe(sales.reduce((sum, item) => sum + item.total, 0));
    expect(report.count).toBe(sales.length);
    expect(report.average).toBe(Math.round(report.revenue / report.count));
    expect(report.granularity).toBe('jam');
    expect(report.points.reduce((sum, point) => sum + point.value, 0)).toBe(report.revenue);
  });

  it('bulan ini: satu titik per hari dan rincian harian terbaru dahulu', () => {
    const report = salesReport(data, MONTH, now);
    expect(report.granularity).toBe('hari');
    expect(report.points).toHaveLength(19);
    expect(report.points.reduce((sum, point) => sum + point.value, 0)).toBe(report.revenue);
    const dates = report.days.map((day) => day.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('memotong grafik pada hari ini bila rentang melewati hari ini', () => {
    const report = salesReport(data, { from: '2026-10-15', to: '2026-10-25' }, now);
    expect(report.points[report.points.length - 1]?.key).toBe(TODAY);
  });

  it('satu hari tanpa transaksi rinci tidak punya grafik', () => {
    const report = salesReport(data, { from: '2026-10-10', to: '2026-10-10' }, now);
    expect(report.granularity).toBe('tidak-ada');
    expect(report.points).toEqual([]);
    expect(report.revenue).toBeGreaterThan(0);
  });

  it('nol bila tidak ada data', () => {
    const empty: Dataset = { ...data, sales: [], dailyRevenue: [] };
    expect(salesReport(empty, MONTH, now)).toMatchObject({ revenue: 0, count: 0, average: 0 });
  });

  it('titik jam hari lampau memuat seluruh jam dagang', () => {
    expect(hourlyPoints(data, '2026-10-18', now)).toHaveLength(10);
    expect(dailyPoints(data, { from: '2026-10-05', to: '2026-10-07' }).map((p) => p.label)).toEqual(
      ['5', '6', '7'],
    );
  });

  it('komposisi cara bayar menjumlahkan transaksi pada rentang dengan persen 100', () => {
    const mix = paymentMix(data, MONTH);
    const total = data.sales
      .filter((item) => wibDate(new Date(item.createdAt)) >= MONTH.from)
      .reduce((sum, item) => sum + item.total, 0);
    expect(mix.reduce((sum, row) => sum + row.amount, 0)).toBe(total);
    expect(mix.reduce((sum, row) => sum + row.count, 0)).toBe(data.sales.length);
    expect(Math.abs(mix.reduce((sum, row) => sum + row.percent, 0) - 100)).toBeLessThanOrEqual(2);
    const amounts = mix.map((row) => row.amount);
    expect([...amounts].sort((first, second) => second - first)).toEqual(amounts);
  });
});

describe('laporan laba rugi dan biaya', () => {
  it('menjaga laba kotor, laba bersih, dan margin konsisten', () => {
    const report = profitReport(data, MONTH);
    expect(report.gross).toBe(report.sales - report.cogs);
    expect(report.net).toBe(report.gross - report.expenses);
    expect(report.cost).toBe(report.cogs + report.expenses);
    expect(report.netMargin).toBeCloseTo((report.net / report.sales) * 100, 1);
    expect(report.hasData).toBe(true);
  });

  it('tanpa data margin nol dan hasData salah', () => {
    const empty: Dataset = { ...data, dailyRevenue: [], expenses: [] };
    expect(profitReport(empty, MONTH)).toMatchObject({
      grossMargin: 0,
      netMargin: 0,
      hasData: false,
    });
  });

  it('biaya: total, porsi per kategori menjumlah 100, dan rincian terbaru dahulu', () => {
    const report = expenseReport(data, MONTH);
    expect(report.total).toBe(data.expenses.reduce((sum, item) => sum + item.amount, 0));
    expect(Math.abs(report.shares.reduce((sum, row) => sum + row.percent, 0) - 100)).toBeLessThan(
      1,
    );
    expect(report.items.length).toBeLessThanOrEqual(10);
    const dates = report.items.map((item) => item.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(expenseReport(data, MONTH, 3).items).toHaveLength(3);
  });

  it('biaya pada rentang kosong bernilai nol', () => {
    expect(expenseReport(data, { from: '2026-01-01', to: '2026-01-31' })).toMatchObject({
      total: 0,
      shares: [],
      items: [],
    });
  });
});

describe('neraca', () => {
  const sheet = balanceSheet(data, now);

  it('selalu seimbang: aset sama dengan kewajiban ditambah ekuitas', () => {
    expect(sheet.assets).toBe(sheet.cash + sheet.receivable + sheet.inventory);
    expect(sheet.assets).toBe(sheet.liabilities + sheet.equity);
    expect(sheet.asOf).toBe(TODAY);
  });

  it('seimbang pula pada data kosong dan data dengan hutang besar', () => {
    const empty: Dataset = {
      ...data,
      sales: [],
      expenses: [],
      customers: [],
      suppliers: [],
      products: [],
    };
    const bare = balanceSheet(empty, now);
    expect(bare.assets).toBe(OPENING_CASH);
    expect(bare.assets).toBe(bare.liabilities + bare.equity);
    const indebted: Dataset = {
      ...data,
      suppliers: data.suppliers.map((supplier) => ({ ...supplier, payable: 9_000_000_000_000 })),
    };
    const heavy = balanceSheet(indebted, now);
    expect(heavy.assets).toBe(heavy.liabilities + heavy.equity);
    expect(heavy.equity).toBeLessThan(0);
  });

  it('piutang usaha adalah sisa seluruh invoice pelanggan', () => {
    expect(sheet.receivable).toBe(data.customers.reduce((sum, item) => sum + outstanding(item), 0));
  });

  it('hutang usaha adalah jumlah hutang supplier', () => {
    expect(sheet.payable).toBe(data.suppliers.reduce((sum, item) => sum + item.payable, 0));
  });

  it('persediaan memakai stok dikali HPP dan mengabaikan stok negatif', () => {
    const product = data.products[0];
    if (product === undefined) {
      throw new Error('data uji kosong');
    }
    const one: Dataset = {
      ...data,
      products: [{ ...product, hpp: 1_000, stock: { display: 10, besar: 5 } }],
      customers: [],
      suppliers: [],
    };
    expect(balanceSheet(one, now).inventory).toBe(15_000);
    const negative: Dataset = {
      ...one,
      products: [{ ...product, hpp: 1_000, stock: { display: -4, besar: 0 } }],
    };
    expect(balanceSheet(negative, now).inventory).toBe(0);
  });

  it('kas: saldo dasar ditambah penerimaan bulan ini dikurangi biaya bulan ini', () => {
    const receipts = data.sales.reduce((sum, item) => sum + item.paid, 0);
    const spent = data.expenses.reduce((sum, item) => sum + item.amount, 0);
    expect(sheet.cash).toBe(OPENING_CASH + receipts - spent);
  });
});

describe('produk terlaris dan penjualan per penjual', () => {
  it('menjumlahkan nilai per barang pada rentang dan mengurutkan menurun', () => {
    const rows = topProducts(data, MONTH, 1000);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    expect(total).toBe(data.sales.reduce((sum, item) => sum + item.total, 0));
    expect(rows[0]?.percent).toBe(100);
    expect(topProducts(data, MONTH, 3)).toHaveLength(3);
  });

  it('mengubah jumlah ke satuan dasar', () => {
    const product = data.products.find((item) => item.units.some((unit) => unit.factor > 1));
    if (product === undefined) {
      throw new Error('data uji kosong');
    }
    const bulk = product.units.find((unit) => unit.factor > 1);
    if (bulk === undefined) {
      throw new Error('data uji kosong');
    }
    const custom: Dataset = {
      ...data,
      products: [product],
      sales: [
        sale({
          lines: [{ productId: product.id, unit: bulk.code, quantity: 2, unitPrice: 1000 }],
        }),
      ],
    };
    const [row] = topProducts(custom, { from: TODAY, to: TODAY }, 5);
    expect(row?.quantity).toBe(2 * bulk.factor);
    expect(row?.unit).toBe(product.baseUnit);
    expect(row?.amount).toBe(2000);
  });

  it('kosong tanpa transaksi pada rentang', () => {
    expect(topProducts(data, { from: '2026-01-01', to: '2026-01-02' })).toEqual([]);
    expect(sellerSales(data, { from: '2026-01-01', to: '2026-01-02' })).toEqual([]);
  });

  it('penjual: memakai sellerId bila ada, selain itu kasir, dan menjumlah ke omzet', () => {
    const rows = sellerSales(data, MONTH);
    expect(rows.map((row) => row.name).sort()).toEqual(['Dewi', 'Rizal']);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(
      data.sales.reduce((sum, item) => sum + item.total, 0),
    );
    expect(rows[0]?.percent).toBe(100);
  });

  it('mengelompokkan baris menurut sellerId sebelum kasir dan menghitung transaksi sekali', () => {
    const custom: Dataset = {
      ...data,
      sales: [
        sale({
          id: 'S-A',
          cashierId: 'U-3',
          lines: [
            { productId: 'P', unit: 'Pcs', quantity: 1, unitPrice: 1000, sellerId: 'U-6' },
            { productId: 'P', unit: 'Pcs', quantity: 1, unitPrice: 2000, sellerId: 'U-6' },
            { productId: 'P', unit: 'Pcs', quantity: 1, unitPrice: 4000 },
          ],
        }),
      ],
    };
    const rows = sellerSales(custom, { from: TODAY, to: TODAY });
    const field = rows.find((row) => row.id === 'U-6');
    const cashier = rows.find((row) => row.id === 'U-3');
    expect(field).toMatchObject({ name: 'Budi Lapangan', count: 1, amount: 3000, average: 3000 });
    expect(cashier).toMatchObject({ count: 1, amount: 4000 });
  });

  it('memakai id bila pengguna tidak dikenal', () => {
    const custom: Dataset = {
      ...data,
      sales: [
        sale({
          cashierId: 'U-404',
          lines: [{ productId: 'P', unit: 'Pcs', quantity: 1, unitPrice: 10 }],
        }),
      ],
    };
    expect(sellerSales(custom, { from: TODAY, to: TODAY })[0]?.name).toBe('U-404');
  });
});

describe('daftar laporan', () => {
  it('status hijau bila online dan data segar, kuning bila offline atau basi', () => {
    const loaded = new Date('2026-10-19T03:00:00.000Z');
    expect(reportStatus(true, loaded, loaded)).toBe('segar');
    expect(reportStatus(true, loaded, new Date(loaded.getTime() + FRESH_MS))).toBe('segar');
    expect(reportStatus(true, loaded, new Date(loaded.getTime() + FRESH_MS + 1))).toBe('lokal');
    expect(reportStatus(false, loaded, loaded)).toBe('lokal');
  });

  it('ringkasan satu baris tersedia untuk keenam laporan', () => {
    const headlines = reportHeadlines(data, now);
    expect(Object.keys(headlines).sort()).toEqual([...REPORT_KINDS].sort());
    expect(headlines.neraca.amount).toBe(balanceSheet(data, now).assets);
    expect(headlines['laba-rugi'].amount).toBe(profitReport(data, MONTH).net);
    expect(headlines.penjualan.amount).toBe(salesReport(data, MONTH, now).revenue);
    expect(headlines.biaya.amount).toBe(expenseReport(data, MONTH).total);
    expect(headlines['produk-terlaris'].name).toBe(topProducts(data, MONTH, 1)[0]?.name);
    expect(headlines['per-penjual'].name).toBe(sellerSales(data, MONTH)[0]?.name);
  });

  it('tanpa transaksi ringkasan produk dan penjual tidak bernama', () => {
    const empty: Dataset = { ...data, sales: [] };
    const headlines = reportHeadlines(empty, now);
    expect(headlines['produk-terlaris'].name).toBeUndefined();
    expect(headlines['per-penjual'].name).toBeUndefined();
  });
});
