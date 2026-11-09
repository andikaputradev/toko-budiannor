import type { ReceivableDecision } from '../../../shared/data/receivable';
import type { ApprovalKind, BillLine, Customer, Product } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { creditWarning, type CreditReason } from './credit';

export type ApprovalReason = CreditReason | 'below-list';

export interface ApprovalWarning {
  /** Alasan utama: alasan piutang lebih dulu, lalu harga di bawah tier. */
  readonly reason: ApprovalReason;
  readonly reasons: readonly ApprovalReason[];
  /** Jenis permintaan persetujuan yang dicatat: piutang bila ada alasan piutang, selain itu diskon. */
  readonly kind: ApprovalKind;
  readonly text: string;
}

export interface BelowListLine {
  readonly name: string;
  readonly unit: string;
  readonly price: number;
  readonly list: number;
  readonly quantity: number;
}

// Baris yang harga ubahnya lebih rendah dari harga tier pelanggan.
export function belowListLines(
  lines: readonly BillLine[],
  lookup: (id: string) => Product | undefined,
): BelowListLine[] {
  return lines.flatMap((line) =>
    line.listPrice !== undefined && line.unitPrice < line.listPrice
      ? [
          {
            name: lookup(line.productId)?.name ?? line.productId,
            unit: line.unit,
            price: line.unitPrice,
            list: line.listPrice,
            quantity: line.quantity,
          },
        ]
      : [],
  );
}

const SHOWN_LINES = 3;

export function belowListText(rows: readonly BelowListLine[]): string {
  const sentences = rows.slice(0, SHOWN_LINES).map((row) =>
    label('slsHargaDiBawahTier', {
      nama: row.name,
      harga: formatRupiah(row.price),
      satuan: row.unit,
      tier: formatRupiah(row.list),
    }),
  );
  if (rows.length > SHOWN_LINES) {
    sentences.push(label('slsBarangLainDiBawahTier', { jumlah: rows.length - SHOWN_LINES }));
  }
  return sentences.join(' ');
}

// Selisih harga tier dan harga jual untuk seluruh baris di bawah tier (nilai potongan).
export function belowListGap(rows: readonly BelowListLine[]): number {
  return rows.reduce((sum, row) => sum + Math.round((row.list - row.price) * row.quantity), 0);
}

// Gabungan peringatan piutang (validasi limit dan keterlambatan) dan harga di bawah tier.
// Keduanya memerlukan persetujuan Owner lewat alur yang sama.
export function approvalWarning(input: {
  readonly decision: ReceivableDecision;
  readonly below: readonly BelowListLine[];
  readonly customer: Customer | undefined;
  readonly now: Date;
}): ApprovalWarning | undefined {
  const credit = creditWarning(input.decision, input.customer, input.now);
  const hasBelow = input.below.length > 0;
  if (credit === undefined && !hasBelow) {
    return undefined;
  }
  const reasons: ApprovalReason[] = [
    ...(credit === undefined ? [] : [credit.reason]),
    ...(hasBelow ? (['below-list'] as const) : []),
  ];
  const first = reasons[0];
  if (first === undefined) {
    return undefined;
  }
  const belowSentence = belowListText(input.below);
  const text =
    credit === undefined
      ? `${belowSentence} ${label('butuhApprovalOwner')}`
      : hasBelow
        ? `${credit.text} ${belowSentence}`
        : credit.text;
  return { reason: first, reasons, kind: credit === undefined ? 'diskon' : 'piutang', text };
}
