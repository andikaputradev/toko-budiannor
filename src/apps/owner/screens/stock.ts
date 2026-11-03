import { el } from '../../../shared/dom';
import { formatDecimal, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { fromBase, totalStock } from '../../../shared/data/units';
import { matchesFilter, stockStatus, type WarehouseFilter } from '../../../shared/domain/stock';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import { PAGE_SIZE } from '../domain/constants';
import { preferredUnit } from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import { findProducts } from '../search';
import type { ScreenHandle } from '../screen';
import { openSheet } from '../sheet';

const DEBOUNCE_MS = 300;

const WAREHOUSES: readonly (readonly [WarehouseFilter, LabelKey])[] = [
  ['semua', 'semua'],
  ['display', 'gudangDisplay'],
  ['besar', 'gudangBesar'],
];

export function renderStock(session: OwnerSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  let warehouse: WarehouseFilter = 'semua';
  let below = false;
  let text = '';
  let shown = PAGE_SIZE;
  let timer: number | undefined;

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
        return 'messageId' in result
          ? message(result.messageId, result.values)
          : label(result.labelKey);
      },
    });
  };

  const card = (product: Product): HTMLElement => {
    const status = stockStatus(product, 'semua');
    const badge =
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
          );
    const mutate = createButton({
      text: label('buatMutasi'),
      variant: 'secondary',
      icon: 'arrow-left-right',
      onClick: () => {
        openMutation(product);
      },
    });
    mutate.setAttribute('aria-label', `${label('buatMutasi')} ${product.name}`);
    const order = createButton({
      text: label('buatPo'),
      variant: 'secondary',
      icon: 'clipboard-list',
      onClick: () => {
        go(`/owner/transaksi?tab=po&barang=${encodeURIComponent(product.code)}`);
      },
    });
    order.setAttribute('aria-label', `${label('buatPo')} ${product.name}`);
    return el(
      'article',
      { className: 'own-card own-card--stock' },
      el('h2', { className: 'own-card__name', text: product.name }),
      el('p', { className: 't-label', text: `${product.code} · ${product.baseUnit}` }),
      el(
        'p',
        { className: 'own-stock-line' },
        el('span', {
          text: label('stokBarisDisplay', { nilai: formatDecimal(product.stock.display, 3, 1) }),
        }),
        el('span', {
          text: label('stokBarisBesar', { nilai: formatDecimal(product.stock.besar, 3, 1) }),
        }),
        el('strong', {
          text: label('stokBarisTotal', { nilai: formatDecimal(totalStock(product), 3, 1) }),
        }),
      ),
      badge,
      el('div', { className: 'own-actions' }, mutate, order),
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
