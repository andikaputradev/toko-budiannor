import type { Product, SalesOrder } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';

export interface CopyContext {
  readonly salesName: string;
  readonly customerName: string;
  readonly product: (id: string) => Product | undefined;
  readonly statusText: string;
}

const METHOD_LABELS: Readonly<Record<SalesOrder['payment'], LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

export function buildOrderCopy(order: SalesOrder, context: CopyContext): string[] {
  const at = new Date(order.createdAt);
  const rule = '-'.repeat(32);
  const owed = Math.max(0, order.total - order.downPayment);
  return [
    label('salinanSoJudul'),
    label('tokoNama'),
    `${label('noSo')}: ${order.number}`,
    `${label('tanggal')}: ${formatDate(at)}, ${formatTime(at)}`,
    `${label('peranSales')}: ${context.salesName}`,
    `${label('pelanggan')}: ${context.customerName}`,
    rule,
    ...order.lines.map((line) => {
      const name = context.product(line.productId)?.name ?? line.productId;
      return `${name}\n  ${formatDecimal(line.quantity)} ${line.unit} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(Math.round(line.quantity * line.unitPrice))}`;
    }),
    rule,
    `${label('totalSo')}: ${formatRupiah(order.total)}`,
    `${label('caraBayar')}: ${label(METHOD_LABELS[order.payment])}`,
    ...(order.payment === 'dp'
      ? [
          `${label('uangMuka')}: ${formatRupiah(order.downPayment)}`,
          `${label('sisaTagihan')}: ${formatRupiah(owed)}`,
        ]
      : order.payment === 'piutang'
        ? [`${label('sisaTagihan')}: ${formatRupiah(order.total)}`]
        : []),
    `${label('kolomStatus')}: ${context.statusText}`,
  ];
}
