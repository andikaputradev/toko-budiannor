import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { wibDate } from '../../../shared/data/receivable';
import type { PaymentMethod } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  buildInvoices,
  filterInvoices,
  grossProfit,
  PAGE_SIZE,
  pageCount,
  type InvoiceFilter,
  type InvoiceRow,
  type InvoiceStatus,
} from '../domain/invoices';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';

const STATUS_LABELS: Readonly<Record<InvoiceStatus, LabelKey>> = {
  lunas: 'statusLunas',
  pending: 'statusPending',
  draf: 'statusDraf',
};

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

export function renderSales(session: BoSession): ScreenHandle {
  const store = session.store;
  const today = wibDate(session.now());
  let filter: InvoiceFilter = {
    start: `${today.slice(0, 8)}01`,
    end: today,
    status: 'semua',
    text: '',
  };
  let page = 0;
  let selected: string | undefined;

  const startId = nextId('bo-inv-start');
  const endId = nextId('bo-inv-end');
  const searchId = nextId('bo-inv-cari');
  const start = el('input', {
    className: 'input',
    attrs: { id: startId, type: 'date' },
  });
  const end = el('input', { className: 'input', attrs: { id: endId, type: 'date' } });
  const search = el('input', {
    className: 'input',
    attrs: { id: searchId, type: 'search', autocomplete: 'off' },
  });
  start.value = filter.start;
  end.value = filter.end;
  const status = createSelectField({
    labelText: label('kolomStatus'),
    options: [
      { value: 'semua', text: label('semua') },
      { value: 'lunas', text: label('statusLunas') },
      { value: 'pending', text: label('statusPending') },
      { value: 'draf', text: label('statusDraf') },
    ],
  });
  const error = el('p', { className: 'bo-error', attrs: { role: 'alert' } });
  const tableBox = el('section', { className: 'bo-panel bo-sales__table' });
  const detailBox = el('section', { className: 'bo-panel bo-sales__detail' });

  const field = (id: string, text: string, input: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text, attrs: { for: id } }),
      input,
    );

  const customerOf = (row: InvoiceRow): string => row.customerName ?? label('pelangganUmum');
  const visible = (): InvoiceRow[] =>
    filterInvoices(
      buildInvoices(store.getState().data, store.getState().salesOrders),
      filter,
      label('pelangganUmum'),
    );

  const copyLines = (row: InvoiceRow): string[] => {
    const at = new Date(row.at);
    return [
      label('salinanInvoice'),
      label('tokoNama'),
      `${label('noInvoice')}: ${row.number}`,
      `${label('tanggal')}: ${formatDate(at)}, ${formatTime(at)}`,
      `${label('pelanggan')}: ${customerOf(row)}`,
      '-'.repeat(32),
      ...row.lines.map((line) => {
        const name =
          store.getState().data.products.find((item) => item.id === line.productId)?.name ??
          line.productId;
        return `${name}\n  ${formatDecimal(line.quantity)} ${line.unit} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(Math.round(line.quantity * line.unitPrice))}`;
      }),
      '-'.repeat(32),
      `${label('totalSo')}: ${formatRupiah(row.total)}`,
    ];
  };

  const printCopy = (row: InvoiceRow): void => {
    const result = session.printInvoiceCopy(row.number);
    if (!result.ok) {
      showToast({ kind: 'error', text: message(result.messageId, result.values) });
      return;
    }
    openModal({
      title: label('cetakUlangInvoice'),
      body: el('pre', { className: 'bo-copy', text: copyLines(row).join('\n') }),
      actions: [{ text: label('tutup'), variant: 'secondary' }],
    });
  };

  const paintDetail = (row: InvoiceRow | undefined): void => {
    if (row === undefined) {
      detailBox.replaceChildren(
        el('h2', { text: label('detailInvoice') }),
        el('p', { className: 't-label', text: label('pilihInvoice') }),
      );
      return;
    }
    const profit = grossProfit(row, store.getState().data.products);
    const source = row.source === 'pos' ? 'sumberPos' : 'sumberSales';
    const print = createButton({
      text: label('cetakUlangInvoice'),
      variant: 'secondary',
      icon: 'printer',
      onClick: () => {
        printCopy(row);
      },
    });
    const later = (text: string, icon: 'arrow-left-right' | 'pencil'): HTMLButtonElement => {
      const button = createButton({ text, variant: 'secondary', icon });
      button.setAttribute('aria-disabled', 'true');
      button.toggleAttribute('data-inactive', true);
      button.title = label('tahapBerikutnya');
      return button;
    };
    detailBox.replaceChildren(
      el('h2', { text: `${label('detailInvoice')}: ${row.number}` }),
      el(
        'dl',
        { className: 'bo-sales__facts' },
        el('dt', { text: label(row.source === 'pos' ? 'peranKasir' : 'peranSales') }),
        el('dd', { text: row.staff }),
        el('dt', { text: label('caraBayar') }),
        el('dd', { text: label(METHOD_LABELS[row.payment]) }),
        el('dt', { text: label('gudang') }),
        el('dd', { text: label('namaGudangDisplay') }),
        el('dt', { text: label('kolomStatus') }),
        el('dd', { text: label(STATUS_LABELS[row.status]) }),
        el('dt', { text: label('sumberInvoice') }),
        el('dd', { text: label(source) }),
      ),
      el(
        'table',
        { className: 'pos-table pos-table--dense' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomBarang') }),
            el('th', { className: 'is-end', text: label('jumlah') }),
            el('th', { className: 'is-end', text: label('subtotalBaris') }),
          ),
        ),
        el(
          'tbody',
          {},
          ...row.lines.map((line) =>
            el(
              'tr',
              {},
              el('td', {
                text:
                  store.getState().data.products.find((item) => item.id === line.productId)?.name ??
                  line.productId,
              }),
              el('td', {
                className: 'is-end',
                text: `${formatDecimal(line.quantity)} ${line.unit}`,
              }),
              el('td', {
                className: 'is-end',
                text: formatRupiah(Math.round(line.quantity * line.unitPrice)),
              }),
            ),
          ),
        ),
      ),
      el('p', { className: 't-value', text: `${label('totalSo')}: ${formatRupiah(row.total)}` }),
      el('p', {
        className: 't-label',
        text: `${label('labaKotorTransaksi')}: ${formatRupiah(profit)}`,
      }),
      el(
        'div',
        { className: 'bo-sales__actions' },
        print,
        later(label('buatSuratJalan'), 'arrow-left-right'),
        later(label('koreksiTransaksi'), 'pencil'),
      ),
      el('p', { className: 't-label', text: label('tahapBerikutnya') }),
    );
  };

  const paint = (): void => {
    const rows = visible();
    const pages = pageCount(rows.length);
    page = Math.min(page, pages - 1);
    const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (selected === undefined || !rows.some((row) => row.number === selected)) {
      selected = rows[0]?.number;
    }
    const chosen = rows.find((row) => row.number === selected);
    tableBox.replaceChildren(
      rows.length === 0
        ? el('p', { className: 't-label', text: label('tidakAdaInvoice') })
        : el(
            'table',
            { className: 'pos-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { text: label('noInvoice') }),
                el('th', { text: label('tanggal') }),
                el('th', { text: label('pelanggan') }),
                el('th', { className: 'is-end', text: label('kolomTotal') }),
                el('th', { text: label('kolomStatus') }),
              ),
            ),
            el(
              'tbody',
              {},
              ...shown.map((row) => {
                const open = el('button', {
                  className: 'bo-sales__open',
                  text: row.number,
                  attrs: { type: 'button' },
                });
                open.addEventListener('click', () => {
                  selected = row.number;
                  paint();
                });
                return el(
                  'tr',
                  {
                    className: row.number === selected ? 'is-selected' : '',
                    attrs: { 'aria-selected': row.number === selected ? 'true' : 'false' },
                  },
                  el('td', {}, open),
                  el('td', { text: formatDate(new Date(row.at)) }),
                  el('td', { text: customerOf(row) }),
                  el('td', { className: 'is-end', text: formatRupiah(row.total) }),
                  el('td', { text: label(STATUS_LABELS[row.status]) }),
                );
              }),
            ),
          ),
      el(
        'div',
        { className: 'bo-sales__pager' },
        createButton({
          text: label('halamanSebelumnya'),
          variant: 'secondary',
          disabled: page === 0,
          onClick: () => {
            page -= 1;
            paint();
          },
        }),
        el('span', {
          className: 't-label',
          text: label('halamanDari', { halaman: page + 1, total: pages }),
        }),
        createButton({
          text: label('halamanBerikutnya'),
          variant: 'secondary',
          disabled: page >= pages - 1,
          onClick: () => {
            page += 1;
            paint();
          },
        }),
      ),
    );
    paintDetail(chosen);
  };

  const apply = (): void => {
    const next: InvoiceFilter = {
      start: start.value,
      end: end.value,
      status: status.select.value as InvoiceFilter['status'],
      text: search.value,
    };
    if (next.end < next.start) {
      error.textContent = message('MSG-039');
      return;
    }
    error.textContent = '';
    filter = next;
    page = 0;
    paint();
  };
  for (const input of [start, end, search]) {
    input.addEventListener('input', apply);
  }
  status.select.addEventListener('change', apply);

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'p') {
      const row = visible().find((item) => item.number === selected);
      if (row !== undefined) {
        event.preventDefault();
        printCopy(row);
      }
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(paint);

  const element = el(
    'div',
    { className: 'bo-sales' },
    el(
      'div',
      { className: 'bo-sales__filter' },
      field(startId, label('dariTanggal'), start),
      field(endId, label('sampaiTanggal'), end),
      status.root,
      field(searchId, label('cariInvoice'), search),
    ),
    error,
    el('div', { className: 'bo-sales__body' }, tableBox, detailBox),
  );
  paint();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
