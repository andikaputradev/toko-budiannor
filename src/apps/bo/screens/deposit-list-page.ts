import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import type { Customer, DepositEntry } from '../../../shared/data/types';
import { formatDate, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import type { BoSession } from '../bo-session';
import { depositHistory, holderCount, todayTotals, totalDeposit } from '../domain/deposit';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import type { ScreenHandle } from './login';
import { openDepositReceipt } from './deposit-print';
import {
  createFilterSelect,
  createKpi,
  createListPage,
  createRefreshButton,
  createSearchBox,
} from './trx/list-page';

export const DEPOSIT_PATH = '/bo/transaksi/deposit-pelanggan';

const TEXT = {
  judul: 'Daftar Deposit Pelanggan',
  buat: 'Buat Setoran Deposit',
  segarkan: 'Segarkan',
  tanggal: 'Tanggal',
  semua: 'Semua',
  jenis: 'Jenis',
  cari: 'Cari No / Pelanggan...',
  cariNama: 'Cari nomor bukti atau pelanggan',
  kolomTanggal: 'Tanggal',
  kolomNomor: 'No. Bukti',
  kolomPelanggan: 'Pelanggan',
  kolomKeterangan: 'Keterangan',
  kolomMasuk: 'Masuk',
  kolomKeluar: 'Keluar',
  kolomSaldo: 'Saldo',
  kosong: 'Belum ada mutasi deposit. Klik Buat Setoran Deposit untuk menyetor.',
  tidakCocok: 'Tidak ada mutasi deposit yang sesuai filter.',
  daftar: 'Daftar mutasi deposit',
  setor: 'Setoran',
  pakai: 'Pemakaian',
  retur: 'Kredit retur',
  saldoAwal: 'Saldo awal',
} as const;

interface DepositLine {
  readonly key: string;
  readonly at: string;
  readonly number: string;
  readonly customer: Customer;
  readonly description: string;
  readonly inflow: number;
  readonly outflow: number;
  readonly balance: number;
  readonly entry: DepositEntry | undefined;
}

const DATE_OPTIONS: readonly { readonly value: DateRangeKind; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

// Daftar Deposit Pelanggan: semua mutasi (setoran, pemakaian, kredit retur) beserta saldo awal tiap
// pelanggan, dengan tombol "Buat Setoran Deposit" yang membuka formulir pada tab yang sama.
export function renderDepositListPage(
  session: BoSession,
  go: (path: string) => void,
): ScreenHandle {
  const store = session.store;
  const today = wibDate(session.now());
  const kpiTotal = createKpi(label('boDepositStatTotal'));
  const kpiHolders = createKpi(label('boDepositStatPemilik'));
  const kpiIn = createKpi(label('boDepositStatMasuk'));
  const kpiOut = createKpi(label('boDepositStatKeluar'));
  const dateSelect = createFilterSelect(
    TEXT.tanggal,
    DATE_OPTIONS.map((option) => ({
      value: option.value,
      text: `${TEXT.tanggal}: ${option.text}`,
    })),
  );
  const kindSelect = createFilterSelect(TEXT.jenis, [
    { value: 'semua', text: `${TEXT.jenis}: ${TEXT.semua}` },
    { value: 'setor', text: `${TEXT.jenis}: ${TEXT.setor}` },
    { value: 'pakai', text: `${TEXT.jenis}: ${TEXT.pakai}` },
    { value: 'retur', text: `${TEXT.jenis}: ${TEXT.retur}` },
  ]);
  const search = createSearchBox(TEXT.cariNama, TEXT.cari);
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
          el('th', { text: TEXT.kolomTanggal }),
          el('th', { text: TEXT.kolomNomor }),
          el('th', { text: TEXT.kolomPelanggan }),
          el('th', { text: TEXT.kolomKeterangan }),
          el('th', { className: 'is-end', text: TEXT.kolomMasuk }),
          el('th', { className: 'is-end', text: TEXT.kolomKeluar }),
          el('th', { className: 'is-end', text: TEXT.kolomSaldo }),
          el('th', {}, el('span', { className: 'visually-hidden', text: 'Aksi' })),
        ),
      ),
      body,
    ),
  );

  const lines = (): DepositLine[] => {
    const state = store.getState();
    const entries = state.depositEntries;
    const result: DepositLine[] = [];
    for (const customer of state.data.customers) {
      for (const row of depositHistory(customer, entries)) {
        result.push({ ...row, key: row.id, customer });
      }
    }
    // Mutasi terbaru lebih dulu; saldo awal (tanpa tanggal) di akhir.
    return result.sort((a, b) => {
      if (a.at === '' || b.at === '') {
        return a.at === b.at
          ? a.customer.name.localeCompare(b.customer.name, 'id')
          : a.at === ''
            ? 1
            : -1;
      }
      return b.at.localeCompare(a.at) || b.number.localeCompare(a.number);
    });
  };

  const paint = (): void => {
    const state = store.getState();
    kpiTotal.set(formatRupiah(totalDeposit(state.data.customers)));
    kpiHolders.set(String(holderCount(state.data.customers)));
    const day = todayTotals(state.depositEntries, today);
    kpiIn.set(formatRupiah(day.inflow));
    kpiOut.set(formatRupiah(day.outflow));
    const all = lines();
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const text = search.input.value.trim().toLowerCase();
    const rows = all.filter((line) => {
      if (kindSelect.value !== 'semua' && line.entry?.kind !== kindSelect.value) {
        return false;
      }
      if (line.entry !== undefined) {
        const date = wibDate(new Date(line.at));
        if (range.startDate !== undefined && date < range.startDate) {
          return false;
        }
        if (range.endDate !== undefined && date > range.endDate) {
          return false;
        }
      } else if (range.startDate !== undefined) {
        return false;
      }
      return (
        text === '' ||
        line.number.toLowerCase().includes(text) ||
        line.customer.name.toLowerCase().includes(text) ||
        line.customer.code.toLowerCase().includes(text)
      );
    });
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? TEXT.kosong : TEXT.tidakCocok,
            attrs: { colspan: '8' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((line) => {
        const entry = line.entry;
        const print =
          entry === undefined
            ? ''
            : createButton({
                text: label('boDepositCetakBukti'),
                variant: 'secondary',
                icon: 'printer',
                onClick: () => {
                  openDepositReceipt(session, entry);
                },
              });
        return el(
          'tr',
          { attrs: { 'data-key': line.key } },
          el('td', {
            className: 'bo-nowrap',
            text: line.at === '' ? '-' : formatDate(new Date(line.at)),
          }),
          el(
            'td',
            {},
            line.number === ''
              ? '-'
              : el('strong', { className: 'bo-trx-link', text: line.number }),
          ),
          el('td', { className: 'is-bold', text: line.customer.name }),
          el('td', { text: line.description }),
          el('td', {
            className: 'is-end',
            text: line.inflow > 0 ? formatRupiah(line.inflow) : '-',
          }),
          el('td', {
            className: 'is-end',
            text: line.outflow > 0 ? formatRupiah(line.outflow) : '-',
          }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(line.balance) }),
          el('td', { className: 'is-action' }, print),
        );
      }),
    );
  };

  for (const control of [dateSelect, kindSelect]) {
    control.addEventListener('change', paint);
  }
  search.input.addEventListener('input', paint);
  const stop = store.subscribe(paint);
  const element = createListPage({
    heading: el('h1', { className: 'bo-trx-listhead__heading', text: TEXT.judul }),
    kpis: [kpiTotal, kpiHolders, kpiIn, kpiOut],
    createText: TEXT.buat,
    onCreate: () => {
      go(`${DEPOSIT_PATH}?baru=1`);
    },
    refresh: createRefreshButton(TEXT.segarkan, paint),
    filters: [dateSelect, kindSelect],
    search: search.root,
    table,
  });
  paint();
  return { element, destroy: stop };
}
