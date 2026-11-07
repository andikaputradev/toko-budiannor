import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import type { PaymentMethod, Sale } from '../../../shared/data/types';
import { label, message, type LabelKey } from '../../../shared/messages';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import { isRangeValid } from '../domain/forms';
import {
  dayOf,
  filterSales,
  isPending,
  isUnsynced,
  pageCount,
  pageSlice,
  saleDate,
  type StatusFilter,
} from '../domain/history';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import { openAuthorizeModal } from './authorize';
import type { ScreenHandle } from './login';
import { openReceiptPreview, saleReceipt } from './receipt-preview';
import { openReturnModal } from './retur-modal';

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

export function renderHistory(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulRiwayat');
  const today = dayOf(session.now().toISOString());
  let start = today;
  let end = today;
  let status: StatusFilter = 'semua';
  let query = '';
  let page = 1;
  let selectedNumber: string | undefined;

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
    const body = el('tbody');
    for (const sale of pageSlice(rows, page)) {
      const pick = el('button', {
        className: 'pos-bills__pick',
        text: sale.number,
        attrs: {
          type: 'button',
          'aria-pressed': sale.number === current?.number ? 'true' : 'false',
        },
      });
      pick.addEventListener('click', () => {
        selectedNumber = sale.number;
        render();
      });
      const pending = isPending(sale, queue);
      body.append(
        el(
          'tr',
          { className: sale.number === current?.number ? 'is-selected' : '' },
          el('td', {}, pick),
          el('td', { text: formatTime(new Date(sale.createdAt)) }),
          el('td', { text: session.customerName(sale.customerId) }),
          el('td', { className: 'is-end', text: formatRupiah(sale.total) }),
          el(
            'td',
            {},
            el('span', {
              className: pending
                ? 'pos-status pos-status--pending'
                : 'pos-status pos-status--lunas',
              text: label(pending ? 'statusPending' : 'statusLunas'),
            }),
            isUnsynced(sale, queue)
              ? el('span', {
                  className: 't-label pos-history__unsynced',
                  text: label('belumTersinkron'),
                })
              : false,
          ),
        ),
      );
    }
    listBox.replaceChildren(
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomNoTransaksi') }),
            el('th', { text: label('kolomWaktu') }),
            el('th', { text: label('pelanggan') }),
            el('th', { className: 'is-end', text: label('kolomTotal') }),
            el('th', { text: label('kolomStatus') }),
          ),
        ),
        body,
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
    const row = (name: string, value: string): HTMLElement =>
      el(
        'p',
        { className: 'pos-history__row' },
        el('span', { className: 't-label', text: name }),
        el('span', { text: value }),
      );
    const actions = el(
      'div',
      { className: 'pos-history__actions' },
      createButton({
        text: label('cetakUlangStruk'),
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
    if (isAllowed(role, 'BO-10', 'Simpan Retur')) {
      actions.append(
        createButton({
          text: label('returPenjualan'),
          variant: 'secondary',
          onClick: () => {
            openReturnModal(session, sale, render);
          },
        }),
      );
    }
    detail.replaceChildren(
      el('h2', { className: 't-section-title', text: sale.number }),
      row(label('detailTanggal'), `${formatDate(at)} ${formatTime(at)}`),
      row(label('detailKasir'), session.userName(sale.cashierId)),
      row(label('pelanggan'), session.customerName(sale.customerId)),
      el(
        'ul',
        {
          className: 'pos-bills__lines',
          attrs: { tabindex: '0', 'aria-label': label('daftarBarang') },
        },
        ...sale.lines.map((line) =>
          el(
            'li',
            {},
            el('span', { text: session.product(line.productId)?.name ?? line.productId }),
            el('span', {
              className: 't-label',
              text: `${formatDecimal(line.quantity)} ${line.unit}`,
            }),
          ),
        ),
      ),
      row(label('detailCaraBayar'), label(METHOD_LABELS[sale.payment])),
      row(label('kolomTotal'), formatRupiah(sale.total)),
      actions,
    );
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

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-history' },
      el(
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
      ),
      detail,
    ),
  );
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
