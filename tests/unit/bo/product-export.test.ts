import { describe, expect, it } from 'vitest';
import {
  OWNER_ONLY_COLUMNS,
  availableColumns,
  buildExport,
  type ExportColumnId,
  type ExportParams,
} from '../../../src/apps/bo/domain/product-export';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';

const all = generateDataset().products;

const params = (override: Partial<ExportParams> = {}): ExportParams => ({
  columns: ['kode', 'nama'],
  category: '',
  brand: '',
  status: 'semua',
  stock: 'semua',
  text: '',
  ...override,
});

function product(override: Partial<Product>): Product {
  const first = all[0];
  if (first === undefined) {
    throw new Error('dataset kosong');
  }
  return { ...first, ...override };
}

describe('kolom ekspor', () => {
  it('HPP dan Harga Beli Akhir hanya tersedia untuk Owner', () => {
    expect([...OWNER_ONLY_COLUMNS].sort()).toEqual(['hargaBeliAkhir', 'hpp']);
    expect(availableColumns('owner')).toEqual(expect.arrayContaining(['hpp', 'hargaBeliAkhir']));
    for (const role of ['supervisor', 'kasir', 'frontliner', 'sales'] as const) {
      const columns = availableColumns(role);
      expect(columns).not.toContain('hpp');
      expect(columns).not.toContain('hargaBeliAkhir');
      expect(columns).toContain('kode');
    }
  });

  it('Supervisor yang meminta hpp dan hargaBeliAkhir tidak mendapatkannya; Owner mendapatkannya', () => {
    const requested: ExportColumnId[] = ['kode', 'hpp', 'hargaBeliAkhir', 'nama'];
    const supervisor = buildExport([product({})], params({ columns: requested }), 'supervisor');
    expect(supervisor.columns).toEqual(['Kode', 'Nama Barang']);
    const owner = buildExport([product({})], params({ columns: requested }), 'owner');
    expect(owner.columns).toEqual(['Kode', 'Nama Barang', 'HPP', 'Harga Beli Akhir']);
  });

  it('urutan kolom mengikuti susunan baku, bukan urutan permintaan', () => {
    const result = buildExport([product({})], params({ columns: ['nama', 'kode'] }), 'owner');
    expect(result.columns).toEqual(['Kode', 'Nama Barang']);
  });
});

describe('isi dan filter ekspor', () => {
  it('kolom harga memuat satuan dan harga untuk semua satuan barang', () => {
    const multi = product({
      baseUnit: 'Pcs',
      units: [
        { code: 'Pcs', name: 'Pcs', factor: 1 },
        { code: 'LSN', name: 'LSN', factor: 12 },
        { code: 'DOS', name: 'DOS', factor: 60 },
      ],
      prices: {
        Pcs: { eceran: 1000, grosir: 900, kontraktor: 855 },
        LSN: { eceran: 12_000, grosir: 10_800, kontraktor: 10_260 },
        DOS: { eceran: 60_000, grosir: 54_000, kontraktor: 51_300 },
      },
    });
    const result = buildExport(
      [multi],
      params({ columns: ['hargaEcer', 'hargaGrosir', 'hargaKontraktor', 'satuan'] }),
      'owner',
    );
    expect(result.columns).toEqual(['Satuan', 'Harga Eceran', 'Harga Grosir', 'Harga Kontraktor']);
    expect(result.rows[0]).toEqual([
      'Pcs; LSN = 12; DOS = 60',
      'Pcs 1.000; LSN 12.000; DOS 60.000',
      'Pcs 900; LSN 10.800; DOS 54.000',
      'Pcs 855; LSN 10.260; DOS 51.300',
    ]);
  });

  it('stok menampilkan Toko, Gudang, dan total dalam satuan dasar', () => {
    const stocked = product({ stock: { display: 7, besar: 48.5 } });
    const result = buildExport(
      [stocked],
      params({ columns: ['stokToko', 'stokGudang', 'stokTotal'] }),
      'owner',
    );
    expect(result.rows[0]).toEqual(['7', '48,5', '55,5']);
  });

  it('menyaring menurut kategori, merk, status, stok, dan teks', () => {
    const a = product({ id: 'X1', code: 'AAA01', name: 'Semen Uji', category: 'K1', brand: 'M1' });
    const b = product({
      id: 'X2',
      code: 'BBB02',
      name: 'Cat Uji',
      category: 'K2',
      brand: 'M2',
      active: false,
      stock: { display: 0, besar: 0 },
      minStock: 5,
    });
    const c = product({
      id: 'X3',
      code: 'CCC03',
      name: 'Pipa Uji',
      category: 'K1',
      brand: 'M2',
      stock: { display: 2, besar: 1 },
      minStock: 10,
    });
    const rows = (override: Partial<ExportParams>): string[] =>
      buildExport([a, b, c], params(override), 'owner').rows.map((row) => row[0] ?? '');

    expect(rows({ category: 'K1' })).toEqual(['AAA01', 'CCC03']);
    expect(rows({ brand: 'M2' })).toEqual(['BBB02', 'CCC03']);
    expect(rows({ status: 'nonaktif' })).toEqual(['BBB02']);
    expect(rows({ status: 'aktif' })).toEqual(['AAA01', 'CCC03']);
    expect(rows({ stock: 'kosong' })).toEqual(['BBB02']);
    expect(rows({ stock: 'dibawah-minimum' })).toEqual(['BBB02', 'CCC03']);
    expect(rows({ text: 'pipa' })).toEqual(['CCC03']);
    expect(rows({ text: 'bbb' })).toEqual(['BBB02']);
  });

  it('filter yang tidak menyisakan barang menghasilkan baris kosong, kolom tetap ada', () => {
    const result = buildExport([product({})], params({ text: 'tidak-ada-barang-ini' }), 'owner');
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual(['Kode', 'Nama Barang']);
  });

  it('komisi dan promo tampil dalam persen, kosong bila tidak diisi', () => {
    const filled = product({
      salesCommission: { percent: 2.5, nominal: 0 },
      promo: { percent: 10, nominal: 0 },
    });
    const empty = product({ salesCommission: undefined, promo: undefined });
    const columns: ExportColumnId[] = ['komisi', 'promo'];
    expect(buildExport([filled], params({ columns }), 'owner').rows[0]).toEqual(['2,5%', '10%']);
    expect(buildExport([empty], params({ columns }), 'owner').rows[0]).toEqual(['', '']);
  });
});
