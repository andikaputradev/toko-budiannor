import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../src/shared/data/generator';
import {
  createSearchIndex,
  MIN_QUERY_LENGTH,
  normalize,
  SEARCH_BUDGET_MS,
} from '../../src/shared/data/search-index';

const dataset = generateDataset();
const index = createSearchIndex(dataset.products);

const QUERIES = [
  'se',
  'sem',
  'semen',
  'semen pcc',
  'pipa pvc 3/4',
  'pipa pvc 3/4 inci karya',
  'kabel nym 2x1,5',
  'cat tembok putih',
  'cat tembok putih sinar',
  'engsel',
  'engsel pintu 4',
  'gembok anti gunting',
  'triplek meranti',
  'seng gelombang 0,3',
  'keramik motif kayu',
  'lampu led 12 w',
  'kuas roll',
  'selang spiral',
  'karya mandiri',
  'warna nusantara',
  'kg',
  'inci',
  'b0123',
  'B3600',
  '8990000000456',
  'tidak ada barang seperti ini',
  'zzzz',
];

function percentile(sorted: readonly number[], ratio: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

describe('indeks pencarian', () => {
  it('mengindeks 3.600 barang', () => {
    expect(index.size).toBe(3600);
    expect(index.buildMs).toBeGreaterThanOrEqual(0);
  });

  it('menormalkan huruf besar, tanda baca, dan spasi', () => {
    expect(normalize('  SEMEN   Pcc!! ')).toBe('semen pcc');
  });

  it('menolak kueri lebih pendek dari batas minimum', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(index.search('s').hits).toHaveLength(0);
    expect(index.search('  ').total).toBe(0);
  });

  it('menemukan barang lewat kode dan barcode secara tepat', () => {
    const byCode = index.search('b0123');
    expect(byCode.hits).toHaveLength(1);
    expect(byCode.hits[0]?.code).toBe('B0123');
    const byBarcode = index.search('8990000000456');
    expect(byBarcode.hits[0]?.code).toBe('B0456');
  });

  it('menerapkan semua kata kueri sebagai awalan dengan logika dan', () => {
    const result = index.search('semen pcc');
    expect(result.total).toBeGreaterThan(0);
    for (const product of result.hits) {
      const name = normalize(product.name);
      expect(name).toContain('semen');
      expect(name).toContain('pcc');
    }
  });

  it('mengembalikan kosong untuk kueri tanpa kecocokan dan membatasi jumlah hasil', () => {
    expect(index.search('zzzz').hits).toHaveLength(0);
    const limited = index.search('semen', 10);
    expect(limited.hits).toHaveLength(10);
    expect(limited.total).toBeGreaterThan(10);
  });

  it('mengutamakan nama yang diawali kueri', () => {
    const result = index.search('pipa pvc', 5);
    for (const product of result.hits) {
      expect(normalize(product.name).startsWith('pipa pvc')).toBe(true);
    }
  });

  it('menampilkan hasil di bawah 300 ms pada 3.600 data dan melaporkan angka waktu', () => {
    const durations: number[] = [];
    for (let round = 0; round < 20; round += 1) {
      for (const query of QUERIES) {
        durations.push(index.search(query).durationMs);
      }
    }
    const sorted = [...durations].sort((first, second) => first - second);
    const median = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const max = sorted[sorted.length - 1] ?? 0;
    const format = (value: number): string => value.toFixed(3).replace('.', ',');
    console.info(
      `WAKTU PENCARIAN: data=${String(index.size)} kueri=${String(durations.length)} ` +
        `median=${format(median)} ms p95=${format(p95)} ms maks=${format(max)} ms ` +
        `indeks=${format(index.buildMs)} ms batas=${String(SEARCH_BUDGET_MS)} ms`,
    );
    expect(max).toBeLessThan(SEARCH_BUDGET_MS);
    expect(index.buildMs).toBeLessThan(1000);
  });
});
