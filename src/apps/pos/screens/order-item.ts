import { el, type Child } from '../../../shared/dom';
import { isPromoLine } from '../../../shared/domain/promo';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import type { BillLine, Product } from '../../../shared/data/types';
import { lineSubtotal } from '../domain/bill';
import { clipName } from '../domain/catalog-view';
import { discountTag } from './line-price';

export interface OrderItemOptions {
  readonly line: BillLine;
  readonly product: Product | undefined;
  readonly short?: boolean;
  // Dengan onOpen nama barang menjadi tombol (keranjang); tanpa itu hanya teks (layar bayar).
  readonly onOpen?: (() => void) | undefined;
}

// Satu baris barang pesanan: nama (satu baris, kode di kanannya) di atas, lalu "QTY : jumlah X harga"
// di kiri dan jumlah rupiah di kanan. Dipakai bersama oleh keranjang Pesanan Baru dan layar bayar
// supaya keduanya tampil sama.
export function createOrderItem(options: OrderItemOptions): HTMLElement {
  const { line, product } = options;
  const fullName = product?.name ?? line.productId;
  const tag = discountTag(line);
  const parts: Child[] = [
    el('span', {
      className: 'pos-bill__text',
      text: clipName(fullName),
      attrs: { title: fullName },
    }),
    product === undefined
      ? false
      : el('span', { className: 'pos-bill__code t-label', text: product.code }),
    product !== undefined &&
      isPromoLine(line, product) &&
      el('span', { className: 'pos-order__promo', text: label('promoTanda') }),
    options.short === true &&
      el(
        'span',
        { className: 'pos-short' },
        icon('triangle-alert'),
        el('span', { text: label('stokKurang') }),
      ),
  ];
  const onOpen = options.onOpen;
  const name =
    onOpen === undefined
      ? el('div', { className: 'pos-bill__name pos-bill__name--static' }, ...parts)
      : el('button', { className: 'pos-bill__name', attrs: { type: 'button' } }, ...parts);
  if (onOpen !== undefined) {
    name.addEventListener('click', onOpen);
  }
  return el(
    'li',
    { className: 'pos-order__item' },
    name,
    el(
      'span',
      { className: 'pos-order__qty' },
      document.createTextNode(
        label('qtyBaris', {
          jumlah: formatDecimal(line.quantity, 3, 0),
          harga: formatRupiah(line.unitPrice).replace('Rp ', ''),
        }),
      ),
      tag === undefined ? false : el('span', { className: 'pos-order__flag', text: ` ${tag}` }),
    ),
    el('output', { className: 'pos-order__amount', text: formatRupiah(lineSubtotal(line)) }),
  );
}
