import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import type { BillLine, Product } from '../../../src/shared/data/types';
import { unitPrice } from '../../../src/shared/data/units';
import {
  addLine,
  billTotal,
  defaultUnitOf,
  discountAmount,
  itemCount,
  lineGross,
  lineSubtotal,
  MAX_BILL_LINES,
  removeLine,
  mergeLines,
  repriceLines,
  splitLines,
  validateDiscount,
} from '../../../src/apps/pos/domain/bill';
import { isShort } from '../../../src/apps/pos/domain/stock';

const dataset = generateDataset();

function find(prefix: string): Product {
  const product = dataset.products.find((item) => item.name.startsWith(prefix));
  if (product === undefined) {
    throw new Error(prefix);
  }
  return product;
}

const semen = find('Semen');
const kabel = find('Kabel NYM');
const bata = find('Bata Merah');

function line(product: Product, unit: string, quantity: number): BillLine {
  return { productId: product.id, unit, quantity, unitPrice: unitPrice(product, unit, 'eceran') };
}

describe('total bill', () => {
  it('menghitung subtotal sebagai jumlah dikali harga dibulatkan ke rupiah', () => {
    expect(lineSubtotal({ productId: 'x', unit: 'Kg', quantity: 25.5, unitPrice: 1337 })).toBe(
      34094,
    );
    expect(lineSubtotal({ productId: 'x', unit: 'Kg', quantity: 0.333, unitPrice: 1000 })).toBe(
      333,
    );
    expect(lineSubtotal({ productId: 'x', unit: 'Kg', quantity: 1.5, unitPrice: 1337000 })).toBe(
      2005500,
    );
  });

  it('menjumlahkan seluruh baris dan menghitung jenis barang', () => {
    const lines = [line(semen, 'Sak', 2), line(semen, 'Kg', 5), line(kabel, 'Meter', 12.5)];
    const expected = lines.reduce((sum, item) => sum + lineSubtotal(item), 0);
    expect(billTotal(lines)).toBe(expected);
    expect(itemCount(lines)).toBe(2);
    expect(billTotal([])).toBe(0);
  });

  it('tidak membawa galat apung pada pecahan desimal berulang', () => {
    const first = addLine([], line(kabel, 'Meter', 0.1));
    const second = first.ok ? addLine(first.lines, line(kabel, 'Meter', 0.2)) : first;
    expect(second.ok && second.lines[0]?.quantity).toBe(0.3);
  });
});

describe('baris bill', () => {
  it('menambah jumlah pada baris yang sama tanpa baris baru', () => {
    const first = addLine([], line(semen, 'Sak', 1));
    const second = first.ok ? addLine(first.lines, line(semen, 'Sak', 1)) : first;
    const third = second.ok ? addLine(second.lines, line(semen, 'Sak', 1)) : second;
    expect(third.ok && third.lines).toHaveLength(1);
    expect(third.ok && third.lines[0]?.quantity).toBe(3);
  });

  it('memisahkan baris untuk satuan berbeda', () => {
    const first = addLine([], line(semen, 'Sak', 1));
    const second = first.ok ? addLine(first.lines, line(semen, 'Kg', 1)) : first;
    expect(second.ok && second.lines).toHaveLength(2);
  });

  it('membatasi satu bill pada 200 baris', () => {
    let lines: readonly BillLine[] = [];
    for (let index = 0; index < MAX_BILL_LINES; index += 1) {
      const product = dataset.products[index];
      if (product === undefined) {
        throw new Error('data kurang');
      }
      const result = addLine(lines, line(product, product.baseUnit, 1));
      lines = result.ok ? result.lines : lines;
    }
    expect(lines).toHaveLength(200);
    const extra = dataset.products[200];
    expect(extra && addLine(lines, line(extra, extra.baseUnit, 1))).toEqual({
      ok: false,
      reason: 'max-lines',
    });
    expect(addLine(lines, line(semen, semen.baseUnit, 1)).ok).toBe(true);
  });

  it('menghapus baris dan menghitung ulang harga saat tier berganti', () => {
    const lines = [line(semen, 'Sak', 2), line(bata, 'Pcs', 100)];
    expect(removeLine(lines, 0)).toHaveLength(1);
    const map = new Map(dataset.products.map((item) => [item.id, item]));
    const repriced = repriceLines(lines, map, 'grosir');
    expect(repriced[0]?.unitPrice).toBe(unitPrice(semen, 'Sak', 'grosir'));
    expect(repriced[0]?.unitPrice).toBeLessThan(lines[0]?.unitPrice ?? 0);
  });

  it('memilih satuan bawaan Sak untuk semen dan satuan dasar untuk barang lain', () => {
    expect(defaultUnitOf(semen).code).toBe('Sak');
    expect(defaultUnitOf(bata).code).toBe('Pcs');
  });

  it('menandai stok kurang bila jumlah bill melebihi stok dikurangi yang terjual', () => {
    const total = semen.stock.display + semen.stock.besar;
    const ok = [line(semen, 'Kg', Math.floor(total))];
    expect(isShort(ok, semen, 0)).toBe(false);
    expect(isShort(ok, semen, 5)).toBe(true);
    expect(isShort([line(semen, 'Sak', Math.ceil(total / 40) + 1)], semen, 0)).toBe(true);
  });
});

describe('diskon baris', () => {
  const base: BillLine = { productId: 'x', unit: 'Sak', quantity: 3, unitPrice: 70000 };

  it('lineSubtotal mengurangi diskon persen dan nominal dengan pembulatan rupiah', () => {
    expect(lineGross(base)).toBe(210000);
    expect(lineSubtotal(base)).toBe(210000);
    expect(lineSubtotal({ ...base, discount: { kind: 'persen', value: 10 } })).toBe(189000);
    expect(lineSubtotal({ ...base, discount: { kind: 'nominal', value: 5000 } })).toBe(205000);
    const odd: BillLine = { productId: 'x', unit: 'Sak', quantity: 1, unitPrice: 33333 };
    expect(discountAmount({ ...odd, discount: { kind: 'persen', value: 15 } })).toBe(5000);
    expect(lineSubtotal({ ...odd, discount: { kind: 'persen', value: 15 } })).toBe(28333);
  });

  it('diskon dijepit pada jumlah baris dan tidak pernah negatif', () => {
    expect(discountAmount({ ...base, discount: { kind: 'nominal', value: 999999 } })).toBe(210000);
    expect(lineSubtotal({ ...base, discount: { kind: 'nominal', value: 999999 } })).toBe(0);
    expect(discountAmount({ ...base, discount: { kind: 'persen', value: 250 } })).toBe(210000);
    expect(discountAmount({ ...base, discount: { kind: 'nominal', value: -5 } })).toBe(0);
    expect(discountAmount({ ...base, discount: { kind: 'persen', value: Number.NaN } })).toBe(0);
    expect(discountAmount(base)).toBe(0);
  });

  it('validateDiscount menolak negatif, persen di atas 100, dan nominal melebihi jumlah baris', () => {
    expect(validateDiscount('persen', -1, 210000)).toBe('negatif');
    expect(validateDiscount('nominal', -1, 210000)).toBe('negatif');
    expect(validateDiscount('persen', Number.NaN, 210000)).toBe('negatif');
    expect(validateDiscount('persen', 101, 210000)).toBe('melebihi');
    expect(validateDiscount('nominal', 210001, 210000)).toBe('melebihi');
    expect(validateDiscount('persen', 100, 210000)).toBe('ok');
    expect(validateDiscount('persen', 0, 210000)).toBe('ok');
    expect(validateDiscount('nominal', 210000, 210000)).toBe('ok');
  });

  it('billTotal menjumlahkan subtotal setelah diskon', () => {
    const lines: BillLine[] = [
      { ...base, discount: { kind: 'persen', value: 10 } },
      { productId: 'y', unit: 'Kg', quantity: 2, unitPrice: 1000 },
    ];
    expect(billTotal(lines)).toBe(189000 + 2000);
  });

  it('repriceLines memberi harga tier baru, tetapi menjaga harga yang diubah kasir', () => {
    const products = new Map([[semen.id, semen]]);
    const eceran = unitPrice(semen, 'Sak', 'eceran');
    const grosir = unitPrice(semen, 'Sak', 'grosir');
    const plain: BillLine = { productId: semen.id, unit: 'Sak', quantity: 1, unitPrice: eceran };
    const manual: BillLine = {
      productId: semen.id,
      unit: 'Sak',
      quantity: 1,
      unitPrice: eceran - 1000,
      listPrice: eceran,
    };
    const [first, second] = repriceLines([plain, manual], products, 'grosir');
    expect(first?.unitPrice).toBe(grosir);
    expect(first?.listPrice).toBeUndefined();
    expect(second?.unitPrice).toBe(eceran - 1000);
    expect(second?.listPrice).toBe(grosir);
  });
});

describe('split dan merge baris bill', () => {
  const semenLine: BillLine = { productId: 'P-01', unit: 'SAK', quantity: 4, unitPrice: 70000 };
  const lemLine: BillLine = { productId: 'P-02', unit: 'KLG', quantity: 2, unitPrice: 10000 };

  it('splitLines memindahkan jumlah sebagian dan menghapus baris yang habis dari yang tersisa', () => {
    const result = splitLines(
      [semenLine, lemLine],
      [
        { index: 0, quantity: 1.5 },
        { index: 1, quantity: 2 },
      ],
    );
    if ('error' in result) {
      throw new Error(result.error);
    }
    expect(result.kept).toEqual([{ ...semenLine, quantity: 2.5 }]);
    expect(result.moved).toEqual([{ ...semenLine, quantity: 1.5 }, lemLine]);
  });

  it('splitLines menolak daftar kosong, jumlah melebihi isi, dan pemindahan semua baris', () => {
    expect(splitLines([semenLine], [])).toEqual({ error: 'kosong' });
    expect(splitLines([semenLine], [{ index: 0, quantity: 0 }])).toEqual({ error: 'kosong' });
    expect(splitLines([semenLine], [{ index: 0, quantity: 4.001 }])).toEqual({
      error: 'melebihi',
    });
    expect(splitLines([semenLine], [{ index: 5, quantity: 1 }])).toEqual({ error: 'melebihi' });
    expect(splitLines([semenLine], [{ index: 0, quantity: 4 }])).toEqual({ error: 'semua' });
    expect(
      splitLines(
        [semenLine, lemLine],
        [
          { index: 0, quantity: 4 },
          { index: 1, quantity: 2 },
        ],
      ),
    ).toEqual({ error: 'semua' });
  });

  it('splitLines menjumlahkan pilihan ganda pada baris yang sama dan tidak melampaui isi', () => {
    const result = splitLines(
      [semenLine, lemLine],
      [
        { index: 0, quantity: 1 },
        { index: 0, quantity: 1 },
      ],
    );
    if ('error' in result) {
      throw new Error(result.error);
    }
    expect(result.moved[0]?.quantity).toBe(2);
    expect(result.kept[0]?.quantity).toBe(2);
    expect(
      splitLines(
        [semenLine, lemLine],
        [
          { index: 0, quantity: 3 },
          { index: 0, quantity: 2 },
        ],
      ),
    ).toEqual({ error: 'melebihi' });
  });

  it('split memperhatikan diskon dan catatan baris', () => {
    const percent: BillLine = {
      ...semenLine,
      discount: { kind: 'persen', value: 10 },
      note: 'Antar sore',
      sellerId: 'U-5',
    };
    const nominal: BillLine = {
      ...lemLine,
      quantity: 3,
      discount: { kind: 'nominal', value: 1000 },
    };
    const result = splitLines(
      [percent, nominal],
      [
        { index: 0, quantity: 1 },
        { index: 1, quantity: 1 },
      ],
    );
    if ('error' in result) {
      throw new Error(result.error);
    }
    expect(result.moved[0]).toMatchObject({
      discount: { kind: 'persen', value: 10 },
      note: 'Antar sore',
      sellerId: 'U-5',
    });
    expect(result.kept[0]).toMatchObject({
      discount: { kind: 'persen', value: 10 },
      note: 'Antar sore',
      sellerId: 'U-5',
    });
    const movedNominal = result.moved[1]?.discount;
    const keptNominal = result.kept[1]?.discount;
    expect(movedNominal).toEqual({ kind: 'nominal', value: 333 });
    expect(keptNominal).toEqual({ kind: 'nominal', value: 667 });
    expect((movedNominal?.value ?? 0) + (keptNominal?.value ?? 0)).toBe(1000);
  });

  it('mergeLines menjumlahkan barang dan satuan sama dan mempertahankan harga bill target', () => {
    const target: BillLine[] = [semenLine];
    const source: BillLine[] = [{ ...semenLine, quantity: 1.5, unitPrice: 65000 }];
    const merged = mergeLines(target, source);
    expect(merged).toEqual([{ ...semenLine, quantity: 5.5 }]);
  });

  it('mergeLines menjaga baris dengan satuan atau barang berbeda terpisah, termasuk diskon dan catatan', () => {
    const target: BillLine[] = [semenLine];
    const otherUnit: BillLine = { ...semenLine, unit: 'KG', quantity: 5, unitPrice: 1800 };
    const noted: BillLine = {
      ...lemLine,
      note: 'Warna putih',
      discount: { kind: 'persen', value: 5 },
    };
    const merged = mergeLines(target, [otherUnit, noted]);
    expect(merged).toEqual([semenLine, otherUnit, noted]);
    expect(merged).not.toBe(target);
  });
});

describe('diskon dan harga ubahan pada gabungan dan perubahan harga tier', () => {
  const base: BillLine = { productId: semen.id, unit: 'Sak', quantity: 2, unitPrice: 70000 };

  it('mergeLines menjumlahkan diskon nominal dan mempertahankan diskon persen yang sama', () => {
    const nominal = mergeLines(
      [{ ...base, discount: { kind: 'nominal', value: 10000 } }],
      [{ ...base, quantity: 1, discount: { kind: 'nominal', value: 5000 } }],
    );
    expect(nominal).toEqual([
      { ...base, quantity: 3, discount: { kind: 'nominal', value: 15000 } },
    ]);
    const percent = mergeLines(
      [{ ...base, discount: { kind: 'persen', value: 10 } }],
      [{ ...base, quantity: 1, discount: { kind: 'persen', value: 10 } }],
    );
    expect(percent).toEqual([{ ...base, quantity: 3, discount: { kind: 'persen', value: 10 } }]);
  });

  it('mergeLines tidak menghapus diskon, harga ubahan, atau catatan sumber: syarat berbeda tetap terpisah', () => {
    const plain = { ...base };
    const cases: BillLine[] = [
      { ...base, quantity: 1, discount: { kind: 'nominal', value: 10000 } },
      { ...base, quantity: 1, discount: { kind: 'persen', value: 5 } },
      { ...base, quantity: 1, unitPrice: 65000, listPrice: 70000 },
      { ...base, quantity: 1, note: 'Warna putih' },
      { ...base, quantity: 1, sellerId: 'U-5' },
    ];
    for (const source of cases) {
      const merged = mergeLines([plain], [source]);
      expect(merged, JSON.stringify(source)).toEqual([plain, source]);
    }
    const bothDiscounted = mergeLines(
      [{ ...base, discount: { kind: 'persen', value: 10 } }],
      [{ ...base, quantity: 1, discount: { kind: 'persen', value: 20 } }],
    );
    expect(bothDiscounted).toHaveLength(2);
  });

  it('repriceLines membuang diskon nominal yang melebihi jumlah baris setelah harga tier turun', () => {
    const products = new Map([[semen.id, semen]]);
    const eceran = unitPrice(semen, 'Sak', 'eceran');
    const grosir = unitPrice(semen, 'Sak', 'grosir');
    expect(grosir).toBeLessThan(eceran);
    const tooBig: BillLine = {
      productId: semen.id,
      unit: 'Sak',
      quantity: 1,
      unitPrice: eceran,
      discount: { kind: 'nominal', value: grosir + 500 },
    };
    const fits: BillLine = { ...tooBig, discount: { kind: 'nominal', value: 100 } };
    const percent: BillLine = { ...tooBig, discount: { kind: 'persen', value: 10 } };
    const [first, second, third] = repriceLines([tooBig, fits, percent], products, 'grosir');
    expect(first?.discount).toBeUndefined();
    expect(second?.discount).toEqual({ kind: 'nominal', value: 100 });
    expect(third?.discount).toEqual({ kind: 'persen', value: 10 });
  });
});
