import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { canOpenScreen, isAllowed } from '../../../shared/permissions';
import { createSearchIndex, type SearchIndex } from '../../../shared/data/search-index';
import type { BillLine, Product, Role, UnitDef } from '../../../shared/data/types';
import { unitPrice } from '../../../shared/data/units';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createDropdown } from '../../../shared/ui/dropdown';
import { createEmptyState } from '../../../shared/ui/empty';
import { createIllustration } from '../../../shared/ui/illustration';
import { createMenuButton, type MenuItem } from '../../../shared/ui/menu';
import { showToast } from '../../../shared/ui/toast';
import { billTotal, lineSubtotal } from '../domain/bill';
import {
  categoriesOf,
  customerLabel,
  initialsOf,
  proposalFirst,
  stockLines,
  type StockKey,
} from '../domain/catalog-view';
import { isShort } from '../domain/stock';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';
import { createProductThumb } from '../thumb';
import { createTopbar } from '../topbar';
import { openCustomerPicker } from './customer-picker';
import type { ScreenHandle } from './login';
import { openDraftPreview } from './receipt-preview';
import { needsShift } from '../domain/shift';
import { guardWithShift } from './shift';
import { openUnitModal } from './unit-modal';

const RESULT_LIMIT = 60;
const LONG_PRESS_MS = 500;

const STOCK_LABELS = {
  toko: 'stokToko',
  gudang: 'stokGudang',
  po: 'stokPo',
} as const satisfies Record<StockKey, string>;

let cache: { readonly products: readonly Product[]; readonly index: SearchIndex } | undefined;

function indexFor(products: readonly Product[]): SearchIndex {
  if (cache?.products !== products) {
    cache = { products, index: createSearchIndex(products) };
  }
  return cache.index;
}

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function unitText(unit: UnitDef): string {
  return unit.factor === 1 ? unit.code : `${unit.code} (${formatDecimal(unit.factor, 3, 0)})`;
}

export function renderSell(session: PosSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const products = store.getState().data.products.filter((product) => product.active !== false);
  const ordered = proposalFirst(products);
  const index = indexFor(products);
  const topbar = createTopbar(session, 'judulPesananBaru');
  let query = '';
  let category = '';

  const searchInput = el('input', {
    className: 'input pos-search__input',
    attrs: {
      id: 'pos-search',
      type: 'search',
      autocomplete: 'off',
      'aria-label': label('cari'),
      placeholder: label('cariBarangPlaceholder'),
    },
  });
  const searchError = el('p', { className: 'pos-search__error', attrs: { role: 'alert' } });
  const grid = el('div', { className: 'pos-grid' });
  const note = el('p', { className: 't-label pos-note' });
  const orderId = nextId('pesanan');
  const order = el('section', { className: 'pos-bill-panel', attrs: { id: orderId } });
  const main = el('main', { className: 'pos-sell', attrs: { 'data-sheet': 'closed' } });
  const bar = el('button', {
    className: 'pos-order-bar',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': orderId },
  });
  const closeSheet = el(
    'button',
    {
      className: 'pos-order__close',
      attrs: { type: 'button', 'aria-label': label('tutupPesanan') },
    },
    icon('x'),
  );
  let sheetOpen = false;
  // Di bawah 900 px panel pesanan menjadi lembar bawah yang dibuka lewat bilah.
  const setSheet = (open: boolean): void => {
    sheetOpen = open;
    main.dataset['sheet'] = open ? 'open' : 'closed';
    bar.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      closeSheet.focus();
    } else {
      bar.focus();
    }
  };
  bar.addEventListener('click', () => {
    setSheet(!sheetOpen);
  });
  closeSheet.addEventListener('click', () => {
    setSheet(false);
  });
  main.addEventListener('click', (event) => {
    if (event.target === main && sheetOpen) {
      setSheet(false);
    }
  });
  const banner = el('div', { className: 'pos-banner' });
  const customerButton = el('button', {
    className: 'pos-customer-btn',
    attrs: { type: 'button' },
  });

  const role = (): Role => store.getState().role;
  const refocus = (): void => {
    if (document.querySelector('.modal-overlay') === null) {
      searchInput.focus();
    }
  };
  const fail = (text: string): void => {
    showToast({ kind: 'error', text });
  };

  const addProduct = (product: Product, unit?: string): void => {
    const result = session.addProduct(product, unit);
    if (!result.ok) {
      fail(message('MSG-027'));
    }
    refocus();
  };

  const createCard = (product: Product): HTMLElement => {
    const tier = session.customer()?.tier ?? 'eceran';
    const main = el(
      'button',
      { className: 'pos-card__main', attrs: { type: 'button' } },
      createProductThumb(product, 'md'),
      el('span', { className: 'pos-card__name', text: product.name }),
    );
    let timer: number | undefined;
    let pressed = false;
    main.addEventListener('pointerdown', () => {
      pressed = false;
      timer = window.setTimeout(() => {
        pressed = true;
        openUnitModal({ session, product, onDone: refocus });
      }, LONG_PRESS_MS);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      main.addEventListener(type, () => {
        window.clearTimeout(timer);
      });
    }
    main.addEventListener('click', () => {
      if (pressed) {
        pressed = false;
        return;
      }
      addProduct(product);
    });
    main.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        openUnitModal({ session, product, onDone: refocus });
      }
    });

    const prices = el(
      'div',
      { className: 'pos-card__prices', attrs: { role: 'group', 'aria-label': label('blokHarga') } },
      ...product.units.map((unit) => {
        const row = el(
          'button',
          { className: 'pos-card__price', attrs: { type: 'button' } },
          el('span', { className: 'pos-card__unit', text: unitText(unit) }),
          el('span', {
            className: 'pos-card__amount t-value',
            text: formatRupiah(unitPrice(product, unit.code, tier)),
          }),
        );
        row.addEventListener('click', () => {
          addProduct(product, unit.code);
        });
        return row;
      }),
    );
    const stock = el(
      'dl',
      { className: 'pos-card__stock', attrs: { 'aria-label': label('blokStok') } },
      ...stockLines(product).map((line) =>
        el(
          'div',
          { className: 'pos-card__stockrow' },
          el('dt', { text: label(STOCK_LABELS[line.key]) }),
          el('dd', {
            text:
              line.quantity === undefined
                ? '-'
                : `${formatDecimal(line.quantity, 1, 0)} ${line.unit}`,
          }),
        ),
      ),
    );
    return el(
      'article',
      { className: 'pos-card' },
      main,
      el('div', { className: 'pos-card__table' }, prices, stock),
    );
  };

  const renderGrid = (): void => {
    const hits =
      query.trim().length >= 2
        ? index.search(query, products.length)
        : { hits: ordered, total: ordered.length };
    const filtered = hits.hits.filter(
      (product) => category === '' || product.category === category,
    );
    const shown = filtered.slice(0, RESULT_LIMIT);
    grid.replaceChildren(
      ...(shown.length === 0
        ? [createEmptyState({ icon: 'search', title: message('MSG-006') })]
        : shown.map(createCard)),
    );
    note.textContent = filtered.length > RESULT_LIMIT ? label('hasilDibatasi') : '';
  };

  const dropdown = createDropdown({
    labelText: label('kategoriBarang'),
    options: [
      { value: '', text: label('semuaKategori') },
      ...categoriesOf(products).map((name) => ({ value: name, text: name })),
    ],
    value: category,
    onChange: (value) => {
      category = value;
      renderGrid();
      refocus();
    },
  });

  const draftReceipt = (): void => {
    const lines = session.state().lines;
    if (lines.length === 0) {
      fail(message('MSG-025'));
      return;
    }
    openDraftPreview(session);
  };

  const hold = (): void => {
    const held = session.holdBill();
    if (held === undefined) {
      fail(message('MSG-025'));
    } else {
      showToast({ kind: 'success', text: message('MSG-008', { nomor: held.number }) });
    }
    refocus();
  };
  const pay = (): void => {
    if (needsShift(role(), session.state().shift)) {
      return;
    }
    if (session.state().lines.length === 0) {
      fail(message('MSG-025'));
      return;
    }
    go('/pos/bayar');
  };
  const recall = (): void => {
    if (session.state().lines.length > 0) {
      fail(message('MSG-028'));
      return;
    }
    go('/pos/bill');
  };

  const renderCustomerButton = (): void => {
    const current = session.customer();
    customerButton.replaceChildren(
      el(
        'span',
        { className: 'pos-customer-btn__avatar', attrs: { 'aria-hidden': 'true' } },
        current === undefined ? icon('user-round') : initialsOf(current.name),
      ),
      el('span', { className: 'pos-customer-btn__text', text: customerLabel(current) }),
    );
  };

  const orderQuantity = (line: BillLine): HTMLElement => {
    const price = formatRupiah(line.unitPrice).replace('Rp ', '');
    const quantityText = formatDecimal(line.quantity, 3, 0);
    if (line.listPrice === undefined && line.discount === undefined) {
      return el('span', {
        className: 'pos-order__qty',
        text: label('qtyBaris', { jumlah: quantityText, harga: price }),
      });
    }
    const discount = line.discount;
    return el(
      'span',
      { className: 'pos-order__qty' },
      document.createTextNode(`${label('qtyBarisAwal', { jumlah: quantityText })} `),
      line.listPrice === undefined
        ? false
        : el('s', {
            className: 'pos-order__list',
            text: formatRupiah(line.listPrice).replace('Rp ', ''),
          }),
      line.listPrice === undefined ? false : document.createTextNode(' '),
      document.createTextNode(price),
      discount === undefined
        ? false
        : el('span', {
            className: 'pos-order__flag',
            text: ` ${
              discount.kind === 'persen'
                ? label('diskonTandaPersen', { nilai: discount.value })
                : label('diskonTandaNominal', { nilai: formatRupiah(discount.value) })
            }`,
          }),
    );
  };

  const renderOrder = (): void => {
    const state = session.state();
    const frontliner = role() === 'frontliner';
    const total = billTotal(state.lines);
    const items = state.lines.map((line, position) => {
      const product = session.product(line.productId);
      const short = product !== undefined && isShort(state.lines, product, 0);
      const open = el(
        'button',
        { className: 'pos-bill__name', attrs: { type: 'button' } },
        el('span', { text: product?.name ?? line.productId }),
        short &&
          el(
            'span',
            { className: 'pos-short' },
            icon('triangle-alert'),
            el('span', { text: label('stokKurang') }),
          ),
      );
      open.addEventListener('click', () => {
        if (product !== undefined) {
          void import('./line-detail').then(({ openLineDetail }) => {
            openLineDetail({ session, product, lineIndex: position, onDone: refocus });
          });
        }
      });
      return el(
        'li',
        { className: 'pos-order__item' },
        open,
        orderQuantity(line),
        el('span', { className: 'pos-order__unit t-label', text: line.unit }),
        el('output', { className: 'pos-order__amount', text: formatRupiah(lineSubtotal(line)) }),
      );
    });

    const menuItems: MenuItem[] = [
      { text: label('tahanBill'), icon: 'pause', onSelect: hold },
      { text: label('panggilBill'), icon: 'clipboard-list', onSelect: recall },
    ];
    if (frontliner) {
      menuItems.push({ text: label('cetakStrukDraf'), icon: 'printer', onSelect: draftReceipt });
    }
    const footer = el('div', { className: 'pos-order__footer' });
    if (!frontliner && isAllowed(role(), 'POS-02', 'Bayar')) {
      const payButton = createButton({
        text: label('bayarJumlah', { jumlah: formatRupiah(total) }),
        icon: 'banknote',
        pay: true,
        onClick: pay,
      });
      payButton.toggleAttribute('data-inactive', state.lines.length === 0);
      if (isPc()) {
        payButton.append(
          el('kbd', {
            className: 'pos-kbd',
            text: label('pintasanBayar'),
            attrs: { 'aria-hidden': 'true' },
          }),
        );
      }
      footer.append(payButton);
    }
    footer.append(createMenuButton({ labelText: label('opsiPesanan'), items: menuItems }));

    bar.replaceChildren(
      icon('shopping-cart'),
      el('span', { text: label('pesananJumlah', { jumlah: state.lines.length }) }),
      el('strong', { className: 'pos-order-bar__total', text: formatRupiah(total) }),
    );
    order.replaceChildren(
      closeSheet,
      el('h2', {
        className: 'pos-order__title t-section-title',
        text: label('pesananJumlah', { jumlah: state.lines.length }),
      }),
      items.length === 0
        ? el(
            'div',
            { className: 'pos-order__empty' },
            createIllustration('keranjang'),
            el('p', { text: label('belumAdaBarangDipilih') }),
          )
        : el(
            'ul',
            { className: 'pos-order', attrs: { 'aria-label': label('daftarBarang') } },
            ...items,
          ),
      el(
        'p',
        { className: 'pos-order__subtotal' },
        el('span', { className: 't-section-title', text: label('kolomSubtotal') }),
        el('output', { className: 't-total pos-totals__value', text: formatRupiah(total) }),
      ),
      footer,
    );
  };

  const renderBanner = (): void => {
    const online = store.getState().online;
    const children: HTMLElement[] = [];
    if (!online) {
      children.push(
        createBanner('offline', message('MSG-004', { antrean: session.pendingQueue() })),
      );
    }
    if (session.state().printPending !== undefined) {
      const retry = createButton({
        text: label('cetakUlang'),
        variant: 'secondary',
        icon: 'printer',
        onClick: () => {
          const result = session.retryPrint();
          if (result.ok) {
            showToast({ kind: 'success', text: label('strukTercetak') });
          } else {
            fail(failureText(result));
          }
        },
      });
      children.push(
        el(
          'div',
          { className: 'pos-print-banner' },
          createBanner('danger', message('MSG-018')),
          retry,
        ),
      );
    }
    banner.replaceChildren(...children);
  };

  const pickCustomer = (): void => {
    openCustomerPicker(
      session,
      () => {
        renderCustomerButton();
        renderOrder();
        renderGrid();
        refocus();
      },
      go,
    );
  };

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape' && sheetOpen) {
      event.preventDefault();
      setSheet(false);
      return;
    }
    if (!isPc()) {
      return;
    }
    const actions: Readonly<Record<string, () => void>> = {
      F2: refocus,
      F4: () => {
        if (role() !== 'frontliner') {
          pay();
        }
      },
      F6: hold,
      F9: pickCustomer,
    };
    const action = actions[event.key];
    if (action !== undefined) {
      event.preventDefault();
      action();
    }
  };
  document.addEventListener('keydown', onKey);

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    searchError.textContent = '';
    renderGrid();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const text = searchInput.value.trim();
    const found = index.search(text, 2);
    if (found.total === 1 && found.hits[0] !== undefined) {
      addProduct(found.hits[0]);
      searchInput.value = '';
      query = '';
      searchError.textContent = '';
      renderGrid();
    } else if (found.total === 0 && /^\d{8,}$/.test(text)) {
      searchError.textContent = message('MSG-026', { barcode: text });
    }
  });
  searchInput.addEventListener('blur', (event) => {
    if (event.relatedTarget === null) {
      refocus();
    }
  });
  customerButton.addEventListener('click', pickCustomer);

  const unsubscribers = [
    session.subscribe(() => {
      renderCustomerButton();
      renderOrder();
      renderBanner();
      renderGrid();
    }),
    store.subscribe(() => {
      renderOrder();
      renderBanner();
    }),
  ];

  const form = el(
    'form',
    { className: 'pos-search', attrs: { role: 'search' } },
    icon('search'),
    searchInput,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderGrid();
  });
  const scan = el(
    'button',
    { className: 'pos-scan', attrs: { type: 'button', 'aria-label': label('pindai') } },
    icon('scan-barcode'),
  );
  scan.addEventListener('click', () => {
    searchInput.focus();
    note.textContent = label('petunjukPindai');
  });

  main.append(
    el(
      'section',
      { className: 'pos-catalog' },
      el('div', { className: 'pos-toolbar' }, dropdown.element, form, scan, customerButton),
      searchError,
      grid,
      note,
    ),
    order,
    bar,
  );
  const element = el('div', { className: 'pos' }, topbar.element, banner, main);
  const unguard = guardWithShift(session, element);
  renderCustomerButton();
  renderGrid();
  renderOrder();
  renderBanner();
  window.setTimeout(refocus, 0);
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      for (const stop of unsubscribers) {
        stop();
      }
      unguard();
      topbar.destroy();
    },
  };
}

export const SELL_SCREEN = 'POS-02';
export function canSell(role: Parameters<typeof canOpenScreen>[0]): boolean {
  return canOpenScreen(role, SELL_SCREEN);
}
