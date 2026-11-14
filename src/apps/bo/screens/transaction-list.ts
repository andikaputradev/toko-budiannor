import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  buildTransactionRows,
  computeTransactionMetrics,
  countToday,
  dateRangeFor,
  filterTransactions,
  partyNames,
  type DateRangeKind,
  type TransactionRow,
  type TransactionStatus,
  type TransactionType,
} from '../domain/transaction-list';
import {
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createSearchBox,
} from './trx/list-page';

const TEXT = {
  segarkan: 'Segarkan',
  buatFaktur: 'Buat Faktur Baru',
  cari: 'Cari No Faktur / Pelanggan / Pemasok...',
  cariNama: 'Cari No Faktur, pelanggan, atau pemasok',
  jumlahHariIni: 'Jumlah Transaksi Hari Ini',
  totalHariIni: 'Total Transaksi Hari Ini',
  tanggal: 'Tanggal',
  pelanggan: 'Pelanggan',
  pemasok: 'Pemasok',
  status: 'Status',
  semua: 'Semua',
  judulJual: 'Daftar Nota Penjualan',
  judulBeli: 'Daftar Nota Pembelian',
  kosong: 'Tidak ada nota transaksi yang sesuai filter.',
  daftar: 'Daftar nota transaksi',
  pembayaran: 'Pembayaran',
  user: 'User',
  keterangan: 'Keterangan',
  noSo: 'No. SO',
  noPo: 'No. PO',
} as const;

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

const STATUS_OPTIONS: readonly {
  readonly value: 'semua' | TransactionStatus;
  readonly text: string;
}[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'lunas', text: 'Lunas' },
  { value: 'belum-lunas', text: 'Belum Lunas' },
  { value: 'jatuh-tempo', text: 'Jatuh Tempo' },
];

function statusBadge(status: TransactionStatus): HTMLElement {
  const tone =
    status === 'lunas' ? 'is-lunas' : status === 'belum-lunas' ? 'is-warning' : 'is-danger';
  const text = STATUS_OPTIONS.find((option) => option.value === status)?.text ?? status;
  return el('span', { className: `bo-trx-status ${tone}`, text });
}

// Daftar Nota Penjualan atau Pembelian (gambar klien 8): kartu judul dengan empat kotak angka,
// Buat Faktur Baru, segarkan, filter Tanggal, pelanggan atau pemasok, Status, dan pencarian.
export function renderTransactionList(
  session: BoSession,
  go: (path: string) => void,
  initialTab: TransactionType = 'penjualan',
): ScreenHandle {
  const dataset = session.store.getState().data;
  const today = dataset.referenceDate.slice(0, 10);
  const allRows = buildTransactionRows(dataset);
  let tab: TransactionType = initialTab;

  const heading = el('h1', { className: 'bo-trx-listhead__heading' });
  const switcher = el('div', { className: 'bo-tab-switcher bo-trx-switch' });
  const switchButton = (type: TransactionType, text: string): HTMLButtonElement => {
    const button = el('button', { className: 'bo-tab-btn', text, attrs: { type: 'button' } });
    button.addEventListener('click', () => {
      tab = type;
      rebuildPartyFilter();
      paint();
    });
    return button;
  };
  const jualButton = switchButton('penjualan', label('tabFakturPenjualan'));
  const beliButton = switchButton('pembelian', label('tabFakturPembelian'));
  switcher.append(jualButton, beliButton);

  const kpiCount = createKpi(TEXT.jumlahHariIni);
  const kpiToday = createKpi(TEXT.totalHariIni);
  const kpiUnpaid = createKpi(label('labelRingkasanBelumLunas'), 'warn');
  const kpiDue = createKpi(label('labelRingkasanJatuhTempo'), 'danger');

  const dateSelect = createFilterSelect(
    TEXT.tanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.tanggal}: ${option.text}`,
    })),
  );
  let partySelect = createFilterSelect(TEXT.pelanggan, []);
  const statusSelect = createFilterSelect(
    TEXT.status,
    STATUS_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.status}: ${option.text}`,
    })),
  );
  const filters = el('div', { className: 'bo-trx-filters__slot' });
  const search = createSearchBox(TEXT.cariNama, TEXT.cari);

  const head = el('tr', {});
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
    const buyer = tab === 'pembelian';
    const name = buyer ? TEXT.pemasok : TEXT.pelanggan;
    partySelect = createFilterSelect(name, [
      { value: '', text: `${name}: ${TEXT.semua}` },
      ...partyNames(allRows, tab).map((party) => ({ value: party, text: `${name}: ${party}` })),
    ]);
    partySelect.addEventListener('change', paint);
    filters.replaceChildren(dateSelect, partySelect, statusSelect);
  }

  function paint(): void {
    const buyer = tab === 'pembelian';
    heading.textContent = buyer ? TEXT.judulBeli : TEXT.judulJual;
    jualButton.classList.toggle('is-active', !buyer);
    beliButton.classList.toggle('is-active', buyer);
    jualButton.setAttribute('aria-pressed', buyer ? 'false' : 'true');
    beliButton.setAttribute('aria-pressed', buyer ? 'true' : 'false');

    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const filtered = filterTransactions(allRows, {
      type: tab,
      status: statusSelect.value as 'semua' | TransactionStatus,
      query: search.input.value,
      party: partySelect.value,
      ...range,
    });
    const metrics = computeTransactionMetrics(filtered);
    const day = countToday(filtered, today);
    kpiCount.set(String(day.count));
    kpiToday.set(formatRupiah(day.total));
    kpiUnpaid.set(formatRupiah(metrics.totalBelumLunas));
    kpiDue.set(formatRupiah(metrics.totalJatuhTempo));

    head.replaceChildren(
      el('th', { text: label('noInvoice') }),
      el('th', { text: buyer ? TEXT.noPo : TEXT.noSo }),
      el('th', { text: label('tanggal') }),
      el('th', { text: buyer ? TEXT.pemasok : TEXT.pelanggan }),
      el('th', { text: TEXT.pembayaran }),
      el('th', { text: label('kolomStatus') }),
      el('th', { className: 'is-center', text: label('labelUmurNota') }),
      el('th', { className: 'is-end', text: label('kolomTotal') }),
      el('th', { text: TEXT.user }),
      el('th', { text: TEXT.keterangan }),
    );
    body.replaceChildren(...rowsOf(filtered, buyer));
  }

  function rowsOf(rows: readonly TransactionRow[], buyer: boolean): HTMLElement[] {
    if (rows.length === 0) {
      return [
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', { text: TEXT.kosong, attrs: { colspan: '10' } }),
        ),
      ];
    }
    return rows.map((row) =>
      el(
        'tr',
        {},
        el(
          'td',
          {},
          el('a', {
            className: 'bo-trx-link',
            text: row.number,
            attrs: {
              href: `#/bo/${buyer ? 'pembelian' : 'penjualan'}?no=${encodeURIComponent(row.number)}`,
            },
          }),
        ),
        el('td', { className: 'bo-trx-link-ref', text: row.refNumber }),
        el('td', { className: 'bo-nowrap', text: row.date }),
        el('td', { className: 'is-bold', text: row.partyName }),
        el('td', { className: 'bo-nowrap', text: row.paymentTerms }),
        el('td', {}, statusBadge(row.status)),
        el('td', { className: 'is-center', text: `${formatDecimal(row.ageDays)} Hari` }),
        el('td', { className: 'is-end is-bold', text: formatRupiah(row.total) }),
        el('td', { text: row.user }),
        el('td', { className: 'bo-trx-notes', text: row.notes, attrs: { title: row.notes } }),
      ),
    );
  }

  for (const control of [dateSelect, statusSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);

  const refresh = createRefreshButton(TEXT.segarkan, paint);
  rebuildPartyFilter();
  const root = createListPage({
    heading,
    under: switcher,
    kpis: [kpiCount, kpiToday, kpiUnpaid, kpiDue],
    createText: TEXT.buatFaktur,
    onCreate: () => {
      go(tab === 'penjualan' ? '/bo/penjualan' : '/bo/pembelian');
    },
    refresh,
    filters: [filters],
    search: search.root,
    table,
  });
  paint();
  return { element: root, destroy: () => undefined };
}
