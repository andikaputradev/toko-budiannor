import type { Product, SalesOrder } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { METHOD_LABELS } from './history';

export interface CopyContext {
  readonly salesName: string;
  readonly customerName: string;
  readonly product: (id: string) => Product | undefined;
  readonly statusText: string;
}

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
      const note =
        line.listPrice === undefined || line.listPrice === line.unitPrice
          ? ''
          : `\n  ${label('hargaAsli', { harga: formatRupiah(line.listPrice) })}`;
      return `${name}\n  ${formatDecimal(line.quantity)} ${line.unit} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(Math.round(line.quantity * line.unitPrice))}${note}`;
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
