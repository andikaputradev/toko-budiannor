import '../../../styles/bo-stok.css';
import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { icon, SVG_NAMESPACE, type IconName } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import { wibDate } from '../../../shared/data/receivable';
import type { Product } from '../../../shared/data/types';
import { breakdownStock, totalStock } from '../../../shared/data/units';
import type { StockStatus, WarehouseFilter } from '../../../shared/domain/stock';
import { createBadge, type BadgeKind } from '../../../shared/ui/badge';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import { openExportPreview, type ExportKind } from '../export-preview';
import {
  addDays,
  ALL_CATEGORIES,
  buildStockCard,
  buildStockRows,
  categoriesOf,
  clampPage,
  monthStart,
  movementsFor,
  pageCount,
  pageSlice,
  PAGE_SIZE,
  productsWithMovement,
  RANGE_MESSAGES,
  summarize,
  validateRange,
  valueByCategory,
  type CardRow,
  type MovementKind,
  type MovementSources,
  type StockCard,
  type StockReportRow,
} from '../domain/stock-report';
import { movementSourcesFor } from '../movement-sources';
import { createProductPicker } from '../picker';
import { findProducts } from '../search';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';

type Tab = 'posisi' | 'kartu';

const TAB_LABELS: Readonly<Record<Tab, LabelKey>> = {
  posisi: 'lpsTabPosisi',
  kartu: 'lpsTabKartu',
};

const TAB_ICONS: Readonly<Record<Tab, IconName>> = {
  posisi: 'boxes',
  kartu: 'history',
};

const STATUS_BADGE: Readonly<Record<StockStatus, BadgeKind>> = {
  aman: 'aman',
  minimum: 'di-bawah-minimum',
  negatif: 'ditinjau',
};

const KIND_LABELS: Readonly<Record<MovementKind, LabelKey>> = {
  penjualan: 'lpsJenisPenjualan',
  pembelian: 'lpsJenisPembelian',
  mutasi: 'lpsJenisMutasi',
  opname: 'lpsJenisOpname',
  koreksi: 'lpsJenisKoreksi',
  'retur-penjualan': 'lpsJenisReturJual',
  'retur-pembelian': 'lpsJenisReturBeli',
};

const CATEGORY_BARS = 6;
const SAMPLE_PRODUCTS = 8;

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function warehouseName(warehouse: 'display' | 'besar' | undefined): string {
  if (warehouse === undefined) {
    return '-';
  }
  return label(warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay');
}

function qty(value: number): string {
  return formatDecimal(value, 3, 1);
}

function labelled(text: string, control: HTMLElement, id: string): HTMLDivElement {
  return el(
    'div',
    { className: 'field' },
    el('label', { className: 'field__label', text, attrs: { for: id } }),
    control,
  );
}

function stat(text: string, value: string, caption: string, tone = ''): HTMLElement {
  return el(
    'div',
    { className: `bo-lapstok-stat ${tone}`.trim() },
    el('span', { className: 'bo-lapstok-stat__label', text }),
    el('span', { className: 'bo-lapstok-stat__value', text: value }),
    el('span', { className: 'bo-lapstok-stat__caption', text: caption }),
  );
}

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

interface Shown {
  readonly product: Product;
  readonly card: StockCard;
  readonly start: string;
  readonly end: string;
  readonly warehouse: WarehouseFilter;
}

const CHART = { width: 440, height: 200, left: 56, right: 14, top: 14, bottom: 34 };

// Grafik tangga saldo stok: saldo bertahan sampai ada pergerakan berikutnya.
function createBalanceChart(shown: Shown): SVGSVGElement {
  const { card } = shown;
  const startMs = Date.parse(`${shown.start}T00:00:00+07:00`);
  const endMs = Date.parse(`${shown.end}T23:59:59+07:00`);
  const span = Math.max(1, endMs - startMs);
  const points = [
    { t: startMs, v: card.opening, title: undefined as string | undefined },
    ...card.rows.map((row) => ({
      t: Math.min(Math.max(Date.parse(row.at), startMs), endMs),
      v: row.balance,
      title: `${formatDate(new Date(row.at))} ${row.document}: ${qty(row.balance)} ${shown.product.baseUnit}`,
    })),
    { t: endMs, v: card.closing, title: undefined },
  ];
  const values = points.map((point) => point.v);
  const low = Math.min(0, ...values);
  const high = Math.max(low + 1, ...values);
  const innerWidth = CHART.width - CHART.left - CHART.right;
  const innerHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (t: number): number => CHART.left + ((t - startMs) / span) * innerWidth;
  const y = (v: number): number =>
    CHART.top + innerHeight - ((v - low) / (high - low)) * innerHeight;

  const chart = svg('svg', {
    viewBox: `0 0 ${String(CHART.width)} ${String(CHART.height)}`,
    class: 'bo-lapstok-chart__svg',
    role: 'img',
    'aria-label': label('lpsGrafikSaldo'),
  });
  for (const value of [low, (low + high) / 2, high]) {
    chart.append(
      svg('line', {
        x1: String(CHART.left),
        x2: String(CHART.width - CHART.right),
        y1: String(y(value)),
        y2: String(y(value)),
        class: 'bo-lapstok-chart__grid',
      }),
    );
    const tick = svg('text', {
      x: String(CHART.left - 8),
      y: String(y(value) + 4),
      class: 'bo-lapstok-chart__tick',
      'text-anchor': 'end',
    });
    tick.textContent = formatDecimal(value, 1, 0);
    chart.append(tick);
  }
  const first = points[0];
  if (first !== undefined) {
    let path = `M ${String(x(first.t))} ${String(y(first.v))}`;
    for (const point of points.slice(1)) {
      path += ` H ${String(x(point.t))} V ${String(y(point.v))}`;
    }
    const baseline = y(low);
    const last = points[points.length - 1] ?? first;
    chart.append(
      svg('path', {
        d: `${path} V ${String(baseline)} H ${String(x(first.t))} Z`,
        class: 'bo-lapstok-chart__area',
      }),
      svg('path', { d: path, class: 'bo-lapstok-chart__line' }),
    );
    for (const point of points) {
      if (point.title === undefined) {
        continue;
      }
      const dot = svg('circle', {
        cx: String(x(point.t)),
        cy: String(y(point.v)),
        r: '4',
        class: 'bo-lapstok-chart__dot',
      });
      const title = svg('title', {});
      title.textContent = point.title;
      dot.append(title);
      chart.append(dot);
    }
    for (const [text, anchor, position] of [
      [formatDate(new Date(startMs)), 'start', CHART.left],
      [formatDate(new Date(last.t)), 'end', CHART.width - CHART.right],
    ] as const) {
      const tick = svg('text', {
        x: String(position),
        y: String(CHART.height - 8),
        class: 'bo-lapstok-chart__tick',
        'text-anchor': anchor,
      });
      tick.textContent = text;
      chart.append(tick);
    }
  }
  return chart;
}

export function renderStockReport(
  session: BoSession,
  _go: (path: string) => void,
  query: URLSearchParams,
): ScreenHandle {
  const store = session.store;
  const today = wibDate(session.now());
  const lookup = (id: string | null | undefined): Product | undefined =>
    id === null || id === undefined
      ? undefined
      : store.getState().data.products.find((item) => item.id === id);
  const sources = (): MovementSources => movementSourcesFor(session);

  let tab: Tab = query.get('tab') === 'kartu' ? 'kartu' : 'posisi';
  // posisi stok
  let warehouse: WarehouseFilter = 'semua';
  let category = ALL_CATEGORIES;
  let below = query.get('filter') === 'minimum';
  let text = '';
  let page = 1;
  // kartu stok
  let cardProduct: Product | undefined = lookup(query.get('barang'));
  let cardWarehouse: WarehouseFilter = 'semua';
  let start = addDays(today, -89);
  let end = today;
  let shown: Shown | undefined;
  let lastProducts = store.getState().data.products;

  const canPdf = session.allowed('BO-16', 'Ekspor PDF');
  const canExcel = session.allowed('BO-16', 'Ekspor Excel');

  const bannerBox = el('div', { className: 'bo-stok-banner' });

  // --- Kepala halaman dan ekspor ---
  const exportButton = (kind: ExportKind): HTMLButtonElement =>
    createButton({
      text: label(kind === 'pdf' ? 'eksporPdf' : 'eksporExcelXlsx'),
      variant: kind === 'pdf' ? 'primary' : 'secondary',
      icon: kind === 'pdf' ? 'printer' : 'download',
      onClick: () => {
        doExport(kind);
      },
    });
  const exportButtons = [
    ...(canExcel ? [exportButton('excel')] : []),
    ...(canPdf ? [exportButton('pdf')] : []),
  ];
  const head = el(
    'header',
    { className: 'bo-stok-head' },
    el(
      'div',
      { className: 'bo-stok-head__text' },
      el('h2', { className: 'bo-stok-head__title', text: label('lpsJudul') }),
      el('p', {
        className: 'bo-stok-head__sub',
        text: label('lpsSub', { tanggal: formatDate(session.now()) }),
      }),
    ),
    el('div', { className: 'bo-stok-head__actions' }, ...exportButtons),
  );

  // --- Tab ---
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const tabList = el('div', {
    className: 'bo-lapstok__tabs',
    attrs: { role: 'tablist', 'aria-label': label('lpsTabAria') },
  });
  const order: readonly Tab[] = ['posisi', 'kartu'];
  const posisiPane = el('section', { className: 'bo-lapstok__pane', attrs: { role: 'tabpanel' } });
  const kartuPane = el('section', { className: 'bo-lapstok__pane', attrs: { role: 'tabpanel' } });
  const paintTabs = (focus: boolean): void => {
    for (const [key, button] of tabButtons) {
      const active = key === tab;
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      if (active && focus) {
        button.focus();
      }
    }
    posisiPane.toggleAttribute('hidden', tab !== 'posisi');
    kartuPane.toggleAttribute('hidden', tab !== 'kartu');
  };
  const selectTab = (next: Tab, focus: boolean): void => {
    tab = next;
    paintTabs(focus);
  };
  for (const key of order) {
    const button = el(
      'button',
      {
        className: 'bo-lapstok__tab',
        attrs: { type: 'button', role: 'tab' },
      },
      icon(TAB_ICONS[key]),
      el('span', { text: label(TAB_LABELS[key]) }),
    );
    button.addEventListener('click', () => {
      selectTab(key, false);
    });
    button.addEventListener('keydown', (event) => {
      const index = order.indexOf(key);
      const moves: Readonly<Record<string, number>> = {
        ArrowRight: (index + 1) % order.length,
        ArrowLeft: (index + order.length - 1) % order.length,
        Home: 0,
        End: order.length - 1,
      };
      const target = moves[event.key];
      const next = target === undefined ? undefined : order[target];
      if (next !== undefined) {
        event.preventDefault();
        selectTab(next, true);
      }
    });
    tabButtons.set(key, button);
    tabList.append(button);
  }

  // =========================================================================
  // Posisi Stok
  // =========================================================================
  const searchId = nextId('lapstok-cari');
  const search = el('input', {
    className: 'input',
    attrs: {
      id: searchId,
      type: 'search',
      autocomplete: 'off',
      placeholder: label('lpsCariPlaceholder'),
    },
  });
  const warehouseField = createSelectField({
    labelText: label('gudang'),
    options: [
      { value: 'semua', text: label('labelSemuaGudang') },
      { value: 'display', text: label('namaGudangDisplay') },
      { value: 'besar', text: label('namaGudangBesar') },
    ],
    value: warehouse,
  });
  const categoryField = createSelectField({
    labelText: label('kategori'),
    options: [
      { value: ALL_CATEGORIES, text: label('semuaKategori') },
      ...categoriesOf(store.getState().data.products).map((name) => ({ value: name, text: name })),
    ],
    value: category,
  });
  const belowChip = el('button', {
    className: 'chip bo-lapstok__below',
    text: label('diBawahMinimum'),
    attrs: { type: 'button', 'aria-pressed': below ? 'true' : 'false' },
  });
  const statsBox = el('div', { className: 'bo-lapstok__stats' });
  const chartBox = el('section', { className: 'bo-panel bo-lapstok__bars' });
  const tableBox = el('section', { className: 'bo-panel bo-lapstok__table' });

  const filteredRows = (): StockReportRow[] => {
    const products = store.getState().data.products;
    return buildStockRows(findProducts(products, text, products.length), {
      warehouse,
      category,
      below,
    });
  };

  const statusCell = (row: StockReportRow): HTMLTableCellElement =>
    el(
      'td',
      {},
      el(
        'div',
        { className: 'bo-lapstok__status' },
        createBadge(STATUS_BADGE[row.status]),
        el('span', {
          className: 'bo-lapstok__caption',
          text: `${label('kolomMin')} ${qty(row.minimum)}`,
        }),
      ),
    );

  const openCard = (product: Product): void => {
    cardProduct = product;
    selectTab('kartu', false);
    showCard();
    tabList.scrollIntoView({ block: 'nearest' });
  };

  const paintPosisi = (): void => {
    const rows = filteredRows();
    const summary = summarize(rows);
    page = clampPage(page, rows.length);
    const total = pageCount(rows.length);

    statsBox.replaceChildren(
      stat(
        label('lpsStatNilai'),
        formatRupiah(summary.valueTotal),
        label('lpsStatNilaiCaption', {
          display: formatRupiah(summary.valueDisplay),
          besar: formatRupiah(summary.valueBesar),
        }),
        'bo-lapstok-stat--wide',
      ),
      stat(label('lpsStatBarang'), formatDecimal(summary.items), label('lpsStatBarangCaption')),
      stat(
        label('lpsStatMinimum'),
        formatDecimal(summary.belowMinimum),
        label('lpsStatMinimumCaption'),
        summary.belowMinimum > 0 ? 'is-warning' : '',
      ),
      stat(
        label('lpsStatNegatif'),
        formatDecimal(summary.negative),
        label('lpsStatNegatifCaption'),
        summary.negative > 0 ? 'is-danger' : '',
      ),
    );

    const bars = valueByCategory(rows, CATEGORY_BARS);
    chartBox.replaceChildren(
      el('h3', { className: 'bo-stok-panel-title', text: label('lpsGrafikJudul') }),
      bars.length === 0
        ? el('p', { className: 'bo-stok-note', text: label('lpsGrafikKosong') })
        : el(
            'ol',
            { className: 'bo-lapstok-bars' },
            ...bars.map((item) => {
              const fill = el('span', { className: 'bo-lapstok-bars__fill' });
              fill.style.setProperty(
                '--share',
                `${String(Math.max(2, Math.round(item.share * 100)))}%`,
              );
              return el(
                'li',
                { className: 'bo-lapstok-bars__item' },
                el(
                  'span',
                  { className: 'bo-lapstok-bars__row' },
                  el('span', {
                    className: 'bo-lapstok-bars__name',
                    text: item.other ? label('lpsGrafikLainnya') : item.category,
                  }),
                  el('span', {
                    className: 'bo-lapstok-bars__value',
                    text: formatRupiah(item.value),
                  }),
                ),
                el('span', { className: 'bo-lapstok-bars__track' }, fill),
              );
            }),
          ),
    );

    const single = warehouse !== 'semua';
    const slice = pageSlice(rows, page);
    const body = el(
      'tbody',
      {},
      ...slice.map((row) => {
        const product = row.product;
        const open = createButton({
          text: label('lpsTabKartu'),
          variant: 'secondary',
          icon: 'history',
          onClick: () => {
            openCard(product);
          },
        });
        open.setAttribute('aria-label', `${label('lpsTabKartu')} ${product.name}`);
        open.classList.add('bo-lapstok__card-btn');
        return el(
          'tr',
          {},
          el(
            'td',
            {},
            el('span', { className: 'bo-lapstok__name', text: product.name }),
            el('span', {
              className: 'bo-lapstok__caption',
              text: `${product.code} | ${product.category}`,
            }),
          ),
          ...(single
            ? [el('td', { className: 'is-end', text: qty(row.quantity) })]
            : [
                el('td', { className: 'is-end', text: qty(row.display) }),
                el('td', { className: 'is-end', text: qty(row.besar) }),
                el('td', { className: 'is-end is-strong', text: qty(totalStock(product)) }),
              ]),
          el('td', { text: product.baseUnit }),
          el('td', { className: 'is-end', text: formatRupiah(product.hpp) }),
          el('td', { className: 'is-end is-strong', text: formatRupiah(row.value) }),
          statusCell(row),
          el('td', {}, open),
        );
      }),
    );
    const from = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(rows.length, page * PAGE_SIZE);
    const previous = createButton({
      text: label('lpsSebelumnya'),
      variant: 'secondary',
      icon: 'chevron-left',
      disabled: page <= 1,
      onClick: () => {
        page -= 1;
        paintPosisi();
      },
    });
    const next = createButton({
      text: label('lpsBerikutnya'),
      variant: 'secondary',
      icon: 'chevron-right',
      disabled: page >= total,
      onClick: () => {
        page += 1;
        paintPosisi();
      },
    });
    tableBox.replaceChildren(
      rows.length === 0
        ? createEmptyState({
            icon: 'inbox',
            title: label('stokFilterKosong'),
          })
        : el(
            'div',
            { className: 'bo-stok-scroll' },
            el(
              'table',
              {
                className: 'pos-table bo-stok-table bo-lapstok__grid',
                attrs: { 'aria-label': label('lpsTabelAria') },
              },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('lpsKolomBarang') }),
                  ...(single
                    ? [
                        el('th', {
                          className: 'is-end',
                          text: label(warehouse === 'besar' ? 'gudangBesar' : 'gudangDisplay'),
                        }),
                      ]
                    : [
                        el('th', { className: 'is-end', text: label('gudangDisplay') }),
                        el('th', { className: 'is-end', text: label('gudangBesar') }),
                        el('th', { className: 'is-end', text: label('kolomTotal') }),
                      ]),
                  el('th', { text: label('kolomSatuan') }),
                  el('th', { className: 'is-end', text: label('lpsKolomHpp') }),
                  el('th', { className: 'is-end', text: label('lpsKolomNilai') }),
                  el('th', { text: label('kolomStatus') }),
                  el(
                    'th',
                    { className: 'bo-lapstok__th-action' },
                    el('span', { className: 'visually-hidden', text: label('lpsTabKartu') }),
                  ),
                ),
              ),
              body,
            ),
          ),
      el(
        'div',
        { className: 'bo-lapstok__pager' },
        el('p', {
          className: 'bo-stok-note',
          attrs: { 'aria-live': 'polite' },
          text: label('lpsMenampilkan', {
            dari: formatDecimal(from),
            sampai: formatDecimal(to),
            total: formatDecimal(rows.length),
          }),
        }),
        el(
          'div',
          { className: 'bo-lapstok__pager-actions' },
          previous,
          el('span', {
            className: 'bo-lapstok__page',
            text: label('lpsHalaman', {
              halaman: formatDecimal(page),
              total: formatDecimal(total),
            }),
          }),
          next,
        ),
      ),
    );
  };

  search.addEventListener('input', () => {
    text = search.value;
    page = 1;
    paintPosisi();
  });
  warehouseField.select.addEventListener('change', () => {
    warehouse = warehouseField.select.value as WarehouseFilter;
    page = 1;
    paintPosisi();
  });
  categoryField.select.addEventListener('change', () => {
    category = categoryField.select.value;
    page = 1;
    paintPosisi();
  });
  belowChip.addEventListener('click', () => {
    below = !below;
    belowChip.setAttribute('aria-pressed', below ? 'true' : 'false');
    page = 1;
    paintPosisi();
  });

  posisiPane.append(
    el(
      'div',
      { className: 'bo-panel bo-lapstok__filters' },
      labelled(label('cari'), search, searchId),
      warehouseField.root,
      categoryField.root,
      el('div', { className: 'bo-lapstok__filter-chip' }, belowChip),
    ),
    el('div', { className: 'bo-lapstok__top' }, statsBox, chartBox),
    tableBox,
  );

  // =========================================================================
  // Kartu Stok
  // =========================================================================
  const picked = el('p', { className: 'bo-lapstok__picked' });
  const picker = createProductPicker({
    labelText: label('lpsKartuBarang'),
    placeholder: label('lpsKartuPlaceholder'),
    products: () => store.getState().data.products,
    onPick: (product) => {
      cardProduct = product;
      paintPicked();
      showCard();
    },
  });
  picker.root.classList.add('bo-lapstok__picker');
  const cardWarehouseField = createSelectField({
    labelText: label('gudang'),
    options: [
      { value: 'semua', text: label('labelSemuaGudang') },
      { value: 'display', text: label('namaGudangDisplay') },
      { value: 'besar', text: label('namaGudangBesar') },
    ],
    value: cardWarehouse,
  });
  const startId = nextId('lapstok-dari');
  const endId = nextId('lapstok-sampai');
  const startInput = el('input', {
    className: 'input',
    attrs: { id: startId, type: 'date', value: start, max: today },
  });
  const endInput = el('input', {
    className: 'input',
    attrs: { id: endId, type: 'date', value: end, max: today },
  });
  const cardError = el('p', { className: 'bo-error bo-lapstok__error', attrs: { role: 'alert' } });
  const periodChips = el('div', {
    className: 'bo-lapstok__chips',
    attrs: { role: 'group', 'aria-label': label('lpsPeriodeAria') },
  });
  const samples = el('div', { className: 'bo-lapstok__samples' });
  const result = el('div', { className: 'bo-lapstok__result' });

  const paintPicked = (): void => {
    picked.replaceChildren(
      ...(cardProduct === undefined
        ? []
        : [icon('package'), el('span', { text: `${cardProduct.name} (${cardProduct.code})` })]),
    );
    picked.toggleAttribute('hidden', cardProduct === undefined);
  };

  const paintPeriodChips = (): void => {
    const presets: readonly (readonly [LabelKey, string])[] = [
      ['periodeBulanIni', monthStart(today)],
      ['lpsPeriode30', addDays(today, -29)],
      ['lpsPeriode90', addDays(today, -89)],
    ];
    periodChips.replaceChildren(
      ...presets.map(([key, from]) => {
        const chip = el('button', {
          className: 'chip',
          text: label(key),
          attrs: {
            type: 'button',
            'aria-pressed': start === from && end === today ? 'true' : 'false',
          },
        });
        chip.addEventListener('click', () => {
          start = from;
          end = today;
          startInput.value = start;
          endInput.value = end;
          paintPeriodChips();
          showCard();
        });
        return chip;
      }),
    );
  };

  const cardRowText = (row: CardRow): string => {
    switch (row.kind) {
      case 'penjualan':
        return label('lpsKetPenjualan', { pihak: row.party ?? label('lpsKetUmum') });
      case 'pembelian':
        return label('lpsKetPembelian', { pihak: row.party ?? '-' });
      case 'mutasi':
        return label('lpsKetMutasi', {
          asal: warehouseName(row.from),
          tujuan: warehouseName(row.to),
        });
      case 'opname':
        return row.note === undefined
          ? label('lpsKetOpname')
          : `${label('lpsKetOpname')}: ${row.note}`;
      case 'koreksi':
        return label('lpsKetKoreksi', { alasan: row.note ?? '-' });
      default:
        return row.party ?? label(KIND_LABELS[row.kind]);
    }
  };

  const exportCard = (current: Shown): { columns: string[]; rows: string[][] } => {
    const { card } = current;
    return {
      columns: [
        label('tanggal'),
        label('lpsKolomDokumen'),
        label('lpsKolomJenis'),
        label('lpsKolomKeterangan'),
        label('kolomGudang'),
        label('lpsKolomMasuk'),
        label('lpsKolomKeluar'),
        label('lpsKolomSaldo'),
      ],
      rows: [
        ['', '', '', label('lpsSaldoAwal'), '', '', '', qty(card.opening)],
        ...card.rows.map((row) => [
          formatDate(new Date(row.at)),
          row.document,
          label(KIND_LABELS[row.kind]),
          cardRowText(row),
          row.internal ? '-' : warehouseName(row.warehouse),
          row.inQty === 0 ? '-' : qty(row.inQty),
          row.outQty === 0 ? '-' : qty(row.outQty),
          qty(row.balance),
        ]),
        [
          '',
          '',
          '',
          label('lpsSaldoAkhir'),
          '',
          qty(card.totalIn),
          qty(card.totalOut),
          qty(card.closing),
        ],
      ],
    };
  };

  function paintCard(): void {
    if (shown === undefined) {
      result.replaceChildren(
        createEmptyState({
          icon: 'history',
          title: label('lpsKartuKosongJudul'),
          description: label('lpsKartuKosongTeks'),
        }),
      );
      return;
    }
    const { product, card } = shown;
    const parts = breakdownStock(product, totalStock(product))
      .map((part) => `${formatDecimal(part.quantity, 3, 0)} ${part.unit}`)
      .join(' + ');
    const unit = label('lpsSatuanDasar', { satuan: product.baseUnit });
    const info = el(
      'section',
      { className: 'bo-panel bo-lapcard__info' },
      el(
        'div',
        { className: 'bo-lapcard__title' },
        el('h3', { className: 'bo-lapcard__name', text: product.name }),
        el('p', {
          className: 'bo-lapcard__meta',
          text: `${product.code} | ${product.category} | ${product.baseUnit}`,
        }),
      ),
      el(
        'dl',
        { className: 'bo-lapcard__facts' },
        el(
          'div',
          {},
          el('dt', { text: label('lpsKartuStokSekarang') }),
          el('dd', {
            text: label('lpsKartuStokRincian', {
              display: qty(product.stock.display),
              besar: qty(product.stock.besar),
              total: `${qty(totalStock(product))} ${product.baseUnit}`,
            }),
          }),
          parts === '' ? false : el('dd', { className: 'bo-lapstok__caption', text: parts }),
        ),
        el(
          'div',
          {},
          el('dt', { text: label('lpsKolomHpp') }),
          el('dd', {
            text: label('lpsKartuHppNilai', {
              hpp: formatRupiah(product.hpp),
              nilai: formatRupiah(Math.round(totalStock(product) * product.hpp)),
            }),
          }),
        ),
      ),
    );
    const stats = el(
      'div',
      { className: 'bo-lapstok__stats bo-lapstok__stats--card' },
      stat(label('lpsSaldoAwal'), qty(card.opening), unit),
      stat(label('lpsTotalMasuk'), `+${qty(card.totalIn)}`, unit),
      stat(label('lpsTotalKeluar'), `-${qty(card.totalOut)}`, unit),
      stat(label('lpsSaldoAkhir'), qty(card.closing), unit, 'bo-lapstok-stat--accent'),
    );
    const chart = el(
      'section',
      { className: 'bo-panel bo-lapstok__chart' },
      el('h3', { className: 'bo-stok-panel-title', text: label('lpsGrafikSaldo') }),
      createBalanceChart(shown),
    );
    const body = el(
      'tbody',
      {},
      el(
        'tr',
        { className: 'bo-lapstok__open' },
        el('td', { attrs: { colspan: '7' }, text: label('lpsSaldoAwal') }),
        el('td', { className: 'is-end is-strong', text: qty(card.opening) }),
      ),
      ...card.rows.map((row) =>
        el(
          'tr',
          {},
          el('td', { text: formatDate(new Date(row.at)) }),
          el('td', {}, el('strong', { text: row.document })),
          el(
            'td',
            {},
            el('span', { className: 'bo-lapstok__kind', text: label(KIND_LABELS[row.kind]) }),
          ),
          el('td', { className: 'bo-lapstok__note', text: cardRowText(row) }),
          el('td', { text: row.internal ? '-' : warehouseName(row.warehouse) }),
          el('td', { className: 'is-end', text: row.inQty === 0 ? '-' : qty(row.inQty) }),
          el('td', { className: 'is-end', text: row.outQty === 0 ? '-' : qty(row.outQty) }),
          el('td', { className: 'is-end is-strong', text: qty(row.balance) }),
        ),
      ),
    );
    const table =
      card.rows.length === 0
        ? el('p', { className: 'bo-stok-note', text: label('belumAdaData') })
        : false;
    result.replaceChildren(
      info,
      el('div', { className: 'bo-lapstok__top' }, stats, chart),
      el(
        'section',
        { className: 'bo-panel bo-lapstok__table' },
        el(
          'div',
          { className: 'bo-stok-scroll' },
          el(
            'table',
            {
              className: 'pos-table bo-stok-table bo-lapstok__ledger',
              attrs: { 'aria-label': label('lpsKartuTabelAria') },
            },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { text: label('tanggal') }),
                el('th', { text: label('lpsKolomDokumen') }),
                el('th', { text: label('lpsKolomJenis') }),
                el('th', { text: label('lpsKolomKeterangan') }),
                el('th', { text: label('kolomGudang') }),
                el('th', {
                  className: 'is-end',
                  text: `${label('lpsKolomMasuk')} (${product.baseUnit})`,
                }),
                el('th', {
                  className: 'is-end',
                  text: `${label('lpsKolomKeluar')} (${product.baseUnit})`,
                }),
                el('th', {
                  className: 'is-end',
                  text: `${label('lpsKolomSaldo')} (${product.baseUnit})`,
                }),
              ),
            ),
            body,
            el(
              'tfoot',
              {},
              el(
                'tr',
                {},
                el('td', { attrs: { colspan: '5' }, text: label('lpsSaldoAkhir') }),
                el('td', { className: 'is-end', text: qty(card.totalIn) }),
                el('td', { className: 'is-end', text: qty(card.totalOut) }),
                el('td', { className: 'is-end', text: qty(card.closing) }),
              ),
            ),
          ),
        ),
        table,
        el('p', { className: 'bo-stok-note', text: label('lpsKetBantuan') }),
      ),
    );
  }

  function showCard(): void {
    cardError.textContent = '';
    if (!store.getState().online) {
      cardError.textContent = message('MSG-001');
      return;
    }
    if (cardProduct === undefined) {
      cardError.textContent = message('MSG-105');
      picker.input.focus();
      return;
    }
    start = startInput.value;
    end = endInput.value;
    const issue = validateRange(start, end, today);
    if (issue !== undefined) {
      cardError.textContent = message(RANGE_MESSAGES[issue]);
      return;
    }
    const product = lookup(cardProduct.id) ?? cardProduct;
    cardProduct = product;
    paintPicked();
    paintPeriodChips();
    shown = {
      product,
      start,
      end,
      warehouse: cardWarehouse,
      card: buildStockCard(product, movementsFor(product, sources()), {
        start,
        end,
        warehouse: cardWarehouse,
      }),
    };
    paintCard();
  }

  cardWarehouseField.select.addEventListener('change', () => {
    cardWarehouse = cardWarehouseField.select.value as WarehouseFilter;
  });
  const show = createButton({
    text: label('lpsKartuTampilkan'),
    icon: 'search',
    onClick: showCard,
  });
  show.classList.add('bo-lapstok__show');
  for (const input of [startInput, endInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        showCard();
      }
    });
  }

  const paintSamples = (): void => {
    const products = productsWithMovement(
      store.getState().data.products,
      sources(),
      SAMPLE_PRODUCTS,
    );
    samples.replaceChildren(
      ...(products.length === 0
        ? []
        : [
            el('p', { className: 'bo-lapstok__caption', text: label('lpsKartuContoh') }),
            el(
              'div',
              { className: 'bo-lapstok__chips' },
              ...products.map((product) => {
                const chip = el('button', {
                  className: 'chip bo-lapstok__sample',
                  text: product.name,
                  attrs: { type: 'button', title: `${product.name} (${product.code})` },
                });
                chip.addEventListener('click', () => {
                  cardProduct = product;
                  paintPicked();
                  showCard();
                });
                return chip;
              }),
            ),
          ]),
    );
  };

  kartuPane.append(
    el(
      'div',
      { className: 'bo-panel bo-lapstok__filters bo-lapstok__filters--card' },
      el('div', { className: 'bo-lapstok__pick' }, picker.root, picked),
      cardWarehouseField.root,
      labelled(label('dariTanggal'), startInput, startId),
      labelled(label('sampaiTanggal'), endInput, endId),
      el('div', { className: 'bo-lapstok__filter-chip' }, show),
      el('div', { className: 'bo-lapstok__filters-extra' }, periodChips, samples),
    ),
    cardError,
    result,
  );

  // --- Ekspor ---
  function doExport(kind: ExportKind): void {
    if (!store.getState().online) {
      return;
    }
    if (tab === 'kartu') {
      if (shown === undefined) {
        showToast({ kind: 'error', text: message('MSG-105') });
        return;
      }
      const data = exportCard(shown);
      openExportPreview({
        kind,
        title: label('lpsEksporKartu', { kode: shown.product.code }),
        columns: data.columns,
        rows: data.rows,
      });
      return;
    }
    const rows = filteredRows();
    const single = warehouse !== 'semua';
    openExportPreview({
      kind,
      title: label('lpsJudul'),
      columns: [
        label('kolomKode'),
        label('kolomNamaBarang'),
        label('kolomKategori'),
        ...(single
          ? [label(warehouse === 'besar' ? 'gudangBesar' : 'gudangDisplay')]
          : [label('gudangDisplay'), label('gudangBesar'), label('kolomTotal')]),
        label('kolomSatuanDasar'),
        label('lpsKolomHpp'),
        label('lpsKolomNilai'),
        label('kolomStatus'),
      ],
      rows: rows.map((row) => [
        row.product.code,
        row.product.name,
        row.product.category,
        ...(single
          ? [qty(row.quantity)]
          : [qty(row.display), qty(row.besar), qty(totalStock(row.product))]),
        row.product.baseUnit,
        formatDecimal(row.product.hpp),
        formatDecimal(row.value),
        label(
          row.status === 'aman'
            ? 'statusAman'
            : row.status === 'minimum'
              ? 'statusDiBawahMinimum'
              : 'ditinjauNegatif',
        ),
      ]),
    });
  }

  const paintConnection = (): void => {
    const online = store.getState().online;
    bannerBox.replaceChildren(...(online ? [] : [createBanner('offline', message('MSG-001'))]));
    show.disabled = !online;
    for (const button of exportButtons) {
      button.disabled = !online;
    }
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (document.querySelector('.modal-overlay') !== null || !isPc() || !event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'p' && canPdf) {
      event.preventDefault();
      doExport('pdf');
    } else if (key === 'x' && canExcel) {
      event.preventDefault();
      doExport('excel');
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(() => {
    paintConnection();
    const products = store.getState().data.products;
    if (products !== lastProducts) {
      lastProducts = products;
      paintPosisi();
    }
  });

  const element = el(
    'div',
    { className: 'bo-stok-page bo-lapstok' },
    head,
    bannerBox,
    tabList,
    posisiPane,
    kartuPane,
  );
  paintPicked();
  paintPeriodChips();
  paintSamples();
  paintPosisi();
  paintTabs(false);
  if (cardProduct === undefined) {
    paintCard();
  } else {
    showCard();
  }
  paintConnection();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
