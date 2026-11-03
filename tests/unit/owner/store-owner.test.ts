import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { wibDate } from '../../../src/shared/data/receivable';
import { costRatio, expenseSummary, profitLoss, rangeDays } from '../../../src/shared/data/report';
import { createStore } from '../../../src/shared/store/store';
import { need } from './support';

const dataset = generateDataset();

describe('data dan store untuk aplikasi Owner', () => {
  it('menempatkan penjualan contoh pada jam toko 08 sampai 17 WIB', () => {
    expect(dataset.sales).toHaveLength(40);
    for (const sale of dataset.sales) {
      const hour = new Date(new Date(sale.createdAt).getTime() + 7 * 60 * 60 * 1000).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThanOrEqual(17);
      expect(new Date(sale.createdAt).getTime()).toBeLessThan(Date.parse(dataset.referenceDate));
    }
    const days = new Set(dataset.sales.map((sale) => wibDate(new Date(sale.createdAt))));
    expect([...days]).toEqual(['2026-10-18', '2026-10-19']);
  });

  it('membangkitkan pemasok, beban, persetujuan, dan omzet harian 31 hari', () => {
    expect(dataset.suppliers).toHaveLength(6);
    expect(dataset.suppliers[0]?.id).toBe('V-001');
    expect(dataset.approvals.map((item) => item.kind)).toEqual(['diskon', 'piutang', 'koreksi']);
    expect(dataset.approvals.every((item) => item.status === 'menunggu')).toBe(true);
    expect(dataset.expenses.every((item) => item.date.startsWith('2026-10'))).toBe(true);
    expect(dataset.dailyRevenue).toHaveLength(31);
    expect(JSON.stringify(generateDataset().expenses)).toBe(JSON.stringify(dataset.expenses));
  });

  it('menomori dokumen dari store, memulai mutasi di M-0002, dan mengatur ulang', () => {
    const store = createStore({ dataset });
    expect(store.peekNumber('M')).toBe('M-0002');
    expect(store.takeNumber('M')).toBe('M-0002');
    expect(store.takeNumber('M')).toBe('M-0003');
    expect(store.takeNumber('SO')).toBe('SO-0001');
    expect(store.takeNumber('PO')).toBe('PO-0001');
    store.resetData();
    expect(store.peekNumber('M')).toBe('M-0002');
    expect(store.peekNumber('SO')).toBe('SO-0001');
  });

  it('menyelesaikan persetujuan hanya sekali dan mengganti data pelanggan', () => {
    const store = createStore({ dataset });
    store.resolveApproval('AP-1', 'disetujui', 'U-1', '2026-10-19T03:05:00.000Z', 'Pelanggan lama');
    store.resolveApproval('AP-1', 'ditolak', 'U-1', '2026-10-19T03:06:00.000Z', 'Ubah');
    const request = need(store.getState().approvals.find((item) => item.id === 'AP-1'));
    expect(request).toMatchObject({ status: 'disetujui', note: 'Pelanggan lama' });
    const customer = need(store.getState().data.customers[0]);
    store.saveCustomer({ ...customer, name: 'Nama Baru' });
    expect(store.getState().data.customers[0]?.name).toBe('Nama Baru');
    expect(store.getState().data.customers).toHaveLength(60);
    store.resetData();
    expect(store.getState().data.customers[0]?.name).toBe(customer.name);
  });

  it('menyimpan Sales Order dan Purchase Order', () => {
    const store = createStore({ dataset });
    store.addSalesOrder({
      id: 'SO-0001',
      number: 'SO-0001',
      createdAt: dataset.referenceDate,
      createdBy: 'U-1',
      customerId: undefined,
      lines: [],
      total: 0,
      payment: 'tunai',
      downPayment: 0,
      status: 'draf',
      source: 'owner',
    });
    store.addPurchaseOrder({
      id: 'PO-0001',
      number: 'PO-0001',
      createdAt: dataset.referenceDate,
      createdBy: 'U-1',
      supplierId: 'V-001',
      warehouse: 'besar',
      lines: [],
      total: 0,
      status: 'dipesan',
    });
    expect(store.getState().salesOrders).toHaveLength(1);
    expect(store.getState().purchaseOrders).toHaveLength(1);
  });
});

describe('laporan bersama BO dan Owner', () => {
  it('menghitung rentang hari dan rasio harga pokok dalam batas wajar', () => {
    expect(rangeDays('2026-10-01', '2026-10-19')).toBe(19);
    expect(rangeDays('2026-10-19', '2026-10-19')).toBe(1);
    const ratio = costRatio(dataset);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
    expect(ratio).toBeLessThanOrEqual(0.95);
    expect(costRatio({ ...dataset, sales: [] })).toBe(0.78);
  });

  it('menyusun laba rugi dan ringkasan beban per kategori dari data yang sama', () => {
    const summary = expenseSummary(dataset, '2026-10-01', '2026-10-19');
    const total = dataset.expenses.reduce((sum, item) => sum + item.amount, 0);
    expect(summary.total).toBe(total);
    expect(summary.rows[0]?.category).toBe('Gaji Pegawai');
    const amounts = summary.rows.map((row) => row.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    const result = profitLoss(dataset, '2026-10-01', '2026-10-19');
    expect(result.gross).toBe(result.sales - result.cogs);
    expect(result.net).toBe(result.gross - result.expenses);
    expect(result.expenses).toBe(total);
    expect(profitLoss(dataset, '2020-01-01', '2020-01-02')).toEqual({
      sales: 0,
      cogs: 0,
      gross: 0,
      expenses: 0,
      net: 0,
    });
  });
});
