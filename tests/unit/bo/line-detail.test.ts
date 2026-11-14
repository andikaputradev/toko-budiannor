import { describe, expect, it } from 'vitest';
import {
  discountExprFrom,
  discountFields,
  lineTotal,
  priceHistory,
  stockLabel,
  unitOptions,
  unitPriceFor,
  validateDetail,
} from '../../../src/apps/bo/domain/line-detail';
import { generateDataset } from '../../../src/shared/data/generator';
import { formatDecimal } from '../../../src/shared/format';
import type { Dataset, Product, Sale, Supplier } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { need } from './support';

describe('discountExprFrom', () => {
  it('persen tunggal menjadi ekspresi persen', () => {
    expect(discountExprFrom({ percent: '10', nominal: '' })).toBe('10%');
    expect(discountExprFrom({ percent: ' 7,5 ', nominal: '' })).toBe('7.5%');
  });

  it('persen bertingkat dipertahankan', () => {
    expect(discountExprFrom({ percent: '5+5', nominal: '' })).toBe('5+5');
  });

  it('nominal menjadi ekspresi Rp tanpa pemisah ribuan', () => {
    expect(discountExprFrom({ percent: '', nominal: '2.000' })).toBe('Rp 2000');
    expect(discountExprFrom({ percent: '', nominal: '15000' })).toBe('Rp 15000');
  });

  it('persen menang bila keduanya terisi, kosong bila keduanya kosong atau nol', () => {
    expect(discountExprFrom({ percent: '10', nominal: '500' })).toBe('10%');
    expect(discountExprFrom({ percent: '', nominal: '' })).toBe('');
    expect(discountExprFrom({ percent: '0', nominal: '0' })).toBe('');
    expect(discountExprFrom({ percent: 'abc', nominal: '' })).toBe('');
  });
});

describe('discountFields', () => {
  it('ekspresi kosong memberi dua isian kosong', () => {
    expect(discountFields('', 1000)).toEqual({ percent: '', nominal: '' });
  });

  it('persen menampilkan padanan nominal per satuan', () => {
    expect(discountFields('10%', 70_000)).toEqual({ percent: '10', nominal: '7000' });
  });

  it('nominal menampilkan padanan persen dua desimal', () => {
    expect(discountFields('Rp 2000', 70_000)).toEqual({ percent: '2.86', nominal: '2000' });
  });

  it('bertingkat menampilkan ekspresi pada isian persen dan padanan nominal', () => {
    expect(discountFields('5+5', 100_000)).toEqual({ percent: '5+5', nominal: '9750' });
  });
});

describe('lineTotal', () => {
  it('tanpa diskon sama dengan harga kali kuantitas', () => {
    expect(lineTotal(70_000, 10, '')).toBe(700_000);
  });

  it('nominal dikurangkan per satuan (aturan BO tetap)', () => {
    expect(lineTotal(70_000, 10, 'Rp 2000')).toBe(680_000);
  });

  it('persen dan bertingkat dihitung atas harga satuan', () => {
    expect(lineTotal(10_000, 10, '10%')).toBe(90_000);
    expect(lineTotal(100_000, 1, '5+5')).toBe(90_250);
  });

  it('diskon melebihi harga tidak membuat total negatif', () => {
    expect(lineTotal(1000, 3, 'Rp 5000')).toBe(0);
    expect(lineTotal(1000, 3, '150%')).toBeGreaterThanOrEqual(0);
  });
});

describe('validateDetail', () => {
  const ok = { quantity: '3', unitPrice: '1000', allowDecimal: false };

  it('isian wajar lolos', () => {
    expect(validateDetail(ok)).toBe('ok');
    expect(validateDetail({ ...ok, quantity: '2,5', allowDecimal: true })).toBe('ok');
  });

  it('kuantitas nol, negatif, atau bukan angka ditolak', () => {
    expect(validateDetail({ ...ok, quantity: '0' })).toBe('quantity');
    expect(validateDetail({ ...ok, quantity: '-2' })).toBe('quantity');
    expect(validateDetail({ ...ok, quantity: '' })).toBe('quantity');
    expect(validateDetail({ ...ok, quantity: 'abc' })).toBe('quantity');
  });

  it('pecahan pada barang bilangan bulat ditolak sebagai desimal', () => {
    expect(validateDetail({ ...ok, quantity: '2,5' })).toBe('decimal');
    expect(validateDetail({ ...ok, quantity: '1.5' })).toBe('decimal');
  });

  it('harga negatif atau bukan angka ditolak', () => {
    expect(validateDetail({ ...ok, unitPrice: '-1' })).toBe('price');
    expect(validateDetail({ ...ok, unitPrice: '' })).toBe('price');
    expect(validateDetail({ ...ok, unitPrice: 'x' })).toBe('price');
    expect(validateDetail({ ...ok, unitPrice: '0' })).toBe('ok');
  });
});

describe('validateDetail: diskon dan ongkos kirim', () => {
  const base = { quantity: '1', unitPrice: '1000', allowDecimal: false };

  it('diskon persen di atas 100 ditolak, tepat 100 lolos', () => {
    expect(validateDetail({ ...base, discountExpr: '150%' })).toBe('discount');
    expect(validateDetail({ ...base, discountExpr: '100%' })).toBe('ok');
  });

  it('diskon nominal per satuan melebihi harga ditolak, sama dengan harga lolos', () => {
    expect(validateDetail({ ...base, discountExpr: 'Rp 5000' })).toBe('discount');
    expect(validateDetail({ ...base, discountExpr: 'Rp 1001' })).toBe('discount');
    expect(validateDetail({ ...base, discountExpr: 'Rp 1000' })).toBe('ok');
    expect(validateDetail({ ...base, discountExpr: 'Rp 999' })).toBe('ok');
  });

  it('diskon bertingkat dengan tingkat di atas 100 ditolak', () => {
    expect(validateDetail({ ...base, discountExpr: '50+120' })).toBe('discount');
    expect(validateDetail({ ...base, discountExpr: '5+5' })).toBe('ok');
  });

  it('tanpa diskon lolos', () => {
    expect(validateDetail({ ...base, discountExpr: '' })).toBe('ok');
    expect(validateDetail(base)).toBe('ok');
  });

  it('ongkos kirim negatif ditolak; nol dan kosong lolos', () => {
    expect(validateDetail({ ...base, shipping: '-5000' })).toBe('shipping');
    expect(validateDetail({ ...base, shipping: 'abc' })).toBe('shipping');
    expect(validateDetail({ ...base, shipping: '0' })).toBe('ok');
    expect(validateDetail({ ...base, shipping: '' })).toBe('ok');
  });

  it('kuantitas dan harga tetap diperiksa lebih dulu', () => {
    expect(validateDetail({ ...base, quantity: '0', discountExpr: '150%' })).toBe('quantity');
    expect(validateDetail({ ...base, unitPrice: '-1', discountExpr: '150%' })).toBe('price');
  });
});

describe('satuan, harga, dan stok barang', () => {
  const dataset = generateDataset();
  const product = need(
    dataset.products.find((item) => item.units.length >= 2 && item.stock.display > 0),
  );

  it('opsi satuan memuat kode dan faktor setiap satuan barang', () => {
    const options = unitOptions(product);
    expect(options.map((option) => option.code)).toEqual(product.units.map((unit) => unit.code));
    expect(options.every((option) => option.factor > 0)).toBe(true);
  });

  it('harga satuan diambil dari harga eceran satuan itu, nol bila tidak ada', () => {
    const unit = need(product.units[0]);
    expect(unitPriceFor(product, unit.code)).toBe(product.prices[unit.code]?.eceran ?? 0);
    expect(unitPriceFor(product, 'TIDAK-ADA')).toBe(0);
  });

  it('stok per gudang dalam satuan terpilih', () => {
    const unit = need(product.units.find((item) => item.factor > 1));
    const toko = stockLabel(product, 'toko', unit.code);
    const gudang = stockLabel(product, 'gudang', unit.code);
    expect(toko).not.toBe('');
    expect(gudang).not.toBe('');
    expect(stockLabel(product, 'toko')).toBe(formatDecimal(product.stock.display));
    expect(stockLabel(product, 'gudang')).toBe(formatDecimal(product.stock.besar));
  });
});

describe('priceHistory', () => {
  const IN = (day: string): string => `2026-${day}T03:00:00.000Z`;

  function fixture() {
    const base = generateDataset();
    const [target, other] = base.products;
    const [supplier] = base.suppliers;
    if (target === undefined || other === undefined || supplier === undefined) {
      throw new Error('dataset kosong');
    }
    const unit = target.baseUnit;
    const line = (product: Product, quantity: number, unitPrice: number, lineUnit = unit) => ({
      productId: product.id,
      unit: lineUnit,
      quantity,
      unitPrice,
    });
    const sale = (id: string, createdAt: string, lines: Sale['lines']): Sale => ({
      id,
      number: id,
      createdAt,
      cashierId: 'U-1',
      customerId: undefined,
      lines,
      total: 0,
      payment: 'tunai',
      paid: 0,
    });
    const withInvoices: Supplier = {
      ...supplier,
      invoices: [
        {
          id: 'FB-1',
          issuedAt: IN('10-01'),
          dueAt: IN('10-01'),
          amount: 0,
          paid: 0,
          lines: [line(target, 10, 1000)],
        },
        {
          id: 'FB-2',
          issuedAt: IN('10-05'),
          dueAt: IN('10-05'),
          amount: 0,
          paid: 0,
          lines: [line(target, 10, 1100), line(other, 1, 1)],
        },
      ],
    };
    const dataset: Dataset = {
      ...base,
      suppliers: [withInvoices],
      sales: [
        sale('T-1', IN('09-01'), [line(target, 1, 5000)]),
        sale('T-2', IN('10-02'), [line(target, 1, 5100)]),
        sale('T-3', IN('10-03'), [line(target, 1, 5200)]),
        sale('T-4', IN('10-04'), [line(target, 1, 5300)]),
        sale('T-5', IN('10-06'), [line(target, 2, 9999, 'LAIN')]),
      ],
    };
    const store = createStore({ dataset });
    store.addPurchaseOrder({
      id: 'PO-1',
      number: 'PO-1',
      createdAt: IN('10-07'),
      createdBy: 'U-1',
      supplierId: supplier.id,
      warehouse: 'besar',
      lines: [line(target, 5, 1200)],
      total: 6000,
      status: 'dipesan',
    });
    return { store, target, other };
  }

  it('jual: paling banyak limit harga, terbaru dahulu', () => {
    const { store, target } = fixture();
    const result = priceHistory({
      state: store.getState(),
      product: target,
      kind: 'jual',
      limit: 3,
    });
    expect(result.map((row) => row.price)).toEqual([9999, 5300, 5200]);
  });

  it('jual dengan satuan tertentu hanya memuat satuan itu', () => {
    const { store, target } = fixture();
    const result = priceHistory({
      state: store.getState(),
      product: target,
      kind: 'jual',
      limit: 3,
      unit: target.baseUnit,
    });
    expect(result.map((row) => row.price)).toEqual([5300, 5200, 5100]);
  });

  it('beli: faktur pemasok dan PO, terbaru dahulu', () => {
    const { store, target } = fixture();
    const result = priceHistory({
      state: store.getState(),
      product: target,
      kind: 'beli',
      limit: 3,
    });
    expect(result.map((row) => row.price)).toEqual([1200, 1100, 1000]);
  });

  it('barang tanpa transaksi menghasilkan daftar kosong', () => {
    const { store } = fixture();
    const product = need(store.getState().data.products.at(-1));
    expect(priceHistory({ state: store.getState(), product, kind: 'beli', limit: 3 })).toEqual([]);
    expect(priceHistory({ state: store.getState(), product, kind: 'jual', limit: 3 })).toEqual([]);
  });
});
