import { el } from '../../../../shared/dom';
import { matchesPhrase } from '../../../../shared/data/search-index';
import { wibDate } from '../../../../shared/data/receivable';
import { formatRupiah } from '../../../../shared/format';
import { formatDate } from '../../short-date';
import type { BoSession } from '../../bo-session';
import { dateRangeFor, type DateRangeKind } from '../../domain/transaction-list';
import { methodText, type DebtPayment } from '../../domain/debt-payments';
import type { PartyType } from '../../domain/receivable-payable';
import type { ScreenHandle } from '../login';
import {
  createDateFilter,
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createRowSelection,
  createSearchBox,
  fixColumns,
  refuseDelete,
} from '../trx/list-page';
import { userName } from '../mutasi/parts';
import { ensurePayments } from './ledger';
import { DEBT_COPY, DEBT_TEXT } from './text';

export const PAYMENT_PATH: Readonly<Record<PartyType, string>> = {
  pelanggan: '/bo/hutang-piutang/bayar-piutang',
  pemasok: '/bo/hutang-piutang/bayar-hutang',
};

export function paymentFormPath(type: PartyType, number?: string): string {
  return `${PAYMENT_PATH[type]}?baru=1${number === undefined ? '' : `&no=${encodeURIComponent(number)}`}`;
}

function shortDate(date: string): string {
  return formatDate(new Date(`${date}T12:00:00+07:00`));
}

// Daftar Pembayaran Piutang atau Hutang (gambar klien 22): tombol "+ Bayar", filter pihak, pencarian,
// total pembayaran hari ini, dan tabel pembayaran. Nomor pembayaran membuka dokumennya.
export function renderPaymentList(
  session: BoSession,
  go: (path: string) => void,
  type: PartyType,
): ScreenHandle {
  const copy = DEBT_COPY[type];
  const today = wibDate(session.now());
  const todayKpi = createKpi(copy.totalHariIni);
  const search = createSearchBox(copy.cariPembayaranNama, copy.cariPembayaran);
  const selection = createRowSelection();
  let partySelect = createFilterSelect(copy.saldoPihak, [{ value: '', text: copy.semuaPihak }]);
  const dateSelect = createDateFilter();
  const methodSelect = createFilterSelect(DEBT_TEXT.kolomMetode, [
    { value: '', text: 'Metode: Semua' },
    ...(['tunai', 'transfer', 'qris', 'edc'] as const).map((method) => ({
      value: method,
      text: `Metode: ${methodText(method)}`,
    })),
  ]);
  const filters = el('div', { className: 'bo-trx-filters__slot' });

  const body = el('tbody', {});
  const grid = el(
    'table',
    { className: 'bo-trx-table bo-trx-table--list' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: DEBT_TEXT.kolomNomorBayar }),
        el('th', { text: DEBT_TEXT.kolomTanggal }),
        el('th', { text: copy.kolomPihak }),
        el('th', { text: DEBT_TEXT.kolomMetode }),
        el('th', { text: DEBT_TEXT.kolomKasBank }),
        el('th', { text: DEBT_TEXT.kolomUser }),
        el('th', { text: DEBT_TEXT.kolomKeterangan }),
        el('th', { className: 'is-end', text: DEBT_TEXT.kolomTotalBayar }),
      ),
    ),
    body,
  );
  // Pembayaran Hutang dan Piutang memakai kolom dan lebar yang sama.
  fixColumns(grid, [160, 105, undefined, 115, 130, 110, undefined, 140]);
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': DEBT_TEXT.daftarPembayaran },
    },
    grid,
  );

  const mine = (): DebtPayment[] =>
    ensurePayments(session).filter((payment) => payment.type === type);

  const rebuildFilter = (): void => {
    const names = [...new Set(mine().map((payment) => payment.partyName))].sort((a, b) =>
      a.localeCompare(b, 'id'),
    );
    const chosen = partySelect.value;
    partySelect = createFilterSelect(copy.saldoPihak, [
      { value: '', text: copy.semuaPihak },
      ...names.map((name) => ({ value: name, text: `${copy.saldoPihak}: ${name}` })),
    ]);
    partySelect.value = names.includes(chosen) ? chosen : '';
    partySelect.addEventListener('change', paint);
    filters.replaceChildren(dateSelect, partySelect, methodSelect);
  };

  const paint = (): void => {
    const all = mine();
    todayKpi.set(
      formatRupiah(
        all.filter((payment) => payment.date === today).reduce((sum, item) => sum + item.total, 0),
      ),
    );
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const rows = [...all]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .filter(
        (payment) =>
          (range.startDate === undefined || payment.date >= range.startDate) &&
          (range.endDate === undefined || payment.date <= range.endDate) &&
          (methodSelect.value === '' || payment.method === methodSelect.value) &&
          (partySelect.value === '' || payment.partyName === partySelect.value) &&
          matchesPhrase(`${payment.number} ${payment.partyName}`, search.input.value),
      );
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? DEBT_TEXT.pembayaranKosong : DEBT_TEXT.pembayaranTidakCocok,
            attrs: { colspan: '8' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((payment) => {
        const tr = el(
          'tr',
          { attrs: { 'data-number': payment.number } },
          el(
            'td',
            {},
            el('a', {
              className: 'bo-trx-link',
              text: payment.number,
              attrs: { href: `#${paymentFormPath(type, payment.number)}` },
            }),
          ),
          el('td', { className: 'bo-nowrap', text: shortDate(payment.date) }),
          el('td', { className: 'is-bold', text: payment.partyName }),
          el('td', { text: methodText(payment.method) }),
          el('td', { text: payment.account }),
          el('td', { text: userName(session.store, payment.userId) }),
          el('td', {
            className: 'bo-trx-notes',
            text: payment.note,
            attrs: { title: payment.note },
          }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(payment.total) }),
        );
        selection.attach(tr, payment.number);
        return tr;
      }),
    );
  };

  for (const control of [dateSelect, methodSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);
  const element = createListPage({
    title: copy.daftarJudul,
    kpis: [todayKpi],
    selection,
    onCreate: () => {
      go(paymentFormPath(type));
    },
    onEdit: (number) => {
      go(paymentFormPath(type, number));
    },
    onDelete: () => {
      refuseDelete(DEBT_TEXT.pembayaranDitolak);
    },
    refresh: createRefreshButton(DEBT_TEXT.segarkan, () => {
      rebuildFilter();
      paint();
    }),
    filters: [filters],
    search: search.root,
    table,
  });
  rebuildFilter();
  paint();
  const stop = session.subscribe(() => {
    rebuildFilter();
    paint();
  });
  return { element, destroy: stop };
}
