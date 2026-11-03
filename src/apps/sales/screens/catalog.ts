import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { Product, Tier } from '../../../shared/data/types';
import { fromBase, totalStock, unitPrice } from '../../../shared/data/units';
import { preferredUnit } from '../../../shared/domain/orders';
import { matchesFilter, stockStatus, type WarehouseFilter } from '../../../shared/domain/stock';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField } from '../../../shared/ui/field';
import { findProducts } from '../../../shared/ui/product-picker';
import type { ScreenHandle } from '../../../shared/ui/screen';
import { showToast } from '../../../shared/ui/toast';
import { PAGE_SIZE } from '../domain/constants';
import type { SalesSession } from '../sales-session';

const DEBOUNCE_MS = 300;

const WAREHOUSES: readonly (readonly [WarehouseFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['display', 'gudangDisplay'],
  ['besar', 'gudangBesar'],
];

const TIERS: readonly (readonly [Tier, LabelKey])[] = [
  ['eceran', 'tierEceran'],
  ['grosir', 'tierGrosir'],
  ['kontraktor', 'tierKontraktor'],
];

export function renderCatalog(session: SalesSession, go: (path: string) => void): ScreenHandle {
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
  const tierBox = el('div', { className: 'own-stack' });
  const search = el('input', {
    className: 'input own-search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      'aria-label': label('cari'),
      placeholder: label('cariPlaceholderOwner'),
    },
  });
  const hint = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('filterStok') },
  });
  const list = el('div', { className: 'own-stack' });
  const more = el('div', { className: 'own-more' });

  const filtered = (): Product[] =>
    findProducts(store.getState().data.products, text).filter((product) =>
      matchesFilter(product, { warehouse, below, negative: false }),
    );

  const renderTier = (): void => {
    const selected = store
      .getState()
      .data.customers.find((item) => item.id === session.state().draft.customerId);
    if (selected !== undefined) {
      const key = TIERS.find(([tier]) => tier === selected.tier)?.[1] ?? 'tierEceran';
      tierBox.replaceChildren(
        el('p', { className: 't-label', text: label('tierDariPelanggan', { tier: label(key) }) }),
      );
      return;
    }
    tierBox.replaceChildren(
      el('p', { className: 't-label', text: label('tierHarga') }),
      el(
        'div',
        { className: 'own-chips', attrs: { role: 'group', 'aria-label': label('tierHarga') } },
        ...TIERS.map(([tier, key]) =>
          createChip({
            text: label(key),
            selected: session.state().catalogTier === tier,
            onToggle: () => {
              session.setCatalogTier(tier);
              renderTier();
              paint();
            },
          }),
        ),
      ),
    );
  };

  const card = (product: Product): HTMLElement => {
    const unit = units.get(product.id) ?? preferredUnit(product);
    const tier = session.tier();
    const amount = (value: number): string =>
      `${formatDecimal(fromBase(product, unit, value), 3, 1)} ${unit}`;
    const status = stockStatus(product, 'semua');
    const unitSelect = el(
      'select',
      {
        className: 'input',
        attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
      },
      ...product.units.map((item) =>
        el('option', { text: item.code, attrs: { value: item.code } }),
      ),
    );
    unitSelect.value = unit;
    unitSelect.addEventListener('change', () => {
      units.set(product.id, unitSelect.value);
      paint();
    });
    const add = createButton({
      text: label('tambahKeOrder'),
      icon: 'plus',
      onClick: () => {
        session.addLine(product, unit);
        showToast({ kind: 'success', text: label('ditambahKeOrder', { nama: product.name }) });
      },
    });
    add.setAttribute('aria-label', `${label('tambahKeOrder')} ${product.name}`);
    const shownStock =
      warehouse === 'semua'
        ? [
            label('stokBarisDisplay', { nilai: amount(product.stock.display) }),
            label('stokBarisBesar', { nilai: amount(product.stock.besar) }),
          ]
        : [
            label(warehouse === 'display' ? 'stokBarisDisplay' : 'stokBarisBesar', {
              nilai: amount(product.stock[warehouse]),
            }),
          ];
    return el(
      'article',
      { className: 'own-card own-card--stock' },
      el('h2', { className: 'own-card__name', text: product.name }),
      el('p', { className: 't-label', text: `${product.code} · ${product.baseUnit}` }),
      el(
        'div',
        { className: 'own-grid-2' },
        unitSelect,
        el('output', {
          className: 't-value',
          text: label('hargaPerSatuan', {
            harga: formatRupiah(unitPrice(product, unit, tier)),
            satuan: unit,
          }),
        }),
      ),
      el(
        'p',
        { className: 'own-stock-line' },
        ...shownStock.map((line) => el('span', { text: line })),
        el('strong', { text: label('stokBarisTotal', { nilai: amount(totalStock(product)) }) }),
      ),
      status === 'aman'
        ? false
        : el(
            'span',
            {
              className:
                status === 'minimum' ? 'own-status own-status--warn' : 'own-status own-status--bad',
            },
            icon(status === 'minimum' ? 'triangle-alert' : 'circle-x'),
            el('span', {
              text: label(status === 'minimum' ? 'diBawahMinimum' : 'ditinjauNegatif'),
            }),
          ),
      add,
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
  const stop = store.subscribe(paint);

  const element = el(
    'div',
    { className: 'own-stack' },
    customer.root,
    tierBox,
    search,
    hint,
    chips,
    list,
    more,
    createButton({
      text: label('lihatOrder'),
      variant: 'secondary',
      onClick: () => {
        go('/sales/order');
      },
    }),
  );
  renderTier();
  renderChips();
  paint();
  return {
    element,
    destroy: () => {
      stop();
      window.clearTimeout(timer);
      scroller?.removeEventListener('scroll', onScroll);
    },
  };
}
