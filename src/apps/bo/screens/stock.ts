import '../../../styles/bo-mutasi.css';
import { screenActive } from '../screen-active';
import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { totalStock } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import { createVirtualGrid } from '../../../shared/ui/virtual-grid';
import type { BoSession } from '../bo-session';
import { wibDate } from '../../../shared/data/receivable';
import { formatDate } from '../../../shared/format';
import {
  matchesFilter,
  minimumIn,
  stockStatus,
  type StockStatus,
  type WarehouseFilter,
} from '../domain/stock-view';
import { findProducts } from '../search';
import type { ScreenHandle } from './login';
import { openPrintChooser } from './mutasi/parts';
import { MUT_TEXT } from './mutasi/text';

const STATUS_VIEW: Readonly<Record<StockStatus, { text: LabelKey; icon: IconName; css: string }>> =
  {
    aman: { text: 'statusAman', icon: 'circle-check', css: 'bo-status--ok' },
    minimum: { text: 'statusDiBawahMinimum', icon: 'triangle-alert', css: 'bo-status--warn' },
    negatif: { text: 'ditinjauNegatif', icon: 'circle-x', css: 'bo-status--bad' },
  };

const WAREHOUSES: readonly (readonly [WarehouseFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['display', 'gudangDisplay'],
  ['besar', 'gudangBesar'],
];

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderStock(
  session: BoSession,
  go: (path: string) => void,
  query: URLSearchParams,
): ScreenHandle {
  const store = session.store;
  const initial = query.get('filter');
  let warehouse: WarehouseFilter = 'semua';
  let below = initial === 'minimum';
  let negative = initial === 'negatif';
  let text = '';

  const search = el('input', {
    className: 'input bo-search',
    attrs: { type: 'search', autocomplete: 'off', 'aria-label': label('cari') },
  });
  const chips = el('div', {
    className: 'bo-chips',
    attrs: { role: 'group', 'aria-label': label('filterStok') },
  });
  const count = el('p', { className: 'bo-mut-count bo-count', attrs: { 'aria-live': 'polite' } });
  const empty = el('p', { className: 'bo-empty t-label' });

  const filtered = (): Product[] => {
    const base = findProducts(
      store.getState().data.products,
      text,
      store.getState().data.products.length,
    );
    return base.filter((product) => matchesFilter(product, { warehouse, below, negative }));
  };

  const review = (product: Product): void => {
    const result = session.markReviewed(product.id);
    if (result.ok) {
      showToast({ kind: 'success', text: label('sudahDitinjau') });
      refresh();
    } else {
      showToast({ kind: 'error', text: message(result.messageId) });
    }
  };

  const statusCell = (product: Product): Node => {
    const status = stockStatus(product, warehouse);
    const view = STATUS_VIEW[status];
    const wrap = el(
      'span',
      { className: 'bo-status-cell' },
      el(
        'span',
        { className: `bo-status ${view.css}` },
        icon(view.icon),
        el('span', { text: label(view.text) }),
      ),
    );
    if (
      status === 'negatif' &&
      session.allowed('BO-05', 'Tandai Sudah Ditinjau (pada baris negatif)')
    ) {
      const button = createButton({
        text: label('tandaiSudahDitinjau'),
        variant: 'secondary',
        onClick: () => {
          review(product);
        },
      });
      button.classList.add('bo-status-cell__action');
      const online = store.getState().online;
      button.toggleAttribute('data-inactive', !online);
      button.setAttribute('aria-disabled', online ? 'false' : 'true');
      wrap.append(button);
    }
    return wrap;
  };

  const grid = createVirtualGrid<Product>({
    label: label('tabelStok'),
    rows: filtered(),
    rowKey: (product) => product.id,
    columns: [
      { header: label('kolomKode'), width: '76px', cell: (product) => product.code },
      {
        header: label('kolomNamaBarang'),
        width: 'minmax(260px, 1fr)',
        cell: (product) => product.name,
      },
      { header: MUT_TEXT.satuan, width: '76px', cell: (product) => product.baseUnit },
      {
        header: MUT_TEXT.stokToko,
        width: '94px',
        align: 'end',
        cell: (product) => formatDecimal(product.stock.display, 3, 1),
      },
      {
        header: MUT_TEXT.stokGudang,
        width: '112px',
        align: 'end',
        cell: (product) => formatDecimal(product.stock.besar, 3, 1),
      },
      {
        header: MUT_TEXT.totalStok,
        width: '104px',
        align: 'end',
        cell: (product) => formatDecimal(totalStock(product), 3, 1),
      },
      {
        header: MUT_TEXT.minToko,
        width: '92px',
        align: 'end',
        cell: (product) => formatDecimal(minimumIn(product, 'display'), 3, 1),
      },
      {
        header: MUT_TEXT.minTotal,
        width: '96px',
        align: 'end',
        cell: (product) => formatDecimal(product.minStock, 3, 1),
      },
      { header: label('kolomStatus'), width: '320px', cell: statusCell },
    ],
    onActivate: (product) => {
      if (stockStatus(product, warehouse) === 'negatif') {
        review(product);
      }
    },
  });

  const refresh = (): void => {
    const rows = filtered();
    grid.setRows(rows);
    grid.refresh();
    count.textContent = label('jumlahBarangDaftar', { jumlah: formatDecimal(rows.length) });
    empty.textContent = rows.length === 0 ? label('stokFilterKosong') : '';
  };

  const renderChips = (): void => {
    const make = (name: string, pressed: boolean, onClick: () => void): HTMLButtonElement => {
      const chip = el('button', {
        className: 'chip',
        text: name,
        attrs: { type: 'button', 'aria-pressed': pressed ? 'true' : 'false' },
      });
      chip.addEventListener('click', onClick);
      return chip;
    };
    chips.replaceChildren(
      ...WAREHOUSES.map(([value, key]) =>
        make(label(key), warehouse === value, () => {
          warehouse = value;
          renderChips();
          refresh();
        }),
      ),
      make(label('diBawahMinimum'), below, () => {
        below = !below;
        renderChips();
        refresh();
      }),
      make(label('ditinjauNegatif'), negative, () => {
        negative = !negative;
        renderChips();
        refresh();
      }),
    );
  };

  const print = (): void => {
    openPrintChooser({
      title: MUT_TEXT.cetakDaftarStok,
      dateText: formatDate(session.now()),
      fileName: `daftar-stok-minim-${wibDate(session.now())}`,
      columns: [
        label('kolomKode'),
        label('kolomNamaBarang'),
        MUT_TEXT.satuan,
        MUT_TEXT.stokToko,
        MUT_TEXT.stokGudang,
        MUT_TEXT.totalStok,
        MUT_TEXT.minToko,
        MUT_TEXT.minTotal,
        label('kolomStatus'),
      ],
      rows: filtered().map((product) => [
        product.code,
        product.name,
        product.baseUnit,
        formatDecimal(product.stock.display, 3, 1),
        formatDecimal(product.stock.besar, 3, 1),
        formatDecimal(totalStock(product), 3, 1),
        formatDecimal(minimumIn(product, 'display'), 3, 1),
        formatDecimal(product.minStock, 3, 1),
        label(STATUS_VIEW[stockStatus(product, warehouse)].text),
      ]),
    });
  };

  search.addEventListener('input', () => {
    text = search.value;
    refresh();
  });
  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (document.querySelector('.modal-overlay') !== null || !isPc()) {
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      below = !below;
      renderChips();
      refresh();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(refresh);

  const element = el(
    'div',
    { className: 'bo-stock bo-mut bo-mut--stock' },
    el('div', { className: 'bo-mut-filters' }, search, chips, count),
    grid.element,
    empty,
    el(
      'div',
      { className: 'bo-mut-foot' },
      createButton({
        text: label('mutasiStok'),
        variant: 'secondary',
        onClick: () => {
          go('/bo/mutasi');
        },
      }),
      createButton({
        text: MUT_TEXT.cetak,
        variant: 'secondary',
        icon: 'printer',
        onClick: print,
      }),
    ),
  );
  renderChips();
  refresh();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
