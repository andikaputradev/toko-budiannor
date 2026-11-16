import '../../../styles/bo-mutasi.css';
import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import { formatDate } from '../../../shared/format';
import type { BoSession } from '../bo-session';
import type { OpnameOrder, OpnameStatus } from '../domain/opname';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import type { ScreenHandle } from './login';
import { renderOpnameForm } from './opname-form';
import { formFor, OPNAME_FORM_PATH, warehouseName } from './opname-shared';
import { userName } from './mutasi/parts';
import { MUT_TEXT } from './mutasi/text';
import {
  createFilterSelect,
  createListPage,
  createRefreshButton,
  createSearchBox,
} from './trx/list-page';

const STATUS_TEXT: Readonly<Record<OpnameStatus, string>> = {
  menunggu: MUT_TEXT.statusMenunggu,
  perhitungan: MUT_TEXT.statusPerhitungan,
  selesai: MUT_TEXT.statusSelesai,
};

const STATUS_TONE: Readonly<Record<OpnameStatus, string>> = {
  menunggu: 'is-danger',
  perhitungan: 'is-warning',
  selesai: 'is-lunas',
};

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: MUT_TEXT.semua },
  { value: 'hari-ini', text: MUT_TEXT.hariIni },
  { value: 'tujuh-hari', text: MUT_TEXT.tujuhHari },
  { value: 'bulan-ini', text: MUT_TEXT.bulanIni },
];

// Stok Opname (gambar klien 19 dan 20): daftar riwayat dengan tombol "+ Stok Opname"; formulir
// Perintah dan Hasil pada tab yang sama lewat `?baru=1` (dan `no=` untuk perintah yang sudah ada).
export function renderOpname(
  session: BoSession,
  go: (path: string) => void,
  query: URLSearchParams,
): ScreenHandle {
  if (query.get('baru') === '1') {
    return renderOpnameForm(session, go, {
      pso: query.get('no') ?? undefined,
      mode: query.get('mode') === 'hasil' ? 'hasil' : undefined,
    });
  }
  return renderOpnameList(session, go);
}

function renderOpnameList(session: BoSession, go: (path: string) => void): ScreenHandle {
  const today = wibDate(session.now());
  const dateSelect = createFilterSelect(
    MUT_TEXT.kolomTanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${MUT_TEXT.kolomTanggal}: ${option.text}`,
    })),
  );
  const warehouseSelect = createFilterSelect(MUT_TEXT.kolomGudang, [
    { value: 'semua', text: MUT_TEXT.gudangSemua },
    { value: 'display', text: `${MUT_TEXT.kolomGudang}: Toko` },
    { value: 'besar', text: `${MUT_TEXT.kolomGudang}: Gudang` },
  ]);
  const statusSelect = createFilterSelect(MUT_TEXT.kolomStatus, [
    { value: 'semua', text: MUT_TEXT.statusSemua },
    ...(['menunggu', 'perhitungan', 'selesai'] as const).map((status) => ({
      value: status,
      text: `${MUT_TEXT.kolomStatus}: ${STATUS_TEXT[status]}`,
    })),
  ]);
  const search = createSearchBox(MUT_TEXT.cariOpnameNama, MUT_TEXT.cariOpname);

  const body = el('tbody', {});
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': MUT_TEXT.riwayatOpname },
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
          el('th', { text: MUT_TEXT.kolomTanggal }),
          el('th', { text: MUT_TEXT.kolomNomorPso }),
          el('th', { text: MUT_TEXT.kolomNomorHso }),
          el('th', { text: MUT_TEXT.kolomGudang }),
          el('th', { text: MUT_TEXT.kolomStatus }),
          el('th', { text: MUT_TEXT.kolomPetugas }),
          el('th', { text: MUT_TEXT.kolomKeterangan }),
        ),
      ),
      body,
    ),
  );

  const docDate = (order: OpnameOrder): string =>
    formatDate(new Date(`${order.date}T12:00:00+07:00`));

  const matches = (order: OpnameOrder): boolean => {
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    if (range.startDate !== undefined && order.date < range.startDate) {
      return false;
    }
    if (range.endDate !== undefined && order.date > range.endDate) {
      return false;
    }
    if (warehouseSelect.value !== 'semua' && order.warehouse !== warehouseSelect.value) {
      return false;
    }
    if (statusSelect.value !== 'semua' && order.status !== statusSelect.value) {
      return false;
    }
    const text = search.input.value.trim().toLowerCase();
    if (text === '') {
      return true;
    }
    return [order.pso, order.hso ?? '', userName(session.store, order.officerId), order.note].some(
      (field) => field.toLowerCase().includes(text),
    );
  };

  const paint = (): void => {
    const all = session.state().opnameOrders;
    const rows = [...all].reverse().filter(matches);
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? MUT_TEXT.opnameKosong : MUT_TEXT.opnameTidakCocok,
            attrs: { colspan: '7' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((order) =>
        el(
          'tr',
          { attrs: { 'data-pso': order.pso } },
          el('td', { className: 'bo-nowrap', text: docDate(order) }),
          el(
            'td',
            {},
            el('a', {
              className: 'bo-trx-link',
              text: order.pso,
              attrs: { href: `#${formFor(order.pso, 'perintah')}` },
            }),
          ),
          el(
            'td',
            {},
            order.hso === undefined
              ? ''
              : el('a', {
                  className: 'bo-trx-link',
                  text: order.hso,
                  attrs: { href: `#${formFor(order.pso, 'hasil')}` },
                }),
          ),
          el('td', { text: warehouseName(order) }),
          el(
            'td',
            {},
            el('span', {
              className: `bo-trx-status ${STATUS_TONE[order.status]}`,
              text: STATUS_TEXT[order.status],
            }),
          ),
          el('td', { text: userName(session.store, order.officerId) }),
          el('td', {
            className: 'bo-trx-notes',
            text: order.note,
            attrs: { title: order.note },
          }),
        ),
      ),
    );
  };

  for (const control of [dateSelect, warehouseSelect, statusSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);
  const stop = session.subscribe(paint);
  const element = createListPage({
    heading: el('h1', { className: 'bo-trx-listhead__heading', text: MUT_TEXT.riwayatOpname }),
    kpis: [],
    createText: MUT_TEXT.buatOpname,
    onCreate: () => {
      go(OPNAME_FORM_PATH);
    },
    refresh: createRefreshButton(MUT_TEXT.segarkan, paint),
    filters: [dateSelect, warehouseSelect, statusSelect],
    search: search.root,
    table,
  });
  paint();
  return { element, destroy: stop };
}
