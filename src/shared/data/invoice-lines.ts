import { createRandom, type Random } from './prng';
import type { BillLine, Product, UnitDef } from './types';

// Rincian barang invoice dibangkitkan deterministik dari katalog: kunci yang sama selalu memberi
// baris yang sama, dan jumlah seluruh baris selalu sama dengan nilai invoice.
const MIN_LINES = 2;
const MAX_LINES = 4;
const SMALL_INVOICE = 100_000;
const TARGET_QUANTITY_SPAN = 40;
const RANGE_ATTEMPTS = 40;
const LAST_LINE_CANDIDATES = 12;

export type PriceOf = (product: Product, unit: UnitDef) => number;

export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface Pick {
  readonly product: Product;
  readonly unit: UnitDef;
  readonly price: number;
}

function inRange(price: number, min: number, max: number): boolean {
  return price > 0 && price >= min && price <= max;
}

function pickOnce(
  products: readonly Product[],
  random: Random,
  priceOf: PriceOf,
  min: number,
  max: number,
): Pick | undefined {
  const product = random.pick(products);
  const unit = random.pick(product.units);
  if (product.active === false) {
    return undefined;
  }
  const price = priceOf(product, unit);
  return inRange(price, min, max) ? { product, unit, price } : undefined;
}

// Pindai berurutan dari posisi acak sampai ada barang yang harganya cukup murah.
function pickAnyBelow(
  products: readonly Product[],
  random: Random,
  priceOf: PriceOf,
  max: number,
): Pick | undefined {
  const start = random.int(0, products.length - 1);
  for (let offset = 0; offset < products.length; offset += 1) {
    const product = products[(start + offset) % products.length];
    const unit = product?.units[0];
    if (product === undefined || unit === undefined || product.active === false) {
      continue;
    }
    const price = priceOf(product, unit);
    if (inRange(price, 0, max)) {
      return { product, unit, price };
    }
  }
  return undefined;
}

function pickBetween(
  products: readonly Product[],
  random: Random,
  priceOf: PriceOf,
  max: number,
): Pick | undefined {
  const min = max / TARGET_QUANTITY_SPAN;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    const found = pickOnce(products, random, priceOf, min, max);
    if (found !== undefined) {
      return found;
    }
  }
  return pickAnyBelow(products, random, priceOf, max);
}

export function buildInvoiceLines(
  key: string,
  amount: number,
  products: readonly Product[],
  priceOf: PriceOf,
): BillLine[] {
  if (amount <= 0 || products.length === 0) {
    return [];
  }
  const random = createRandom(hashText(key));
  const count = amount < SMALL_INVOICE ? MIN_LINES : random.int(MIN_LINES, MAX_LINES);
  const weights = Array.from({ length: count }, () => random.int(2, 6));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const lines: BillLine[] = [];
  let remaining = amount;

  for (let index = 0; index < count - 1; index += 1) {
    const budget = Math.floor((amount * (weights[index] ?? 1)) / totalWeight);
    const pick = pickBetween(products, random, priceOf, budget);
    if (pick === undefined) {
      continue;
    }
    const quantity = Math.max(1, Math.floor(budget / pick.price));
    lines.push({
      productId: pick.product.id,
      unit: pick.unit.code,
      quantity,
      unitPrice: pick.price,
    });
    remaining -= quantity * pick.price;
  }

  // Baris penutup menutup selisih: potongan nominal kecil membuat jumlah tepat sama dengan invoice.
  // Diskon nominal berlaku per satuan, jadi selisih pembulatan (selalu kurang dari satu harga
  // satuan) dipotong dari satu satuan saja dan sisa jumlahnya tetap harga penuh pada baris lain.
  const closing = (target: number): BillLine[] => {
    let best:
      { readonly pick: Pick; readonly quantity: number; readonly discount: number } | undefined;
    let bestRatio = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < LAST_LINE_CANDIDATES; attempt += 1) {
      const pick = pickBetween(products, random, priceOf, target);
      if (pick === undefined) {
        continue;
      }
      const quantity = Math.ceil(target / pick.price);
      const gross = quantity * pick.price;
      const discount = gross - target;
      const ratio = discount / gross;
      if (ratio < bestRatio) {
        best = { pick, quantity, discount };
        bestRatio = ratio;
      }
    }
    if (best === undefined) {
      return [];
    }
    const { pick, quantity, discount } = best;
    const base = { productId: pick.product.id, unit: pick.unit.code, unitPrice: pick.price };
    if (discount === 0 || quantity === 1) {
      return [
        {
          ...base,
          quantity,
          ...(discount > 0 ? { discount: { kind: 'nominal' as const, value: discount } } : {}),
        },
      ];
    }
    return [
      { ...base, quantity: quantity - 1 },
      { ...base, quantity: 1, discount: { kind: 'nominal' as const, value: discount } },
    ];
  };
  let tail = closing(remaining);
  const dropped = lines[lines.length - 1];
  if (lines.length + tail.length > MAX_LINES && dropped !== undefined) {
    // Dua baris penutup melebihi batas: baris sebelumnya dilebur ke dalam selisih yang ditutup.
    lines.pop();
    remaining += Math.round(dropped.quantity * dropped.unitPrice);
    tail = closing(remaining);
  }
  lines.push(...tail);
  return lines;
}

export function linesTotal(lines: readonly BillLine[]): number {
  return lines.reduce((sum, line) => {
    const gross = Math.round(line.quantity * line.unitPrice);
    const discount = line.discount;
    const off =
      discount === undefined
        ? 0
        : discount.kind === 'persen'
          ? Math.round((gross * discount.value) / 100)
          : Math.round(discount.value * line.quantity);
    return sum + gross - Math.min(gross, Math.max(0, off));
  }, 0);
}
