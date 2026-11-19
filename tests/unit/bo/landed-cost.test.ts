import { describe, expect, it } from 'vitest';
import type { DocLine } from '../../../src/apps/bo/domain/doc-line';
import { formatDocNumber } from '../../../src/apps/bo/domain/doc-number';
import {
  costPart,
  hppAfterPurchase,
  purchaseCostUpdates,
} from '../../../src/apps/bo/domain/landed-cost';
import { nextProductCode } from '../../../src/apps/bo/domain/product-form';
import { nextOrderNumber } from '../../../src/apps/bo/domain/order-list';
import { slashIso, slashStamp } from '../../../src/apps/bo/short-date';
import type { Product } from '../../../src/shared/data/types';

// Barang uji: satuan dasar PCS dan satuan DUS isi 10, stok toko 20 dan gudang 30, HPP rata-rata 1.000.
const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 'P-1',
    code: 'B0001',
    name: 'PAKU',
    baseUnit: 'PCS',
    units: [
      { code: 'PCS', name: 'PCS', factor: 1 },
      { code: 'DUS', name: 'DUS', factor: 10 },
    ],
    stock: { display: 20, besar: 30 },
    hpp: 900,
    hppAvg: 1_000,
    ...over,
  }) as unknown as Product;

const line = (over: Partial<DocLine> = {}): DocLine => ({
  id: 'L-1',
  productId: 'P-1',
  productName: 'PAKU',
  code: 'B0001',
  warehouse: 'gudang',
  unit: 'PCS',
  quantity: 50,
  unitPrice: 1_200,
  discountExpr: '',
  shipping: 0,
  koli: false,
  ...over,
});

describe('biaya masuk pembelian dengan ongkos kirim (revisi BO putaran 10)', () => {
  it('ongkos kirim per satuan menambah biaya masuk tetapi tidak harga beli bersih', () => {
    const part = costPart(product(), line({ shipping: 100 }));
    expect(part.baseQuantity).toBe(50);
    expect(part.netCost).toBe(1_200);
    expect(part.landedCost).toBe(1_300);
  });

  it('satuan besar dibagi faktor satuan: biaya per satuan dasar', () => {
    const part = costPart(
      product(),
      line({ unit: 'DUS', quantity: 5, unitPrice: 12_000, shipping: 1_000 }),
    );
    expect(part.baseQuantity).toBe(50);
    expect(part.netCost).toBe(1_200);
    expect(part.landedCost).toBe(1_300);
  });

  it('HPP rata-rata tertimbang oleh stok yang ada: (50 x 1.000 + 50 x 1.300) / 100', () => {
    const part = costPart(product(), line({ shipping: 100 }));
    expect(hppAfterPurchase(product(), [part])).toBe(1_150);
  });

  it('tanpa ongkos kirim HPP hanya dipengaruhi harga beli', () => {
    const part = costPart(product(), line());
    expect(hppAfterPurchase(product(), [part])).toBe(1_100);
  });

  it('tanpa stok HPP baru sama dengan biaya masuk pembelian', () => {
    const empty = product({ stock: { display: 0, besar: 0 } });
    const part = costPart(empty, line({ shipping: 100 }));
    expect(hppAfterPurchase(empty, [part])).toBe(1_300);
  });

  it('pembaruan per barang: HPP rata-rata dan harga beli akhir tanpa ongkos kirim', () => {
    const updates = purchaseCostUpdates(
      [line({ shipping: 100 }), line({ id: 'L-2', unitPrice: 1_400, shipping: 100 })],
      (id) => (id === 'P-1' ? product() : undefined),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.lastPurchasePrice).toBe(1_400);
    // stok 50 x 1.000, beli 50 x 1.300 dan 50 x 1.500
    expect(updates[0]?.hppAvg).toBe(Math.round((50 * 1_000 + 50 * 1_300 + 50 * 1_500) / 150));
  });

  it('baris barang yang tidak dikenal dilewati', () => {
    expect(purchaseCostUpdates([line()], () => undefined)).toEqual([]);
  });
});

describe('nomor dan kode otomatis (revisi BO putaran 10)', () => {
  it('nomor dokumen: awalan, tahun dan bulan, lalu empat digit', () => {
    expect(formatDocNumber('FJ', '2026-11-19', 123)).toBe('FJ26110123');
    expect(formatDocNumber('PO', '2026-11-19', 1)).toBe('PO26110001');
  });

  it('nomor PO melanjutkan urutan bulan itu dengan empat digit', () => {
    expect(nextOrderNumber('po', [], '2026-11-19')).toBe('PO26111001');
    expect(nextOrderNumber('po', ['PO26111001', 'PO26111005', 'PO26101900'], '2026-11-19')).toBe(
      'PO26111006',
    );
  });

  it('kode barang baru empat digit melanjutkan angka terbesar, termasuk kode berawalan huruf', () => {
    expect(nextProductCode([])).toBe('0001');
    expect(nextProductCode([{ code: '0001' }, { code: '0002' }])).toBe('0003');
    expect(nextProductCode([{ code: 'B0042' }, { code: 'P001' }])).toBe('0043');
  });
});

describe('tanggal hari/bulan/tahun dengan garis miring', () => {
  it('tanggal ISO dan cap waktu', () => {
    expect(slashIso('2026-10-19')).toBe('19/10/2026');
    expect(slashIso('')).toBe('-');
    expect(slashStamp('2026-10-19 08:05:12')).toBe('19/10/2026 08:05:12');
    expect(slashStamp('Belum pernah')).toBe('Belum pernah');
  });
});
