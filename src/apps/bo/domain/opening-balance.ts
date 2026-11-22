import type { Product, Stock, WarehouseId } from '../../../shared/data/types';
import { round3, toBase } from '../../../shared/data/units';

// Saldo Stok Awal barang (gambar klien 37 dan 39, revisi BO putaran 9): catatan stok awal per gudang
// beserta biaya satuannya. Hanya Owner yang melihat biaya dan boleh menambah.
export interface OpeningEntry {
  // Tanggal ISO (YYYY-MM-DD).
  readonly date: string;
  readonly quantity: number;
  readonly unit: string;
  readonly warehouse: WarehouseId;
  // Biaya per satuan pada kolom Satuan (rupiah).
  readonly unitCost: number;
}

export interface OpeningDraft {
  readonly warehouse: string;
  readonly date: string;
  readonly quantity: string;
  readonly unit: string;
  readonly cost: string;
}

export type OpeningIssue = 'gudang' | 'tanggal' | 'kuantitas' | 'satuan' | 'biaya';

export type OpeningParsed =
  | { readonly ok: true; readonly entry: OpeningEntry }
  | { readonly ok: false; readonly issue: OpeningIssue };

const WAREHOUSES: readonly WarehouseId[] = ['display', 'besar'];

function digits(text: string): number {
  const clean = text.replace(/\D/g, '');
  return clean === '' ? 0 : Number(clean);
}

export function parseQuantity(text: string): number {
  const value = Number(text.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? round3(value) : 0;
}

export function parseCost(text: string): number {
  return digits(text);
}

export function totalCost(quantity: number, unitCost: number): number {
  return Math.round(quantity * unitCost);
}

// Satuan terbesar yang membagi stok tanpa sisa (mis. 745 Sak, bukan 29.800 Kg); selain itu satuan dasar.
function evenUnit(product: Product, base: number): { unit: string; quantity: number } {
  const baseUnit = product.units[0]?.code ?? product.baseUnit;
  const ordered = [...product.units].sort((first, second) => second.factor - first.factor);
  for (const unit of ordered) {
    const quantity = round3(base / unit.factor);
    if (unit.factor > 0 && Number.isInteger(quantity) && quantity > 0) {
      return { unit: unit.code, quantity };
    }
  }
  return { unit: baseUnit, quantity: round3(base) };
}

// Catatan awal dibangkitkan dari stok barang saat pertama dibuka: satu baris per gudang yang berisi,
// berbiaya HPP. Penambahan sesudahnya memperbesar stok gudang itu.
export function seedOpening(product: Product, date: string): OpeningEntry[] {
  const unitCost = product.hppAvg ?? product.hpp;
  const entries: OpeningEntry[] = [];
  for (const warehouse of WAREHOUSES) {
    const base = product.stock[warehouse];
    if (base <= 0) {
      continue;
    }
    const { unit, quantity } = evenUnit(product, base);
    const factor = product.units.find((item) => item.code === unit)?.factor ?? 1;
    entries.push({ date, quantity, unit, warehouse, unitCost: Math.round(unitCost * factor) });
  }
  return entries;
}

export function parseOpening(product: Product, draft: OpeningDraft): OpeningParsed {
  if (draft.warehouse !== 'display' && draft.warehouse !== 'besar') {
    return { ok: false, issue: 'gudang' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    return { ok: false, issue: 'tanggal' };
  }
  const quantity = parseQuantity(draft.quantity);
  if (quantity <= 0) {
    return { ok: false, issue: 'kuantitas' };
  }
  if (!product.units.some((unit) => unit.code === draft.unit)) {
    return { ok: false, issue: 'satuan' };
  }
  const unitCost = parseCost(draft.cost);
  if (unitCost <= 0) {
    return { ok: false, issue: 'biaya' };
  }
  return {
    ok: true,
    entry: { date: draft.date, quantity, unit: draft.unit, warehouse: draft.warehouse, unitCost },
  };
}

// Stok gudang setelah saldo awal ditambahkan (dalam satuan dasar).
export function stockAfter(product: Product, entry: OpeningEntry): Stock {
  const added = toBase(product, entry.unit, entry.quantity);
  return {
    display: round3(product.stock.display + (entry.warehouse === 'display' ? added : 0)),
    besar: round3(product.stock.besar + (entry.warehouse === 'besar' ? added : 0)),
  };
}

// Stok gudang setelah satu catatan saldo awal diganti: catatan lama dilepas, yang baru ditambahkan
// (gudang dan satuannya boleh berbeda dari catatan lama).
export function stockReplaced(product: Product, previous: OpeningEntry, next: OpeningEntry): Stock {
  const removed = toBase(product, previous.unit, previous.quantity);
  const added = toBase(product, next.unit, next.quantity);
  const change = (warehouse: WarehouseId): number =>
    (previous.warehouse === warehouse ? -removed : 0) + (next.warehouse === warehouse ? added : 0);
  return {
    display: round3(product.stock.display + change('display')),
    besar: round3(product.stock.besar + change('besar')),
  };
}

// Isian dialog Isi Saldo Awal untuk sebuah catatan, dipakai saat catatan itu diubah.
export function draftOfEntry(
  entry: OpeningEntry,
  quantityText: string,
  costText: string,
): OpeningDraft {
  return {
    warehouse: entry.warehouse,
    date: entry.date,
    quantity: quantityText,
    unit: entry.unit,
    cost: costText,
  };
}

// Harga beli akhir dan HPP rata-rata per satuan, dari nilai per satuan dasar.
export function perUnit(base: number | undefined, factor: number): number {
  return Math.round((base ?? 0) * factor);
}
