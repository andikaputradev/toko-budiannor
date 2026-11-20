import { el } from '../../../shared/dom';
import { slashIso } from '../short-date';
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
  createRowSelection,
  createSearchBox,
  fixColumns,
  refuseDelete,
} from './trx/list-page';

const TEXT = {
  segarkan: 'Segarkan',
  cari: 'Cari faktur...',
  cariNama: 'Cari No Faktur, pelanggan, atau pemasok',
  jumlahHariIni: 'Jumlah Transaksi Hari Ini',
  totalHariIni: 'Total Transaksi Hari Ini',
  tanggal: 'Tanggal',
  pelanggan: 'Pelanggan',
  pemasok: 'Pemasok',
  status: 'Status',
  semua: 'Semua',
  judulJual: 'Daftar Faktur Penjualan',
  judulBeli: 'Daftar Faktur Pembelian',
  kosong: 'Tidak ada faktur transaksi yang sesuai filter.',
  daftar: 'Daftar faktur transaksi',
  pembayaran: 'Pembayaran',
  user: 'User',
  keterangan: 'Keterangan',
  noSo: 'No. SO',
  noPo: 'No. PO',
  noFaktur: 'No. Faktur',
  totalBelumLunas: 'Total Faktur Belum Lunas',
  totalJatuhTempo: 'Total Faktur Jatuh Tempo',
  ditolak:
    'Faktur yang sudah tersimpan tidak dapat dihapus karena sudah mengubah stok dan saldo. Gunakan Retur Penjualan atau Retur Pembelian.',
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

// Daftar Faktur Penjualan atau Pembelian (gambar klien 8 dan 32): Tambah, Ubah, Hapus, Cetak, Keluar,
// segarkan, filter Tanggal, pelanggan atau pemasok, Status, pencarian, dan empat kotak angka.
export function renderTransactionList(
  session: BoSession,
  go: (path: string) => void,
  initialTab: TransactionType = 'penjualan',
): ScreenHandle {
  const dataset = session.store.getState().data;
  const today = dataset.referenceDate.slice(0, 10);
  const allRows = buildTransactionRows(dataset);
  // Penjualan dan Pembelian masing-masing punya halaman daftar sendiri (CATATAN klien 16 November).
  const tab: TransactionType = initialTab;

  const selection = createRowSelection();

  const kpiCount = createKpi(TEXT.jumlahHariIni);
  const kpiToday = createKpi(TEXT.totalHariIni);
  const kpiUnpaid = createKpi(TEXT.totalBelumLunas, 'warn');
  const kpiDue = createKpi(TEXT.totalJatuhTempo, 'danger');

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
  const grid = el(
    'table',
    { className: 'bo-trx-table bo-trx-table--list' },
    el('thead', {}, head),
    body,
  );
  // Faktur Beli dan Faktur Jual memakai kolom dan lebar yang sama.
  fixColumns(grid, [126, 112, 100, 204, 132, 124, 110, 72, undefined, 124]);
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.daftar },
    },
    grid,
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
      el('th', { text: TEXT.noFaktur }),
      el('th', { text: buyer ? TEXT.noPo : TEXT.noSo }),
      el('th', { text: label('tanggal') }),
      el('th', { text: buyer ? TEXT.pemasok : TEXT.pelanggan }),
      el('th', { text: TEXT.pembayaran }),
      el('th', { text: label('kolomStatus') }),
      el('th', { className: 'is-center', text: label('labelUmurNota') }),
      el('th', { text: TEXT.user }),
      el('th', { text: TEXT.keterangan }),
      el('th', { className: 'is-end', text: label('kolomTotal') }),
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
    return rows.map((row) => {
      const tr = el(
        'tr',
        { attrs: { 'data-number': row.number } },
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
        el('td', { className: 'bo-nowrap', text: slashIso(row.date) }),
        el('td', { className: 'is-bold', text: row.partyName }),
        el('td', { className: 'bo-nowrap', text: row.paymentTerms }),
        el('td', {}, statusBadge(row.status)),
        el('td', { className: 'is-center', text: `${formatDecimal(row.ageDays)} Hari` }),
        el('td', { text: row.user }),
        el('td', { className: 'bo-trx-notes', text: row.notes, attrs: { title: row.notes } }),
        el('td', { className: 'is-end is-bold', text: formatRupiah(row.total) }),
      );
      selection.attach(tr, row.number);
      return tr;
    });
  }

  for (const control of [dateSelect, statusSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);

  const refresh = createRefreshButton(TEXT.segarkan, paint);
  rebuildPartyFilter();
  const formPath = tab === 'penjualan' ? '/bo/penjualan' : '/bo/pembelian';
  const root = createListPage({
    title: tab === 'penjualan' ? TEXT.judulJual : TEXT.judulBeli,
    kpis: [kpiCount, kpiToday, kpiUnpaid, kpiDue],
    selection,
    onCreate: () => {
      go(formPath);
    },
    onEdit: (number) => {
      go(`${formPath}?no=${encodeURIComponent(number)}`);
    },
    onDelete: () => {
      refuseDelete(TEXT.ditolak);
    },
    refresh,
    filters: [filters],
    search: search.root,
    table,
  });
  paint();
  return { element: root, destroy: () => undefined };
}
