import type {
  BillLine,
  Dataset,
  HeldBill,
  PaymentMethod,
  Product,
  PurchaseOrder,
  Role,
  Sale,
  SalesOrder,
  WarehouseId,
} from '../../../shared/data/types';
import { discountAmount, lineGross, lineSubtotal } from '../../pos/domain/bill';

export type DocKind = 'bill' | 'sale' | 'so' | 'po';
export type DocStatus =
  'ditahan' | 'lunas' | 'dp' | 'piutang' | 'draf' | 'dipesan' | 'diterima-sebagian' | 'diterima';

export interface DocRow {
  readonly kind: DocKind;
  /** Kunci kueri: id bill, nomor transaksi, atau nomor SO atau PO. */
  readonly ref: string;
  readonly number: string;
  readonly at: string;
  readonly total: number;
  readonly status: DocStatus;
  readonly userName: string;
  readonly partyName: string | undefined;
}

export interface DetailLine {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  /** Harga tier asli bila harga baris diubah. */
  readonly listPrice: number | undefined;
  readonly discount: number;
  readonly subtotal: number;
}

export interface DocPayment {
  readonly method: PaymentMethod;
  readonly amount: number;
}

export interface DocDetail {
  readonly kind: DocKind;
  readonly ref: string;
  readonly number: string;
  readonly at: string;
  readonly status: DocStatus;
  readonly userName: string;
  readonly userRole: Role | undefined;
  readonly partyName: string | undefined;
  readonly partyCode: string | undefined;
  readonly lines: readonly DetailLine[];
  /** Jumlah seluruh baris sebelum diskon. */
  readonly gross: number;
  readonly discount: number;
  readonly total: number;
  readonly payments: readonly DocPayment[];
  readonly paid: number;
  readonly remaining: number;
  readonly dueDate: string | undefined;
  readonly warehouse: WarehouseId | undefined;
  /** Cara bayar yang dipilih pada transaksi atau SO. */
  readonly method: PaymentMethod | undefined;
  readonly synced: boolean | undefined;
}

export interface DocKey {
  readonly kind: DocKind;
  readonly ref: string;
}

const QUERY_KEYS: readonly (readonly [string, DocKind])[] = [
  ['bill', 'bill'],
  ['trx', 'sale'],
  ['so', 'so'],
  ['po', 'po'],
];

export function docKeyFromQuery(query: URLSearchParams): DocKey | undefined {
  for (const [name, kind] of QUERY_KEYS) {
    const ref = query.get(name);
    if (ref !== null && ref !== '') {
      return { kind, ref };
    }
  }
  return undefined;
}

export function docQuery(row: DocKey): string {
  const name = QUERY_KEYS.find(([, kind]) => kind === row.kind)?.[0] ?? 'trx';
  return `${name}=${encodeURIComponent(row.ref)}`;
}

export function billTotal(lines: readonly BillLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

export function saleStatus(sale: Sale): 'lunas' | 'dp' | 'piutang' {
  if (sale.paid >= sale.total) {
    return 'lunas';
  }
  return sale.paid > 0 ? 'dp' : 'piutang';
}

function byNewest(first: { readonly at: string }, second: { readonly at: string }): number {
  return second.at.localeCompare(first.at);
}

function nameOf(data: Dataset, id: string | undefined): string {
  return data.users.find((user) => user.id === id)?.name ?? id ?? '';
}

function customerName(data: Dataset, id: string | undefined): string | undefined {
  return id === undefined ? undefined : data.customers.find((item) => item.id === id)?.name;
}

function supplierName(data: Dataset, id: string): string | undefined {
  return data.suppliers.find((item) => item.id === id)?.name;
}

export function heldBillRows(data: Dataset): DocRow[] {
  return data.bills
    .map((bill): DocRow => ({
      kind: 'bill',
      ref: bill.id,
      number: bill.number,
      at: bill.createdAt,
      total: billTotal(bill.lines),
      status: 'ditahan',
      userName: nameOf(data, bill.userId),
      partyName: customerName(data, bill.customerId),
    }))
    .sort(byNewest);
}

export function saleRows(data: Dataset): DocRow[] {
  return data.sales
    .map((sale): DocRow => ({
      kind: 'sale',
      ref: sale.number,
      number: sale.number,
      at: sale.createdAt,
      total: sale.total,
      status: saleStatus(sale),
      userName: nameOf(data, sale.cashierId),
      partyName: customerName(data, sale.customerId),
    }))
    .sort(byNewest);
}

// SO dan PO yang dibuat saat aplikasi berjalan (oleh Owner atau Sales), terbaru lebih dahulu.
export function orderRows(
  data: Dataset,
  salesOrders: readonly SalesOrder[],
  purchaseOrders: readonly PurchaseOrder[],
): DocRow[] {
  const sales = salesOrders.map((order): DocRow => ({
    kind: 'so',
    ref: order.number,
    number: order.number,
    at: order.createdAt,
    total: order.total,
    status: 'draf',
    userName: nameOf(data, order.createdBy),
    partyName: customerName(data, order.customerId),
  }));
  const purchases = purchaseOrders.map((order): DocRow => ({
    kind: 'po',
    ref: order.number,
    number: order.number,
    at: order.createdAt,
    total: order.total,
    status: order.status,
    userName: nameOf(data, order.createdBy),
    partyName: supplierName(data, order.supplierId),
  }));
  return [...sales, ...purchases].sort(byNewest);
}

export function detailLines(
  lines: readonly BillLine[],
  lookup: (id: string) => Product | undefined,
): DetailLine[] {
  return lines.map((line) => {
    const product = lookup(line.productId);
    return {
      productId: line.productId,
      code: product?.code ?? '',
      name: product?.name ?? line.productId,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      listPrice:
        line.listPrice !== undefined && line.listPrice !== line.unitPrice
          ? line.listPrice
          : undefined,
      discount: discountAmount(line),
      subtotal: lineSubtotal(line),
    };
  });
}

export function linesGross(lines: readonly BillLine[]): number {
  return lines.reduce((sum, line) => sum + lineGross(line), 0);
}

interface DetailBase {
  readonly lines: readonly DetailLine[];
  readonly gross: number;
  readonly discount: number;
  readonly total: number;
}

function summarize(lines: readonly DetailLine[]): DetailBase {
  const gross = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  const discount = lines.reduce((sum, line) => sum + line.discount, 0);
  return { lines, gross, discount, total: gross - discount };
}

function paymentsOfSale(sale: Sale): DocPayment[] {
  if (sale.payments !== undefined && sale.payments.length > 0) {
    return sale.payments.map((item) => ({ method: item.via ?? item.method, amount: item.amount }));
  }
  return sale.paid > 0 ? [{ method: sale.payment, amount: sale.paid }] : [];
}

export interface DocSources {
  readonly data: Dataset;
  readonly salesOrders: readonly SalesOrder[];
  readonly purchaseOrders: readonly PurchaseOrder[];
}

export function findDocument(sources: DocSources, key: DocKey): DocDetail | undefined {
  const { data } = sources;
  const lookup = (id: string): Product | undefined =>
    data.products.find((product) => product.id === id);
  const roleOf = (id: string | undefined): Role | undefined =>
    data.users.find((user) => user.id === id)?.role;

  if (key.kind === 'bill') {
    const bill: HeldBill | undefined = data.bills.find((item) => item.id === key.ref);
    if (bill === undefined) {
      return undefined;
    }
    const base = summarize(detailLines(bill.lines, lookup));
    const customer = data.customers.find((item) => item.id === bill.customerId);
    return {
      kind: 'bill',
      ref: bill.id,
      number: bill.number,
      at: bill.createdAt,
      status: 'ditahan',
      userName: nameOf(data, bill.userId),
      userRole: roleOf(bill.userId),
      partyName: customer?.name,
      partyCode: customer?.code,
      ...base,
      payments: [],
      paid: 0,
      remaining: base.total,
      dueDate: undefined,
      warehouse: undefined,
      method: undefined,
      synced: undefined,
    };
  }

  if (key.kind === 'sale') {
    const sale = data.sales.find((item) => item.number === key.ref);
    if (sale === undefined) {
      return undefined;
    }
    const base = summarize(detailLines(sale.lines, lookup));
    const customer = data.customers.find((item) => item.id === sale.customerId);
    const paid = Math.min(sale.paid, base.total);
    return {
      kind: 'sale',
      ref: sale.number,
      number: sale.number,
      at: sale.createdAt,
      status: saleStatus(sale),
      userName: nameOf(data, sale.cashierId),
      userRole: roleOf(sale.cashierId),
      partyName: customer?.name,
      partyCode: customer?.code,
      ...base,
      payments: paymentsOfSale(sale),
      paid,
      remaining: Math.max(0, base.total - paid),
      dueDate: sale.terms?.dueDate,
      warehouse: undefined,
      method: sale.payment,
      synced: undefined,
    };
  }

  if (key.kind === 'so') {
    const order = sources.salesOrders.find((item) => item.number === key.ref);
    if (order === undefined) {
      return undefined;
    }
    const base = summarize(detailLines(order.lines, lookup));
    const customer = data.customers.find((item) => item.id === order.customerId);
    const paid = Math.min(order.downPayment, base.total);
    return {
      kind: 'so',
      ref: order.number,
      number: order.number,
      at: order.createdAt,
      status: 'draf',
      userName: nameOf(data, order.createdBy),
      userRole: roleOf(order.createdBy),
      partyName: customer?.name,
      partyCode: customer?.code,
      ...base,
      payments: paid > 0 ? [{ method: 'dp', amount: paid }] : [],
      paid,
      remaining: Math.max(0, base.total - paid),
      dueDate: undefined,
      warehouse: undefined,
      method: order.payment,
      synced: order.synced,
    };
  }

  const order = sources.purchaseOrders.find((item) => item.number === key.ref);
  if (order === undefined) {
    return undefined;
  }
  const lines = detailLines(
    order.lines.map((line) => ({
      productId: line.productId,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
    lookup,
  );
  const base = summarize(lines);
  return {
    kind: 'po',
    ref: order.number,
    number: order.number,
    at: order.createdAt,
    status: order.status,
    userName: nameOf(data, order.createdBy),
    userRole: roleOf(order.createdBy),
    partyName: supplierName(data, order.supplierId),
    partyCode: undefined,
    ...base,
    payments: [],
    paid: 0,
    remaining: base.total,
    dueDate: undefined,
    warehouse: order.warehouse,
    method: undefined,
    synced: undefined,
  };
}
