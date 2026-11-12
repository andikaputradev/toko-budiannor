import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import type { Product } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createTabs } from '../../../shared/ui/tabs';
import type { BoSession } from '../bo-session';
import {
  buildProductHistory,
  defaultRange,
  normalizeRange,
  type HistoryRow,
} from '../domain/product-history';
import { ledgerFor } from '../domain/stock-correction';

function historyTable(
  rows: readonly HistoryRow[],
  partyHeading: LabelKey,
  name: string,
): HTMLElement {
  if (rows.length === 0) {
    return el('p', { className: 'bo-info__empty', text: label('infoKosong') });
  }
  return el(
    'div',
    { className: 'bo-info__scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': name } },
    el(
      'table',
      { className: 'bo-info__table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: label('infoKolTanggal') }),
          el('th', { text: label('infoKolNomor') }),
          el('th', { text: label(partyHeading) }),
          el('th', { className: 'is-end', text: label('infoKolJumlah') }),
          el('th', { className: 'is-end', text: label('infoKolNilai') }),
        ),
      ),
      el(
        'tbody',
        {},
        ...rows.map((row) =>
          el(
            'tr',
            {},
            el('td', { text: formatDate(new Date(row.at)) }),
            el('td', { text: row.number }),
            el('td', { text: row.party }),
            el('td', { className: 'is-end', text: `${formatDecimal(row.quantity)} ${row.unit}` }),
            el('td', { className: 'is-end', text: formatRupiah(row.amount) }),
          ),
        ),
      ),
    ),
  );
}

// Info barang: ringkasan stok dan saldo awal, lalu riwayat Pembelian, Penjualan, dan Koreksi yang
// bisa disaring menurut tanggal. Bawaan 30 hari terakhir; Dari dan Sampai membuka riwayat lebih lama.
export function openProductInfo(session: BoSession, product: Product): void {
  const store = session.store;
  const today = wibDate(session.now());
  const dateInput = (name: LabelKey, value: string): HTMLInputElement => {
    const control = el('input', {
      className: 'bo-pd-input bo-info__date',
      attrs: { type: 'date', 'aria-label': label(name) },
    });
    control.value = value;
    return control;
  };
  const initial = defaultRange(today);
  const fromInput = dateInput('infoDari', initial.from);
  const toInput = dateInput('infoSampai', initial.to);

  const pembelian = el('div', { className: 'bo-info__panel' });
  const penjualan = el('div', { className: 'bo-info__panel' });
  const koreksi = el('div', { className: 'bo-info__panel' });

  const paint = (): void => {
    const range = normalizeRange({
      from: fromInput.value === '' ? initial.from : fromInput.value,
      to: toInput.value === '' ? initial.to : toInput.value,
    });
    // Rentang yang terbalik ditukar, dan isian ikut diperbarui agar jelas apa yang ditampilkan.
    fromInput.value = range.from;
    toInput.value = range.to;
    const history = buildProductHistory({
      product,
      state: store.getState(),
      corrections: ledgerFor(store).docs(),
      range,
    });
    pembelian.replaceChildren(
      historyTable(history.pembelian, 'infoKolPemasok', label('infoTabPembelian')),
    );
    penjualan.replaceChildren(
      historyTable(history.penjualan, 'infoKolPelanggan', label('infoTabPenjualan')),
    );
    koreksi.replaceChildren(
      historyTable(history.koreksi, 'infoKolPetugas', label('infoTabKoreksi')),
    );
  };

  const apply = createButton({ text: label('infoTampilkan'), variant: 'primary', onClick: paint });
  const reset = createButton({
    text: label('infoTigaPuluh'),
    variant: 'secondary',
    onClick: () => {
      fromInput.value = initial.from;
      toInput.value = initial.to;
      paint();
    },
  });
  for (const input of [fromInput, toInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        paint();
      }
    });
  }

  const initialStock = product.initialStock;
  const summary = el(
    'div',
    { className: 'bo-info__summary' },
    el('span', {
      text: label('infoStokRingkas', {
        toko: formatDecimal(product.stock.display),
        gudang: formatDecimal(product.stock.besar),
        satuan: product.baseUnit,
      }),
    }),
    el('span', { text: label('infoRak', { rak: product.rak ?? '-' }) }),
    el('span', {
      text:
        initialStock === undefined
          ? label('infoTanpaSaldoAwal')
          : label('infoSaldoAwal', {
              tanggal: initialStock.date ?? '-',
              jumlah: formatDecimal(initialStock.quantity ?? 0),
              satuan: initialStock.unit ?? product.baseUnit,
              nilai: formatRupiah(initialStock.unitPrice ?? product.hpp),
            }),
    }),
  );

  const filter = el(
    'div',
    { className: 'bo-info__filter' },
    el(
      'label',
      { className: 'bo-info__field' },
      el('span', { text: label('infoDari') }),
      fromInput,
    ),
    el(
      'label',
      { className: 'bo-info__field' },
      el('span', { text: label('infoSampai') }),
      toInput,
    ),
    apply,
    reset,
  );

  const tabs = createTabs(label('infoRiwayat'), [
    { text: label('infoTabPembelian'), panel: pembelian },
    { text: label('infoTabPenjualan'), panel: penjualan },
    { text: label('infoTabKoreksi'), panel: koreksi },
  ]);

  paint();
  openModal({
    title: `${product.code} - ${product.name}`,
    body: el('div', { className: 'bo-info' }, summary, filter, tabs),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
