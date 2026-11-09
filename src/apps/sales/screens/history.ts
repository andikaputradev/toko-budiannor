import '../../../styles/mobile-sales.css';
import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import type { SalesOrder } from '../../../shared/data/types';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import type { ScreenHandle } from '../../../shared/ui/screen';
import { openSheet } from '../../../shared/ui/sheet';
import { showToast } from '../../../shared/ui/toast';
import { buildOrderCopy } from '../domain/copy';
import {
  approvalLook,
  METHOD_LABELS,
  orderLineRows,
  orderOwed,
  syncState,
} from '../domain/history';
import type { SalesSession } from '../sales-session';
import type { SalesShell } from '../shell';

const LIST_PATH = '/sales/riwayat';

const stamp = (iso: string): string => `${formatDate(new Date(iso))}, ${formatTime(new Date(iso))}`;

export function renderHistory(
  session: SalesSession,
  go: (path: string) => void,
  query: URLSearchParams,
  shell?: SalesShell,
): ScreenHandle {
  const store = session.store;
  const selected = query.get('so');
  const root = el('div', { className: 'own-stack sls-screen' });
  let drawn = '';

  const lookup = (id: string) => store.getState().data.products.find((item) => item.id === id);
  const customerName = (order: SalesOrder): string =>
    store.getState().data.customers.find((item) => item.id === order.customerId)?.name ??
    label('pelangganUmum');
  const statusText = (order: SalesOrder): string =>
    label(approvalLook(session.approvalOf(order).status).labelKey);

  const syncBadge = (order: SalesOrder): HTMLElement =>
    syncState(order) === 'tersinkron'
      ? createMobBadge(label('slsSinkronOk'), 'sukses', 'cloud-check')
      : createMobBadge(label('slsSinkronMenunggu'), 'peringatan', 'cloud-off');

  const statusBadge = (order: SalesOrder): HTMLElement => {
    const look = approvalLook(session.approvalOf(order).status);
    return createMobBadge(label(look.labelKey), look.tone, look.icon);
  };

  const card = (order: SalesOrder): HTMLElement => {
    const sent = session.state().sent[order.number] !== undefined;
    return el(
      'a',
      {
        className: 'mob-card sls-so',
        attrs: { href: `#${LIST_PATH}?so=${encodeURIComponent(order.number)}` },
      },
      el(
        'span',
        { className: 'sls-so__top' },
        el('span', { className: 'sls-so__number', text: order.number }),
        icon('chevron-right'),
      ),
      el('span', {
        className: 'sls-so__who',
        text: `${customerName(order)}, ${stamp(order.createdAt)}`,
      }),
      el(
        'span',
        { className: 'sls-so__mid' },
        el('strong', { className: 'sls-so__total', text: formatRupiah(order.total) }),
        el('span', {
          className: 'sls-so__meta',
          text: label('slsBarisCaraBayar', {
            jumlah: order.lines.length,
            cara: label(METHOD_LABELS[order.payment]),
          }),
        }),
      ),
      el(
        'span',
        { className: 'sls-so__badges' },
        statusBadge(order),
        syncBadge(order),
        sent ? createMobBadge(label('salinanTerkirimBadge'), 'info', 'message-circle') : false,
      ),
    );
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
        createBanner('info', label('simulasiPdf')),
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

  const print = (order: SalesOrder, printerSelect: HTMLSelectElement): void => {
    if (session.state().printer === undefined) {
      showToast({ kind: 'error', text: label('slsPilihPrinter') });
      printerSelect.focus();
      return;
    }
    const result = session.printCopy(order.number);
    showToast(
      result.ok
        ? { kind: 'success', text: label('salinanDicetak', { printer: result.printer }) }
        : {
            kind: 'error',
            text:
              'messageId' in result
                ? message(result.messageId, result.values)
                : label(result.labelKey),
          },
    );
  };

  const detail = (order: SalesOrder): HTMLElement => {
    const approval = session.approvalOf(order);
    const rows = orderLineRows(order, lookup);
    const owed = orderOwed(order);
    const sentAt = session.state().sent[order.number];
    const copy = buildOrderCopy(order, {
      salesName: session.userName(),
      customerName: customerName(order),
      product: lookup,
      statusText: statusText(order),
    });
    const printer = createSelectField({
      labelText: label('printerBluetooth'),
      options: [
        { value: '', text: label('tanpaPrinter') },
        ...session.printers.map((name) => ({ value: name, text: name })),
      ],
      value: session.state().printer ?? '',
    });
    printer.select.addEventListener('change', () => {
      session.setPrinter(printer.select.value === '' ? undefined : printer.select.value);
    });

    const fact = (name: string, value: string): HTMLElement[] => [
      el('dt', { text: name }),
      el('dd', { text: value }),
    ];
    const total = (name: string, value: string, strong = false): HTMLElement =>
      el(
        'div',
        { className: strong ? 'sls-totals__row sls-totals__row--strong' : 'sls-totals__row' },
        el('dt', { text: name }),
        el('dd', { text: value }),
      );

    return el(
      'div',
      { className: 'own-stack sls-detail' },
      createMobCard({
        className: 'sls-detail__head',
        body: [
          el('div', { className: 'sls-so__badges' }, statusBadge(order), syncBadge(order)),
          el(
            'dl',
            { className: 'sls-facts' },
            ...fact(label('pelanggan'), customerName(order)),
            ...fact(label('tanggal'), stamp(order.createdAt)),
            ...fact(label('peranSales'), session.userName()),
          ),
          approval.request === undefined
            ? false
            : el(
                'div',
                { className: 'sls-detail__note' },
                el('p', {
                  className: 'sls-detail__note-label',
                  text: label('slsAlasanPersetujuan'),
                }),
                el('p', { text: approval.request.detail }),
              ),
        ],
      }),
      approval.status === 'menunggu'
        ? createBanner('warning', label('tungguPersetujuan'))
        : approval.status === 'ditolak'
          ? createBanner('danger', label('soDitolakOwner'))
          : false,
      createMobCard({
        title: label('slsRincianBarang'),
        iconName: 'package',
        body: [
          el(
            'ul',
            { className: 'sls-items' },
            ...rows.map((row) =>
              el(
                'li',
                { className: 'sls-item' },
                el(
                  'div',
                  { className: 'sls-item__main' },
                  el('p', { className: 'sls-item__name', text: row.name }),
                  el('p', {
                    className: 'sls-item__calc',
                    text: `${formatDecimal(row.quantity)} ${row.unit} x ${formatRupiah(row.price)}`,
                  }),
                  row.listPrice === undefined || row.listPrice === row.price
                    ? false
                    : el(
                        'p',
                        { className: 'sls-item__flag' },
                        createMobBadge(label('slsHargaDiubah'), 'info', 'pencil'),
                        el('span', {
                          text: label('hargaAsli', { harga: formatRupiah(row.listPrice) }),
                        }),
                      ),
                ),
                el('strong', { className: 'sls-item__sum', text: formatRupiah(row.subtotal) }),
              ),
            ),
          ),
          el(
            'dl',
            { className: 'sls-totals' },
            total(label('totalSo'), formatRupiah(order.total), true),
            total(label('caraBayar'), label(METHOD_LABELS[order.payment])),
            ...(order.payment === 'dp'
              ? [total(label('uangMuka'), formatRupiah(order.downPayment))]
              : []),
            ...(owed > 0 ? [total(label('sisaTagihan'), formatRupiah(owed))] : []),
          ),
        ],
      }),
      createMobCard({
        title: label('kirimSalinanSo'),
        iconName: 'send',
        body: [
          el(
            'div',
            { className: 'mob-stack' },
            sentAt === undefined
              ? false
              : createMobBadge(
                  label('salinanTerkirimPada', { waktu: stamp(sentAt) }),
                  'sukses',
                  'circle-check',
                ),
            createButton({
              text: label('kirimSalinanSo'),
              icon: 'send',
              onClick: () => {
                openSend(order);
              },
            }),
            printer.root,
            createButton({
              text: label('cetakBluetooth'),
              variant: 'secondary',
              icon: 'printer',
              onClick: () => {
                print(order, printer.select);
              },
            }),
          ),
        ],
      }),
      el(
        'details',
        { className: 'mob-card sls-preview' },
        el('summary', {}, el('span', { text: label('pratinjauSalinan') }), icon('chevron-down')),
        el('p', { className: 'sls-preview__note', text: label('simulasiPdf') }),
        el('pre', {
          className: 'own-pdf',
          attrs: { tabindex: '0', 'aria-label': label('pratinjauSalinan') },
          text: copy.join('\n'),
        }),
      ),
    );
  };

  // Layar digambar ulang hanya bila isi yang tampil berubah, agar fokus pada pilihan printer tetap.
  const signature = (): string => {
    const state = session.state();
    return JSON.stringify([
      selected,
      session
        .orders()
        .map((order) => [order.number, order.synced, session.approvalOf(order).status]),
      state.sent,
    ]);
  };

  const paint = (): void => {
    const next = signature();
    if (next === drawn) {
      return;
    }
    drawn = next;
    const orders = session.orders();
    const found = selected === null ? undefined : orders.find((item) => item.number === selected);
    if (found === undefined) {
      shell?.setTitle(label('navRiwayat'));
      shell?.setBack(undefined);
      root.replaceChildren(
        ...(orders.length === 0
          ? [
              createEmptyState({
                icon: 'inbox',
                title: label('belumAdaSoSales'),
                action: createButton({
                  text: label('slsBukaKatalog'),
                  variant: 'secondary',
                  icon: 'package',
                  onClick: () => {
                    go('/sales/katalog');
                  },
                }),
              }),
            ]
          : orders.map(card)),
      );
      return;
    }
    shell?.setTitle(found.number);
    shell?.setBack(LIST_PATH);
    root.replaceChildren(detail(found));
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
