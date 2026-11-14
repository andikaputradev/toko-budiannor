import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import { formatRupiah } from '../../../shared/format';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import {
  buildPurchaseOrderRows,
  buildSalesOrderRows,
  filterOrderRows,
  type OrderKind,
  type OrderRow,
  type OrderStatus,
} from '../domain/order-list';
import { importedSoNumbers } from '../domain/session-drafts';
import {
  createFilterSelect,
  createListPage,
  createRefreshButton,
  createSearchBox,
} from './trx/list-page';

export const ORDER_PATH: Readonly<Record<OrderKind, string>> = {
  po: '/bo/transaksi/po-pembelian',
  so: '/bo/transaksi/so-penjualan',
};

const COPY = {
  po: {
    judul: 'Daftar Pesanan Pembelian ( PO )',
    buat: 'Buat PO Baru',
    nomor: 'No. PO',
    pihak: 'Pemasok',
    cari: 'Cari No PO / Pemasok / Keterangan...',
    cariNama: 'Cari No PO, pemasok, atau keterangan',
  },
  so: {
    judul: 'Daftar Pesanan Penjualan ( SO )',
    buat: 'Buat SO Baru',
    nomor: 'No. SO',
    pihak: 'Pelanggan',
    cari: 'Cari No SO / Pelanggan / Keterangan...',
    cariNama: 'Cari No SO, pelanggan, atau keterangan',
  },
} as const;

const TEXT = {
  segarkan: 'Segarkan',
  tanggal: 'Tanggal',
  status: 'Status',
  semua: 'Semua',
  keterangan: 'Keterangan',
  total: 'Total',
  kosong: 'Belum ada pesanan.',
  tidakCocok: 'Tidak ada pesanan yang sesuai filter.',
  daftar: 'Daftar pesanan',
} as const;

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

const STATUS_TEXT: Readonly<Record<OrderStatus, string>> = {
  'on-proses': 'On Proses',
  partial: 'Partial',
  selesai: 'Selesai',
};

const STATUS_TONE: Readonly<Record<OrderStatus, string>> = {
  'on-proses': 'is-danger',
  partial: 'is-warning',
  selesai: 'is-lunas',
};

// Daftar PO atau SO (gambar klien 10): kartu judul, Buat PO atau SO Baru, segarkan, filter Tanggal,
// pemasok atau pelanggan, Status, dan pencarian. Nomor pesanan membuka formulirnya.
export function renderOrderList(
  session: BoSession,
  go: (path: string) => void,
  kind: OrderKind,
): ScreenHandle {
  const store = session.store;
  const copy = COPY[kind];
  const path = ORDER_PATH[kind];
  const today = wibDate(session.now());

  const allRows = (): OrderRow[] =>
    kind === 'po'
      ? buildPurchaseOrderRows(store.getState())
      : buildSalesOrderRows(store.getState(), importedSoNumbers);

  const dateSelect = createFilterSelect(
    TEXT.tanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.tanggal}: ${option.text}`,
    })),
  );
  const statuses: readonly OrderStatus[] =
    kind === 'po' ? ['on-proses', 'partial', 'selesai'] : ['on-proses', 'selesai'];
  const statusSelect = createFilterSelect(TEXT.status, [
    { value: 'semua', text: `${TEXT.status}: ${TEXT.semua}` },
    ...statuses.map((status) => ({
      value: status,
      text: `${TEXT.status}: ${STATUS_TEXT[status]}`,
    })),
  ]);
  let partySelect = createFilterSelect(copy.pihak, []);
  const filters = el('div', { className: 'bo-trx-filters__slot' });
  const search = createSearchBox(copy.cariNama, copy.cari);

  const heading = el('h1', { className: 'bo-trx-listhead__heading', text: copy.judul });
  const head = el(
    'tr',
    {},
    el('th', { text: copy.nomor }),
    el('th', { text: TEXT.tanggal }),
    el('th', { text: copy.pihak }),
    el('th', { text: TEXT.keterangan }),
    el('th', { text: TEXT.status }),
    el('th', { className: 'is-end', text: TEXT.total }),
  );
  const body = el('tbody', {});
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.daftar },
    },
    el('table', { className: 'bo-trx-table bo-trx-table--list' }, el('thead', {}, head), body),
  );

  function rebuildPartyFilter(): void {
    const names = [...new Set(allRows().map((row) => row.partyName))].sort((a, b) =>
      a.localeCompare(b),
    );
    const chosen = partySelect.value;
    partySelect = createFilterSelect(copy.pihak, [
      { value: '', text: `${copy.pihak}: ${TEXT.semua}` },
      ...names.map((name) => ({ value: name, text: `${copy.pihak}: ${name}` })),
    ]);
    partySelect.value = names.includes(chosen) ? chosen : '';
    partySelect.addEventListener('change', paint);
    filters.replaceChildren(dateSelect, partySelect, statusSelect);
  }

  function paint(): void {
    const rows = filterOrderRows(allRows(), {
      status: statusSelect.value as 'semua' | OrderStatus,
      text: search.input.value,
      party: partySelect.value,
      ...(() => {
        const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
        return {
          ...(range.startDate === undefined ? {} : { start: range.startDate }),
          ...(range.endDate === undefined ? {} : { end: range.endDate }),
        };
      })(),
    });
    if (rows.length === 0) {
      const none = allRows().length === 0;
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', { text: none ? TEXT.kosong : TEXT.tidakCocok, attrs: { colspan: '6' } }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((row) =>
        el(
          'tr',
          { attrs: { 'data-number': row.number } },
          el(
            'td',
            {},
            el('a', {
              className: 'bo-trx-link',
              text: row.number,
              attrs: { href: `#${path}?no=${encodeURIComponent(row.number)}` },
            }),
          ),
          el('td', { className: 'bo-nowrap', text: row.date }),
          el('td', { className: 'is-bold', text: row.partyName }),
          el('td', { className: 'bo-trx-notes', text: row.notes, attrs: { title: row.notes } }),
          el(
            'td',
            {},
            el('span', {
              className: `bo-trx-status ${STATUS_TONE[row.status]}`,
              text: STATUS_TEXT[row.status],
            }),
          ),
          el('td', { className: 'is-end is-bold', text: formatRupiah(row.total) }),
        ),
      ),
    );
  }

  for (const control of [dateSelect, statusSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);
  rebuildPartyFilter();
  const root = createListPage({
    heading,
    kpis: [],
    createText: copy.buat,
    onCreate: () => {
      go(`${path}?baru=1`);
    },
    refresh: createRefreshButton(TEXT.segarkan, () => {
      rebuildPartyFilter();
      paint();
    }),
    filters: [filters],
    search: search.root,
    table,
  });
  paint();
  return { element: root, destroy: () => undefined };
}
