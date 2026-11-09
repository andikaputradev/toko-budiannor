import { linesTotal } from '../../../shared/data/invoice-lines';
import { wibDate } from '../../../shared/data/receivable';
import type {
  BillLine,
  Customer,
  Dataset,
  Product,
  ReturnNote,
  ReturnNoteKind,
  ReturnNoteLine,
  ReturnNoteSettlement,
  Stock,
  Supplier,
  WarehouseId,
} from '../../../shared/data/types';
import { fromBase, round3, toBase, validateQuantity } from '../../../shared/data/units';
import { settleInvoices } from '../../../shared/domain/receivables';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import type { IconName } from '../../../shared/icons';
import { label, message, type LabelKey, type SystemMessageId } from '../../../shared/messages';
import { parseQuantity } from './transfer';

export type ReturnKind = ReturnNoteKind;
export type Settlement = ReturnNoteSettlement;

// Pilihan pelanggan untuk penjualan tunai tanpa nama; tidak pernah menjadi id pelanggan nyata.
export const UMUM_KEY = '__umum';

export const SETTLEMENTS: Readonly<Record<ReturnKind, readonly Settlement[]>> = {
  penjualan: ['tunai', 'transfer', 'potong', 'deposit'],
  pembelian: ['tunai', 'transfer', 'potong'],
};

export const WAREHOUSE_LABELS: Readonly<Record<WarehouseId, LabelKey>> = {
  display: 'gudangDisplay',
  besar: 'gudangBesar',
};

export interface SourceLine {
  readonly index: number;
  readonly line: BillLine;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly unitName: string;
  readonly sold: number;
  readonly returned: number;
  readonly room: number;
}

export interface ReturnSource {
  readonly kind: ReturnKind;
  readonly number: string;
  readonly date: string;
  readonly partyId: string | undefined;
  readonly partyName: string;
  readonly total: number;
  readonly paid: number;
  readonly cashReturned: number;
  readonly lines: readonly SourceLine[];
}

export interface PartyOption {
  readonly key: string;
  readonly name: string;
  readonly count: number;
}

export interface ReturnPick {
  readonly index: number;
  readonly quantity: string;
}

export interface ReturnDraft {
  readonly source: ReturnSource | undefined;
  readonly picks: readonly ReturnPick[];
  readonly reason: string;
  readonly settlement: Settlement;
  readonly warehouse: WarehouseId;
}

export interface SettlementPlan {
  readonly applied: number;
  readonly toDeposit: number;
  readonly cash: number;
}

export type ReturnIssue =
  | { readonly type: 'faktur' }
  | { readonly type: 'barang' }
  | { readonly type: 'jumlah'; readonly index: number; readonly messageId: SystemMessageId }
  | { readonly type: 'melebihi'; readonly index: number; readonly room: string }
  | { readonly type: 'alasan' }
  | { readonly type: 'stok'; readonly index: number; readonly available: string }
  | { readonly type: 'pihak' }
  | { readonly type: 'dana'; readonly limit: number };

export interface ImpactLine {
  readonly icon: IconName;
  readonly text: string;
}

export const REASON_PRESETS: Readonly<Record<ReturnKind, readonly LabelKey[]>> = {
  penjualan: [
    'boReturAlasanRusak',
    'boReturAlasanSalahBarang',
    'boReturAlasanKelebihan',
    'boReturAlasanBatal',
  ],
  pembelian: [
    'boReturAlasanRusak',
    'boReturAlasanSalahBarang',
    'boReturAlasanKelebihan',
    'boReturAlasanTidakSesuai',
  ],
};

// ---------- Sumber retur: faktur penjualan kasir dan faktur pembelian pemasok ----------

function unitNameOf(product: Product | undefined, code: string): string {
  return product?.units.find((unit) => unit.code === code)?.name ?? code;
}

function toSource(
  kind: ReturnKind,
  header: {
    readonly number: string;
    readonly at: string;
    readonly partyId: string | undefined;
    readonly partyName: string;
    readonly total: number;
    readonly paid: number;
  },
  rawLines: readonly BillLine[],
  products: ReadonlyMap<string, Product>,
  notes: readonly ReturnNote[],
): ReturnSource {
  const related = notes.filter((note) => note.kind === kind && note.sourceNumber === header.number);
  const lines = rawLines.map((line, index): SourceLine => {
    const product = products.get(line.productId);
    const returned = round3(
      related.reduce(
        (sum, note) =>
          sum +
          note.lines
            .filter((item) => item.index === index)
            .reduce((inner, item) => inner + item.quantity, 0),
        0,
      ),
    );
    return {
      index,
      line,
      code: product?.code ?? line.productId,
      name: product?.name ?? line.productId,
      unit: line.unit,
      unitName: unitNameOf(product, line.unit),
      sold: line.quantity,
      returned,
      room: round3(Math.max(0, line.quantity - returned)),
    };
  });
  return {
    kind,
    number: header.number,
    date: wibDate(new Date(header.at)),
    partyId: header.partyId,
    partyName: header.partyName,
    total: header.total,
    paid: header.paid,
    cashReturned: related.reduce((sum, note) => sum + note.cash, 0),
    lines,
  };
}

function byNewest(first: ReturnSource, second: ReturnSource): number {
  return second.date.localeCompare(first.date) || second.number.localeCompare(first.number);
}

export function returnSources(
  kind: ReturnKind,
  data: Dataset,
  notes: readonly ReturnNote[],
): ReturnSource[] {
  const products = new Map(data.products.map((product) => [product.id, product]));
  if (kind === 'penjualan') {
    const names = new Map(data.customers.map((customer) => [customer.id, customer.name]));
    return data.sales
      .map((sale) =>
        toSource(
          kind,
          {
            number: sale.number,
            at: sale.createdAt,
            partyId: sale.customerId,
            partyName:
              sale.customerId === undefined
                ? label('pelangganUmum')
                : (names.get(sale.customerId) ?? sale.customerId),
            total: sale.total,
            paid: sale.paid,
          },
          sale.lines,
          products,
          notes,
        ),
      )
      .sort(byNewest);
  }
  return data.suppliers
    .flatMap((supplier) =>
      (supplier.invoices ?? []).map((invoice) =>
        toSource(
          kind,
          {
            number: invoice.id,
            at: invoice.issuedAt,
            partyId: supplier.id,
            partyName: supplier.name,
            total: invoice.amount,
            paid: invoice.paid,
          },
          invoice.lines,
          products,
          notes,
        ),
      ),
    )
    .sort(byNewest);
}

export function partyKey(source: ReturnSource): string {
  return source.partyId ?? UMUM_KEY;
}

export function partyOptions(sources: readonly ReturnSource[]): PartyOption[] {
  const found = new Map<string, PartyOption>();
  for (const source of sources) {
    const key = partyKey(source);
    const known = found.get(key);
    found.set(key, {
      key,
      name: source.partyName,
      count: (known?.count ?? 0) + 1,
    });
  }
  return [...found.values()].sort((first, second) => {
    if (first.key === UMUM_KEY || second.key === UMUM_KEY) {
      return first.key === UMUM_KEY ? -1 : 1;
    }
    return first.name.localeCompare(second.name);
  });
}

export function findSource(
  sources: readonly ReturnSource[],
  text: string,
): ReturnSource | undefined {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') {
    return undefined;
  }
  return (
    sources.find((source) => source.number.toLowerCase() === wanted) ??
    sources.find((source) => source.number.toLowerCase().includes(wanted))
  );
}

export function hasRoom(source: ReturnSource): boolean {
  return source.lines.some((line) => line.room > 0);
}

// ---------- Perhitungan nilai, penyelesaian, dan stok ----------

// Nilai barang yang diretur: jumlah kali harga faktur asal. Baris berdiskon dihitung proporsional
// dari subtotal setelah diskon dan tidak melebihi subtotal itu (sama dengan retur di kasir).
export function returnedValue(line: BillLine, quantity: number): number {
  const gross = Math.round(line.quantity * line.unitPrice);
  const subtotal = linesTotal([line]);
  if (subtotal === gross) {
    return Math.round(quantity * line.unitPrice);
  }
  const share = line.quantity > 0 ? Math.round((subtotal * quantity) / line.quantity) : 0;
  return Math.min(subtotal, share);
}

function pickedQuantity(pick: ReturnPick): number | undefined {
  const quantity = parseQuantity(pick.quantity);
  return quantity === undefined || quantity <= 0 ? undefined : quantity;
}

export function buildNoteLines(
  source: ReturnSource,
  picks: readonly ReturnPick[],
): ReturnNoteLine[] {
  const result: ReturnNoteLine[] = [];
  for (const pick of picks) {
    const line = source.lines[pick.index];
    const quantity = pickedQuantity(pick);
    if (line !== undefined && quantity !== undefined) {
      result.push({
        index: line.index,
        productId: line.line.productId,
        unit: line.unit,
        quantity,
        value: returnedValue(line.line, quantity),
      });
    }
  }
  return result;
}

export function returnTotal(
  source: ReturnSource | undefined,
  picks: readonly ReturnPick[],
): number {
  return source === undefined
    ? 0
    : buildNoteLines(source, picks).reduce((sum, line) => sum + line.value, 0);
}

export function planSettlement(
  kind: ReturnKind,
  settlement: Settlement,
  total: number,
  balance: number,
): SettlementPlan {
  if (settlement === 'deposit') {
    return { applied: 0, toDeposit: total, cash: 0 };
  }
  if (settlement === 'potong') {
    const applied = Math.min(total, Math.max(0, balance));
    const rest = total - applied;
    return kind === 'penjualan'
      ? { applied, toDeposit: rest, cash: 0 }
      : { applied, toDeposit: 0, cash: rest };
  }
  return { applied: 0, toDeposit: 0, cash: total };
}

// Retur pembelian dengan uang kembali dari pemasok baru selesai setelah dana benar-benar diterima.
export function statusOf(kind: ReturnKind, plan: SettlementPlan): ReturnNote['status'] {
  return kind === 'pembelian' && plan.cash > 0 ? 'menunggu' : 'selesai';
}

export function settlementsFor(kind: ReturnKind, source: ReturnSource | undefined): Settlement[] {
  const all = SETTLEMENTS[kind];
  if (source?.partyId === undefined && kind === 'penjualan') {
    return all.filter((item) => item === 'tunai' || item === 'transfer');
  }
  return [...all];
}

export function defaultSettlement(
  kind: ReturnKind,
  source: ReturnSource | undefined,
  balance: number,
): Settlement {
  if (source?.partyId === undefined) {
    return 'tunai';
  }
  if (source.paid - source.cashReturned > 0) {
    return 'tunai';
  }
  if (balance > 0) {
    return 'potong';
  }
  return kind === 'penjualan' ? 'deposit' : 'tunai';
}

export function settlementLabelKey(kind: ReturnKind, settlement: Settlement): LabelKey {
  if (kind === 'penjualan') {
    const keys: Readonly<Record<Settlement, LabelKey>> = {
      tunai: 'boReturCaraTunai',
      transfer: 'boReturCaraTransfer',
      potong: 'boReturCaraPotongPiutang',
      deposit: 'boReturCaraJadiDeposit',
    };
    return keys[settlement];
  }
  const keys: Readonly<Record<Settlement, LabelKey>> = {
    tunai: 'boReturCaraTunaiPemasok',
    transfer: 'boReturCaraTransferPemasok',
    potong: 'boReturCaraPotongHutang',
    deposit: 'boReturCaraJadiDeposit',
  };
  return keys[settlement];
}

export function supplierBalance(supplier: Supplier | undefined): number {
  return supplier === undefined ? 0 : Math.max(0, supplier.payable);
}

export function customerBalance(customer: Customer | undefined): number {
  return customer === undefined
    ? 0
    : customer.invoices.reduce(
        (sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid),
        0,
      );
}

// Pemotongan piutang atau hutang melunasi faktur tertua lebih dulu, sama dengan pembayaran biasa.
export function potongCustomer(customer: Customer, amount: number): Customer {
  return { ...customer, invoices: settleInvoices(customer.invoices, amount) };
}

export function potongSupplier(supplier: Supplier, amount: number): Supplier {
  if (supplier.invoices === undefined) {
    return { ...supplier, payable: Math.max(0, supplier.payable - amount) };
  }
  const invoices = settleInvoices(supplier.invoices, amount);
  return {
    ...supplier,
    invoices,
    payable: invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid), 0),
  };
}

function baseQuantity(product: Product, unit: string, quantity: number): number | undefined {
  return product.units.some((item) => item.code === unit)
    ? toBase(product, unit, quantity)
    : undefined;
}

function baseNeeds(
  source: ReturnSource,
  picks: readonly ReturnPick[],
  products: ReadonlyMap<string, Product>,
): Map<string, number> {
  const needs = new Map<string, number>();
  for (const pick of picks) {
    const line = source.lines[pick.index];
    const quantity = pickedQuantity(pick);
    const product = line === undefined ? undefined : products.get(line.line.productId);
    if (line === undefined || quantity === undefined || product === undefined) {
      continue;
    }
    const base = baseQuantity(product, line.unit, quantity);
    if (base !== undefined) {
      needs.set(product.id, round3((needs.get(product.id) ?? 0) + base));
    }
  }
  return needs;
}

export function suggestWarehouse(
  kind: ReturnKind,
  source: ReturnSource | undefined,
  picks: readonly ReturnPick[],
  products: ReadonlyMap<string, Product>,
): WarehouseId {
  if (kind === 'penjualan' || source === undefined) {
    return 'display';
  }
  const needs = [...baseNeeds(source, picks, products)];
  const covers = (warehouse: WarehouseId): boolean =>
    needs.every(([id, quantity]) => (products.get(id)?.stock[warehouse] ?? 0) >= quantity);
  if (covers('besar')) {
    return 'besar';
  }
  return covers('display') ? 'display' : 'besar';
}

export interface StockPlan {
  readonly productId: string;
  readonly stock: Stock;
}

// Retur penjualan menambah stok gudang pilihan; retur pembelian mengurangi stok gudang pilihan.
export function planStock(
  kind: ReturnKind,
  warehouse: WarehouseId,
  source: ReturnSource,
  picks: readonly ReturnPick[],
  products: ReadonlyMap<string, Product>,
): StockPlan[] {
  const sign = kind === 'penjualan' ? 1 : -1;
  const plans: StockPlan[] = [];
  for (const [id, base] of baseNeeds(source, picks, products)) {
    const product = products.get(id);
    if (product !== undefined) {
      plans.push({
        productId: id,
        stock: { ...product.stock, [warehouse]: round3(product.stock[warehouse] + sign * base) },
      });
    }
  }
  return plans;
}

// ---------- Validasi ----------

export function refundableCash(source: ReturnSource): number {
  return Math.max(0, source.paid - source.cashReturned);
}

export function validateReturn(
  kind: ReturnKind,
  draft: ReturnDraft,
  products: ReadonlyMap<string, Product>,
): ReturnIssue | undefined {
  const source = draft.source;
  if (source === undefined) {
    return { type: 'faktur' };
  }
  if (draft.picks.length === 0) {
    return { type: 'barang' };
  }
  for (const pick of draft.picks) {
    const line = source.lines[pick.index];
    if (line === undefined) {
      return { type: 'barang' };
    }
    const quantity = parseQuantity(pick.quantity);
    if (quantity === undefined) {
      return { type: 'jumlah', index: pick.index, messageId: 'MSG-030' };
    }
    if (quantity <= 0) {
      return { type: 'jumlah', index: pick.index, messageId: 'MSG-029' };
    }
    const product = products.get(line.line.productId);
    const issue = product === undefined ? 'ok' : validateQuantity(product, quantity);
    if (issue === 'too-many-decimals') {
      return { type: 'jumlah', index: pick.index, messageId: 'MSG-031' };
    }
    if (issue === 'integer-only') {
      return { type: 'jumlah', index: pick.index, messageId: 'MSG-032' };
    }
    if (quantity > line.room) {
      return {
        type: 'melebihi',
        index: pick.index,
        room: `${formatDecimal(line.room, 3, 1)} ${line.unitName}`,
      };
    }
  }
  if (draft.reason.trim() === '') {
    return { type: 'alasan' };
  }
  if (kind === 'pembelian') {
    const used = new Map<string, number>();
    for (const pick of draft.picks) {
      const line = source.lines[pick.index];
      const quantity = pickedQuantity(pick);
      const product = line === undefined ? undefined : products.get(line.line.productId);
      if (line === undefined || quantity === undefined || product === undefined) {
        continue;
      }
      const base = baseQuantity(product, line.unit, quantity) ?? 0;
      const cumulative = round3((used.get(product.id) ?? 0) + base);
      used.set(product.id, cumulative);
      const available = product.stock[draft.warehouse];
      if (cumulative > available) {
        const shown = fromBase(product, line.unit, Math.max(0, available));
        return {
          type: 'stok',
          index: pick.index,
          available: `${formatDecimal(shown, 3, 1)} ${line.unitName}`,
        };
      }
    }
  }
  if (
    (draft.settlement === 'potong' || draft.settlement === 'deposit') &&
    source.partyId === undefined
  ) {
    return { type: 'pihak' };
  }
  if (draft.settlement === 'tunai' || draft.settlement === 'transfer') {
    const limit = refundableCash(source);
    if (returnTotal(source, draft.picks) > limit) {
      return { type: 'dana', limit };
    }
  }
  return undefined;
}

export function describeIssue(issue: ReturnIssue): string {
  switch (issue.type) {
    case 'faktur':
      return label('boReturPilihFaktur');
    case 'barang':
      return message('MSG-084');
    case 'jumlah':
      return message(issue.messageId);
    case 'melebihi':
      return message('MSG-085', { jumlah: issue.room });
    case 'alasan':
      return message('MSG-086');
    case 'stok':
      return message('MSG-072', { stok: issue.available });
    case 'pihak':
      return label('boReturButuhPelanggan');
    case 'dana':
      return label('boReturDanaMelebihi', { batas: formatRupiah(issue.limit) });
  }
}

export function issueIndex(issue: ReturnIssue): number | undefined {
  return 'index' in issue ? issue.index : undefined;
}

// ---------- Ringkasan dampak dan daftar ----------

// Baris rincian uang: potongan piutang atau hutang, kredit deposit, dan uang tunai atau transfer.
export function settlementLines(
  kind: ReturnKind,
  settlement: Settlement,
  plan: SettlementPlan,
): ImpactLine[] {
  const rows: ImpactLine[] = [];
  if (plan.applied > 0) {
    rows.push({
      icon: 'wallet',
      text: label(kind === 'penjualan' ? 'boReturDampakPiutang' : 'boReturDampakHutang', {
        nilai: formatRupiah(plan.applied),
      }),
    });
  }
  if (plan.toDeposit > 0) {
    rows.push({
      icon: 'coins',
      text: label('boReturDampakDeposit', { nilai: formatRupiah(plan.toDeposit) }),
    });
  }
  if (plan.cash > 0) {
    const way = settlement === 'transfer' ? 'boReturViaTransfer' : 'boReturViaTunai';
    rows.push({
      icon: 'banknote',
      text: label(kind === 'penjualan' ? 'boReturDampakUangKeluar' : 'boReturDampakUangMasuk', {
        nilai: formatRupiah(plan.cash),
        cara: label(way),
      }),
    });
  }
  return rows;
}

export function describeImpact(
  kind: ReturnKind,
  warehouse: WarehouseId,
  settlement: Settlement,
  plan: SettlementPlan,
  itemCount: number,
): ImpactLine[] {
  if (itemCount === 0) {
    return [];
  }
  return [
    {
      icon: 'package',
      text: label(kind === 'penjualan' ? 'boReturDampakStokNaik' : 'boReturDampakStokTurun', {
        gudang: label(WAREHOUSE_LABELS[warehouse]),
        jumlah: itemCount,
      }),
    },
    ...settlementLines(kind, settlement, plan),
  ];
}

export function notesOfKind(notes: readonly ReturnNote[], kind: ReturnKind): ReturnNote[] {
  return notes
    .filter((note) => note.kind === kind)
    .sort(
      (first, second) =>
        second.at.localeCompare(first.at) || second.number.localeCompare(first.number),
    );
}

export interface NoteSummary {
  readonly count: number;
  readonly total: number;
  readonly waiting: number;
}

export function summarizeNotes(notes: readonly ReturnNote[]): NoteSummary {
  return {
    count: notes.length,
    total: notes.reduce((sum, note) => sum + note.total, 0),
    waiting: notes.filter((note) => note.status === 'menunggu').length,
  };
}

export function noteItemCount(note: ReturnNote): number {
  return new Set(note.lines.map((line) => line.productId)).size;
}
