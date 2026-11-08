import type { BillLine } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { discountAmount } from '../domain/bill';

// Tanda diskon pada baris, mis. "-10%" atau "-Rp 5.000"; kosong bila tidak ada diskon.
export function discountTag(line: BillLine): string | undefined {
  const discount = line.discount;
  if (discount === undefined || discountAmount(line) === 0) {
    return undefined;
  }
  return discount.kind === 'persen'
    ? label('diskonTandaPersen', { nilai: discount.value })
    : label('diskonTandaNominal', { nilai: formatRupiah(discount.value) });
}

const plain = (value: number): string => formatRupiah(value).replace('Rp ', '');

// Harga satuan pada baris: harga asli dicoret (bila diubah) diikuti harga yang berlaku.
export function priceNodes(line: BillLine): Node[] {
  return [
    ...(line.listPrice === undefined
      ? []
      : [
          el('s', { className: 'pos-order__list', text: plain(line.listPrice) }),
          document.createTextNode(' '),
        ]),
    document.createTextNode(plain(line.unitPrice)),
  ];
}
