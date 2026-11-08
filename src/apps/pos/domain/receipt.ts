import type { Sale } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';

export type PaperWidth = 58 | 80;
export type ReceiptKind = 'draft' | 'sale' | 'copy' | 'retur';

export const PAPER_CHARS: Readonly<Record<PaperWidth, number>> = { 58: 32, 80: 48 };

export interface ReceiptItem {
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPrice: number;
  // Jumlah kotor baris, sebelum diskon.
  readonly subtotal: number;
  readonly discount?: number | undefined;
  readonly listPrice?: number | undefined;
}

export interface ReceiptPayment {
  readonly method: string;
  readonly amount: number;
}

export interface ReceiptInput {
  readonly kind: ReceiptKind;
  readonly width: PaperWidth;
  readonly number: string;
  readonly at: Date;
  readonly cashier: string;
  readonly customer: string;
  readonly items: readonly ReceiptItem[];
  readonly total: number;
  readonly payments: readonly ReceiptPayment[];
  readonly change: number;
}

// Kembalian = jumlah baris terbayar dikurangi total; 0 untuk penjualan lama tanpa rincian.
export function changeOf(sale: Sale): number {
  const paid = (sale.payments ?? [])
    .filter((row) => row.method !== 'piutang')
    .reduce((sum, row) => sum + row.amount, 0);
  return Math.max(0, paid - sale.total);
}

function center(text: string, width: number): string {
  const clipped = text.slice(0, width);
  return `${' '.repeat(Math.floor((width - clipped.length) / 2))}${clipped}`;
}

function pair(left: string, right: string, width: number): string[] {
  if (left.length + 1 + right.length <= width) {
    return [`${left}${' '.repeat(width - left.length - right.length)}${right}`];
  }
  const head = wrapText(left, width);
  if (right.length <= width) {
    return [...head, `${' '.repeat(width - right.length)}${right}`];
  }
  return [...head, ...wrapText(right, width - 2).map((part) => `  ${part}`)];
}

export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const piece = word.length > width ? word.slice(0, width) : word;
    if (current === '') {
      current = piece;
    } else if (current.length + 1 + piece.length <= width) {
      current = `${current} ${piece}`;
    } else {
      lines.push(current);
      current = piece;
    }
  }
  return current === '' ? lines : [...lines, current];
}

export function buildReceipt(input: ReceiptInput): string[] {
  const width = PAPER_CHARS[input.width];
  const rule = (char: string): string => char.repeat(width);
  const lines: string[] = [center(label('tokoNama'), width), rule('=')];
  if (input.kind === 'draft') {
    for (const part of wrapText(label('judulStrukDraf'), width)) {
      lines.push(center(part, width));
    }
  } else if (input.kind === 'copy') {
    lines.push(center(label('strukSalinan'), width));
  } else if (input.kind === 'retur') {
    lines.push(center(label('judulBuktiRetur'), width));
  }
  lines.push(
    rule('-'),
    ...pair(label('strukNomor'), input.number, width),
    ...pair(label('strukWaktu'), `${formatDate(input.at)} ${formatTime(input.at)}`, width),
    ...pair(label('strukKasir'), input.cashier, width),
    ...pair(label('pelanggan'), input.customer, width),
    rule('-'),
  );
  for (const item of input.items) {
    lines.push(...wrapText(item.name, width));
    const amount = `${formatDecimal(item.quantity)} ${item.unit}`;
    lines.push(
      ...(input.kind === 'draft'
        ? [`  ${amount}`]
        : pair(
            `  ${amount} x ${formatRupiah(item.unitPrice)}`,
            formatRupiah(item.subtotal),
            width,
          )),
    );
    if (input.kind !== 'draft') {
      if (item.listPrice !== undefined) {
        lines.push(
          `  ${label('hargaAsli', { harga: formatRupiah(item.listPrice) })}`.slice(0, width),
        );
      }
      if (item.discount !== undefined && item.discount > 0) {
        lines.push(...pair(`  ${label('diskon')}`, `-${formatRupiah(item.discount)}`, width));
      }
    }
  }
  lines.push(rule('-'));
  if (input.kind === 'draft') {
    lines.push(...pair(label('jumlahItem'), String(input.items.length), width));
    return lines;
  }
  lines.push(...pair(label('totalHuruf'), formatRupiah(input.total), width));
  for (const payment of input.payments) {
    lines.push(...pair(payment.method, formatRupiah(payment.amount), width));
  }
  if (input.change > 0) {
    lines.push(...pair(label('kembalian'), formatRupiah(input.change), width));
  }
  lines.push(rule('-'), center(label('strukTerimaKasih'), width));
  return lines;
}
