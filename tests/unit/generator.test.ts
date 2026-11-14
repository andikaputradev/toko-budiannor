import { describe, expect, it } from 'vitest';
import { CUSTOMER_COUNT, generateDataset, PRODUCT_COUNT } from '../../src/shared/data/generator';
import { overdueInvoices, remainingLimit } from '../../src/shared/data/receivable';
import { TIERS } from '../../src/shared/data/types';

const dataset = generateDataset();
const now = new Date(dataset.referenceDate);

describe('generator data fiktif', () => {
  it('menghasilkan 3.600 SKU dengan kode, barcode, dan nama unik', () => {
    expect(dataset.products).toHaveLength(PRODUCT_COUNT);
    expect(new Set(dataset.products.map((product) => product.code)).size).toBe(3600);
    expect(new Set(dataset.products.map((product) => product.barcode)).size).toBe(3600);
    expect(new Set(dataset.products.map((product) => product.name)).size).toBe(3600);
  });

  it('deterministik untuk benih yang sama dan berbeda untuk benih lain', () => {
    const again = generateDataset();
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));
    const other = generateDataset(7);
    expect(JSON.stringify(other.products.slice(0, 50))).not.toBe(
      JSON.stringify(dataset.products.slice(0, 50)),
    );
  });

  it('memberi satuan bertingkat naik, dasar berfaktor 1, dan dua tier harga berurutan', () => {
    for (const product of dataset.products) {
      expect(product.units[0]?.factor).toBe(1);
      expect(product.units[0]?.code).toBe(product.baseUnit);
      const factors = product.units.map((unit) => unit.factor);
      expect([...factors].sort((first, second) => first - second)).toEqual(factors);
      for (const unit of product.units) {
        const prices = product.prices[unit.code];
        expect(prices).toBeDefined();
        if (prices !== undefined) {
          expect(Object.keys(prices).sort()).toEqual([...TIERS].sort());
          expect(prices.grosir).toBeLessThanOrEqual(prices.eceran);
          expect(prices.grosir).toBeGreaterThan(0);
        }
      }
    }
  });

  it('mencakup barang desimal dan barang bulat dengan stok dua gudang tidak negatif', () => {
    expect(dataset.products.some((product) => product.allowDecimal)).toBe(true);
    expect(dataset.products.some((product) => !product.allowDecimal)).toBe(true);
    for (const product of dataset.products) {
      expect(product.stock.display).toBeGreaterThanOrEqual(0);
      expect(product.stock.besar).toBeGreaterThanOrEqual(0);
      if (!product.allowDecimal) {
        expect(Number.isInteger(product.stock.display)).toBe(true);
      }
    }
    expect(dataset.products.some((product) => product.stock.display === 0)).toBe(true);
    expect(
      dataset.products.some(
        (product) => product.stock.display + product.stock.besar < product.minStock,
      ),
    ).toBe(true);
  });

  it('menghasilkan 60 pelanggan dengan limit, piutang, dan sebagian lewat jatuh tempo', () => {
    expect(dataset.customers).toHaveLength(CUSTOMER_COUNT);
    const overdue = dataset.customers.filter(
      (customer) => overdueInvoices(customer, now).length > 0,
    );
    const nearLimit = dataset.customers.filter(
      (customer) => remainingLimit(customer) <= 500000 && remainingLimit(customer) >= 0,
    );
    const clean = dataset.customers.filter((customer) => customer.invoices.length === 0);
    expect(overdue.length).toBeGreaterThanOrEqual(10);
    expect(nearLimit.length).toBeGreaterThanOrEqual(10);
    expect(clean.length).toBeGreaterThanOrEqual(10);
    for (const customer of dataset.customers) {
      expect(customer.limit).toBeGreaterThan(0);
    }
  });

  it('menghasilkan enam pengguna fiktif dengan PIN 6 digit dan kelima peran', () => {
    expect(dataset.users).toHaveLength(6);
    expect(new Set(dataset.users.map((user) => user.role))).toEqual(
      new Set(['owner', 'supervisor', 'kasir', 'frontliner', 'sales']),
    );
    for (const user of dataset.users) {
      expect(user.pin).toMatch(/^\d{6}$/);
    }
  });

  it('menghasilkan bill gantung, riwayat, dan antrean sinkronisasi berisi 3 transaksi', () => {
    expect(dataset.bills).toHaveLength(3);
    expect(dataset.bills.map((bill) => bill.number)).toEqual(['B-0001', 'B-0002', 'B-0003']);
    expect(dataset.sales).toHaveLength(40);
    expect(dataset.sales[0]?.number).toBe('T-000101');
    expect(dataset.queue).toHaveLength(3);
    expect(dataset.queue.every((item) => item.status === 'menunggu')).toBe(true);
    for (const sale of dataset.sales) {
      expect(sale.total).toBe(
        sale.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0),
      );
    }
  });

  it('memuat atribut operasional Back Office seperti rak, berat, komisi, dan supplier', () => {
    const first = dataset.products[0];
    expect(first?.rak).toBeDefined();
    expect(first?.weight).toBeGreaterThan(0);
    expect(first?.supplierName).toBeDefined();
    expect(first?.hppAvg).toBeGreaterThan(0);
    expect(first?.minByWarehouse?.display).toBeGreaterThan(0);
    expect(first?.minByWarehouse?.besar).toBeGreaterThan(0);
    expect(first?.salesCommission).toBeDefined();
    expect(first?.initialStock).toBeDefined();
  });

  it('sepertiga barang tidak punya komisi sendiri sehingga komisinya ikut profil sales', () => {
    const withoutOwn = dataset.products.filter((item) => item.salesCommission === undefined);
    const withOwn = dataset.products.filter((item) => item.salesCommission !== undefined);
    expect(withoutOwn.length).toBeGreaterThan(0);
    expect(withOwn.length).toBeGreaterThan(withoutOwn.length);
  });
});
