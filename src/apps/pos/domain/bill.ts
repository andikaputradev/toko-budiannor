import { round3, unitPrice } from '../../../shared/data/units';
import type { BillLine, LineDiscount, Product, Tier, UnitDef } from '../../../shared/data/types';

export const MAX_BILL_LINES = 200;

export type AddResult =
  | { readonly ok: true; readonly lines: readonly BillLine[]; readonly index: number }
  | { readonly ok: false; readonly reason: 'max-lines' };

export function lineGross(line: BillLine): number {
  return Math.round(line.quantity * line.unitPrice);
}

// Diskon baris dalam rupiah, dibulatkan, dan dijepit antara 0 dan jumlah baris.
export function discountAmount(line: BillLine): number {
  const discount = line.discount;
  if (discount === undefined || !Number.isFinite(discount.value) || discount.value <= 0) {
    return 0;
  }
  const gross = lineGross(line);
  const raw =
    discount.kind === 'persen'
      ? Math.round((gross * discount.value) / 100)
      : Math.round(discount.value);
  return Math.min(gross, Math.max(0, raw));
}

export function lineSubtotal(line: BillLine): number {
  return lineGross(line) - discountAmount(line);
}

export function validateDiscount(
  kind: LineDiscount['kind'],
  value: number,
  gross: number,
): 'ok' | 'negatif' | 'melebihi' {
  if (!Number.isFinite(value) || value < 0) {
    return 'negatif';
  }
  if (kind === 'persen') {
    return value > 100 ? 'melebihi' : 'ok';
  }
  return value > gross ? 'melebihi' : 'ok';
}

export function billTotal(lines: readonly BillLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

export function itemCount(lines: readonly BillLine[]): number {
  return new Set(lines.map((line) => line.productId)).size;
}

export function defaultUnitOf(product: Product): UnitDef {
  const packaged = product.units[1];
  const base = product.units[0];
  if (base === undefined) {
    throw new RangeError(`Barang ${product.code} tidak punya satuan`);
  }
  return product.baseUnit === 'Kg' && packaged !== undefined ? packaged : base;
}

export function addLine(lines: readonly BillLine[], line: BillLine): AddResult {
  const index = lines.findIndex(
    (item) => item.productId === line.productId && item.unit === line.unit,
  );
  if (index >= 0) {
    const next = lines.map((item, position) =>
      position === index ? { ...item, quantity: round3(item.quantity + line.quantity) } : item,
    );
    return { ok: true, lines: next, index };
  }
  if (lines.length >= MAX_BILL_LINES) {
    return { ok: false, reason: 'max-lines' };
  }
  return { ok: true, lines: [...lines, line], index: lines.length };
}

export function replaceLine(
  lines: readonly BillLine[],
  index: number,
  line: BillLine,
): readonly BillLine[] {
  return lines.map((item, position) => (position === index ? line : item));
}

export function removeLine(lines: readonly BillLine[], index: number): readonly BillLine[] {
  return lines.filter((_, position) => position !== index);
}

// Harga tier baru untuk setiap baris; harga yang diubah kasir dijaga dan hanya listPrice-nya
// yang mengikuti tier baru.
export function repriceLines(
  lines: readonly BillLine[],
  products: ReadonlyMap<string, Product>,
  tier: Tier,
): readonly BillLine[] {
  return lines.map((line) => {
    const product = products.get(line.productId);
    if (product === undefined) {
      return line;
    }
    const tierPrice = unitPrice(product, line.unit, tier);
    return line.listPrice === undefined
      ? { ...line, unitPrice: tierPrice }
      : { ...line, listPrice: tierPrice };
  });
}

export interface SplitPick {
  readonly index: number;
  readonly quantity: number;
}

function sized(line: BillLine, quantity: number, discount: LineDiscount | undefined): BillLine {
  return {
    productId: line.productId,
    unit: line.unit,
    quantity,
    unitPrice: line.unitPrice,
    ...(discount === undefined ? {} : { discount }),
    ...(line.listPrice === undefined ? {} : { listPrice: line.listPrice }),
    ...(line.note === undefined ? {} : { note: line.note }),
    ...(line.sellerId === undefined ? {} : { sellerId: line.sellerId }),
  };
}

// Membagi diskon baris saat sebagian jumlahnya dipindahkan: persen ikut ke dua bagian, nominal
// dibagi proporsional dengan sisa pembulatan pada bagian yang tertinggal.
function shareDiscount(
  line: BillLine,
  take: number,
): { readonly kept: LineDiscount | undefined; readonly moved: LineDiscount | undefined } {
  const discount = line.discount;
  if (discount === undefined) {
    return { kept: undefined, moved: undefined };
  }
  if (discount.kind === 'persen') {
    return { kept: discount, moved: discount };
  }
  const movedValue = Math.round((discount.value * take) / line.quantity);
  const keptValue = discount.value - movedValue;
  return {
    kept: keptValue > 0 ? { kind: 'nominal', value: keptValue } : undefined,
    moved: movedValue > 0 ? { kind: 'nominal', value: movedValue } : undefined,
  };
}

export function splitLines(
  lines: readonly BillLine[],
  picks: readonly SplitPick[],
):
  | { readonly kept: readonly BillLine[]; readonly moved: readonly BillLine[] }
  | { readonly error: 'kosong' | 'melebihi' | 'semua' } {
  const totals = new Map<number, number>();
  for (const pick of picks) {
    if (pick.quantity > 0) {
      totals.set(pick.index, round3((totals.get(pick.index) ?? 0) + pick.quantity));
    }
  }
  if (totals.size === 0) {
    return { error: 'kosong' };
  }
  for (const [index, quantity] of totals) {
    const line = lines[index];
    if (line === undefined || quantity > line.quantity) {
      return { error: 'melebihi' };
    }
  }
  const kept: BillLine[] = [];
  const moved: BillLine[] = [];
  lines.forEach((line, index) => {
    const take = totals.get(index);
    if (take === undefined) {
      kept.push(line);
      return;
    }
    const rest = round3(line.quantity - take);
    if (rest <= 0) {
      moved.push(line);
      return;
    }
    const shares = shareDiscount(line, take);
    kept.push(sized(line, rest, shares.kept));
    moved.push(sized(line, take, shares.moved));
  });
  if (kept.length === 0) {
    return { error: 'semua' };
  }
  return { kept, moved };
}

// Gabungan dua bill: barang dan satuan sama dijumlahkan dengan harga, diskon, dan catatan bill
// target; baris lain dari bill sumber ditambahkan apa adanya.
export function mergeLines(
  target: readonly BillLine[],
  source: readonly BillLine[],
): readonly BillLine[] {
  const merged: BillLine[] = [...target];
  for (const line of source) {
    const index = merged.findIndex(
      (item) => item.productId === line.productId && item.unit === line.unit,
    );
    const existing = merged[index];
    if (existing === undefined) {
      merged.push(line);
    } else {
      merged[index] = { ...existing, quantity: round3(existing.quantity + line.quantity) };
    }
  }
  return merged;
}
