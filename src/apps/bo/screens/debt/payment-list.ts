import { el } from '../../../../shared/dom';
import { wibDate } from '../../../../shared/data/receivable';
import { formatDate, formatRupiah } from '../../../../shared/format';
import type { BoSession } from '../../bo-session';
import { methodText, type DebtPayment } from '../../domain/debt-payments';
import type { PartyType } from '../../domain/receivable-payable';
import type { ScreenHandle } from '../login';
import {
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createSearchBox,
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
  let partySelect = createFilterSelect(copy.saldoPihak, [{ value: '', text: copy.semuaPihak }]);
  const filters = el('div', { className: 'bo-trx-filters__slot' });

  const body = el('tbody', {});
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': DEBT_TEXT.daftarPembayaran },
    },
    el(
      'table',
      { className: 'bo-trx-table bo-trx-table--list' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: DEBT_TEXT.kolomTanggal }),
          el('th', { text: DEBT_TEXT.kolomNomorBayar }),
          el('th', { text: copy.kolomPihak }),
          el('th', { className: 'is-end', text: DEBT_TEXT.kolomTotalBayar }),
          el('th', { text: DEBT_TEXT.kolomCaraBayar }),
          el('th', { text: DEBT_TEXT.kolomKeterangan }),
          el('th', { text: DEBT_TEXT.kolomUser }),
        ),
      ),
      body,
    ),
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
    filters.replaceChildren(partySelect);
  };

  const paint = (): void => {
    const all = mine();
    todayKpi.set(
      formatRupiah(
        all.filter((payment) => payment.date === today).reduce((sum, item) => sum + item.total, 0),
      ),
    );
    const text = search.input.value.trim().toLowerCase();
    const rows = [...all]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .filter(
        (payment) =>
          (partySelect.value === '' || payment.partyName === partySelect.value) &&
          (text === '' ||
            payment.number.toLowerCase().includes(text) ||
            payment.partyName.toLowerCase().includes(text)),
      );
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? DEBT_TEXT.pembayaranKosong : DEBT_TEXT.pembayaranTidakCocok,
            attrs: { colspan: '7' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((payment) =>
        el(
          'tr',
          { attrs: { 'data-number': payment.number } },
          el('td', { className: 'bo-nowrap', text: shortDate(payment.date) }),
          el(
            'td',
            {},
            el('a', {
              className: 'bo-trx-link',
              text: payment.number,
              attrs: { href: `#${paymentFormPath(type, payment.number)}` },
            }),
          ),
          el('td', { className: 'is-bold', text: payment.partyName }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(payment.total) }),
          el('td', { text: methodText(payment.method) }),
          el('td', {
            className: 'bo-trx-notes',
            text: payment.note,
            attrs: { title: payment.note },
          }),
          el('td', { text: userName(session.store, payment.userId) }),
        ),
      ),
    );
  };

  search.input.addEventListener('input', paint);
  const element = createListPage({
    heading: el('h1', { className: 'bo-trx-listhead__heading', text: copy.daftarJudul }),
    kpis: [todayKpi],
    createText: copy.buat,
    onCreate: () => {
      go(paymentFormPath(type));
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
