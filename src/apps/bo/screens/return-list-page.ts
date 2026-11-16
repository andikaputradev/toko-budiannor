import { el } from '../../../shared/dom';
import { matchesPhrase } from '../../../shared/data/search-index';
import { wibDate } from '../../../shared/data/receivable';
import type { ReturnNote } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import { noteItemCount, notesOfKind, settlementLabelKey, type ReturnKind } from '../domain/returns';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import type { ScreenHandle } from './login';
import { confirmRefund } from './return-actions';
import { openReturnNote } from './return-print';
import {
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createRowSelection,
  createSearchBox,
  refuseDelete,
} from './trx/list-page';

const TEXT = {
  segarkan: 'Segarkan',
  jumlah: 'Jumlah Retur',
  nilai: 'Total Nilai Retur',
  menunggu: 'Menunggu Dana',
  tanggal: 'Tanggal',
  status: 'Status',
  semua: 'Semua',
  cariPenjualan: 'Cari retur...',
  cariPembelian: 'Cari retur...',
  cariNama: 'Cari nomor retur, faktur, atau nama',
  kolomNomor: 'No. Retur',
  kolomTanggal: 'Tanggal',
  kolomFaktur: 'Faktur Asal',
  kolomBarang: 'Barang',
  kolomPenyelesaian: 'Penyelesaian',
  kolomNilai: 'Nilai Retur',
  kolomStatus: 'Status',
  kolomAlasan: 'Alasan',
  kosong: 'Belum ada retur. Klik Tambah untuk mencatat retur pertama.',
  ditolak: 'Retur yang sudah tersimpan tidak dapat dihapus karena sudah mengubah stok dan saldo.',
  tidakCocok: 'Tidak ada retur yang sesuai filter.',
  daftar: 'Daftar retur',
  barang: '{jumlah} barang',
  selesai: 'Selesai',
  menungguStatus: 'Menunggu Dana',
} as const;

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

export const RETURN_PATH: Readonly<Record<ReturnKind, string>> = {
  penjualan: '/bo/transaksi/retur-penjualan',
  pembelian: '/bo/transaksi/retur-pembelian',
};

// Daftar Retur Penjualan atau Pembelian: halaman sendiri dengan tombol "Buat Retur Baru"; nomor retur
// membuka pratinjau fakturnya, dan retur yang menunggu dana dapat ditandai sudah diterima.
export function renderReturnListPage(
  session: BoSession,
  go: (path: string) => void,
  kind: ReturnKind,
): ScreenHandle {
  const store = session.store;
  const sale = kind === 'penjualan';
  const today = wibDate(session.now());
  const kpiCount = createKpi(TEXT.jumlah);
  const kpiValue = createKpi(TEXT.nilai);
  const kpiWaiting = createKpi(TEXT.menunggu, 'warn');
  const dateSelect = createFilterSelect(
    TEXT.tanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.tanggal}: ${option.text}`,
    })),
  );
  const statusSelect = createFilterSelect(TEXT.status, [
    { value: 'semua', text: `${TEXT.status}: ${TEXT.semua}` },
    { value: 'menunggu', text: `${TEXT.status}: ${TEXT.menungguStatus}` },
    { value: 'selesai', text: `${TEXT.status}: ${TEXT.selesai}` },
  ]);
  const search = createSearchBox(TEXT.cariNama, sale ? TEXT.cariPenjualan : TEXT.cariPembelian);
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
          el('th', { text: sale ? 'Pelanggan' : 'Pemasok' }),
          el('th', { className: 'is-end', text: TEXT.kolomBarang }),
          el('th', { text: TEXT.kolomPenyelesaian }),
          el('th', { className: 'is-end', text: TEXT.kolomNilai }),
          el('th', { text: TEXT.kolomStatus }),
          el('th', { text: TEXT.kolomAlasan }),
          el('th', {}, el('span', { className: 'visually-hidden', text: 'Aksi' })),
        ),
      ),
      body,
    ),
  );

  const matches = (note: ReturnNote): boolean => {
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const date = wibDate(new Date(note.at));
    if (range.startDate !== undefined && date < range.startDate) {
      return false;
    }
    if (range.endDate !== undefined && date > range.endDate) {
      return false;
    }
    if (statusSelect.value !== 'semua' && note.status !== statusSelect.value) {
      return false;
    }
    return matchesPhrase(
      `${note.number} ${note.sourceNumber} ${note.partyName}`,
      search.input.value,
    );
  };

  const paint = (): void => {
    const all = notesOfKind(store.getState().returnNotes, kind);
    const rows = all.filter(matches);
    kpiCount.set(String(rows.length));
    kpiValue.set(formatRupiah(rows.reduce((sum, note) => sum + note.total, 0)));
    kpiWaiting.set(String(rows.filter((note) => note.status === 'menunggu').length));
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? TEXT.kosong : TEXT.tidakCocok,
            attrs: { colspan: '10' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((note) => {
        const open = el('button', {
          className: 'bo-trx-link bo-link-button',
          text: note.number,
          attrs: { type: 'button', 'aria-label': `${label('boReturCetakNota')} ${note.number}` },
        });
        open.addEventListener('click', () => {
          openReturnNote(session, note);
        });
        const confirm =
          note.status === 'menunggu'
            ? createButton({
                text: label('boReturTandaiDana'),
                variant: 'secondary',
                icon: 'check',
                onClick: () => {
                  const result = confirmRefund(session, note.id);
                  if (result.ok) {
                    showToast({
                      kind: 'success',
                      text: label('boReturDanaDiterima', { nomor: note.number }),
                    });
                    paint();
                  } else {
                    showToast({ kind: 'error', text: result.text });
                  }
                },
              })
            : '';
        const tr = el(
          'tr',
          { attrs: { 'data-number': note.number } },
          el('td', {}, open),
          el('td', { className: 'bo-nowrap', text: wibDate(new Date(note.at)) }),
          el('td', { className: 'bo-trx-link-ref', text: note.sourceNumber }),
          el('td', { className: 'is-bold', text: note.partyName }),
          el('td', {
            className: 'is-end',
            text: TEXT.barang.replace('{jumlah}', String(noteItemCount(note))),
          }),
          el('td', { text: label(settlementLabelKey(note.kind, note.settlement)) }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(note.total) }),
          el(
            'td',
            {},
            el('span', {
              className: `bo-trx-status ${note.status === 'menunggu' ? 'is-warning' : 'is-lunas'}`,
              text: note.status === 'menunggu' ? TEXT.menungguStatus : TEXT.selesai,
            }),
          ),
          el('td', { className: 'bo-trx-notes', text: note.reason, attrs: { title: note.reason } }),
          el('td', { className: 'is-action' }, confirm),
        );
        selection.attach(tr, note.number);
        return tr;
      }),
    );
  };

  const noteOf = (number: string): ReturnNote | undefined =>
    notesOfKind(store.getState().returnNotes, kind).find((note) => note.number === number);

  for (const control of [dateSelect, statusSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);
  const stop = session.store.subscribe(paint);
  const element = createListPage({
    title: label(sale ? 'boReturDaftarPenjualan' : 'boReturDaftarPembelian'),
    kpis: [kpiCount, kpiValue, kpiWaiting],
    selection,
    onCreate: () => {
      go(`${RETURN_PATH[kind]}?baru=1`);
    },
    onEdit: (number) => {
      const note = noteOf(number);
      if (note !== undefined) {
        openReturnNote(session, note);
      }
    },
    onDelete: () => {
      refuseDelete(TEXT.ditolak);
    },
    refresh: createRefreshButton(TEXT.segarkan, paint),
    filters: [dateSelect, statusSelect],
    search: search.root,
    table,
  });
  paint();
  return { element, destroy: stop };
}
