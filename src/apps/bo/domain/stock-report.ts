import { wibDate } from '../../../shared/data/receivable';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { MAX_REPORT_DAYS, rangeDays } from '../../../shared/data/report';
import type {
  Customer,
  Product,
  PurchaseOrder,
  Sale,
  Supplier,
  WarehouseId,
} from '../../../shared/data/types';
import { findUnit, round3, toBase } from '../../../shared/data/units';
import {
  minimumIn,
  stockIn,
  stockStatus,
  type StockStatus,
  type WarehouseFilter,
} from '../../../shared/domain/stock';
import type { SystemMessageId } from '../../../shared/messages';
import type { CorrectionDoc } from './stock-correction';
import { parsePhysical, type OpnameDoc } from './opname';

export const PAGE_SIZE = 50;
export const ALL_CATEGORIES = '';

// ---------------------------------------------------------------------------
// Posisi stok (tabel stok per barang dengan nilai persediaan)
// ---------------------------------------------------------------------------

export interface StockReportFilter {
  readonly warehouse: WarehouseFilter;
  readonly category: string;
  readonly below: boolean;
}

export interface StockReportRow {
  readonly product: Product;
  readonly display: number;
  readonly besar: number;
  readonly quantity: number;
  readonly minimum: number;
  readonly value: number;
  readonly status: StockStatus;
}

export interface StockSummary {
  readonly items: number;
  readonly valueDisplay: number;
  readonly valueBesar: number;
  readonly valueTotal: number;
  readonly belowMinimum: number;
  readonly negative: number;
}

export interface CategoryValue {
  readonly category: string;
  readonly value: number;
  readonly share: number;
  readonly other: boolean;
}

const collator = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

export function valueOf(product: Product, quantity: number): number {
  return Math.round(quantity * product.hpp);
}

export function categoriesOf(products: readonly Product[]): string[] {
  const found = new Set<string>();
  for (const product of products) {
    if (product.active !== false && product.category !== '') {
      found.add(product.category);
    }
  }
  return [...found].sort((first, second) => collator.compare(first, second));
}

export function buildStockRows(
  products: readonly Product[],
  filter: StockReportFilter,
): StockReportRow[] {
  const rows: StockReportRow[] = [];
  for (const product of products) {
    if (product.active === false) {
      continue;
    }
    if (filter.category !== ALL_CATEGORIES && product.category !== filter.category) {
      continue;
    }
    const status = stockStatus(product, filter.warehouse);
    if (filter.below && status === 'aman') {
      continue;
    }
    const quantity = stockIn(product, filter.warehouse);
    rows.push({
      product,
      display: product.stock.display,
      besar: product.stock.besar,
      quantity,
      minimum: minimumIn(product, filter.warehouse),
      value: valueOf(product, quantity),
      status,
    });
  }
  return rows.sort((first, second) => collator.compare(first.product.name, second.product.name));
}

export function summarize(rows: readonly StockReportRow[]): StockSummary {
  let valueDisplay = 0;
  let valueBesar = 0;
  let valueTotal = 0;
  let belowMinimum = 0;
  let negative = 0;
  for (const row of rows) {
    valueDisplay += valueOf(row.product, row.display);
    valueBesar += valueOf(row.product, row.besar);
    valueTotal += row.value;
    if (row.status === 'minimum') {
      belowMinimum += 1;
    } else if (row.status === 'negatif') {
      negative += 1;
    }
  }
  return { items: rows.length, valueDisplay, valueBesar, valueTotal, belowMinimum, negative };
}

// Kategori bernilai terbesar; sisanya dijumlahkan menjadi satu entri "lainnya".
export function valueByCategory(rows: readonly StockReportRow[], limit: number): CategoryValue[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.value > 0) {
      totals.set(row.product.category, (totals.get(row.product.category) ?? 0) + row.value);
    }
  }
  const sorted = [...totals.entries()].sort((first, second) => second[1] - first[1]);
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    return [];
  }
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0);
  const result: CategoryValue[] = head.map(([category, value]) => ({
    category,
    value,
    share: value / total,
    other: false,
  }));
  if (rest > 0) {
    result.push({ category: '', value: rest, share: rest / total, other: true });
  }
  return result;
}

// Angka bertanda untuk selisih dan saldo: tanda plus eksplisit pada nilai positif.
export function formatSigned(value: number, maxDigits = 3, minDigits = 0): string {
  const text = formatDecimal(value, maxDigits, minDigits);
  return value > 0 ? `+${text}` : text;
}

export function formatSignedRupiah(value: number): string {
  return value > 0 ? `+${formatRupiah(value)}` : formatRupiah(value);
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

export function pageSlice<T>(rows: readonly T[], page: number, size = PAGE_SIZE): T[] {
  const current = clampPage(page, rows.length, size);
  return rows.slice((current - 1) * size, current * size);
}

// ---------------------------------------------------------------------------
// Kartu Stok (pergerakan stok satu barang)
// ---------------------------------------------------------------------------

export type MovementKind =
  | 'penjualan'
  | 'pembelian'
  | 'mutasi'
  | 'opname'
  | 'koreksi'
  | 'retur-penjualan'
  | 'retur-pembelian';

// delta dalam satuan dasar: positif masuk, negatif keluar.
export interface StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly at: string;
  readonly kind: MovementKind;
  readonly document: string;
  readonly warehouse: WarehouseId;
  readonly delta: number;
  readonly party: string | undefined;
  readonly counter: WarehouseId | undefined;
  readonly note: string | undefined;
}

export interface TransferSource {
  readonly number: string;
  readonly at: string;
  readonly from: WarehouseId;
  readonly to: WarehouseId;
  readonly lines: readonly { readonly productId: string; readonly baseQuantity: number }[];
}

export interface MovementSources {
  readonly sales: readonly Sale[];
  readonly customers: readonly Pick<Customer, 'id' | 'name'>[];
  readonly suppliers: readonly Supplier[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly transfers: readonly TransferSource[];
  readonly opname: OpnameDoc | undefined;
  readonly corrections: readonly CorrectionDoc[];
  readonly extra: readonly StockMovement[];
}

// Faktur pembelian hanya bertanggal; dicatat pukul 12.00 WIB agar urutan harian wajar.
function noon(date: string): string {
  return new Date(`${date}T12:00:00+07:00`).toISOString();
}

function baseOf(product: Product, unit: string, quantity: number): number | undefined {
  return findUnit(product, unit) === undefined ? undefined : toBase(product, unit, quantity);
}

export function movementsFor(product: Product, sources: MovementSources): StockMovement[] {
  const found: StockMovement[] = [];
  const add = (movement: StockMovement): void => {
    if (movement.delta !== 0) {
      found.push(movement);
    }
  };
  const customerName = (id: string | undefined): string | undefined =>
    sources.customers.find((item) => item.id === id)?.name;

  for (const sale of sources.sales) {
    sale.lines.forEach((line, index) => {
      const base =
        line.productId === product.id ? baseOf(product, line.unit, line.quantity) : undefined;
      if (base !== undefined) {
        add({
          id: `${sale.id}:${String(index)}`,
          productId: product.id,
          at: sale.createdAt,
          kind: 'penjualan',
          document: sale.number,
          warehouse: 'display',
          delta: -base,
          party: customerName(sale.customerId),
          counter: undefined,
          note: undefined,
        });
      }
    });
  }
  for (const supplier of sources.suppliers) {
    for (const invoice of supplier.invoices ?? []) {
      invoice.lines.forEach((line, index) => {
        const base =
          line.productId === product.id ? baseOf(product, line.unit, line.quantity) : undefined;
        if (base !== undefined) {
          add({
            id: `${invoice.id}:${String(index)}`,
            productId: product.id,
            at: noon(invoice.issuedAt),
            kind: 'pembelian',
            document: invoice.id,
            warehouse: 'besar',
            delta: base,
            party: supplier.name,
            counter: undefined,
            note: undefined,
          });
        }
      });
    }
  }
  for (const order of sources.purchaseOrders) {
    if (order.status !== 'diterima') {
      continue;
    }
    order.lines.forEach((line, index) => {
      const base =
        line.productId === product.id ? baseOf(product, line.unit, line.quantity) : undefined;
      if (base !== undefined) {
        add({
          id: `${order.id}:${String(index)}`,
          productId: product.id,
          at: order.createdAt,
          kind: 'pembelian',
          document: order.number,
          warehouse: order.warehouse,
          delta: base,
          party: sources.suppliers.find((item) => item.id === order.supplierId)?.name,
          counter: undefined,
          note: undefined,
        });
      }
    });
  }
  for (const transfer of sources.transfers) {
    transfer.lines.forEach((line, index) => {
      if (line.productId !== product.id) {
        return;
      }
      const common = {
        productId: product.id,
        at: transfer.at,
        kind: 'mutasi' as const,
        document: transfer.number,
        party: undefined,
        note: undefined,
      };
      add({
        ...common,
        id: `${transfer.number}:${String(index)}:out`,
        warehouse: transfer.from,
        delta: -line.baseQuantity,
        counter: transfer.to,
      });
      add({
        ...common,
        id: `${transfer.number}:${String(index)}:in`,
        warehouse: transfer.to,
        delta: line.baseQuantity,
        counter: transfer.from,
      });
    });
  }
  const opname = sources.opname;
  if (opname?.status === 'diterapkan') {
    for (const line of opname.lines) {
      const physical = parsePhysical(line.physical);
      if (
        line.productId === product.id &&
        physical !== undefined &&
        line.systemSnapshot !== undefined
      ) {
        add({
          id: `${opname.number}:${line.productId}`,
          productId: product.id,
          at: noon(opname.date),
          kind: 'opname',
          document: opname.number,
          warehouse: opname.warehouse,
          delta: round3(physical - line.systemSnapshot),
          party: undefined,
          counter: undefined,
          note: line.note === '' ? undefined : line.note,
        });
      }
    }
  }
  for (const doc of sources.corrections) {
    doc.lines.forEach((line, index) => {
      if (line.productId === product.id) {
        add({
          id: `${doc.number}:${String(index)}`,
          productId: product.id,
          at: doc.at,
          kind: 'koreksi',
          document: doc.number,
          warehouse: line.warehouse,
          delta: line.diffBase,
          party: undefined,
          counter: undefined,
          note: doc.reason,
        });
      }
    });
  }
  for (const movement of sources.extra) {
    if (movement.productId === product.id) {
      add(movement);
    }
  }
  return found.sort(
    (first, second) => first.at.localeCompare(second.at) || first.id.localeCompare(second.id),
  );
}

// Barang yang punya pergerakan, untuk pilihan cepat Kartu Stok.
export function productsWithMovement(
  products: readonly Product[],
  sources: MovementSources,
  limit: number,
): Product[] {
  const ids = new Set<string>();
  for (const sale of sources.sales) {
    for (const line of sale.lines) {
      ids.add(line.productId);
    }
  }
  for (const supplier of sources.suppliers) {
    for (const invoice of supplier.invoices ?? []) {
      for (const line of invoice.lines) {
        ids.add(line.productId);
      }
    }
  }
  for (const transfer of sources.transfers) {
    for (const line of transfer.lines) {
      ids.add(line.productId);
    }
  }
  for (const doc of sources.corrections) {
    for (const line of doc.lines) {
      ids.add(line.productId);
    }
  }
  for (const movement of sources.extra) {
    ids.add(movement.productId);
  }
  const counts = new Map<string, number>();
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const id of ids) {
    const product = byId.get(id);
    if (product !== undefined && product.active !== false) {
      counts.set(id, movementsFor(product, sources).length);
    }
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .flatMap(([id]) => {
      const product = byId.get(id);
      return product === undefined ? [] : [product];
    });
}

export interface CardRow {
  readonly id: string;
  readonly at: string;
  readonly date: string;
  readonly kind: MovementKind;
  readonly document: string;
  readonly party: string | undefined;
  readonly note: string | undefined;
  readonly warehouse: WarehouseId | undefined;
  readonly from: WarehouseId | undefined;
  readonly to: WarehouseId | undefined;
  readonly internal: boolean;
  readonly inQty: number;
  readonly outQty: number;
  readonly balance: number;
}

export interface StockCard {
  readonly opening: number;
  readonly rows: readonly CardRow[];
  readonly totalIn: number;
  readonly totalOut: number;
  readonly closing: number;
  readonly current: number;
}

export interface CardRange {
  readonly start: string;
  readonly end: string;
  readonly warehouse: WarehouseFilter;
}

export function dateOf(movement: Pick<StockMovement, 'at'>): string {
  return wibDate(new Date(movement.at));
}

// Saldo awal dihitung mundur dari stok sistem sekarang sehingga saldo akhir periode berjalan
// selalu sama dengan stok di layar Stok per Gudang bila periode berakhir hari ini.
export function buildStockCard(
  product: Product,
  movements: readonly StockMovement[],
  range: CardRange,
): StockCard {
  const view =
    range.warehouse === 'semua'
      ? movements
      : movements.filter((movement) => movement.warehouse === range.warehouse);
  const current = stockIn(product, range.warehouse);
  const sinceStart = view.filter((movement) => dateOf(movement) >= range.start);
  const opening = round3(current - sinceStart.reduce((sum, movement) => sum + movement.delta, 0));
  const inRange = sinceStart.filter((movement) => dateOf(movement) <= range.end);

  const rows: Omit<CardRow, 'balance'>[] = [];
  const pairs = new Map<string, StockMovement[]>();
  for (const movement of inRange) {
    if (range.warehouse === 'semua' && movement.kind === 'mutasi') {
      const key = `${movement.document}|${movement.at}`;
      pairs.set(key, [...(pairs.get(key) ?? []), movement]);
      continue;
    }
    rows.push({
      id: movement.id,
      at: movement.at,
      date: dateOf(movement),
      kind: movement.kind,
      document: movement.document,
      party: movement.party,
      note: movement.note,
      warehouse: movement.warehouse,
      from: movement.delta < 0 ? movement.warehouse : movement.counter,
      to: movement.delta > 0 ? movement.warehouse : movement.counter,
      internal: false,
      inQty: movement.delta > 0 ? movement.delta : 0,
      outQty: movement.delta < 0 ? -movement.delta : 0,
    });
  }
  for (const group of pairs.values()) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    rows.push({
      id: `${first.document}:${first.id}`,
      at: first.at,
      date: dateOf(first),
      kind: 'mutasi',
      document: first.document,
      party: undefined,
      note: undefined,
      warehouse: undefined,
      from: group.find((movement) => movement.delta < 0)?.warehouse,
      to: group.find((movement) => movement.delta > 0)?.warehouse,
      internal: true,
      inQty: 0,
      outQty: 0,
    });
  }
  rows.sort(
    (first, second) => first.at.localeCompare(second.at) || first.id.localeCompare(second.id),
  );

  let balance = opening;
  let totalIn = 0;
  let totalOut = 0;
  const withBalance = rows.map((row): CardRow => {
    balance = round3(balance + row.inQty - row.outQty);
    totalIn = round3(totalIn + row.inQty);
    totalOut = round3(totalOut + row.outQty);
    return { ...row, balance };
  });
  return { opening, rows: withBalance, totalIn, totalOut, closing: balance, current };
}

export type RangeIssue = 'order' | 'long' | 'future';

export function validateRange(start: string, end: string, today: string): RangeIssue | undefined {
  if (end < start) {
    return 'order';
  }
  if (end > today) {
    return 'future';
  }
  return rangeDays(start, end) > MAX_REPORT_DAYS ? 'long' : undefined;
}

export const RANGE_MESSAGES: Readonly<Record<RangeIssue, SystemMessageId>> = {
  order: 'MSG-039',
  long: 'MSG-104',
  future: 'MSG-109',
};

export function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sumber pergerakan tambahan (mis. retur) yang didaftarkan modul lain
// ---------------------------------------------------------------------------

export type MovementProvider = () => readonly StockMovement[];

const providers = new Set<MovementProvider>();

// Modul lain (mis. Retur) dapat mendaftarkan pergerakan stok miliknya agar muncul di Kartu Stok.
export function registerMovementProvider(provider: MovementProvider): () => void {
  providers.add(provider);
  return () => {
    providers.delete(provider);
  };
}

export function extraMovements(): StockMovement[] {
  return [...providers].flatMap((provider) => [...provider()]);
}
