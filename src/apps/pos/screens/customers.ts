import {
  balanceOf,
  outstanding,
  overdueInvoices,
  remainingLimit,
} from '../../../shared/data/receivable';
import type { Customer, Tier } from '../../../shared/data/types';
import { append, el } from '../../../shared/dom';
import { formatDate, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createEmptyState } from '../../../shared/ui/empty';
import { returnAfterCustomerForm } from '../customer-return';
import { initialsOf } from '../domain/catalog-view';
import { groupByInitial } from '../domain/customers';
import { normalizePhone } from '../domain/forms';
import type { PosSession } from '../pos-session';
import { createSplitPane } from '../split';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';

const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
};

// POS-08 Pelanggan: daftar per huruf awal dengan avatar inisial dan kolom cari di kiri, informasi
// pelanggan dan faktur belum lunas di kanan; tombol bulat tambah membuka formulir pelanggan baru.
export function renderCustomers(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'pelanggan');
  let selectedId: string | undefined;
  let query = '';

  const search = el('input', {
    className: 'input pos-search__input pos-cust__search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      placeholder: label('cariPelanggan'),
      'aria-label': label('cariPelanggan'),
    },
  });
  const listBox = el('div', { className: 'pos-cust-list' });
  // Panel detail bergulir dan bisa tanpa kontrol fokus, jadi diberi tabindex agar terjangkau papan ketik.
  const detail = el('section', {
    className: 'pos-cust-detail',
    attrs: { tabindex: '0', 'aria-label': label('informasiPelanggan') },
  });
  const add = el(
    'button',
    { className: 'pos-fab', attrs: { type: 'button', 'aria-label': label('tambahPelanggan') } },
    icon('plus'),
  );
  add.addEventListener('click', () => {
    returnAfterCustomerForm('/pos/pelanggan');
    go('/pos/pelanggan-baru');
  });
  const pane = createSplitPane({
    list: el(
      'section',
      { className: 'pos-cust__main' },
      el('div', { className: 'pos-search' }, icon('search'), search),
      listBox,
      add,
    ),
    detail,
    backLabel: 'kembali',
    className: 'pos-cust',
  });

  const matches = (customer: Customer): boolean => {
    const needle = query.trim().toLowerCase();
    if (needle === '') {
      return true;
    }
    const digits = normalizePhone(needle);
    return (
      customer.name.toLowerCase().includes(needle) ||
      customer.code.toLowerCase().includes(needle) ||
      (digits !== '' && normalizePhone(customer.phone).includes(digits))
    );
  };

  const row = (customer: Customer): HTMLElement => {
    const button = el(
      'button',
      {
        className: 'pos-cust-row',
        attrs: { type: 'button', 'aria-pressed': customer.id === selectedId ? 'true' : 'false' },
      },
      el('span', {
        className: 'pos-cust-row__avatar',
        text: initialsOf(customer.name),
        attrs: { 'aria-hidden': 'true' },
      }),
      el(
        'span',
        { className: 'pos-cust-row__who' },
        el('strong', { text: customer.name }),
        el('span', {
          className: 't-label',
          text: customer.phone === '' ? customer.code : `${customer.code}, ${customer.phone}`,
        }),
      ),
    );
    button.addEventListener('click', () => {
      selectedId = customer.id;
      render();
      pane.showDetail();
    });
    return el('li', {}, button);
  };

  const detailRow = (key: string, text: string, value: string): HTMLElement =>
    el(
      'p',
      { className: 'pos-cust-detail__row', attrs: { 'data-row': key } },
      el('span', { className: 't-label', text }),
      el('strong', { text: value }),
    );

  const renderDetail = (customer: Customer | undefined): void => {
    if (customer === undefined) {
      detail.replaceChildren(createEmptyState({ icon: 'inbox', title: label('tidakAdaData') }));
      return;
    }
    const overdue = new Set(overdueInvoices(customer, session.now()).map((item) => item.id));
    const open = customer.invoices
      .filter((item) => balanceOf(item) > 0)
      .sort((first, second) => first.dueAt.localeCompare(second.dueAt));
    detail.replaceChildren();
    append(detail, [
      el('h2', { className: 't-section-title', text: label('informasiPelanggan') }),
      detailRow('nama', label('namaPelanggan'), customer.name),
      detailRow('telepon', label('telepon'), customer.phone === '' ? '-' : customer.phone),
      detailRow('alamat', label('alamat'), customer.address ?? '-'),
      detailRow('kategori', label('kategoriHarga'), label(TIER_LABELS[customer.tier])),
      detailRow('limit', label('limitPiutang'), formatRupiah(customer.limit)),
      detailRow('sisa-limit', label('sisaLimit'), formatRupiah(remainingLimit(customer))),
      detailRow('total-piutang', label('totalPiutang'), formatRupiah(outstanding(customer))),
      detailRow(
        'tempo',
        label('tempoLabel'),
        customer.dueDays === undefined ? '-' : label('tempoHari', { hari: customer.dueDays }),
      ),
      el('h3', { className: 't-section-title', text: label('fakturBelumLunas') }),
      open.length === 0
        ? el('p', { className: 't-label', text: label('tidakAdaFakturBelumLunas') })
        : el(
            'ul',
            { className: 'pos-cust-invoices' },
            ...open.map((item) =>
              el(
                'li',
                { className: 'pos-cust-invoice' },
                el(
                  'span',
                  { className: 'pos-cust-invoice__who' },
                  el('strong', { text: item.id }),
                  el('span', {
                    className: 't-label',
                    text: label('jatuhTempoTgl', { tanggal: formatDate(new Date(item.dueAt)) }),
                  }),
                  overdue.has(item.id)
                    ? el('span', {
                        className: 'pos-cust-invoice__late pos-status--pending',
                        text: label('terlambat'),
                      })
                    : false,
                ),
                el('output', {
                  className: 'pos-cust-invoice__amount',
                  text: formatRupiah(balanceOf(item)),
                }),
              ),
            ),
          ),
    ]);
  };

  function render(): void {
    const all = groupByInitial(session.store.getState().data.customers);
    const shown = groupByInitial(session.store.getState().data.customers.filter(matches));
    const everyone = all.flatMap((group) => group.items);
    const selected = everyone.find((item) => item.id === selectedId) ?? everyone[0];
    selectedId = selected?.id;
    listBox.replaceChildren();
    append(
      listBox,
      shown.length === 0
        ? [createEmptyState({ icon: 'search', title: label('tidakAdaData') })]
        : shown.map((group) =>
            el(
              'section',
              { className: 'pos-cust-group' },
              el('h2', { className: 'pos-cust-group__letter', text: group.letter }),
              el('ul', { className: 'pos-cust-group__items' }, ...group.items.map(row)),
            ),
          ),
    );
    renderDetail(selected);
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') === null && event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    }
  };
  document.addEventListener('keydown', onKey);
  const stops = [session.subscribe(render), session.store.subscribe(render)];

  const element = el('div', { className: 'pos' }, topbar.element, pane.element);
  render();
  return {
    element,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
