import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { TIERS, type Product, type Tier, type WarehouseId } from '../../../shared/data/types';
import { breakdownStock, fromBase } from '../../../shared/data/units';
import { tierRows, warehouseTone } from '../../../shared/domain/product-view';
import { matchesFilter, splitMin, type WarehouseFilter } from '../../../shared/domain/stock';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { openPhotoViewer } from '../../../shared/ui/image-viewer';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto } from '../../../shared/ui/product-photo';
import { createTierTable } from '../../../shared/ui/tier-table';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import { PAGE_SIZE } from '../domain/constants';
import { preferredUnit } from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import { findProducts } from '../search';
import type { ScreenHandle } from '../screen';
import { openSheet } from '../sheet';
import type { OwnerShell } from '../shell';

const DEBOUNCE_MS = 300;
const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
};

const WAREHOUSES: readonly (readonly [WarehouseFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['display', 'stkChipToko'],
  ['besar', 'stkChipGudang'],
];

function stockText(product: Product, warehouse: WarehouseId): string {
  return `${formatDecimal(product.stock[warehouse], 3, 0)} ${product.baseUnit}`;
}

// Satu kolom stok: judul kecil (STOK TOKO atau STOK GUDANG) dan lencana berwarna sesuai status.
function stockBadge(product: Product, warehouse: WarehouseId): HTMLElement {
  return el(
    'span',
    { className: 'trx-stk' },
    el('span', {
      className: 'trx-stk__label',
      text: label(warehouse === 'display' ? 'stkLabelToko' : 'stkLabelGudang'),
    }),
    createMobBadge(stockText(product, warehouse), warehouseTone(product, warehouse)),
  );
}

// Tabel harga ringkas pada kartu: satu baris per satuan jual, satu kolom per tier (dalam Rupiah).
function priceTable(product: Product): HTMLElement {
  return el(
    'table',
    { className: 'trx-prices' },
    el('caption', { className: 'visually-hidden', text: label('hargaBertingkat') }),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: label('kolomSatuanJual'), attrs: { scope: 'col' } }),
        ...TIERS.map((tier) =>
          el('th', {
            className: 'is-end',
            text: label(TIER_LABELS[tier]),
            attrs: { scope: 'col' },
          }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...tierRows(product).map((row) =>
        el(
          'tr',
          {},
          el(
            'th',
            { attrs: { scope: 'row' } },
            el('strong', { text: row.unit }),
            row.factor === 1
              ? false
              : el('small', {
                  text: label('satuanSama', {
                    faktor: formatDecimal(row.factor),
                    dasar: product.baseUnit,
                  }),
                }),
          ),
          ...TIERS.map((tier) =>
            el('td', { className: 'is-end', text: formatDecimal(row.prices[tier], 0) }),
          ),
        ),
      ),
    ),
  );
}

export function renderStock(
  session: OwnerSession,
  go: (path: string) => void,
  query?: URLSearchParams,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('stkJudul'));
  shell?.setBack(undefined);
  const store = session.store;
  let warehouse: WarehouseFilter = 'semua';
  let below = query?.get('filter') === 'minimum';
  let text = '';
  let shown = PAGE_SIZE;
  let timer: number | undefined;

  const search = el('input', {
    className: 'input own-search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      'aria-label': label('cari'),
      placeholder: label('stkCariPlaceholder'),
    },
  });
  const hint = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('filterStok') },
  });
  const list = el('div', { className: 'own-stack' });
  const more = el('div', { className: 'own-more' });
  const stamp = el('p', { className: 't-label own-stamp' });

  const filtered = (): Product[] =>
    findProducts(store.getState().data.products, text).filter((product) =>
      matchesFilter(product, { warehouse, below, negative: false }),
    );

  const openMutation = (product: Product): void => {
    const options = [
      { value: 'besar', text: label('namaGudangBesar') },
      { value: 'display', text: label('namaGudangDisplay') },
    ];
    const from = createSelectField({ labelText: label('gudangAsal'), options, value: 'besar' });
    const to = createSelectField({ labelText: label('gudangTujuan'), options, value: 'display' });
    to.select.value = 'display';
    const quantity = createTextField({ labelText: label('jumlahMutasi'), inputMode: 'decimal' });
    const unit = createSelectField({
      labelText: label('kolomSatuan'),
      options: product.units.map((item) => ({ value: item.code, text: item.code })),
      value: preferredUnit(product),
    });
    const available = el('p', { className: 't-label' });
    const paintAvailable = (): void => {
      const source = from.select.value as WarehouseId;
      available.textContent = `${label('stokAsal')}: ${formatDecimal(fromBase(product, unit.select.value, product.stock[source]), 3, 1)} ${unit.select.value}`;
    };
    from.select.addEventListener('change', paintAvailable);
    unit.select.addEventListener('change', paintAvailable);
    paintAvailable();
    openSheet({
      title: `${label('buatMutasi')}: ${product.name}`,
      body: el(
        'div',
        { className: 'own-form' },
        from.root,
        to.root,
        unit.root,
        available,
        quantity.root,
      ),
      submitText: label('simpanMutasi'),
      onSubmit: () => {
        const result = session.saveTransfer(
          product.id,
          from.select.value as WarehouseId,
          to.select.value as WarehouseId,
          unit.select.value,
          quantity.input.value,
        );
        if (result.ok) {
          showToast({ kind: 'success', text: message('MSG-012', { nomor: result.number }) });
          return undefined;
        }
        return failureText(result);
      },
    });
  };

  const zoom = (product: Product): void => {
    openPhotoViewer({ product });
  };

  // Lembar Detail Barang: foto, stok tiap gudang, harga bertingkat, HPP, dan aksi.
  const openDetail = (product: Product): void => {
    const current = (): Product =>
      store.getState().data.products.find((item) => item.id === product.id) ?? product;
    const stockBox = (key: WarehouseId): HTMLElement => {
      const item = current();
      const parts = breakdownStock(item, item.stock[key])
        .map((part) => `${formatDecimal(part.quantity, 3, 0)} ${part.unit}`)
        .join(' + ');
      return el(
        'div',
        { className: 'trx-detail-stock' },
        stockBadge(item, key),
        el('span', {
          className: 'mob-muted',
          text: label('stkMinimum', { nilai: formatDecimal(splitMin(item)[key], 3, 0) }),
        }),
        parts === '' ? false : el('span', { className: 'mob-muted', text: parts }),
      );
    };
    const mutate = createButton({
      text: label('buatMutasi'),
      variant: 'secondary',
      icon: 'arrow-left-right',
    });
    const order = createButton({ text: label('buatPo'), icon: 'clipboard-list' });
    const item = current();
    const body = el(
      'div',
      { className: 'trx-detail-sheet' },
      el(
        'div',
        { className: 'trx-detail-sheet__head' },
        createProductPhoto(item, 'lg', {
          onZoom: () => {
            zoom(item);
          },
        }),
        el(
          'dl',
          { className: 'trx-facts' },
          el('dt', { text: label('kodeBarang') }),
          el('dd', { text: item.code }),
          el('dt', { text: label('merkBarang') }),
          el('dd', { text: item.brand }),
          el('dt', { text: label('kategoriBarang') }),
          el('dd', { text: item.category }),
        ),
      ),
      el('div', { className: 'trx-detail-stocks' }, stockBox('display'), stockBox('besar')),
      createTierTable(item),
      el(
        'p',
        { className: 'trx-hpp' },
        el('span', { className: 'mob-muted', text: label('stkHpp', { satuan: item.baseUnit }) }),
        el('strong', { text: formatRupiah(item.hpp) }),
      ),
      el('div', { className: 'trx-detail-actions' }, mutate, order),
    );
    const handle = openModal({
      title: label('detailBarang'),
      body,
      actions: [{ text: label('tutup'), variant: 'secondary' }],
    });
    handle.dialog.classList.add('trx-dialog', 'trx-dialog--wide');
    mutate.addEventListener('click', () => {
      handle.close();
      openMutation(item);
    });
    order.addEventListener('click', () => {
      handle.close();
      go(`/owner/transaksi?tab=po&barang=${encodeURIComponent(item.code)}`);
    });
  };

  const card = (product: Product): HTMLElement => {
    const open = el(
      'button',
      { className: 'trx-stock__open', attrs: { type: 'button' } },
      el('span', { className: 'trx-stock__name', text: product.name }),
      el('span', { className: 'trx-stock__code', text: `[${product.code}]` }),
    );
    open.addEventListener('click', () => {
      openDetail(product);
    });
    return el(
      'article',
      { className: 'trx-stock' },
      el(
        'div',
        { className: 'trx-stock__main' },
        el('h2', { className: 'trx-stock__title' }, open),
      ),
      el(
        'div',
        { className: 'trx-stock__photo' },
        createProductPhoto(product, 'md', {
          onZoom: () => {
            zoom(product);
          },
        }),
      ),
      el(
        'div',
        { className: 'trx-stock__stocks' },
        stockBadge(product, 'display'),
        stockBadge(product, 'besar'),
      ),
      el(
        'div',
        { className: 'trx-stock__prices' },
        el('p', { className: 'trx-stock__prices-title', text: label('stkHargaJual') }),
        priceTable(product),
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
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
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
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80
    ) {
      const rows = filtered();
      if (rows.length > shown) {
        shown += PAGE_SIZE;
        paint();
      }
    }
  };
  const scroller = document.getElementById('own-main');
  scroller?.addEventListener('scroll', onScroll, { passive: true });

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const element = el('div', { className: 'own-stack' }, search, hint, chips, list, more, stamp);
  renderChips();
  paint();
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
}
