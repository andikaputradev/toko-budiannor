import type { Product, UnitDef } from '../../../shared/data/types';

// Satuan barang: satuan dasar (baris 1) dan paling banyak dua satuan lebih besar (baris 2 dan 3).
// Konversi setiap satuan lebih besar selalu terhadap satuan dasar, mis. LSN = 12 PCS.
export const MAX_UNITS = 3;

export interface UnitRowDraft {
  readonly code: string;
  // Teks angka konversi ke satuan dasar. Selalu kosong pada baris pertama.
  readonly factor: string;
}

export interface UnitRowsIssue {
  readonly field: 'base' | 'duplicate' | 'factor';
  readonly row: number;
}

// Pilihan satuan pada pemilih: satuan yang sudah dipakai data, ditambah kode dari video klien.
export const UNIT_CODES: readonly string[] = [
  'Pcs',
  'Kg',
  'Meter',
  'Kubik',
  'Batang',
  'Liter',
  'M2',
  'Lembar',
  'BKS',
  'BLK',
  'BOX',
  'BTG',
  'BTL',
  'DOS',
  'KRG',
  'KTK',
  'LBR',
  'LSN',
  'MTR',
  'PAK',
  'PIL',
];

export function parseFactor(text: string): number | undefined {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return undefined;
  }
  const value = Number(cleaned);
  return value > 0 ? value : undefined;
}

const empty: UnitRowDraft = { code: '', factor: '' };

// Selalu tiga baris. Baris tanpa kode dikosongkan, dan semua baris di bawahnya ikut dikosongkan.
export function normalizeRows(rows: readonly UnitRowDraft[]): UnitRowDraft[] {
  const result: UnitRowDraft[] = [];
  for (let index = 0; index < MAX_UNITS; index += 1) {
    const source = rows[index];
    const code = source?.code.trim() ?? '';
    const previous = result[index - 1];
    if (code === '' || (index > 0 && previous?.code === '')) {
      result.push(empty);
    } else {
      result.push({ code, factor: index === 0 ? '' : (source?.factor.trim() ?? '') });
    }
  }
  return result;
}

export function visibleRows(rows: readonly UnitRowDraft[]): 1 | 2 | 3 {
  const [base, second] = normalizeRows(rows);
  if (base === undefined || base.code === '') {
    return 1;
  }
  if (second === undefined || second.code === '' || parseFactor(second.factor) === undefined) {
    return 2;
  }
  return 3;
}

export function validateUnitRows(rows: readonly UnitRowDraft[]): UnitRowsIssue | undefined {
  const normalized = normalizeRows(rows);
  if (normalized[0]?.code === '') {
    return { field: 'base', row: 0 };
  }
  const seen: string[] = [];
  for (const [index, current] of normalized.entries()) {
    if (current.code === '') {
      break;
    }
    const key = current.code.toLowerCase();
    if (seen.includes(key)) {
      return { field: 'duplicate', row: index };
    }
    seen.push(key);
    if (index > 0 && parseFactor(current.factor) === undefined) {
      return { field: 'factor', row: index };
    }
  }
  return undefined;
}

// Satuan siap simpan; baris tidak lengkap atau kosong tidak ikut. Panggil validateUnitRows dahulu.
export function toUnitDefs(rows: readonly UnitRowDraft[]): UnitDef[] {
  const defs: UnitDef[] = [];
  for (const [index, current] of normalizeRows(rows).entries()) {
    if (current.code === '') {
      break;
    }
    const factor = index === 0 ? 1 : parseFactor(current.factor);
    if (factor !== undefined) {
      defs.push({ code: current.code, name: current.code, factor });
    }
  }
  return defs;
}

export function rowsOf(product: Product): UnitRowDraft[] {
  return product.units.slice(0, MAX_UNITS).map((unit, index) => ({
    code: unit.code,
    factor: index === 0 ? '' : String(unit.factor).replace('.', ','),
  }));
}
