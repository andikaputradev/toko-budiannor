import { el } from '../../../shared/dom';
import { matchesPhrase } from '../../../shared/data/search-index';
import { wibDate } from '../../../shared/data/receivable';
import { formatDecimal } from '../../../shared/format';
import type { BoSession } from '../bo-session';
import { savedExpeditionNotes } from '../domain/expedition';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import type { ScreenHandle } from './login';
import { showToast } from '../../../shared/ui/toast';
import {
  confirmDelete,
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createRowSelection,
  createSearchBox,
  logDeleted,
} from './trx/list-page';

export const EXPEDITION_PATH = '/bo/transaksi/surat-jalan';

const TEXT = {
  judul: 'Daftar Surat Jalan Ekspedisi',
  segarkan: 'Segarkan',
  jumlah: 'Jumlah Surat Jalan',
  tanggal: 'Tanggal',
  cari: 'Cari surat jalan...',
  cariNama: 'Cari nomor surat jalan, faktur, atau penerima',
  kolomNomor: 'No. Surat Jalan',
  kolomTanggal: 'Tanggal',
  kolomFaktur: 'No. Faktur',
  kolomEkspedisi: 'Ekspedisi',
  kolomSopir: 'No. Polisi / Driver',
  kolomPenerima: 'Penerima & Alamat Kirim',
  kolomKoli: 'Koli',
  kosong: 'Belum ada surat jalan. Klik Tambah atau isi dari Faktur Penjualan.',
  terhapus: '{nomor} dihapus.',
  tidakCocok: 'Tidak ada surat jalan yang sesuai filter.',
  daftar: 'Daftar surat jalan',
} as const;

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

// Daftar Surat Jalan Ekspedisi: dokumen yang sudah disimpan pada sesi ini, dengan tombol Tambah;
// nomor membuka dokumennya pada tab yang sama (CATATAN klien 16 November: semua menu input berupa daftar).
export function renderExpeditionListPage(
  session: BoSession,
  go: (path: string) => void,
): ScreenHandle {
  const today = wibDate(session.now());
  const kpi = createKpi(TEXT.jumlah);
  const dateSelect = createFilterSelect(
    TEXT.tanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.tanggal}: ${option.text}`,
    })),
  );
  const search = createSearchBox(TEXT.cariNama, TEXT.cari);
  const selection = createRowSelection();
  const body = el('tbody', {});
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.daftar },
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
          el('th', { text: TEXT.kolomNomor }),
          el('th', { text: TEXT.kolomTanggal }),
          el('th', { text: TEXT.kolomFaktur }),
          el('th', { text: TEXT.kolomEkspedisi }),
          el('th', { text: TEXT.kolomSopir }),
          el('th', { text: TEXT.kolomPenerima }),
          el('th', { className: 'is-end', text: TEXT.kolomKoli }),
        ),
      ),
      body,
    ),
  );

  const paint = (): void => {
    const all = [...savedExpeditionNotes.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.noteNumber.localeCompare(a.noteNumber),
    );
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const rows = all.filter(
      (note) =>
        (range.startDate === undefined || note.date >= range.startDate) &&
        (range.endDate === undefined || note.date <= range.endDate) &&
        matchesPhrase(
          `${note.noteNumber} ${note.invoiceNumber} ${note.recipient} ${note.expeditionName}`,
          search.input.value,
        ),
    );
    kpi.set(String(rows.length));
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? TEXT.kosong : TEXT.tidakCocok,
            attrs: { colspan: '7' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((note) => {
        const tr = el(
          'tr',
          { attrs: { 'data-number': note.noteNumber } },
          el(
            'td',
            {},
            el('a', {
              className: 'bo-trx-link',
              text: note.noteNumber,
              attrs: { href: `#${EXPEDITION_PATH}?no=${encodeURIComponent(note.noteNumber)}` },
            }),
          ),
          el('td', { className: 'bo-nowrap', text: note.date }),
          el('td', { className: 'bo-trx-link-ref', text: note.invoiceNumber }),
          el('td', { text: note.expeditionName }),
          el('td', { text: note.vehicle }),
          el('td', {
            className: 'bo-trx-notes',
            text: note.recipient,
            attrs: { title: note.recipient },
          }),
          el('td', { className: 'is-end is-bold', text: formatDecimal(note.lines.length) }),
        );
        selection.attach(tr, note.noteNumber);
        return tr;
      }),
    );
  };

  const remove = (number: string): void => {
    confirmDelete(number, () => {
      savedExpeditionNotes.delete(number);
      logDeleted(session, `Surat Jalan ${number} dihapus`);
      showToast({ kind: 'success', text: TEXT.terhapus.replace('{nomor}', number) });
      selection.clear();
      paint();
    });
  };

  dateSelect.addEventListener('change', paint);
  search.input.addEventListener('input', paint);
  const element = createListPage({
    title: TEXT.judul,
    kpis: [kpi],
    selection,
    onCreate: () => {
      go(`${EXPEDITION_PATH}?baru=1`);
    },
    onEdit: (number) => {
      go(`${EXPEDITION_PATH}?no=${encodeURIComponent(number)}`);
    },
    onDelete: remove,
    refresh: createRefreshButton(TEXT.segarkan, paint),
    filters: [dateSelect],
    search: search.root,
    table,
  });
  paint();
  return { element, destroy: () => undefined };
}
