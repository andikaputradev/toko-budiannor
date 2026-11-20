import { formatRupiah } from '../../../shared/format';
import type { Product } from '../../../shared/data/types';

// Cetak Barcode Back-Office (gambar klien 53): pilihan model label, kertas label Tom & Jerry (TnJ),
// daftar cetak, dan penyusunan lembar. Semua logika di sini murni (tanpa DOM) supaya dapat diuji.

// ===== Model label =====

export type LabelModelId = 'model-1' | 'model-2' | 'model-3' | 'model-4';

export interface LabelModel {
  readonly id: LabelModelId;
  readonly name: string;
  // Lambang di label: kode QR (di kiri teks) atau barcode garis (di bawah teks).
  readonly symbol: 'qr' | 'barcode';
  readonly showPrice: boolean;
}

const MODEL_1: LabelModel = { id: 'model-1', name: 'Model 1', symbol: 'qr', showPrice: true };

export const LABEL_MODELS: readonly LabelModel[] = [
  MODEL_1,
  { id: 'model-2', name: 'Model 2', symbol: 'barcode', showPrice: true },
  { id: 'model-3', name: 'Model 3', symbol: 'qr', showPrice: false },
  { id: 'model-4', name: 'Model 4', symbol: 'barcode', showPrice: false },
];

export const DEFAULT_MODEL: LabelModelId = 'model-1';

export function modelOf(id: LabelModelId): LabelModel {
  return LABEL_MODELS.find((model) => model.id === id) ?? MODEL_1;
}

// ===== Kertas label =====

export type PaperId = 'tj-125' | 'tj-108' | 'tj-121';

export interface LabelPaper {
  readonly id: PaperId;
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  // Jumlah label per lembar (angka dalam kurung pada pilihan kertas).
  readonly perSheet: number;
}

// Lembar pratinjau 210 x 165 mm. Jumlah label per lembar (54, 40, 10) dari dokumen klien; jumlah
// kolom dan baris tiap kertas adalah ASUMSI geometri kisi pratinjau, bukan ukuran pabrik.
export const SHEET_WIDTH_MM = 210;
export const SHEET_HEIGHT_MM = 165;

const PAPER_125: LabelPaper = {
  id: 'tj-125',
  name: 'TJ Label No 125',
  columns: 6,
  rows: 9,
  perSheet: 54,
};

export const LABEL_PAPERS: readonly LabelPaper[] = [
  PAPER_125,
  { id: 'tj-108', name: 'TJ Label No 108', columns: 5, rows: 8, perSheet: 40 },
  { id: 'tj-121', name: 'TJ Label No 121', columns: 2, rows: 5, perSheet: 10 },
];

export const DEFAULT_PAPER: PaperId = 'tj-125';

export function paperOf(id: PaperId): LabelPaper {
  return LABEL_PAPERS.find((paper) => paper.id === id) ?? PAPER_125;
}

// Teks pilihan kertas persis seperti gambar klien, mis. "TJ Label No 125 (54)".
export function paperTitle(paper: LabelPaper): string {
  return `${paper.name} (${String(paper.perSheet)})`;
}

// ===== Isi label =====

export interface LabelData {
  readonly code: string;
  readonly barcode: string;
  readonly name: string;
  readonly unit: string;
  readonly price: number;
}

// Contoh isi miniatur model bila belum ada barang yang dipilih (gambar klien 53).
export const SAMPLE_LABEL: LabelData = {
  code: '2308',
  barcode: '00089401001',
  name: 'Grendel Bellucci 2" Sncp',
  unit: 'Pcs',
  price: 35000,
};

// Susunan teks sebuah label menurut modelnya. Model 1 dan 3: kode QR di kiri, teks di kanan.
// Model 2 dan 4: teks di atas, barcode garis di bawahnya lalu angka barcode.
export interface LabelFace {
  readonly symbol: 'qr' | 'barcode';
  // Baris harga di atas label (hanya Model 2).
  readonly head?: string;
  readonly code?: string;
  readonly name: string;
  // Harga tebal di bawah nama (hanya Model 1).
  readonly price?: string;
  readonly digits?: string;
}

export function priceText(price: number, unit: string): string {
  return `${formatRupiah(price)} / ${unit}`;
}

export function barcodeDigits(data: LabelData): string {
  return data.barcode === '' ? data.code : data.barcode;
}

export function labelFace(model: LabelModel, data: LabelData): LabelFace {
  const price = priceText(data.price, data.unit);
  const digits = barcodeDigits(data);
  switch (model.id) {
    case 'model-1':
      return { symbol: 'qr', code: `[${data.code}]`, name: data.name, price };
    case 'model-2':
      return { symbol: 'barcode', head: price, name: `[${data.code}]-${data.name}`, digits };
    case 'model-3':
      return { symbol: 'qr', code: `[ ${data.code} ]`, name: data.name };
    case 'model-4':
      return { symbol: 'barcode', code: `[ ${data.code} ]`, name: data.name, digits };
  }
}

// ===== Daftar cetak =====

export const DEFAULT_COPIES = 6;
export const MIN_COPIES = 1;
export const MAX_COPIES = 999;

// Isi daftar yang disimpan: hanya acuan barang, satuan, dan jumlah. Nama, barcode, dan harga dibaca
// ulang dari katalog (resolveEntries) supaya selalu mengikuti data barang terbaru.
export interface PrintEntry {
  readonly productId: string;
  readonly unit: string;
  readonly copies: number;
}

export interface PrintItem extends LabelData {
  readonly key: string;
  readonly productId: string;
  readonly copies: number;
}

// Pilihan cetak yang disimpan dalam sesi (tombol Simpan).
export interface SavedPrintJob {
  readonly entries: readonly PrintEntry[];
  readonly model: LabelModelId;
  readonly paper: PaperId;
}

export function entryKey(entry: { readonly productId: string; readonly unit: string }): string {
  return `${entry.productId}|${entry.unit}`;
}

export type CopiesIssue = 'kosong' | 'bukan-bulat' | 'kurang' | 'terlalu-banyak';

export type CopiesResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly issue: CopiesIssue };

// Jumlah cetakan harus bilangan bulat antara MIN_COPIES dan MAX_COPIES. Koma, titik, huruf, dan
// notasi ilmiah ("1e3") ditolak; angka negatif dan nol dinilai kurang.
export function parseCopies(raw: string): CopiesResult {
  const text = raw.trim();
  if (text === '') {
    return { ok: false, issue: 'kosong' };
  }
  if (!/^-?\d+$/.test(text)) {
    return { ok: false, issue: 'bukan-bulat' };
  }
  const value = Number(text);
  if (value < MIN_COPIES) {
    return { ok: false, issue: 'kurang' };
  }
  if (value > MAX_COPIES) {
    return { ok: false, issue: 'terlalu-banyak' };
  }
  return { ok: true, value };
}

// Barang dan satuan yang sama tidak dobel: jumlah yang baru MENGGANTI jumlah lama pada baris yang
// sama (urutan baris tetap). Barang atau satuan lain ditambahkan di akhir daftar.
export function addEntry(
  entries: readonly PrintEntry[],
  entry: PrintEntry,
): { readonly entries: readonly PrintEntry[]; readonly replaced: boolean } {
  const key = entryKey(entry);
  if (entries.some((item) => entryKey(item) === key)) {
    return {
      entries: entries.map((item) => (entryKey(item) === key ? entry : item)),
      replaced: true,
    };
  }
  return { entries: [...entries, entry], replaced: false };
}

export function removeEntry(entries: readonly PrintEntry[], key: string): readonly PrintEntry[] {
  return entries.filter((item) => entryKey(item) !== key);
}

export interface UnitChoice {
  readonly code: string;
  readonly price: number;
}

// Satuan barang beserta harga jual eceran, untuk pilihan "Harga Satuan".
export function unitChoices(product: Product): readonly UnitChoice[] {
  return product.units.map((unit) => ({
    code: unit.code,
    price: product.prices[unit.code]?.eceran ?? 0,
  }));
}

export function defaultUnitOf(product: Product): string {
  const wanted = product.defaultUnit;
  if (wanted !== undefined && product.units.some((unit) => unit.code === wanted)) {
    return wanted;
  }
  return product.units[0]?.code ?? product.baseUnit;
}

// Barcode yang dicetak: barcode milik satuan itu bila ada, selain itu barcode barang.
export function barcodeOf(product: Product, unitCode: string): string {
  const own = product.units.find((unit) => unit.code === unitCode)?.barcode;
  return own !== undefined && own !== '' ? own : product.barcode;
}

export function labelDataOf(product: Product, unitCode: string): LabelData {
  return {
    code: product.code,
    barcode: barcodeOf(product, unitCode),
    name: product.name,
    unit: unitCode,
    price: product.prices[unitCode]?.eceran ?? 0,
  };
}

// Mengubah isi daftar menjadi baris tampil. Baris yang barangnya sudah tidak ada atau satuannya
// sudah tidak dimiliki barang dilewati.
export function resolveEntries(
  entries: readonly PrintEntry[],
  products: readonly Product[],
): PrintItem[] {
  const items: PrintItem[] = [];
  for (const entry of entries) {
    const product = products.find((candidate) => candidate.id === entry.productId);
    if (product?.units.some((unit) => unit.code === entry.unit) !== true) {
      continue;
    }
    items.push({
      ...labelDataOf(product, entry.unit),
      key: entryKey(entry),
      productId: entry.productId,
      copies: entry.copies,
    });
  }
  return items;
}

// Daftar awal: satu baris contoh (B0016 bila ada, jika tidak barang pertama yang punya barcode).
export function initialEntries(products: readonly Product[]): readonly PrintEntry[] {
  const sample =
    products.find((product) => product.code === 'B0016') ??
    products.find((product) => product.barcode !== '');
  return sample === undefined
    ? []
    : [{ productId: sample.id, unit: sample.baseUnit, copies: DEFAULT_COPIES }];
}

export function totalLabels(items: readonly { readonly copies: number }[]): number {
  return items.reduce((sum, item) => sum + item.copies, 0);
}

// ===== Lembar dan halaman =====

export function sheetCount(total: number, paper: LabelPaper): number {
  return Math.ceil(total / paper.perSheet);
}

export function clampSheet(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

// Isi satu lembar (indeks mulai 0) menurut urutan baris dan kisi dari kiri ke kanan, atas ke bawah.
// Sel yang tidak terisi bernilai undefined. Panjang hasil selalu sama dengan jumlah label per lembar.
export function buildSheet(
  items: readonly PrintItem[],
  paper: LabelPaper,
  sheetIndex: number,
): (PrintItem | undefined)[] {
  const first = sheetIndex * paper.perSheet;
  const last = first + paper.perSheet;
  const cells = new Array<PrintItem | undefined>(paper.perSheet).fill(undefined);
  let offset = 0;
  for (const item of items) {
    const end = offset + item.copies;
    for (let at = Math.max(offset, first); at < Math.min(end, last); at += 1) {
      cells[at - first] = item;
    }
    offset = end;
    if (offset >= last) {
      break;
    }
  }
  return cells;
}

// ===== Lambang palsu deterministik (mockup): kode QR dan barcode garis =====

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export const QR_SIZE = 21;

function inFinder(x: number, y: number): boolean {
  const near = (value: number): boolean => value < 7;
  const far = (value: number): boolean => value >= QR_SIZE - 7;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}

// Penanda sudut kode QR: 7 x 7 dengan cincin putih pada jarak 2 dari pusatnya.
function finderCell(x: number, y: number): boolean {
  const localX = x >= QR_SIZE - 7 ? x - (QR_SIZE - 7) : x;
  const localY = y >= QR_SIZE - 7 ? y - (QR_SIZE - 7) : y;
  return Math.max(Math.abs(localX - 3), Math.abs(localY - 3)) !== 2;
}

// Jalur putih selebar satu sel di sisi dalam setiap kotak penanda.
function inSeparator(x: number, y: number): boolean {
  const last = QR_SIZE - 8;
  return (
    ((x === 7 || y === 7) && x <= 7 && y <= 7) ||
    ((x === last || y === 7) && x >= last && y <= 7) ||
    ((x === 7 || y === last) && x <= 7 && y >= last)
  );
}

// Matriks 21 x 21 mirip kode QR: tiga kotak penanda sudut, garis pewaktu, dan isi acak dari seed.
// Bukan kode QR sungguhan dan tidak dapat dipindai.
export function qrMatrix(seed: string): boolean[][] {
  const random = seededRandom(`qr:${seed}`);
  const matrix: boolean[][] = [];
  for (let y = 0; y < QR_SIZE; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < QR_SIZE; x += 1) {
      const filled = random() < 0.5;
      if (inFinder(x, y)) {
        row.push(finderCell(x, y));
      } else if (inSeparator(x, y)) {
        row.push(false);
      } else if (y === 6) {
        row.push(x % 2 === 0);
      } else if (x === 6) {
        row.push(y % 2 === 0);
      } else {
        row.push(filled);
      }
    }
    matrix.push(row);
  }
  return matrix;
}

// Jalur SVG kotak-kotak gelap (satu perintah per deretan mendatar) pada kisi QR_SIZE x QR_SIZE.
export function qrPath(seed: string): string {
  const matrix = qrMatrix(seed);
  const commands: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== true) {
        x += 1;
        continue;
      }
      let run = 1;
      while (row[x + run] === true) {
        run += 1;
      }
      commands.push(`M${String(x)} ${String(y)}h${String(run)}v1h-${String(run)}z`);
      x += run;
    }
  });
  return commands.join('');
}

export const BARCODE_HEIGHT = 10;

// Lebar garis dan jarak (dalam modul) dari seed. Indeks genap adalah garis hitam, indeks ganjil
// jarak putih. Pola awal dan akhir tetap, isi di tengah acak.
export function barcodeModules(seed: string): number[] {
  const random = seededRandom(`bar:${seed}`);
  const modules = [2, 1, 1, 2];
  let width = 6;
  while (width < 90) {
    const bar = 1 + Math.floor(random() * 3);
    const gap = 1 + Math.floor(random() * 3);
    modules.push(bar, gap);
    width += bar + gap;
  }
  modules.push(2, 1, 3, 1, 1);
  return modules;
}

// Jalur SVG garis hitam pada kanvas selebar `width` modul dan setinggi BARCODE_HEIGHT.
export function barcodePath(seed: string): { readonly width: number; readonly path: string } {
  const modules = barcodeModules(seed);
  const commands: string[] = [];
  let x = 0;
  modules.forEach((size, index) => {
    if (index % 2 === 0) {
      commands.push(`M${String(x)} 0h${String(size)}v${String(BARCODE_HEIGHT)}h-${String(size)}z`);
    }
    x += size;
  });
  return { width: x, path: commands.join('') };
}
