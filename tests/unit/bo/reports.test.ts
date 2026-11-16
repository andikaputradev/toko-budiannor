import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  buildDebtReport,
  buildDocReport,
  buildGrossProfitReport,
  buildPriceList,
  buildStockReport,
  monthStartOf,
  type DocReportParams,
} from '../../../src/apps/bo/domain/reports';
import { seedDebtPayments } from '../../../src/apps/bo/domain/debt-payments';
import type { MovementSources } from '../../../src/apps/bo/domain/stock-report';

const data = generateDataset();
const today = data.referenceDate.slice(0, 10);
const whole = { from: '2026-01-01', to: '2026-12-31' };

const sales: DocReportParams = {
  mode: 'summary',
  period: whole,
  party: '',
  tier: '',
  product: '',
  category: '',
  brand: '',
  saleType: '',
  kind: '',
  status: '',
  seller: '',
  commission: false,
};

const sources: MovementSources = {
  sales: data.sales,
  customers: data.customers,
  suppliers: data.suppliers,
  purchaseOrders: [],
  transfers: [],
  opnames: [],
  corrections: [],
  extra: [],
};

describe('laporan Back-Office', () => {
  it('Laporan Penjualan Summary: satu baris per faktur dengan total yang cocok', () => {
    const report = buildDocReport(data, false, sales);
    expect(report.title).toBe('Laporan Penjualan');
    expect(report.columns.map((column) => column.text)).toEqual([
      'No Faktur',
      'Tanggal',
      'Pelanggan',
      'Jenis',
      'Status',
      'Total',
    ]);
    expect(report.rows.length).toBeGreaterThan(5);
    expect(report.totals?.[0]).toBe(`Total ${String(report.rows.length)} faktur`);
    expect(report.params[0]).toBe('Jenis: Summary');
  });

  it('Perincian memuat baris barang, Total memuat ringkasan Tunai dan Piutang', () => {
    const detail = buildDocReport(data, false, { ...sales, mode: 'perincian' });
    expect(detail.columns.map((column) => column.text)).toContain('Nama Barang');
    expect(detail.rows.length).toBeGreaterThan(5);
    const total = buildDocReport(data, false, { ...sales, mode: 'total' });
    expect(total.rows.map((row) => row[0])).toEqual([
      'Seluruh penjualan',
      'Tunai',
      'Piutang',
      'Lunas',
      'Belum Lunas',
    ]);
  });

  it('filter Jenis Transaksi dan periode mempersempit faktur; periode kosong tidak berisi', () => {
    const all = buildDocReport(data, false, sales).rows.length;
    const cash = buildDocReport(data, false, { ...sales, kind: 'tunai' });
    expect(cash.rows.length).toBeLessThan(all);
    expect(cash.rows.every((row) => row[3] === 'Tunai')).toBe(true);
    const none = buildDocReport(data, false, {
      ...sales,
      period: { from: '2020-01-01', to: '2020-01-02' },
    });
    expect(none.rows).toHaveLength(0);
    expect(none.emptyText).not.toBe('');
  });

  it('Komisi Sales menambah kolom komisi', () => {
    const report = buildDocReport(data, false, { ...sales, commission: true });
    expect(report.columns.at(-1)?.text).toBe('Komisi Sales');
    expect(report.rows[0]?.length).toBe(report.columns.length);
  });

  it('Laporan Pembelian memakai istilah Hutang dan pemasok', () => {
    const report = buildDocReport(data, true, { ...sales, mode: 'summary' });
    expect(report.title).toBe('Laporan Pembelian');
    expect(report.columns[2]?.text).toBe('Pemasok');
    expect(report.params.join(' ')).toContain('Pemasok: Semua');
  });

  it('Laba Rugi Kotor: penjualan dikurangi HPP, margin dalam persen', () => {
    const report = buildGrossProfitReport(data, {
      mode: 'total',
      period: whole,
      customer: '',
      product: '',
      category: '',
      brand: '',
    });
    expect(report.rows.map((row) => row[0])).toEqual([
      'Jumlah faktur',
      'Penjualan',
      'HPP',
      'Laba Kotor',
      'Margin Kotor',
    ]);
    expect(report.rows.at(-1)?.[1]).toMatch(/%$/);
  });

  it('Hutang Piutang: kartu per pihak, perincian per faktur, pembayaran dari riwayat', () => {
    const payments = seedDebtPayments(data, 'U-1');
    const card = buildDebtReport(data, payments, {
      side: 'piutang',
      mode: 'kartu',
      period: whole,
      party: '',
      status: '',
    });
    expect(card.columns[0]?.text).toBe('Pelanggan');
    expect(card.rows.length).toBeGreaterThan(5);
    const paid = buildDebtReport(data, payments, {
      side: 'piutang',
      mode: 'pembayaran',
      period: whole,
      party: '',
      status: '',
    });
    expect(paid.rows).toHaveLength(payments.filter((item) => item.type === 'pelanggan').length);
    const debt = buildDebtReport(data, payments, {
      side: 'hutang',
      mode: 'perincian',
      period: whole,
      party: '',
      status: '',
    });
    expect(debt.columns[0]?.text).toBe('Pemasok');
    expect(debt.rows.length).toBeGreaterThan(0);
  });

  it('Stok Barang: nilai persediaan menyembunyikan HPP bagi non-Owner; kartu butuh barang', () => {
    const base = {
      mode: 'nilai',
      period: { from: monthStartOf(today), to: today },
      product: 'semen',
      category: '',
      brand: '',
      warehouse: '',
    } as const;
    const owner = buildStockReport(data, sources, { ...base, showHpp: true });
    const supervisor = buildStockReport(data, sources, { ...base, showHpp: false });
    expect(owner.columns.map((column) => column.text)).toContain('Nilai');
    expect(supervisor.columns.map((column) => column.text)).not.toContain('Nilai');
    expect(owner.totals?.at(-1)).toMatch(/^Rp /);
    const missing = buildStockReport(data, sources, {
      ...base,
      mode: 'kartu',
      product: '',
      showHpp: true,
    });
    expect(missing.rows).toHaveLength(0);
    expect(missing.emptyText).toContain('Nama Barang');
    const card = buildStockReport(data, sources, { ...base, mode: 'kartu', showHpp: true });
    expect(card.rows[0]?.[2]).toBe('Saldo Awal');
  });

  it('Daftar Harga dan Katalog: kolom mengikuti pilihan harga, HPP, satuan, dan stok', () => {
    const params = {
      mode: 'harga',
      phrase: 'semen',
      category: '',
      brand: '',
      warehouse: '',
      retail: true,
      wholesale: false,
      showHpp: false,
      allUnits: false,
      withStock: true,
    } as const;
    const list = buildPriceList(data, params);
    expect(list.columns.map((column) => column.text)).toEqual([
      'Kode',
      'Nama Barang',
      'Satuan',
      'Stok',
      'Harga Eceran',
    ]);
    const catalog = buildPriceList(data, {
      ...params,
      mode: 'katalog',
      wholesale: true,
      showHpp: true,
      withStock: false,
      allUnits: true,
    });
    expect(catalog.title).toBe('Katalog Barang');
    expect(catalog.columns.map((column) => column.text)).toEqual([
      'Kode',
      'Nama Barang',
      'Kategori',
      'Merk',
      'Satuan',
      'Harga Eceran',
      'Harga Grosir',
      'HPP',
    ]);
    expect(catalog.rows.length).toBeGreaterThanOrEqual(list.rows.length);
  });
});
