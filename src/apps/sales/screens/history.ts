import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { SalesOrder } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createTextField } from '../../../shared/ui/field';
import type { ScreenHandle } from '../../../shared/ui/screen';
import { openSheet } from '../../../shared/ui/sheet';
import { showToast } from '../../../shared/ui/toast';
import { buildOrderCopy } from '../domain/copy';
import type { SalesSession } from '../sales-session';

export function renderHistory(
  session: SalesSession,
  go: (path: string) => void,
  query: URLSearchParams,
): ScreenHandle {
  const store = session.store;
  const selected = query.get('so');
  const root = el('div', { className: 'own-stack' });

  const customerName = (order: SalesOrder): string =>
    store.getState().data.customers.find((item) => item.id === order.customerId)?.name ??
    label('pelangganUmum');

  const statusText = (order: SalesOrder): string => {
    const approval = session.approvalOf(order).status;
    return approval === 'menunggu'
      ? label('statusSoMenunggu')
      : approval === 'disetujui'
        ? label('statusSoDisetujui')
        : approval === 'ditolak'
          ? label('statusSoDitolak')
          : label('statusDraf');
  };

  const card = (order: SalesOrder): HTMLElement => {
    const open = el(
      'button',
      { className: 'own-card__open', attrs: { type: 'button' } },
      el('span', { className: 'own-card__name', text: order.number }),
      el('span', { className: 't-label', text: customerName(order) }),
      el('span', { className: 't-value', text: formatRupiah(order.total) }),
      el('span', { className: 't-label', text: statusText(order) }),
      session.state().sent[order.number] === undefined
        ? false
        : el('span', { className: 't-label', text: label('salinanTerkirimBadge') }),
    );
    open.addEventListener('click', () => {
      go(`/sales/riwayat?so=${encodeURIComponent(order.number)}`);
    });
    return el('article', { className: 'own-card' }, open);
  };

  const openSend = (order: SalesOrder): void => {
    const customer = store.getState().data.customers.find((item) => item.id === order.customerId);
    const phone = createTextField({ labelText: label('nomorWa'), inputMode: 'numeric' });
    phone.input.value = customer?.phone ?? '';
    openSheet({
      title: label('kirimSalinanSo'),
      body: el(
        'div',
        { className: 'own-form' },
        el('p', { className: 't-label', text: label('simulasiPdf') }),
        phone.root,
      ),
      submitText: label('kirimViaWa'),
      onSubmit: () => {
        const result = session.sendCopy(order.number, phone.input.value);
        if (result.ok) {
          showToast({
            kind: result.queued ? 'info' : 'success',
            text: label(result.queued ? 'salinanAntre' : 'salinanTerkirim', {
              telepon: phone.input.value.trim(),
            }),
          });
          return undefined;
        }
        return 'messageId' in result
          ? message(result.messageId, result.values)
          : label(result.labelKey);
      },
    });
  };

  const detail = (order: SalesOrder): HTMLElement => {
    const lines = buildOrderCopy(order, {
      salesName: session.userName(),
      customerName: customerName(order),
      product: (id) => store.getState().data.products.find((item) => item.id === id),
      statusText: statusText(order),
    });
    const sentAt = session.state().sent[order.number];
    const approval = session.approvalOf(order);
    return el(
      'div',
      { className: 'own-stack' },
      createButton({
        text: label('kembali'),
        variant: 'secondary',
        icon: 'chevron-left',
        onClick: () => {
          go('/sales/riwayat');
        },
      }),
      el('h2', { className: 'own-card__name', text: order.number }),
      el('p', { className: 't-value', text: statusText(order) }),
      approval.request === undefined
        ? false
        : el('p', { className: 't-label', text: approval.request.detail }),
      el('h3', { className: 't-section-title', text: label('pratinjauSalinan') }),
      el('p', { className: 't-label', text: label('simulasiPdf') }),
      el('pre', {
        className: 'own-pdf',
        attrs: { tabindex: '0', 'aria-label': label('pratinjauSalinan') },
        text: lines.join('\n'),
      }),
      sentAt === undefined
        ? false
        : el('p', {
            className: 't-label',
            text: label('salinanTerkirimPada', {
              waktu: `${formatDate(new Date(sentAt))}, ${formatTime(new Date(sentAt))}`,
            }),
          }),
      el(
        'div',
        { className: 'own-stack' },
        createButton({
          text: label('kirimSalinanSo'),
          icon: 'send',
          onClick: () => {
            openSend(order);
          },
        }),
        createButton({
          text: label('cetakBluetooth'),
          variant: 'secondary',
          icon: 'printer',
          onClick: () => {
            const result = session.printCopy(order.number);
            if (result.ok) {
              showToast({
                kind: 'success',
                text: label('salinanDicetak', { printer: result.printer }),
              });
            } else {
              showToast({
                kind: 'error',
                text:
                  'messageId' in result
                    ? message(result.messageId, result.values)
                    : label(result.labelKey),
              });
            }
          },
        }),
      ),
      el('p', {
        className: 't-label',
        text: `${formatDecimal(order.lines.length)} ${label('kolomItem')}`,
      }),
    );
  };

  const paint = (): void => {
    const orders = session.orders();
    const found = selected === null ? undefined : orders.find((item) => item.number === selected);
    root.replaceChildren(
      found === undefined
        ? el(
            'div',
            { className: 'own-stack' },
            ...(orders.length === 0
              ? [createEmptyState({ icon: 'inbox', title: label('belumAdaSoSales') })]
              : orders.map(card)),
          )
        : detail(found),
    );
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: root,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}
