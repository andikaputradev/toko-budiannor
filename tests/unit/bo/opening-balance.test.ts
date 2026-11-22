import { describe, expect, it } from 'vitest';
import {
  draftOfEntry,
  parseOpening,
  seedOpening,
  stockAfter,
  stockReplaced,
  type OpeningEntry,
} from '../../../src/apps/bo/domain/opening-balance';
import { need, sampleProduct } from './support';

// Penyesuaian akhir: baris Saldo Stok Awal dapat diklik dan diubah lewat kotak Isi Saldo Awal.
const product = { ...sampleProduct(), stock: { display: 100, besar: 400 } };
const kg = need(product.units.find((unit) => unit.name === 'Kg'));
const sak = need(product.units.find((unit) => unit.name === 'Sak'));

const previous: OpeningEntry = {
  date: '2026-10-19',
  quantity: 100,
  unit: kg.code,
  warehouse: 'display',
  unitCost: 1_100,
};

describe('mengganti catatan saldo awal', () => {
  it('melepas catatan lama lalu menambah yang baru pada gudang yang sama', () => {
    const next = { ...previous, quantity: 150 };
    expect(stockReplaced(product, previous, next)).toEqual({ display: 150, besar: 400 });
    expect(stockReplaced(product, previous, { ...previous, quantity: 20 })).toEqual({
      display: 20,
      besar: 400,
    });
  });

  it('memindahkan stok bila gudang atau satuan berubah', () => {
    const moved: OpeningEntry = { ...previous, warehouse: 'besar', unit: sak.code, quantity: 2 };
    expect(stockReplaced(product, previous, moved)).toEqual({
      display: 0,
      besar: 400 + 2 * sak.factor,
    });
  });

  it('tanpa perubahan, stok tidak bergeser; sama dengan menambah catatan yang sama setelah dilepas', () => {
    expect(stockReplaced(product, previous, previous)).toEqual(product.stock);
    const added = stockAfter(product, previous);
    expect(added.display).toBe(product.stock.display + 100);
  });

  it('stok yang lebih kecil dari catatan lama menjadi minus, dan pemanggil dapat menolaknya', () => {
    const sold = { ...product, stock: { display: 10, besar: 0 } };
    expect(stockReplaced(sold, previous, { ...previous, quantity: 20 }).display).toBe(-70);
  });

  it('isian dialog memuat nilai catatan dan lolos penguraian yang sama', () => {
    const draft = draftOfEntry(previous, '100', '1.100');
    expect(draft).toEqual({
      warehouse: 'display',
      date: '2026-10-19',
      quantity: '100',
      unit: kg.code,
      cost: '1.100',
    });
    const parsed = parseOpening(product, draft);
    expect(parsed).toEqual({ ok: true, entry: previous });
  });

  it('catatan awal bawaan dibangkitkan dari stok dan bisa diganti', () => {
    const seeded = seedOpening(product, '2026-10-19');
    expect(seeded.map((entry) => entry.warehouse)).toEqual(['display', 'besar']);
    const first = need(seeded[0]);
    const stock = stockReplaced(product, first, { ...first, quantity: first.quantity + 1 });
    expect(stock.display).toBeGreaterThan(product.stock.display);
    expect(stock.besar).toBe(product.stock.besar);
  });
});
