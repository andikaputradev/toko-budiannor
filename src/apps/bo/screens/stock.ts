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
import { openExportPreview, type ExportKind } from '../export-preview';
import {
  matchesFilter,
  minimumIn,
  stockIn,
  stockStatus,
  type StockStatus,
  type WarehouseFilter,
} from '../domain/stock-view';
import { findProducts } from '../search';
import type { ScreenHandle } from './login';

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
  const count = el('p', { className: 't-label bo-count', attrs: { 'aria-live': 'polite' } });
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
      { header: label('kolomKode'), width: '90px', cell: (product) => product.code },
      { header: label('kolomNamaBarang'), width: '1fr', cell: (product) => product.name },
      {
        header: label('gudangDisplay'),
        width: '90px',
        align: 'end',
        cell: (product) => formatDecimal(product.stock.display, 3, 1),
      },
      {
        header: label('gudangBesar'),
        width: '90px',
        align: 'end',
        cell: (product) => formatDecimal(product.stock.besar, 3, 1),
      },
      {
        header: label('kolomTotal'),
        width: '90px',
        align: 'end',
        cell: (product) => formatDecimal(totalStock(product), 3, 1),
      },
      { header: label('kolomSatuanDasar'), width: '80px', cell: (product) => product.baseUnit },
      {
        header: label('kolomMin'),
        width: '80px',
        align: 'end',
        cell: (product) => formatDecimal(minimumIn(product, warehouse), 3, 1),
      },
      { header: label('kolomStatus'), width: '330px', cell: statusCell },
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

  const exportRows = (): { columns: string[]; rows: string[][] } => {
    const list = filtered();
    if (warehouse === 'semua') {
      return {
        columns: [
          label('kolomKode'),
          label('kolomNamaBarang'),
          label('gudangDisplay'),
          label('gudangBesar'),
          label('kolomTotal'),
          label('kolomSatuanDasar'),
          label('kolomMin'),
          label('kolomStatus'),
        ],
        rows: list.map((product) => [
          product.code,
          product.name,
          formatDecimal(product.stock.display, 3, 1),
          formatDecimal(product.stock.besar, 3, 1),
          formatDecimal(totalStock(product), 3, 1),
          product.baseUnit,
          formatDecimal(product.minStock, 3, 1),
          label(STATUS_VIEW[stockStatus(product, warehouse)].text),
        ]),
      };
    }
    const key: LabelKey = warehouse === 'display' ? 'gudangDisplay' : 'gudangBesar';
    return {
      columns: [
        label('kolomKode'),
        label('kolomNamaBarang'),
        label(key),
        label('kolomSatuanDasar'),
        label('kolomMin'),
        label('kolomStatus'),
      ],
      rows: list.map((product) => [
        product.code,
        product.name,
        formatDecimal(stockIn(product, warehouse), 3, 1),
        product.baseUnit,
        formatDecimal(minimumIn(product, warehouse), 3, 1),
        label(STATUS_VIEW[stockStatus(product, warehouse)].text),
      ]),
    };
  };
  const doExport = (kind: ExportKind): void => {
    const data = exportRows();
    openExportPreview({ kind, title: label('menuStok'), columns: data.columns, rows: data.rows });
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
    { className: 'bo-stock' },
    el('div', { className: 'bo-bar' }, search, chips),
    count,
    grid.element,
    empty,
    el(
      'div',
      { className: 'bo-form__actions' },
      createButton({
        text: label('mutasiStok'),
        variant: 'secondary',
        onClick: () => {
          go('/bo/mutasi');
        },
      }),
      createButton({
        text: label('eksporPdf'),
        variant: 'secondary',
        onClick: () => {
          doExport('pdf');
        },
      }),
      createButton({
        text: label('eksporExcel'),
        variant: 'secondary',
        onClick: () => {
          doExport('excel');
        },
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
