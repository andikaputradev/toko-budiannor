import { balanceOf } from '../../../shared/data/receivable';
import { buildInvoiceLines, linesTotal } from '../../../shared/data/invoice-lines';
import { round3, toBase } from '../../../shared/data/units';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import type {
  BillLine,
  Dataset,
  Product,
  Sale,
  Tier,
  WarehouseId,
} from '../../../shared/data/types';
import { findProducts } from '../search';
import type { DebtPayment } from './debt-payments';
import { methodText } from './debt-payments';
import { getPayableBalances, getUnpaidInvoicesForParty } from './receivable-payable';
import {
  buildStockCard,
  movementsFor,
  type MovementSources,
  type MovementKind,
} from './stock-report';
import { buildTransactionRows, type TransactionRow } from './transaction-list';
import { wibDate } from '../../../shared/data/receivable';

// Laporan Back-Office (gambar klien 29): enam laporan yang dipilih lewat kotak pilihan. Fungsi di sini
// murni: menerima data dan parameter, mengembalikan tabel siap tampil, cetak, atau ekspor.
export interface ReportColumn {
  readonly text: string;
  readonly end?: boolean;
}

export interface ReportTable {
  readonly title: string;
  readonly fileName: string;
  // Baris parameter yang dicetak di bawah judul, mis. "Tanggal Faktur: 01/10/2026 s/d 19/10/2026".
  readonly params: readonly string[];
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly (readonly string[])[];
  // Baris total (sejajar kolom); kosong bila laporan tidak punya total.
  readonly totals: readonly string[] | undefined;
  // Pesan bila tidak ada baris (mis. barang belum dipilih untuk Kartu Stok).
  readonly emptyText: string;
}

export interface Period {
  readonly from: string;
  readonly to: string;
}

export type ReportMode = 'summary' | 'perincian' | 'total';

export const MODE_TEXT: Readonly<Record<ReportMode, string>> = {
  summary: 'Summary',
  perincian: 'Perincian',
  total: 'Total',
};

const ALL = '';

function shortDate(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

function periodText(label: string, period: Period): string {
  return `${label}: ${shortDate(period.from)} s/d ${shortDate(period.to)}`;
}

function inPeriod(date: string, period: Period): boolean {
  return (period.from === '' || date >= period.from) && (period.to === '' || date <= period.to);
}

function isSale(value: unknown): value is Sale {
  return (
    typeof value === 'object' && value !== null && 'lines' in value && Array.isArray(value.lines)
  );
}

function byId(data: Dataset): ReadonlyMap<string, Product> {
  return new Map(data.products.map((product) => [product.id, product]));
}

function productMatches(
  product: Product | undefined,
  filter: { readonly product: string; readonly category: string; readonly brand: string },
): boolean {
  if (product === undefined) {
    return filter.product === ALL && filter.category === ALL && filter.brand === ALL;
  }
  const phrase = filter.product.trim().toLowerCase();
  return (
    (phrase === '' ||
      product.name.toLowerCase().includes(phrase) ||
      product.code.toLowerCase().includes(phrase)) &&
    (filter.category === ALL || product.category === filter.category) &&
    (filter.brand === ALL || product.brand === filter.brand)
  );
}

// Baris faktur menjadi baris barang: penjualan POS memuat barisnya, selain itu dibangkitkan
// deterministik dari katalog (data proposal tidak memuat rincian faktur).
function linesOf(row: TransactionRow, data: Dataset): readonly BillLine[] {
  if (isSale(row.rawObject)) {
    return row.rawObject.lines;
  }
  const priceOf =
    row.type === 'penjualan'
      ? (product: Product, unit: { code: string; factor: number }): number =>
          Math.round((product.prices[unit.code]?.eceran ?? product.hpp * unit.factor) || 0)
      : (product: Product, unit: { code: string; factor: number }): number =>
          Math.round(product.hpp * unit.factor);
  return buildInvoiceLines(row.number, row.total, data.products, priceOf);
}

function statusText(row: TransactionRow): string {
  return row.status === 'lunas' ? 'Lunas' : 'Belum Lunas';
}

function kindText(row: TransactionRow, purchase: boolean): string {
  if (row.paymentTerms === 'Tunai') {
    return 'Tunai';
  }
  return purchase ? 'Hutang' : 'Piutang';
}

interface DocFilter {
  readonly period: Period;
  readonly party: string;
  readonly product: string;
  readonly category: string;
  readonly brand: string;
  readonly kind: '' | 'tunai' | 'piutang';
  readonly status: '' | 'lunas' | 'belum-lunas';
}

interface DocLine {
  readonly row: TransactionRow;
  readonly line: BillLine;
  readonly product: Product | undefined;
  readonly amount: number;
}

function matchingDocs(
  rows: readonly TransactionRow[],
  data: Dataset,
  filter: DocFilter,
): { readonly row: TransactionRow; readonly lines: readonly DocLine[] }[] {
  const products = byId(data);
  const result: { row: TransactionRow; lines: DocLine[] }[] = [];
  const hasProductFilter =
    filter.product !== ALL || filter.category !== ALL || filter.brand !== ALL;
  for (const row of rows) {
    if (!inPeriod(row.date, filter.period)) {
      continue;
    }
    if (filter.party !== ALL && row.partyName !== filter.party) {
      continue;
    }
    const credit = row.paymentTerms !== 'Tunai';
    if (filter.kind === 'tunai' && credit) {
      continue;
    }
    if (filter.kind === 'piutang' && !credit) {
      continue;
    }
    if (filter.status === 'lunas' && row.status !== 'lunas') {
      continue;
    }
    if (filter.status === 'belum-lunas' && row.status === 'lunas') {
      continue;
    }
    const all = linesOf(row, data).map((line): DocLine => ({
      row,
      line,
      product: products.get(line.productId),
      amount: linesTotal([line]),
    }));
    const lines = hasProductFilter
      ? all.filter((item) => productMatches(item.product, filter))
      : all;
    if (hasProductFilter && lines.length === 0) {
      continue;
    }
    result.push({ row, lines });
  }
  return result.sort(
    (a, b) => a.row.date.localeCompare(b.row.date) || a.row.number.localeCompare(b.row.number),
  );
}

function commissionOf(item: DocLine): number {
  const percent = item.product?.salesCommission?.percent ?? 0;
  return Math.round((item.amount * percent) / 100);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function empty(title: string, fileName: string, params: readonly string[]): ReportTable {
  return {
    title,
    fileName,
    params,
    columns: [],
    rows: [],
    totals: undefined,
    emptyText: 'Tidak ada data pada parameter ini.',
  };
}

// ---------------------------------------------------------------------------------------------
// Laporan Penjualan dan Laporan Pembelian

export interface DocReportParams extends DocFilter {
  readonly mode: ReportMode;
  // Hanya penjualan: tipe (POS atau Back Office), tier pelanggan, sales, dan komisi.
  readonly tier: '' | Tier;
  readonly saleType: '' | 'pos' | 'bo';
  readonly seller: string;
  readonly commission: boolean;
}

function docParams(params: DocReportParams, purchase: boolean): string[] {
  const lines = [
    periodText('Tanggal Faktur', params.period),
    `${purchase ? 'Pemasok' : 'Pelanggan'}: ${params.party === ALL ? 'Semua' : params.party}`,
  ];
  if (!purchase) {
    lines.push(
      `Kategori Pelanggan: ${params.tier === ALL ? 'Semua' : params.tier === 'eceran' ? 'Eceran' : 'Grosir'}`,
    );
  }
  lines.push(
    `Nama Barang: ${params.product === ALL ? 'Semua' : params.product}`,
    `Kategori Barang: ${params.category === ALL ? 'Semua' : params.category}`,
    `Merk Barang: ${params.brand === ALL ? 'Semua' : params.brand}`,
  );
  if (!purchase) {
    lines.push(
      `Tipe Penjualan: ${params.saleType === ALL ? 'Semua' : params.saleType === 'pos' ? 'POS' : 'Back Office'}`,
    );
  }
  lines.push(
    `Jenis Transaksi: ${params.kind === ALL ? 'Semua' : params.kind === 'tunai' ? 'Tunai' : purchase ? 'Hutang' : 'Piutang'}`,
    `Status Pembayaran: ${params.status === ALL ? 'Semua' : params.status === 'lunas' ? 'Lunas' : 'Belum Lunas'}`,
  );
  return lines;
}

export function buildDocReport(
  data: Dataset,
  purchase: boolean,
  params: DocReportParams,
): ReportTable {
  const title = purchase ? 'Laporan Pembelian' : 'Laporan Penjualan';
  const fileName = `${purchase ? 'Laporan-Pembelian' : 'Laporan-Penjualan'}-${MODE_TEXT[params.mode]}`;
  const paramLines = [`Jenis: ${MODE_TEXT[params.mode]}`, ...docParams(params, purchase)];
  const customers = new Map(data.customers.map((customer) => [customer.name, customer]));
  let rows = buildTransactionRows(data).filter(
    (row) => row.type === (purchase ? 'pembelian' : 'penjualan'),
  );
  if (!purchase) {
    rows = rows.filter((row) => {
      if (params.tier !== ALL && customers.get(row.partyName)?.tier !== params.tier) {
        return false;
      }
      if (params.saleType === 'pos' && !isSale(row.rawObject)) {
        return false;
      }
      if (params.saleType === 'bo' && isSale(row.rawObject)) {
        return false;
      }
      if (params.seller !== ALL) {
        const user = data.users.find((item) => item.id === params.seller);
        const sale = isSale(row.rawObject) ? row.rawObject : undefined;
        const sold =
          sale !== undefined
            ? sale.cashierId === params.seller ||
              sale.lines.some((line) => line.sellerId === params.seller)
            : row.user === user?.name;
        if (!sold) {
          return false;
        }
      }
      return true;
    });
  }
  const docs = matchingDocs(rows, data, params);
  if (docs.length === 0) {
    return empty(title, fileName, paramLines);
  }
  const withCommission = params.commission && !purchase;
  const docTotal = (doc: (typeof docs)[number]): number =>
    params.product === ALL && params.category === ALL && params.brand === ALL
      ? doc.row.total
      : sum(doc.lines.map((line) => line.amount));
  const docCommission = (doc: (typeof docs)[number]): number => sum(doc.lines.map(commissionOf));
  const party = purchase ? 'Pemasok' : 'Pelanggan';

  if (params.mode === 'summary') {
    const columns: ReportColumn[] = [
      { text: 'No Faktur' },
      { text: 'Tanggal' },
      { text: party },
      { text: 'Jenis' },
      { text: 'Status' },
      { text: 'Total', end: true },
      ...(withCommission ? [{ text: 'Komisi Sales', end: true }] : []),
    ];
    const total = sum(docs.map(docTotal));
    return {
      title,
      fileName,
      params: paramLines,
      columns,
      rows: docs.map((doc) => [
        doc.row.number,
        shortDate(doc.row.date),
        doc.row.partyName,
        kindText(doc.row, purchase),
        statusText(doc.row),
        formatRupiah(docTotal(doc)),
        ...(withCommission ? [formatRupiah(docCommission(doc))] : []),
      ]),
      totals: [
        `Total ${String(docs.length)} faktur`,
        '',
        '',
        '',
        '',
        formatRupiah(total),
        ...(withCommission ? [formatRupiah(sum(docs.map(docCommission)))] : []),
      ],
      emptyText: '',
    };
  }

  if (params.mode === 'perincian') {
    const columns: ReportColumn[] = [
      { text: 'No Faktur' },
      { text: 'Tanggal' },
      { text: party },
      { text: 'Kode' },
      { text: 'Nama Barang' },
      { text: 'Qty', end: true },
      { text: 'Satuan' },
      { text: 'Harga', end: true },
      { text: 'Jumlah', end: true },
      ...(withCommission ? [{ text: 'Komisi Sales', end: true }] : []),
    ];
    const flat = docs.flatMap((doc) => doc.lines);
    return {
      title,
      fileName,
      params: paramLines,
      columns,
      rows: flat.map((item) => [
        item.row.number,
        shortDate(item.row.date),
        item.row.partyName,
        item.product?.code ?? '-',
        item.product?.name ?? item.line.productId,
        formatDecimal(item.line.quantity, 3),
        item.line.unit,
        formatRupiah(item.line.unitPrice),
        formatRupiah(item.amount),
        ...(withCommission ? [formatRupiah(commissionOf(item))] : []),
      ]),
      totals: [
        `Total ${String(flat.length)} baris`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        formatRupiah(sum(flat.map((item) => item.amount))),
        ...(withCommission ? [formatRupiah(sum(flat.map(commissionOf)))] : []),
      ],
      emptyText: '',
    };
  }

  const cash = docs.filter((doc) => doc.row.paymentTerms === 'Tunai');
  const credit = docs.filter((doc) => doc.row.paymentTerms !== 'Tunai');
  const paid = docs.filter((doc) => doc.row.status === 'lunas');
  const open = docs.filter((doc) => doc.row.status !== 'lunas');
  const money = (list: typeof docs): string => formatRupiah(sum(list.map(docTotal)));
  return {
    title,
    fileName,
    params: paramLines,
    columns: [
      { text: 'Keterangan' },
      { text: 'Jumlah Faktur', end: true },
      { text: 'Total', end: true },
    ],
    rows: [
      [`Seluruh ${purchase ? 'pembelian' : 'penjualan'}`, String(docs.length), money(docs)],
      ['Tunai', String(cash.length), money(cash)],
      [purchase ? 'Hutang' : 'Piutang', String(credit.length), money(credit)],
      ['Lunas', String(paid.length), money(paid)],
      ['Belum Lunas', String(open.length), money(open)],
      ...(withCommission ? [['Komisi Sales', '', formatRupiah(sum(docs.map(docCommission)))]] : []),
    ],
    totals: undefined,
    emptyText: '',
  };
}

// ---------------------------------------------------------------------------------------------
// Laporan Laba Rugi Kotor (penjualan dikurangi HPP)

export interface GrossProfitParams {
  readonly mode: ReportMode;
  readonly period: Period;
  readonly customer: string;
  readonly product: string;
  readonly category: string;
  readonly brand: string;
}

function percentText(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${formatDecimal(Math.round((part / whole) * 1000) / 10, 1)}%`;
}

export function buildGrossProfitReport(data: Dataset, params: GrossProfitParams): ReportTable {
  const title = 'Laporan Laba Rugi Kotor';
  const fileName = `Laporan-Laba-Rugi-Kotor-${MODE_TEXT[params.mode]}`;
  const paramLines = [
    `Jenis: ${MODE_TEXT[params.mode]}`,
    periodText('Tanggal', params.period),
    `Pelanggan: ${params.customer === ALL ? 'Semua' : params.customer}`,
    `Nama Barang: ${params.product === ALL ? 'Semua' : params.product}`,
    `Kategori Barang: ${params.category === ALL ? 'Semua' : params.category}`,
    `Merk Barang: ${params.brand === ALL ? 'Semua' : params.brand}`,
  ];
  const docs = matchingDocs(
    buildTransactionRows(data).filter((row) => row.type === 'penjualan'),
    data,
    {
      period: params.period,
      party: params.customer,
      product: params.product,
      category: params.category,
      brand: params.brand,
      kind: ALL,
      status: ALL,
    },
  );
  const costOf = (item: DocLine): number =>
    item.product === undefined
      ? 0
      : Math.round(item.product.hpp * toBase(item.product, item.line.unit, item.line.quantity));
  const flat = docs.flatMap((doc) => doc.lines);
  if (flat.length === 0) {
    return empty(title, fileName, paramLines);
  }
  const revenue = sum(flat.map((item) => item.amount));
  const cost = sum(flat.map(costOf));

  if (params.mode === 'total') {
    return {
      title,
      fileName,
      params: paramLines,
      columns: [{ text: 'Keterangan' }, { text: 'Jumlah', end: true }],
      rows: [
        ['Jumlah faktur', String(docs.length)],
        ['Penjualan', formatRupiah(revenue)],
        ['HPP', formatRupiah(cost)],
        ['Laba Kotor', formatRupiah(revenue - cost)],
        ['Margin Kotor', percentText(revenue - cost, revenue)],
      ],
      totals: undefined,
      emptyText: '',
    };
  }
  if (params.mode === 'summary') {
    return {
      title,
      fileName,
      params: paramLines,
      columns: [
        { text: 'No Faktur' },
        { text: 'Tanggal' },
        { text: 'Pelanggan' },
        { text: 'Penjualan', end: true },
        { text: 'HPP', end: true },
        { text: 'Laba Kotor', end: true },
        { text: 'Margin', end: true },
      ],
      rows: docs.map((doc) => {
        const rev = sum(doc.lines.map((item) => item.amount));
        const hpp = sum(doc.lines.map(costOf));
        return [
          doc.row.number,
          shortDate(doc.row.date),
          doc.row.partyName,
          formatRupiah(rev),
          formatRupiah(hpp),
          formatRupiah(rev - hpp),
          percentText(rev - hpp, rev),
        ];
      }),
      totals: [
        `Total ${String(docs.length)} faktur`,
        '',
        '',
        formatRupiah(revenue),
        formatRupiah(cost),
        formatRupiah(revenue - cost),
        percentText(revenue - cost, revenue),
      ],
      emptyText: '',
    };
  }
  return {
    title,
    fileName,
    params: paramLines,
    columns: [
      { text: 'No Faktur' },
      { text: 'Tanggal' },
      { text: 'Kode' },
      { text: 'Nama Barang' },
      { text: 'Qty', end: true },
      { text: 'Satuan' },
      { text: 'Penjualan', end: true },
      { text: 'HPP', end: true },
      { text: 'Laba Kotor', end: true },
    ],
    rows: flat.map((item) => [
      item.row.number,
      shortDate(item.row.date),
      item.product?.code ?? '-',
      item.product?.name ?? item.line.productId,
      formatDecimal(item.line.quantity, 3),
      item.line.unit,
      formatRupiah(item.amount),
      formatRupiah(costOf(item)),
      formatRupiah(item.amount - costOf(item)),
    ]),
    totals: [
      'Total',
      '',
      '',
      '',
      '',
      '',
      formatRupiah(revenue),
      formatRupiah(cost),
      formatRupiah(revenue - cost),
    ],
    emptyText: '',
  };
}

// ---------------------------------------------------------------------------------------------
// Laporan Hutang Piutang

export interface DebtReportParams {
  readonly side: 'hutang' | 'piutang';
  readonly mode: 'kartu' | 'perincian' | 'pembayaran';
  readonly period: Period;
  readonly party: string;
  readonly status: '' | 'lunas' | 'belum-lunas';
}

const DEBT_MODE_TEXT = {
  kartu: 'Kartu',
  perincian: 'Perincian',
  pembayaran: 'Pembayaran',
} as const;

export function buildDebtReport(
  data: Dataset,
  payments: readonly DebtPayment[],
  params: DebtReportParams,
): ReportTable {
  const customer = params.side === 'piutang';
  const title = `Laporan ${customer ? 'Piutang' : 'Hutang'}`;
  const fileName = `Laporan-${customer ? 'Piutang' : 'Hutang'}-${DEBT_MODE_TEXT[params.mode]}`;
  const partyLabel = customer ? 'Pelanggan' : 'Pemasok';
  const paramLines = [
    `Jenis: ${customer ? 'Piutang' : 'Hutang'} - ${DEBT_MODE_TEXT[params.mode]}`,
    periodText('Tanggal', params.period),
    `${partyLabel}: ${params.party === ALL ? 'Semua' : params.party}`,
    `Status Pembayaran: ${params.status === ALL ? 'Semua' : params.status === 'lunas' ? 'Lunas' : 'Belum Lunas'}`,
  ];

  if (params.mode === 'pembayaran') {
    const rows = payments
      .filter(
        (payment) =>
          payment.type === (customer ? 'pelanggan' : 'pemasok') &&
          inPeriod(payment.date, params.period) &&
          (params.party === ALL || payment.partyName === params.party),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    if (rows.length === 0) {
      return empty(title, fileName, paramLines);
    }
    return {
      title,
      fileName,
      params: paramLines,
      columns: [
        { text: 'Tanggal' },
        { text: 'Nomor Pembayaran' },
        { text: partyLabel },
        { text: 'Cara Bayar' },
        { text: 'Keterangan' },
        { text: 'Total Bayar', end: true },
      ],
      rows: rows.map((payment) => [
        shortDate(payment.date),
        payment.number,
        payment.partyName,
        methodText(payment.method),
        payment.note,
        formatRupiah(payment.total),
      ]),
      totals: ['Total', '', '', '', '', formatRupiah(sum(rows.map((payment) => payment.total)))],
      emptyText: '',
    };
  }

  interface Open {
    readonly party: string;
    readonly number: string;
    readonly date: string;
    readonly due: string;
    readonly amount: number;
    readonly paid: number;
  }
  const invoices: Open[] = [];
  if (customer) {
    for (const person of data.customers) {
      for (const invoice of person.invoices) {
        invoices.push({
          party: person.name,
          number: invoice.id,
          date: invoice.issuedAt.slice(0, 10),
          due: invoice.dueAt.slice(0, 10),
          amount: invoice.amount,
          paid: invoice.paid,
        });
      }
    }
  } else {
    for (const balance of getPayableBalances(data)) {
      for (const invoice of getUnpaidInvoicesForParty(balance.partyId, 'pemasok', data)) {
        invoices.push({
          party: balance.name,
          number: invoice.invoiceNumber,
          date: invoice.date,
          due: invoice.dueDate,
          amount: invoice.amount,
          paid: invoice.paid,
        });
      }
    }
  }
  const chosen = invoices
    .filter(
      (invoice) =>
        inPeriod(invoice.date, params.period) &&
        (params.party === ALL || invoice.party === params.party) &&
        (params.status === ALL ||
          (params.status === 'lunas'
            ? invoice.paid >= invoice.amount
            : invoice.paid < invoice.amount)),
    )
    .sort((a, b) => a.party.localeCompare(b.party, 'id') || a.date.localeCompare(b.date));
  if (chosen.length === 0) {
    return empty(title, fileName, paramLines);
  }
  const remaining = (invoice: Open): number => Math.max(0, invoice.amount - invoice.paid);
  const today = data.referenceDate.slice(0, 10);

  if (params.mode === 'perincian') {
    return {
      title,
      fileName,
      params: paramLines,
      columns: [
        { text: partyLabel },
        { text: 'No Faktur' },
        { text: 'Tgl Faktur' },
        { text: 'Jatuh Tempo' },
        { text: 'Nilai Faktur', end: true },
        { text: 'Terbayar', end: true },
        { text: 'Sisa', end: true },
      ],
      rows: chosen.map((invoice) => [
        invoice.party,
        invoice.number,
        shortDate(invoice.date),
        shortDate(invoice.due),
        formatRupiah(invoice.amount),
        formatRupiah(invoice.paid),
        formatRupiah(remaining(invoice)),
      ]),
      totals: [
        'Total',
        '',
        '',
        '',
        formatRupiah(sum(chosen.map((invoice) => invoice.amount))),
        formatRupiah(sum(chosen.map((invoice) => invoice.paid))),
        formatRupiah(sum(chosen.map(remaining))),
      ],
      emptyText: '',
    };
  }
  const groups = new Map<string, Open[]>();
  for (const invoice of chosen) {
    groups.set(invoice.party, [...(groups.get(invoice.party) ?? []), invoice]);
  }
  const cards = [...groups.entries()];
  return {
    title,
    fileName,
    params: paramLines,
    columns: [
      { text: partyLabel },
      { text: 'Jumlah Faktur', end: true },
      { text: 'Total Faktur', end: true },
      { text: 'Terbayar', end: true },
      { text: 'Saldo', end: true },
      { text: 'Jatuh Tempo', end: true },
    ],
    rows: cards.map(([party, list]) => [
      party,
      String(list.length),
      formatRupiah(sum(list.map((invoice) => invoice.amount))),
      formatRupiah(sum(list.map((invoice) => invoice.paid))),
      formatRupiah(sum(list.map(remaining))),
      formatRupiah(sum(list.filter((invoice) => invoice.due < today).map(remaining))),
    ]),
    totals: [
      'Total',
      String(chosen.length),
      formatRupiah(sum(chosen.map((invoice) => invoice.amount))),
      formatRupiah(sum(chosen.map((invoice) => invoice.paid))),
      formatRupiah(sum(chosen.map(remaining))),
      formatRupiah(sum(chosen.filter((invoice) => invoice.due < today).map(remaining))),
    ],
    emptyText: '',
  };
}

export function customerBalanceOf(data: Dataset): number {
  return sum(data.customers.flatMap((person) => person.invoices.map(balanceOf)));
}

// ---------------------------------------------------------------------------------------------
// Laporan Stok Barang: Nilai Persediaan dan Kartu Stok Persediaan

export interface StockReportParams {
  readonly mode: 'nilai' | 'kartu';
  readonly period: Period;
  readonly product: string;
  readonly category: string;
  readonly brand: string;
  readonly warehouse: '' | WarehouseId;
  // HPP dan nilai persediaan hanya dibuka untuk Owner.
  readonly showHpp: boolean;
}

const KIND_TEXT: Readonly<Record<MovementKind, string>> = {
  pembelian: 'Pembelian',
  penjualan: 'Penjualan',
  mutasi: 'Transfer',
  koreksi: 'Koreksi',
  opname: 'Opname',
  'retur-penjualan': 'Retur Penjualan',
  'retur-pembelian': 'Retur Pembelian',
  // Jenis lain mengikuti nama yang sama di Kartu Stok.
};

function warehouseText(warehouse: '' | WarehouseId): string {
  return warehouse === ALL ? 'Semua' : warehouse === 'display' ? 'Toko' : 'Gudang';
}

export function buildStockReport(
  data: Dataset,
  sources: MovementSources,
  params: StockReportParams,
): ReportTable {
  const title = 'Laporan Stok Barang';
  const modeText = params.mode === 'nilai' ? 'Nilai Persediaan' : 'Kartu Stok Persediaan';
  const fileName = `Laporan-Stok-${params.mode === 'nilai' ? 'Nilai-Persediaan' : 'Kartu-Stok'}`;
  const paramLines = [
    `Jenis: ${modeText}`,
    periodText('Tanggal', params.period),
    `Nama Barang: ${params.product === ALL ? 'Semua' : params.product}`,
    `Kategori Barang: ${params.category === ALL ? 'Semua' : params.category}`,
    `Merk Barang: ${params.brand === ALL ? 'Semua' : params.brand}`,
    `Gudang: ${warehouseText(params.warehouse)}`,
  ];
  const filter = { product: params.product, category: params.category, brand: params.brand };

  if (params.mode === 'kartu') {
    if (params.product.trim() === '') {
      return {
        ...empty(title, fileName, paramLines),
        emptyText: 'Isi Nama Barang untuk Kartu Stok Persediaan.',
      };
    }
    const found = findProducts(
      data.products.filter(
        (product) =>
          product.active !== false && productMatches(product, { ...filter, product: ALL }),
      ),
      params.product,
      1,
    )[0];
    if (found === undefined) {
      return { ...empty(title, fileName, paramLines), emptyText: 'Barang tidak ditemukan.' };
    }
    const card = buildStockCard(found, movementsFor(found, sources), {
      start: params.period.from,
      end: params.period.to,
      warehouse: params.warehouse === ALL ? 'semua' : params.warehouse,
    });
    return {
      title,
      fileName,
      params: [...paramLines, `Barang: ${found.code} ${found.name} (satuan ${found.baseUnit})`],
      columns: [
        { text: 'Tanggal' },
        { text: 'Nomor' },
        { text: 'Transaksi' },
        { text: 'Keterangan' },
        { text: 'Masuk', end: true },
        { text: 'Keluar', end: true },
        { text: 'Saldo', end: true },
      ],
      rows: [
        ['', '', 'Saldo Awal', '', '', '', formatDecimal(card.opening, 3)],
        ...card.rows.map((row) => [
          shortDate(row.date),
          row.document,
          KIND_TEXT[row.kind],
          row.party ?? row.note ?? '',
          row.inQty > 0 ? formatDecimal(row.inQty, 3) : '',
          row.outQty > 0 ? formatDecimal(row.outQty, 3) : '',
          formatDecimal(row.balance, 3),
        ]),
      ],
      totals: [
        'Total',
        '',
        '',
        '',
        formatDecimal(card.totalIn, 3),
        formatDecimal(card.totalOut, 3),
        formatDecimal(card.closing, 3),
      ],
      emptyText: '',
    };
  }

  const products = data.products
    .filter((product) => product.active !== false && productMatches(product, filter))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (products.length === 0) {
    return empty(title, fileName, paramLines);
  }
  const quantity = (product: Product): number =>
    params.warehouse === ALL
      ? round3(product.stock.display + product.stock.besar)
      : product.stock[params.warehouse];
  const value = (product: Product): number => Math.round(quantity(product) * product.hpp);
  const columns: ReportColumn[] = [
    { text: 'Kode' },
    { text: 'Nama Barang' },
    { text: 'Satuan' },
    ...(params.warehouse === ALL
      ? [
          { text: 'Stok Toko', end: true },
          { text: 'Stok Gudang', end: true },
        ]
      : []),
    {
      text: params.warehouse === ALL ? 'Total Stok' : `Stok ${warehouseText(params.warehouse)}`,
      end: true,
    },
    ...(params.showHpp
      ? [
          { text: 'HPP', end: true },
          { text: 'Nilai', end: true },
        ]
      : []),
  ];
  return {
    title,
    fileName,
    params: paramLines,
    columns,
    rows: products.map((product) => [
      product.code,
      product.name,
      product.baseUnit,
      ...(params.warehouse === ALL
        ? [formatDecimal(product.stock.display, 3), formatDecimal(product.stock.besar, 3)]
        : []),
      formatDecimal(quantity(product), 3),
      ...(params.showHpp ? [formatRupiah(product.hpp), formatRupiah(value(product))] : []),
    ]),
    totals: [
      `Total ${String(products.length)} barang`,
      '',
      '',
      ...(params.warehouse === ALL
        ? [
            formatDecimal(sum(products.map((product) => product.stock.display)), 3),
            formatDecimal(sum(products.map((product) => product.stock.besar)), 3),
          ]
        : []),
      formatDecimal(sum(products.map(quantity)), 3),
      ...(params.showHpp ? ['', formatRupiah(sum(products.map(value)))] : []),
    ],
    emptyText: '',
  };
}

// ---------------------------------------------------------------------------------------------
// Cetak Daftar Harga dan Katalog Barang

export interface PriceListParams {
  readonly mode: 'harga' | 'katalog';
  readonly phrase: string;
  readonly category: string;
  readonly brand: string;
  readonly warehouse: '' | WarehouseId;
  readonly retail: boolean;
  readonly wholesale: boolean;
  readonly showHpp: boolean;
  readonly allUnits: boolean;
  readonly withStock: boolean;
}

export function buildPriceList(data: Dataset, params: PriceListParams): ReportTable {
  const catalog = params.mode === 'katalog';
  const title = catalog ? 'Katalog Barang' : 'Daftar Harga';
  const fileName = catalog ? 'Katalog-Barang' : 'Daftar-Harga';
  const paramLines = [
    `Frase Nama Barang: ${params.phrase.trim() === '' ? 'Semua' : params.phrase.trim()}`,
    `Kategori Barang: ${params.category === ALL ? 'Semua' : params.category}`,
    `Merk Barang: ${params.brand === ALL ? 'Semua' : params.brand}`,
    `Gudang: ${warehouseText(params.warehouse)}`,
    `Satuan: ${params.allUnits ? 'Semua Satuan' : 'Satuan Dasar'}`,
  ];
  const products = data.products
    .filter(
      (product) =>
        product.active !== false &&
        productMatches(product, {
          product: params.phrase,
          category: params.category,
          brand: params.brand,
        }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (products.length === 0) {
    return empty(title, fileName, paramLines);
  }
  const quantity = (product: Product): number =>
    params.warehouse === ALL
      ? round3(product.stock.display + product.stock.besar)
      : product.stock[params.warehouse];
  const columns: ReportColumn[] = [
    { text: 'Kode' },
    { text: 'Nama Barang' },
    ...(catalog ? [{ text: 'Kategori' }, { text: 'Merk' }] : []),
    { text: 'Satuan' },
    ...(params.withStock ? [{ text: 'Stok', end: true }] : []),
    ...(params.retail ? [{ text: 'Harga Eceran', end: true }] : []),
    ...(params.wholesale ? [{ text: 'Harga Grosir', end: true }] : []),
    ...(params.showHpp ? [{ text: 'HPP', end: true }] : []),
  ];
  const rows = products.flatMap((product) => {
    const units = params.allUnits ? product.units : product.units.slice(0, 1);
    return units.map((unit, index) => [
      product.code,
      product.name,
      ...(catalog ? [product.category, product.brand] : []),
      unit.factor === 1
        ? unit.code
        : `${unit.code} (${formatDecimal(unit.factor, 3)} ${product.baseUnit})`,
      ...(params.withStock
        ? [index === 0 ? `${formatDecimal(quantity(product), 3)} ${product.baseUnit}` : '']
        : []),
      ...(params.retail ? [formatRupiah(product.prices[unit.code]?.eceran ?? 0)] : []),
      ...(params.wholesale ? [formatRupiah(product.prices[unit.code]?.grosir ?? 0)] : []),
      ...(params.showHpp ? [formatRupiah(Math.round(product.hpp * unit.factor))] : []),
    ]);
  });
  return { title, fileName, params: paramLines, columns, rows, totals: undefined, emptyText: '' };
}

export function todayOf(now: Date): string {
  return wibDate(now);
}

export function monthStartOf(today: string): string {
  return `${today.slice(0, 8)}01`;
}
