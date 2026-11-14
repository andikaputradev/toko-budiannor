import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import type { Sale } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { changeOf } from '../domain/receipt';
import type { PosSession } from '../pos-session';
import { openReceiptPreview, saleReceipt } from './receipt-preview';
import { openShareReceipt } from './share-receipt';

export function openPaymentDone(session: PosSession, sale: Sale, go: (path: string) => void): void {
  const change = changeOf(sale);
  const customer = session.store
    .getState()
    .data.customers.find((item) => item.id === sale.customerId);
  const handle = openModal({
    title: label('pembayaranBerhasil'),
    body: el(
      'div',
      { className: 'pos-done' },
      el(
        'span',
        { className: 'pos-done__mark', attrs: { 'aria-hidden': 'true' } },
        icon('circle-check'),
      ),
      el('output', { className: 't-total pos-done__total', text: formatRupiah(sale.total) }),
      el(
        'p',
        { className: 'pos-done__who' },
        el('strong', { text: sale.number }),
        el('span', { text: session.customerName(sale.customerId) }),
      ),
      change > 0 &&
        el(
          'p',
          { className: 'pos-done__change' },
          el('span', { className: 't-label', text: label('kembalian') }),
          el('output', { className: 't-value', text: formatRupiah(change) }),
        ),
      el(
        'div',
        { className: 'pos-done__actions' },
        createButton({
          text: label('cetakStruk'),
          variant: 'secondary',
          icon: 'printer',
          onClick: () => {
            openReceiptPreview({
              session,
              kind: 'sale',
              reference: sale.number,
              build: () => saleReceipt(session, sale, 'sale'),
            });
          },
        }),
        createButton({
          text: label('kirimWa'),
          variant: 'secondary',
          icon: 'message-circle',
          onClick: () => {
            openShareReceipt({
              title: label('kirimStruk'),
              reference: sale.number,
              amountText: formatRupiah(sale.total),
              customerName: session.customerName(sale.customerId),
              phone: customer?.phone ?? '',
              sentLabel: 'strukTerkirimWa',
            });
          },
        }),
      ),
    ),
    actions: [],
    onClose: () => {
      go('/pos/jual');
    },
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('selesai'),
        onClick: () => {
          handle.close();
        },
      }),
    ),
  );
}
