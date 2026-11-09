import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { createAvatar, initialsOf } from '../../../shared/ui/mobile-card';

export interface PartyItem {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly amount: number;
  /** Lencana status dan keterangan tambahan di bawah jumlah. */
  readonly badges: readonly (HTMLElement | false)[];
}

// Daftar pelanggan atau supplier: avatar, nama, jumlah terutang, dan lencana. Seluruh baris dapat diketuk.
export function createPartyList(
  items: readonly PartyItem[],
  onSelect: (id: string) => void,
): HTMLElement {
  return el(
    'ul',
    { className: 'trx-party-list' },
    ...items.map((item) => {
      const button = el(
        'button',
        { className: 'trx-party', attrs: { type: 'button' } },
        createAvatar(initialsOf(item.name)),
        el(
          'span',
          { className: 'trx-party__main' },
          el('span', { className: 'trx-party__name', text: item.name }),
          el('span', { className: 'trx-party__meta', text: item.meta }),
          el('span', { className: 'trx-party__amount', text: formatRupiah(item.amount) }),
          el('span', { className: 'trx-party__badges' }, ...item.badges),
        ),
        icon('chevron-right'),
      );
      button.addEventListener('click', () => {
        onSelect(item.id);
      });
      return el('li', {}, button);
    }),
  );
}

export interface InvoiceItem {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  /** Nilai utama di kanan (sisa tagihan) dan keterangannya. */
  readonly amount: number;
  readonly caption: string;
  readonly badge: HTMLElement;
}

// Daftar invoice atau faktur: nomor, tanggal, sisa, dan status. Seluruh baris dapat diketuk.
export function createInvoiceList(
  items: readonly InvoiceItem[],
  onSelect: (id: string) => void,
): HTMLElement {
  return el(
    'ul',
    { className: 'trx-party-list' },
    ...items.map((item) => {
      const button = el(
        'button',
        { className: 'trx-invoice', attrs: { type: 'button' } },
        el(
          'span',
          { className: 'trx-invoice__main' },
          el('span', { className: 'trx-invoice__title', text: item.title }),
          el('span', { className: 'trx-invoice__meta', text: item.meta }),
          item.badge,
        ),
        el(
          'span',
          { className: 'trx-invoice__side' },
          el('span', { className: 'trx-invoice__amount', text: formatRupiah(item.amount) }),
          el('span', { className: 'trx-invoice__caption', text: item.caption }),
        ),
        icon('chevron-right'),
      );
      button.addEventListener('click', () => {
        onSelect(item.id);
      });
      return el('li', {}, button);
    }),
  );
}
