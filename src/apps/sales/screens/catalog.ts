import '../../../styles/mobile-sales.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { TIERS } from '../../../shared/data/types';
import { preferredUnit } from '../../../shared/domain/orders';
import { stockStatus, type WarehouseFilter } from '../../../shared/domain/stock';
import type { StockTone } from '../../../shared/domain/product-view';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField } from '../../../shared/ui/field';
import { openPhotoViewer } from '../../../shared/ui/image-viewer';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import type { ModalHandle } from '../../../shared/ui/modal';
import { createProductPhoto } from '../../../shared/ui/product-photo';
import { findProducts } from '../../../shared/ui/product-picker';
import { showToast } from '../../../shared/ui/toast';
import {
  filterCatalog,
  stockText,
  stockTone,
  TIER_LABELS,
  tierPrices,
  unitNote,
} from '../domain/catalog';
import { PAGE_SIZE } from '../domain/constants';
import { draftTotals } from '../domain/order-lines';
import type { SalesScreen } from './screen-type';

const DEBOUNCE_MS = 300;

const WAREHOUSES: readonly (readonly [WarehouseFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['display', 'slsChipDisplay'],
  ['besar', 'slsChipBesar'],
];

const TONE_ICONS: Readonly<Record<StockTone, IconName>> = {
  sukses: 'circle-check',
  peringatan: 'triangle-alert',
  bahaya: 'circle-x',
};

export const renderCatalog: SalesScreen = (session, go) => {
  const store = session.store;
  let warehouse: WarehouseFilter = 'semua';
  let below = false;
  let text = '';
  let shown = PAGE_SIZE;
  let timer: number | undefined;
  const units = new Map<string, string>();

  const customer = createSelectField({
    labelText: label('pelanggan'),
    options: [
      { value: '', text: label('pelangganUmum') },
      ...store.getState().data.customers.map((item) => ({ value: item.id, text: item.name })),
    ],
    value: session.state().draft.customerId,
  });
  const tierBox = el('div', { className: 'sls-tier' });
  const search = el('input', {
    className: 'input own-search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      'aria-label': label('cari'),
      placeholder: label('slsCariBarang'),
    },
  });
  const hint = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const chips = el('div', {
    className: 'own-chips sls-chips',
    attrs: { role: 'group', 'aria-label': label('filterStok') },
  });
  const list = el('div', { className: 'sls-list' });
  const more = el('div', { className: 'own-more' });
  const cart = el('div', { className: 'sls-cart' });

  const filtered = (): Product[] =>
    filterCatalog(findProducts(store.getState().data.products, text), { warehouse, below });

  const renderTier = (): void => {
    const selected = store
      .getState()
      .data.customers.find((item) => item.id === session.state().draft.customerId);
    if (selected !== undefined) {
      tierBox.replaceChildren(
        el('span', { className: 'field__label', text: label('slsTierMengikuti') }),
        createMobBadge(label(TIER_LABELS[selected.tier]), 'info', 'tag'),
      );
      tierBox.classList.add('sls-tier--fixed');
      return;
    }
    tierBox.classList.remove('sls-tier--fixed');
    tierBox.replaceChildren(
      el('span', { className: 'field__label', text: label('tierHarga') }),
      el(
        'div',
        { className: 'sls-seg', attrs: { role: 'group', 'aria-label': label('tierHarga') } },
        ...TIERS.map((tier) => {
          const button = el('button', {
            className: 'sls-seg__button',
            text: label(TIER_LABELS[tier]),
            attrs: {
              type: 'button',
              'aria-pressed': session.state().catalogTier === tier ? 'true' : 'false',
            },
          });
          button.addEventListener('click', () => {
            session.setCatalogTier(tier);
            renderTier();
            paint();
          });
          return button;
        }),
      ),
    );
  };

  const stockItem = (product: Product, key: WarehouseId, name: LabelKey): HTMLElement => {
    const tone = stockTone(product, key);
    return el(
      'div',
      { className: `sls-stock__item sls-stock__item--${tone}` },
      el('span', { className: 'sls-stock__label', text: label(name) }),
      el(
        'strong',
        { className: 'sls-stock__value' },
        icon(TONE_ICONS[tone]),
        el('span', { text: stockText(product, key) }),
      ),
    );
  };

  const card = (product: Product): HTMLElement => {
    let unit = units.get(product.id) ?? preferredUnit(product);
    const prices = el('div', { className: 'sls-prices' });
    const paintPrices = (): void => {
      const note = unitNote(product, unit);
      prices.replaceChildren(
        el(
          'div',
          { className: 'sls-prices__head' },
          el('span', { text: label('slsHargaPerSatuan', { satuan: unit }) }),
          note === undefined
            ? false
            : el('span', {
                className: 'sls-prices__note',
                text: label('slsSatuanSetara', {
                  satuan: unit,
                  faktor: formatDecimal(note.factor),
                  dasar: note.base,
                }),
              }),
        ),
        el(
          'div',
          {
            className: 'sls-prices__grid',
            attrs: { role: 'group', 'aria-label': label('hargaBertingkat') },
          },
          ...tierPrices(product, unit, session.tier()).map((entry) =>
            el(
              'div',
              {
                className: 'sls-price',
                attrs: { 'data-active': entry.active ? 'true' : 'false' },
              },
              el('span', { className: 'sls-price__tier', text: label(TIER_LABELS[entry.tier]) }),
              el('strong', { className: 'sls-price__value', text: formatDecimal(entry.price, 0) }),
            ),
          ),
        ),
      );
    };
    paintPrices();

    const unitSelect = el(
      'select',
      {
        className: 'input select__control',
        attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
      },
      ...product.units.map((item) =>
        el('option', { text: item.code, attrs: { value: item.code } }),
      ),
    );
    unitSelect.value = unit;
    unitSelect.addEventListener('change', () => {
      unit = unitSelect.value;
      units.set(product.id, unit);
      paintPrices();
    });
    const add = (): void => {
      session.addLine(product, unit);
      showToast({ kind: 'success', text: label('ditambahKeOrder', { nama: product.name }) });
    };
    const addButton = createButton({ text: label('tambahKeOrder'), icon: 'plus', onClick: add });
    addButton.setAttribute('aria-label', `${label('tambahKeOrder')} ${product.name}`);

    const zoom = (): void => {
      const opened: { viewer?: ModalHandle } = {};
      opened.viewer = openPhotoViewer({
        product,
        tier: session.tier(),
        extra: createButton({
          text: label('tambahKeOrder'),
          icon: 'plus',
          onClick: () => {
            add();
            opened.viewer?.close();
          },
        }),
      });
    };

    const status = stockStatus(product, 'semua');
    return el(
      'article',
      { className: 'mob-card sls-card' },
      el(
        'div',
        { className: 'sls-card__head' },
        el(
          'div',
          { className: 'sls-card__id' },
          el('h2', { className: 'sls-card__name', text: product.name }),
          el('p', { className: 'sls-card__code', text: `[${product.code}] ${product.category}` }),
          status === 'aman'
            ? false
            : createMobBadge(
                label(status === 'minimum' ? 'diBawahMinimum' : 'ditinjauNegatif'),
                status === 'minimum' ? 'peringatan' : 'bahaya',
                status === 'minimum' ? 'triangle-alert' : 'circle-x',
              ),
        ),
        createProductPhoto(product, 'lg', { onZoom: zoom }),
      ),
      el(
        'div',
        { className: 'sls-stock' },
        stockItem(product, 'display', 'slsStokToko'),
        stockItem(product, 'besar', 'slsStokGudang'),
      ),
      prices,
      el(
        'div',
        { className: 'sls-card__foot' },
        el('div', { className: 'select sls-card__unit' }, unitSelect, icon('chevron-down')),
        addButton,
      ),
    );
  };

  const paint = (): void => {
    const rows = filtered();
    list.replaceChildren(
      ...(rows.length === 0
        ? [createEmptyState({ icon: 'inbox', title: label('barangTidakDitemukan') })]
        : rows.slice(0, shown).map(card)),
    );
    more.replaceChildren(
      ...(rows.length > shown
        ? [
            createButton({
              text: label('muatLebihBanyak', { jumlah: rows.length - shown }),
              variant: 'secondary',
              onClick: () => {
                shown += PAGE_SIZE;
                paint();
              },
            }),
          ]
        : []),
    );
    hint.textContent = text.trim().length === 1 ? message('MSG-120') : '';
  };

  const paintCart = (): void => {
    const lines = session.state().draft.lines;
    if (lines.length === 0) {
      cart.replaceChildren();
      return;
    }
    const totals = draftTotals(
      lines,
      (id) => store.getState().data.products.find((item) => item.id === id),
      session.tier(),
    );
    const button = el(
      'button',
      { className: 'sls-cart__button', attrs: { type: 'button' } },
      icon('shopping-cart'),
      el('span', {
        className: 'sls-cart__text',
        text: label('slsLihatOrder', { jumlah: totals.items }),
      }),
      el('strong', { text: formatRupiah(totals.total) }),
    );
    button.addEventListener('click', () => {
      go('/sales/order');
    });
    cart.replaceChildren(button);
  };

  const renderChips = (): void => {
    chips.replaceChildren(
      ...WAREHOUSES.map(([value, key]) =>
        createChip({
          text: label(key),
          selected: warehouse === value,
          onToggle: () => {
            warehouse = value;
            shown = PAGE_SIZE;
            renderChips();
            paint();
          },
        }),
      ),
      createChip({
        text: label('diBawahMinimum'),
        selected: below,
        onToggle: (selectedNow) => {
          below = selectedNow;
          shown = PAGE_SIZE;
          paint();
        },
      }),
    );
  };

  customer.select.addEventListener('change', () => {
    session.setDraft({ customerId: customer.select.value });
    renderTier();
    paint();
  });
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      text = search.value;
      shown = PAGE_SIZE;
      paint();
    }, DEBOUNCE_MS);
  });
  const onScroll = (): void => {
    const scroller = document.getElementById('own-main');
    if (
      scroller !== null &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80 &&
      filtered().length > shown
    ) {
      shown += PAGE_SIZE;
      paint();
    }
  };
  const scroller = document.getElementById('own-main');
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  const stops = [store.subscribe(paint), session.subscribe(paintCart)];

  const element = el(
    'div',
    { className: 'own-stack sls-screen' },
    createMobCard({ className: 'sls-controls', body: [customer.root, tierBox] }),
    search,
    hint,
    chips,
    list,
    more,
    cart,
  );
  renderTier();
  renderChips();
  paint();
  paintCart();
  return {
    element,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      window.clearTimeout(timer);
      scroller?.removeEventListener('scroll', onScroll);
    },
  };
};
