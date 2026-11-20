import { describe, expect, it } from 'vitest';
import {
  BARCODE_HEIGHT,
  DEFAULT_COPIES,
  DEFAULT_MODEL,
  DEFAULT_PAPER,
  LABEL_MODELS,
  LABEL_PAPERS,
  MAX_COPIES,
  QR_SIZE,
  SAMPLE_LABEL,
  addEntry,
  barcodeModules,
  barcodeOf,
  barcodePath,
  buildSheet,
  clampSheet,
  defaultUnitOf,
  entryKey,
  initialEntries,
  labelDataOf,
  labelFace,
  modelOf,
  paperOf,
  paperTitle,
  parseCopies,
  priceText,
  qrMatrix,
  qrPath,
  removeEntry,
  resolveEntries,
  sheetCount,
  totalLabels,
  unitChoices,
  type PrintEntry,
  type PrintItem,
} from '../../../src/apps/bo/domain/barcode-labels';
import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
import { need } from './support';

const products = generateDataset().products;

function byCode(code: string): Product {
  return need(products.find((product) => product.code === code));
}

function item(code: string, copies: number, unit?: string): PrintItem {
  const product = byCode(code);
  const [resolved] = resolveEntries(
    [{ productId: product.id, unit: unit ?? product.baseUnit, copies }],
    products,
  );
  return need(resolved);
}

describe('Model label', () => {
  it('menyediakan empat model berurutan Model 1 sampai Model 4', () => {
    expect(LABEL_MODELS.map((model) => model.name)).toEqual([
      'Model 1',
      'Model 2',
      'Model 3',
      'Model 4',
    ]);
    expect(DEFAULT_MODEL).toBe('model-1');
  });

  it('Model 1 dan 3 memakai kode QR, Model 2 dan 4 memakai barcode garis', () => {
    expect(LABEL_MODELS.map((model) => model.symbol)).toEqual(['qr', 'barcode', 'qr', 'barcode']);
  });

  it('hanya Model 1 dan 2 memuat harga', () => {
    expect(LABEL_MODELS.map((model) => model.showPrice)).toEqual([true, true, false, false]);
  });

  it('Model 1: kode QR, [kode], nama, dan harga tebal per satuan', () => {
    expect(labelFace(modelOf('model-1'), SAMPLE_LABEL)).toEqual({
      symbol: 'qr',
      code: '[2308]',
      name: 'Grendel Bellucci 2" Sncp',
      price: 'Rp 35.000 / Pcs',
    });
  });

  it('Model 2: harga di atas, [kode]-nama, barcode garis, lalu angka barcode', () => {
    expect(labelFace(modelOf('model-2'), SAMPLE_LABEL)).toEqual({
      symbol: 'barcode',
      head: 'Rp 35.000 / Pcs',
      name: '[2308]-Grendel Bellucci 2" Sncp',
      digits: '00089401001',
    });
  });

  it('Model 3: kode QR dengan [ kode ] dan nama, tanpa harga', () => {
    const face = labelFace(modelOf('model-3'), SAMPLE_LABEL);
    expect(face).toEqual({
      symbol: 'qr',
      code: '[ 2308 ]',
      name: 'Grendel Bellucci 2" Sncp',
    });
    expect(face).not.toHaveProperty('price');
    expect(face).not.toHaveProperty('head');
  });

  it('Model 4: [ kode ], nama, barcode garis, dan angka barcode, tanpa harga', () => {
    const face = labelFace(modelOf('model-4'), SAMPLE_LABEL);
    expect(face).toEqual({
      symbol: 'barcode',
      code: '[ 2308 ]',
      name: 'Grendel Bellucci 2" Sncp',
      digits: '00089401001',
    });
    expect(face).not.toHaveProperty('price');
    expect(face).not.toHaveProperty('head');
  });

  it('angka barcode memakai kode barang bila barcode kosong', () => {
    const face = labelFace(modelOf('model-4'), { ...SAMPLE_LABEL, barcode: '' });
    expect(face.digits).toBe('2308');
  });

  it('harga ditulis dengan titik ribuan dan satuan', () => {
    expect(priceText(2800, 'Pcs')).toBe('Rp 2.800 / Pcs');
    expect(priceText(406700, 'Pail')).toBe('Rp 406.700 / Pail');
  });
});

describe('Kertas label Tom & Jerry', () => {
  it('menyediakan No 125 (54), No 108 (40), dan No 121 (10) dengan teks persis gambar klien', () => {
    expect(LABEL_PAPERS.map(paperTitle)).toEqual([
      'TJ Label No 125 (54)',
      'TJ Label No 108 (40)',
      'TJ Label No 121 (10)',
    ]);
    expect(DEFAULT_PAPER).toBe('tj-125');
  });

  it('jumlah label per lembar sama dengan kolom kali baris', () => {
    for (const paper of LABEL_PAPERS) {
      expect(paper.columns * paper.rows).toBe(paper.perSheet);
    }
    expect(paperOf('tj-125')).toMatchObject({ columns: 6, rows: 9 });
    expect(paperOf('tj-108')).toMatchObject({ columns: 5, rows: 8 });
    expect(paperOf('tj-121')).toMatchObject({ columns: 2, rows: 5 });
  });
});

describe('Jumlah cetakan', () => {
  it('menerima bilangan bulat 1 sampai batas atas', () => {
    expect(parseCopies('6')).toEqual({ ok: true, value: 6 });
    expect(parseCopies(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseCopies('1')).toEqual({ ok: true, value: 1 });
    expect(parseCopies(String(MAX_COPIES))).toEqual({ ok: true, value: MAX_COPIES });
    expect(parseCopies('007')).toEqual({ ok: true, value: 7 });
  });

  it('menolak kosong', () => {
    expect(parseCopies('')).toEqual({ ok: false, issue: 'kosong' });
    expect(parseCopies('   ')).toEqual({ ok: false, issue: 'kosong' });
  });

  it('menolak nol dan angka negatif', () => {
    expect(parseCopies('0')).toEqual({ ok: false, issue: 'kurang' });
    expect(parseCopies('-3')).toEqual({ ok: false, issue: 'kurang' });
  });

  it('menolak pecahan, huruf, dan notasi ilmiah', () => {
    for (const raw of ['2.5', '2,5', 'abc', '1e3', '+4', '6 7', '0x10']) {
      expect(parseCopies(raw)).toEqual({ ok: false, issue: 'bukan-bulat' });
    }
  });

  it('menolak angka di atas batas atas, termasuk yang sangat panjang', () => {
    expect(parseCopies(String(MAX_COPIES + 1))).toEqual({ ok: false, issue: 'terlalu-banyak' });
    expect(parseCopies('9'.repeat(400))).toEqual({ ok: false, issue: 'terlalu-banyak' });
  });
});

describe('Daftar cetak', () => {
  const lem = byCode('B0016');
  const baut = byCode('B0007');
  const first: PrintEntry = { productId: lem.id, unit: 'Pcs', copies: 6 };

  it('daftar awal berisi satu baris contoh B0016 satuan Pcs sebanyak 6', () => {
    expect(initialEntries(products)).toEqual([{ productId: lem.id, unit: 'Pcs', copies: 6 }]);
    expect(DEFAULT_COPIES).toBe(6);
  });

  it('daftar awal memakai barang pertama berbarcode bila B0016 tidak ada', () => {
    const rest = products.filter((product) => product.code !== 'B0016');
    const entries = initialEntries(rest);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.productId).toBe(need(rest.find((p) => p.barcode !== '')).id);
    expect(initialEntries([])).toEqual([]);
  });

  it('baris contoh dibaca dari katalog: kode, barcode, nama, satuan, harga, dan jumlah', () => {
    const [row] = resolveEntries(initialEntries(products), products);
    expect(row).toMatchObject({
      code: 'B0016',
      barcode: '8990000000016',
      name: 'Lem Kayu 70 g Karya Mandiri',
      unit: 'Pcs',
      price: 2800,
      copies: 6,
      key: entryKey(first),
    });
  });

  it('menambah barang baru ke akhir daftar', () => {
    const next = addEntry([first], { productId: baut.id, unit: 'Pcs', copies: 3 });
    expect(next.replaced).toBe(false);
    expect(next.entries.map((entry) => entry.productId)).toEqual([lem.id, baut.id]);
  });

  it('barang dan satuan yang sama digantikan jumlahnya pada baris yang sama', () => {
    const list = addEntry([first], { productId: baut.id, unit: 'Pcs', copies: 3 }).entries;
    const next = addEntry(list, { productId: lem.id, unit: 'Pcs', copies: 10 });
    expect(next.replaced).toBe(true);
    expect(next.entries).toEqual([
      { productId: lem.id, unit: 'Pcs', copies: 10 },
      { productId: baut.id, unit: 'Pcs', copies: 3 },
    ]);
  });

  it('barang sama dengan satuan lain menjadi baris tersendiri', () => {
    const next = addEntry([first], { productId: lem.id, unit: 'Dus', copies: 2 });
    expect(next.replaced).toBe(false);
    expect(next.entries).toHaveLength(2);
  });

  it('tidak mengubah daftar asal', () => {
    const original = [first];
    addEntry(original, { productId: lem.id, unit: 'Pcs', copies: 99 });
    expect(original).toEqual([{ productId: lem.id, unit: 'Pcs', copies: 6 }]);
  });

  it('menghapus baris menurut kunci barang dan satuan', () => {
    const list = addEntry([first], { productId: lem.id, unit: 'Dus', copies: 2 }).entries;
    expect(removeEntry(list, entryKey(first))).toEqual([
      { productId: lem.id, unit: 'Dus', copies: 2 },
    ]);
    expect(removeEntry(list, 'tidak-ada')).toHaveLength(2);
  });

  it('melewati baris yang barang atau satuannya sudah tidak ada', () => {
    const rows = resolveEntries(
      [
        first,
        { productId: 'P-9999', unit: 'Pcs', copies: 1 },
        { productId: lem.id, unit: 'Kontainer', copies: 1 },
      ],
      products,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('B0016');
  });

  it('menghitung total label dari seluruh baris', () => {
    expect(totalLabels([])).toBe(0);
    expect(totalLabels([item('B0016', 6), item('B0007', 4)])).toBe(10);
  });
});

describe('Satuan dan harga', () => {
  it('pilihan Harga Satuan memuat tiap satuan beserta harga jual eceran', () => {
    expect(unitChoices(byCode('B0016'))).toEqual([
      { code: 'Pcs', price: 2800 },
      { code: 'Dus', price: 32900 },
    ]);
  });

  it('satuan bawaan memakai satuan pertama bila tidak ada satuan bawaan khusus', () => {
    expect(defaultUnitOf(byCode('B0016'))).toBe('Pcs');
    expect(defaultUnitOf({ ...byCode('B0016'), defaultUnit: 'Dus' })).toBe('Dus');
    expect(defaultUnitOf({ ...byCode('B0016'), defaultUnit: 'Tidak Ada' })).toBe('Pcs');
  });

  it('label mengikuti satuan: harga satuan dan barcode satuan bila ada', () => {
    const lem = byCode('B0016');
    const withBarcode: Product = {
      ...lem,
      units: lem.units.map((unit) =>
        unit.code === 'Dus' ? { ...unit, barcode: '12345678' } : unit,
      ),
    };
    expect(labelDataOf(withBarcode, 'Dus')).toMatchObject({
      unit: 'Dus',
      price: 32900,
      barcode: '12345678',
    });
    expect(barcodeOf(withBarcode, 'Pcs')).toBe('8990000000016');
    expect(labelDataOf(withBarcode, 'Pcs').price).toBe(2800);
  });
});

describe('Lembar dan halaman', () => {
  const paper = paperOf('tj-125');

  it('menghitung jumlah lembar dari total label', () => {
    expect(sheetCount(6, paper)).toBe(1);
    expect(sheetCount(54, paper)).toBe(1);
    expect(sheetCount(55, paper)).toBe(2);
    expect(sheetCount(108, paper)).toBe(2);
    expect(sheetCount(109, paper)).toBe(3);
    expect(sheetCount(10, paperOf('tj-121'))).toBe(1);
    expect(sheetCount(11, paperOf('tj-121'))).toBe(2);
    expect(sheetCount(41, paperOf('tj-108'))).toBe(2);
  });

  it('nomor lembar dijaga di antara pertama dan terakhir', () => {
    expect(clampSheet(-1, 3)).toBe(0);
    expect(clampSheet(1, 3)).toBe(1);
    expect(clampSheet(7, 3)).toBe(2);
    expect(clampSheet(0, 1)).toBe(0);
  });

  it('mengisi sel berurutan dari kiri ke kanan lalu ke baris berikutnya', () => {
    const a = item('B0016', 7);
    const b = item('B0007', 2);
    const cells = buildSheet([a, b], paper, 0);
    expect(cells).toHaveLength(54);
    // Enam kolom: baris pertama penuh A, sel pertama baris kedua A, lalu dua B.
    expect(cells.slice(0, 7).every((cell) => cell?.code === 'B0016')).toBe(true);
    expect(cells[7]?.code).toBe('B0007');
    expect(cells[8]?.code).toBe('B0007');
    expect(cells[9]).toBeUndefined();
    expect(cells.filter((cell) => cell !== undefined)).toHaveLength(9);
  });

  it('letak sel mengikuti kolom dan baris kertas', () => {
    const cells = buildSheet([item('B0016', 4)], paperOf('tj-121'), 0);
    expect(cells).toHaveLength(10);
    // Dua kolom: empat label memenuhi dua baris pertama (indeks 0 sampai 3).
    expect(cells.slice(0, 4).every((cell) => cell !== undefined)).toBe(true);
    expect(cells.slice(4).every((cell) => cell === undefined)).toBe(true);
  });

  it('label yang melebihi kapasitas lanjut ke lembar berikutnya', () => {
    const rows = [item('B0016', 40), item('B0007', 20)];
    const first = buildSheet(rows, paper, 0);
    const second = buildSheet(rows, paper, 1);
    expect(first.every((cell) => cell !== undefined)).toBe(true);
    expect(first.filter((cell) => cell?.code === 'B0016')).toHaveLength(40);
    expect(first.filter((cell) => cell?.code === 'B0007')).toHaveLength(14);
    expect(second.filter((cell) => cell?.code === 'B0007')).toHaveLength(6);
    expect(second.filter((cell) => cell === undefined)).toHaveLength(48);
    expect(sheetCount(totalLabels(rows), paper)).toBe(2);
  });

  it('satu baris dapat melintasi beberapa lembar tanpa kehilangan label', () => {
    const rows = [item('B0016', 130)];
    const filled = [0, 1, 2].map(
      (sheet) => buildSheet(rows, paper, sheet).filter((cell) => cell !== undefined).length,
    );
    expect(filled).toEqual([54, 54, 22]);
    expect(filled.reduce((sum, value) => sum + value, 0)).toBe(130);
  });

  it('lembar di luar isi hanya berisi sel kosong', () => {
    expect(buildSheet([item('B0016', 6)], paper, 3).every((cell) => cell === undefined)).toBe(true);
    expect(buildSheet([], paper, 0).every((cell) => cell === undefined)).toBe(true);
  });

  it('panjang tiap lembar selalu sama dengan label per lembar kertasnya', () => {
    for (const each of LABEL_PAPERS) {
      expect(buildSheet([item('B0016', 3)], each, 0)).toHaveLength(each.perSheet);
    }
  });
});

describe('Lambang palsu deterministik', () => {
  it('matriks QR 21 x 21 selalu sama untuk seed yang sama dan beda untuk seed lain', () => {
    const one = qrMatrix('B0016|8990000000016');
    expect(one).toHaveLength(QR_SIZE);
    expect(one.every((row) => row.length === QR_SIZE)).toBe(true);
    expect(qrMatrix('B0016|8990000000016')).toEqual(one);
    expect(qrMatrix('B0007|8990000000007')).not.toEqual(one);
  });

  it('QR memuat tiga kotak penanda di sudut kiri atas, kanan atas, dan kiri bawah', () => {
    const matrix = qrMatrix('apa saja');
    const at = (x: number, y: number): boolean => need(matrix[y])[x] === true;
    for (const [left, top] of [
      [0, 0],
      [QR_SIZE - 7, 0],
      [0, QR_SIZE - 7],
    ] as const) {
      expect(at(left, top)).toBe(true);
      expect(at(left + 6, top + 6)).toBe(true);
      expect(at(left + 1, top + 1)).toBe(false);
      expect(at(left + 5, top + 5)).toBe(false);
      expect(at(left + 3, top + 3)).toBe(true);
    }
  });

  it('jalur QR memuat perintah kotak dan sama untuk seed yang sama', () => {
    expect(qrPath('x')).toBe(qrPath('x'));
    expect(qrPath('x')).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    expect(qrPath('x')).not.toBe(qrPath('y'));
  });

  it('barcode garis dimulai dan diakhiri dengan garis hitam serta stabil menurut seed', () => {
    const modules = barcodeModules('8990000000016');
    expect(barcodeModules('8990000000016')).toEqual(modules);
    expect(barcodeModules('8990000000007')).not.toEqual(modules);
    expect(modules.length % 2).toBe(1);
    expect(modules.every((size) => size >= 1 && size <= 3)).toBe(true);
    const { width, path } = barcodePath('8990000000016');
    expect(width).toBe(modules.reduce((sum, size) => sum + size, 0));
    expect(path.startsWith('M0 0h2')).toBe(true);
    expect(path).toContain(`v${String(BARCODE_HEIGHT)}`);
  });
});
