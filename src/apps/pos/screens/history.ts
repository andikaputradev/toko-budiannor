import { append, el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import type { PaymentMethod, Sale, SalePayment } from '../../../shared/data/types';
import { label, message, type LabelKey } from '../../../shared/messages';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import { isRangeValid } from '../domain/forms';
import {
  dayOf,
  filterSales,
  groupByDay,
  isPending,
  isUnsynced,
  pageCount,
  pageSlice,
  paymentKeyOf,
  paymentRowsOf,
  receivableInfo,
  saleDate,
  type StatusFilter,
} from '../domain/history';
import { changeOf } from '../domain/receipt';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import { openAuthorizeModal } from './authorize';
import type { ScreenHandle } from './login';
import { openReceiptPreview, saleReceipt } from './receipt-preview';
import { openReturnModal } from './retur-modal';
import { openShareReceipt } from './share-receipt';
import { createSplitPane, type SplitPane } from '../split';

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

const STATUS_CHIPS: readonly (readonly [StatusFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['lunas', 'statusLunas'],
  ['pending', 'statusPending'],
];

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function rowLabel(row: SalePayment): string {
  return row.method === 'dp'
    ? `${label('metodeDp')} (${label(METHOD_LABELS[row.via ?? 'tunai'])})`
    : label(METHOD_LABELS[row.method]);
}

export function renderHistory(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulRiwayat');
  const today = dayOf(session.now().toISOString());
  let start = today;
  let end = today;
  let status: StatusFilter = 'semua';
  let query = '';
  let page = 1;
  let selectedNumber: string | undefined;
  const paneRef: { current: SplitPane | undefined } = { current: undefined };

  const startInput = el('input', {
    className: 'input pos-history__date',
    attrs: { type: 'date', 'aria-label': label('dariTanggal') },
  });
  const endInput = el('input', {
    className: 'input pos-history__date',
    attrs: { type: 'date', 'aria-label': label('sampaiTanggal') },
  });
  startInput.value = start;
  endInput.value = end;
  const search = el('input', {
    className: 'input pos-history__search',
    attrs: { type: 'search', autocomplete: 'off', 'aria-label': label('cariTransaksi') },
  });
  const rangeError = el('p', { className: 'pos-history__error', attrs: { role: 'alert' } });
  const chipBox = el('div', {
    className: 'pos-history__chips',
    attrs: { role: 'group', 'aria-label': label('kolomStatus') },
  });
  const listBox = el('div', { className: 'pos-history__list' });
  const pager = el('div', { className: 'pos-history__pager' });
  const detail = el('section', { className: 'pos-history__detail' });

  const results = (): Sale[] => {
    const online = session.store.getState().online;
    const state = session.state();
    return filterSales(
      state.sales,
      state.queue,
      {
        start,
        end,
        status,
        query,
        onlyDevice: online ? undefined : new Set(state.deviceSales),
      },
      (id) => session.customerName(id),
    );
  };
  const selected = (rows: readonly Sale[]): Sale | undefined =>
    rows.find((sale) => sale.number === selectedNumber) ?? rows[0];

  const renderChips = (): void => {
    chipBox.replaceChildren(
      ...STATUS_CHIPS.map(([value, key]) => {
        const chip = el('button', {
          className: 'chip',
          text: label(key),
          attrs: { type: 'button', 'aria-pressed': value === status ? 'true' : 'false' },
        });
        chip.addEventListener('click', () => {
          status = value;
          page = 1;
          render();
        });
        return chip;
      }),
    );
  };

  const renderList = (rows: readonly Sale[], current: Sale | undefined): void => {
    if (rows.length === 0) {
      listBox.replaceChildren(createEmptyState({ icon: 'inbox', title: label('riwayatKosong') }));
      pager.replaceChildren();
      return;
    }
    const queue = session.state().queue;
    listBox.replaceChildren(
      ...groupByDay(pageSlice(rows, page)).map((group) =>
        el(
          'section',
          { className: 'pos-history__group' },
          el('h3', {
            className: 'pos-history__day t-label',
            text:
              group.day === today
                ? label('hariIni')
                : formatDate(new Date(`${group.day}T12:00:00+07:00`)),
          }),
          el(
            'ul',
            { className: 'pos-history__items' },
            ...group.sales.map((sale) => {
              const pending = isPending(sale, queue);
              const key = paymentKeyOf(sale);
              const pick = el(
                'button',
                {
                  className: 'pos-history__item',
                  attrs: {
                    type: 'button',
                    'aria-pressed': sale.number === current?.number ? 'true' : 'false',
                  },
                },
                el('strong', { className: 'pos-history__no', text: sale.number }),
                el('span', {
                  className: 'pos-history__time t-label',
                  text: formatTime(new Date(sale.createdAt)),
                }),
                el('span', {
                  className: 'pos-history__who',
                  text: session.customerName(sale.customerId),
                }),
                el('span', { className: 'pos-history__total', text: formatRupiah(sale.total) }),
                el('span', {
                  className: pending
                    ? 'pos-status pos-status--pending'
                    : 'pos-status pos-status--lunas',
                  text: label(pending ? 'statusPending' : 'statusLunas'),
                }),
                el('span', {
                  className: 'pos-history__meta t-label',
                  text: `${key === 'split' ? label('caraBayarSplit') : label(METHOD_LABELS[key])} · ${session.userName(sale.cashierId)}`,
                }),
                isUnsynced(sale, queue)
                  ? el('span', {
                      className: 't-label pos-history__unsynced',
                      text: label('belumTersinkron'),
                    })
                  : false,
              );
              pick.addEventListener('click', () => {
                selectedNumber = sale.number;
                render();
                paneRef.current?.showDetail();
              });
              return el('li', {}, pick);
            }),
          ),
        ),
      ),
    );
    const total = pageCount(rows.length);
    pager.replaceChildren(
      ...(total > 1
        ? [
            createButton({
              text: label('sebelumnya'),
              variant: 'secondary',
              onClick: () => {
                page = Math.max(1, page - 1);
                render();
              },
            }),
            el('span', { text: label('halaman', { halaman: page, total }) }),
            createButton({
              text: label('berikutnya'),
              variant: 'secondary',
              onClick: () => {
                page = Math.min(total, page + 1);
                render();
              },
            }),
          ]
        : []),
    );
  };

  const renderDetail = (sale: Sale | undefined): void => {
    if (sale === undefined) {
      detail.replaceChildren();
      return;
    }
    const role = session.store.getState().role;
    const at = new Date(sale.createdAt);
    const customer = session.store
      .getState()
      .data.customers.find((item) => item.id === sale.customerId);
    const row = (name: string, value: string): HTMLElement =>
      el(
        'p',
        { className: 'pos-history__row' },
        el('span', { className: 't-label', text: name }),
        el('span', { text: value }),
      );
    const figure = (name: string, value: number): HTMLElement =>
      el(
        'div',
        { className: 'pos-history__figure' },
        el('span', { className: 't-label', text: name }),
        el('output', { className: 't-value', text: formatRupiah(value) }),
      );

    const actions = el('div', { className: 'pos-history__actions' });
    if (isAllowed(role, 'BO-10', 'Simpan Retur')) {
      const returButton = createButton({
        text: label('retur'),
        variant: 'secondary',
        onClick: () => {
          openReturnModal(session, sale, render, () => {
            detail.querySelector<HTMLElement>('.pos-history__retur')?.focus();
          });
        },
      });
      returButton.classList.add('pos-history__retur');
      actions.append(returButton);
    }
    actions.append(
      createButton({
        text: label('shareStruk'),
        variant: 'secondary',
        icon: 'send',
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
      createButton({
        text: label('cetakStruk'),
        icon: 'printer',
        onClick: () => {
          openReceiptPreview({
            session,
            kind: 'copy',
            reference: sale.number,
            build: (width) => saleReceipt(session, sale, 'copy', width),
          });
        },
      }),
    );
    if (isAllowed(role, 'POS-06', 'Ajukan Koreksi')) {
      actions.append(
        createButton({
          text: label('ajukanKoreksi'),
          variant: 'secondary',
          onClick: () => {
            openAuthorizeModal({
              session,
              purpose: 'koreksi',
              reference: { number: sale.number, total: sale.total },
              onApproved: () => {
                showToast({ kind: 'success', text: label('koreksiDisetujui') });
              },
            });
          },
        }),
      );
    }

    const payRows = paymentRowsOf(sale);
    const received = payRows
      .filter((item) => item.method !== 'piutang')
      .reduce((sum, item) => sum + item.amount, 0);
    const owed = receivableInfo(sale);
    detail.replaceChildren();
    append(detail, [
      actions,
      el('h2', { className: 't-section-title', text: label('infoPenjualan') }),
      row(label('nomorPenjualan'), sale.number),
      row(label('tanggalPenjualan'), `${formatDate(at)} ${formatTime(at)}`),
      row(label('namaPelanggan'), session.customerName(sale.customerId)),
      row(label('dibuatOleh'), session.userName(sale.cashierId)),
      el('h2', { className: 't-section-title', text: label('infoPenerimaan') }),
      el(
        'div',
        { className: 'pos-history__figures' },
        figure(label('totalPenerimaan'), received),
        figure(label('totalBayar'), sale.paid),
        figure(label('kembalian'), changeOf(sale)),
      ),
      el('h3', { className: 'pos-history__sub t-label', text: label('riwayatPenerimaan') }),
      el(
        'ul',
        { className: 'pos-history__pay' },
        ...payRows.map((item) =>
          el(
            'li',
            {},
            el('span', { text: rowLabel(item) }),
            el('span', { className: 'is-end', text: formatRupiah(item.amount) }),
          ),
        ),
      ),
      owed === undefined
        ? false
        : el(
            'div',
            { className: 'pos-history__owed' },
            sale.terms === undefined
              ? false
              : row(label('tempoLabel'), label('tempoHari', { hari: sale.terms.dueDays })),
            owed.dueDate === undefined
              ? false
              : row(label('jatuhTempo'), formatDate(new Date(owed.dueDate))),
            row(label('sisaTagihan'), formatRupiah(owed.sisa)),
          ),
      el('h2', { className: 't-section-title', text: label('barangJasa') }),
      el(
        'ul',
        {
          className: 'pos-bills__lines pos-history__lines',
          attrs: { tabindex: '0', 'aria-label': label('daftarBarang') },
        },
        ...sale.lines.map((line) =>
          el(
            'li',
            {},
            el('strong', { text: session.product(line.productId)?.name ?? line.productId }),
            el('span', {
              className: 't-label',
              text: `${formatDecimal(line.quantity)} ${line.unit} x ${formatRupiah(line.unitPrice)}`,
            }),
            el('span', {
              className: 't-label',
              text: label('diinputOleh', { nama: session.userName(sale.cashierId) }),
            }),
            el('output', {
              className: 'is-end',
              text: formatRupiah(Math.round(line.quantity * line.unitPrice)),
            }),
          ),
        ),
      ),
      row(label('kolomTotal'), formatRupiah(sale.total)),
    ]);
  };

  const render = (): void => {
    rangeError.textContent = isRangeValid(start, end) ? '' : message('MSG-039');
    renderChips();
    const rows = results();
    const current = selected(rows);
    renderList(rows, current);
    renderDetail(current);
  };

  startInput.addEventListener('change', () => {
    start = startInput.value;
    page = 1;
    render();
  });
  endInput.addEventListener('change', () => {
    end = endInput.value;
    page = 1;
    render();
  });
  search.addEventListener('input', () => {
    query = search.value;
    page = 1;
    render();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const exact = session
      .state()
      .sales.find((sale) => sale.number.toLowerCase() === search.value.trim().toLowerCase());
    if (exact !== undefined) {
      selectedNumber = exact.number;
      start = saleDate(exact);
      end = start;
      startInput.value = start;
      endInput.value = end;
      query = '';
      search.value = '';
      render();
    }
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (isPc() && event.key === 'F2') {
      event.preventDefault();
      search.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = session.subscribe(render);
  const stopStore = session.store.subscribe(render);

  const listSection = el(
    'section',
    { className: 'pos-history__main' },
    el(
      'div',
      { className: 'pos-history__filters' },
      startInput,
      endInput,
      search,
      createButton({
        text: label('kembaliKeJual'),
        variant: 'secondary',
        onClick: () => {
          go('/pos/jual');
        },
      }),
    ),
    rangeError,
    chipBox,
    listBox,
    pager,
  );
  const pane = createSplitPane({
    list: listSection,
    detail,
    backLabel: 'kembali',
    className: 'pos-history',
  });
  paneRef.current = pane;
  const element = el('div', { className: 'pos' }, topbar.element, pane.element);
  render();
  return {
    element,
    destroy: () => {
      stop();
      stopStore();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
