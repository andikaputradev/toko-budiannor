import { el, nextId } from '../../../shared/dom';
import { isPromoLine } from '../../../shared/domain/promo';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { accessFor, canOpenScreen, isAllowed } from '../../../shared/permissions';
import { createSearchIndex, type SearchIndex } from '../../../shared/data/search-index';
import type { BillLine, Product, Role, UnitDef } from '../../../shared/data/types';
import { unitPrice } from '../../../shared/data/units';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createDropdown } from '../../../shared/ui/dropdown';
import { createEmptyState } from '../../../shared/ui/empty';
import { createIllustration } from '../../../shared/ui/illustration';
import { createMenuButton, type MenuItem } from '../../../shared/ui/menu';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { lineSubtotal } from '../domain/bill';
import {
  categoriesOf,
  clipName,
  customerLabel,
  initialsOf,
  isPromo,
  proposalFirst,
  rackOf,
  stockLines,
  type StockKey,
} from '../domain/catalog-view';
import { isOutOfStock, isShort } from '../domain/stock';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';
import { createProductThumb } from '../thumb';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { needsShift } from '../domain/shift';
import { loadCatalogView } from '../settings';
import { guardWithShift } from './shift';
import { discountTag } from './line-price';

const RESULT_LIMIT = 60;
const LONG_PRESS_MS = 500;

const STOCK_LABELS = {
  toko: 'stokToko',
  gudang: 'stokGudang',
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
  const grid = el('div', {
    className: loadCatalogView() === 'daftar' ? 'pos-grid pos-grid--daftar' : 'pos-grid',
  });
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
  // Di bawah 900 px panel pesanan menjadi lembar yang tertutup; tombol pelanggan ringkas di bilah alat
  // tetap menjangkau pemilih pelanggan (CSS menyembunyikannya pada layar lebar).
  const customerCompact = el('button', {
    className: 'pos-customer-compact',
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

  // Hanya stok toko yang boleh dijual: stok kosong atau jumlah melebihi stok memunculkan peringatan
  // dan barang tidak masuk keranjang.
  const addProduct = (product: Product, unit?: string): void => {
    const result = session.addProduct(product, unit);
    if (!result.ok) {
      if (result.reason === 'max-lines') {
        fail(message('MSG-027'));
      } else if (result.reason === 'out-of-stock') {
        fail(label('stokBarangKosong', { nama: product.name }));
      } else {
        fail(
          label('stokTokoTerbatas', {
            nama: product.name,
            jumlah: `${formatDecimal(result.available, 3, 0)} ${product.baseUnit}`,
          }),
        );
      }
    }
    refocus();
  };

  const openUnits = (product: Product): void => {
    if (isOutOfStock(product)) {
      fail(label('stokBarangKosong', { nama: product.name }));
      return;
    }
    void import('./unit-modal').then(({ openUnitModal }) => {
      openUnitModal({ session, product, onDone: refocus });
    });
  };

  const createCard = (product: Product): HTMLElement => {
    const tier = session.customer()?.tier ?? 'eceran';
    const empty = isOutOfStock(product);
    const soldOutId = nextId('stok-kosong');
    // Daftar harga ada di dalam tombol kartu, jadi tanpa role atau label sendiri (tidak dibaca di sana).
    const prices = el(
      'span',
      { className: 'pos-card__prices' },
      ...product.units.map((unit) =>
        el(
          'span',
          { className: 'pos-card__price', attrs: { 'data-unit': unit.code } },
          el('span', { className: 'pos-card__unit', text: unitText(unit) }),
          el('span', {
            className: 'pos-card__amount t-value',
            text: formatRupiah(unitPrice(product, unit.code, tier)),
          }),
        ),
      ),
    );
    const main = el(
      'button',
      {
        className: 'pos-card__main',
        attrs: {
          type: 'button',
          'aria-disabled': empty ? 'true' : false,
          'aria-describedby': empty ? soldOutId : false,
        },
      },
      isPromo(product)
        ? el('span', { className: 'pos-card__promo', text: label('promoTanda') })
        : false,
      createProductThumb(product, 'md'),
      el(
        'span',
        { className: 'pos-card__head' },
        el('span', {
          className: 'pos-card__name',
          text: clipName(product.name),
          attrs: { title: product.name },
        }),
        el('span', { className: 'pos-card__code t-label', text: product.code }),
      ),
      prices,
    );
    let timer: number | undefined;
    let pressed = false;
    main.addEventListener('pointerdown', () => {
      pressed = false;
      timer = window.setTimeout(() => {
        pressed = true;
        openUnits(product);
      }, LONG_PRESS_MS);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      main.addEventListener(type, () => {
        window.clearTimeout(timer);
      });
    }
    // Ketukan pada baris harga menambah satuan itu; ketukan di bagian lain menambah satuan bawaan.
    main.addEventListener('click', (event) => {
      if (pressed) {
        pressed = false;
        return;
      }
      const row = event.target instanceof Element ? event.target.closest('[data-unit]') : null;
      addProduct(product, row?.getAttribute('data-unit') ?? undefined);
    });
    main.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        openUnits(product);
      }
    });

    const stockRows = stockLines(product).map((line) =>
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
    );
    const stock = el(
      'dl',
      { className: 'pos-card__stock', attrs: { 'aria-label': label('blokStok') } },
      ...stockRows,
      el(
        'div',
        { className: 'pos-card__stockrow' },
        el('dt', { text: label('stokNoRak') }),
        el('dd', { text: rackOf(product) }),
      ),
    );
    return el(
      'article',
      { className: empty ? 'pos-card pos-card--empty' : 'pos-card' },
      main,
      empty
        ? el('span', {
            className: 'pos-card__soldout',
            text: label('stokKosongTanda'),
            attrs: { id: soldOutId },
          })
        : false,
      stock,
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
    void import('./receipt-preview').then(({ openDraftPreview }) => {
      openDraftPreview(session);
    });
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
  const openDiscount = (): void => {
    if (session.state().lines.length === 0) {
      fail(message('MSG-025'));
      return;
    }
    const open = (authorized: boolean): void => {
      void import('./bill-discount').then(({ openBillDiscount }) => {
        openBillDiscount({ session, authorized, onDone: refocus });
      });
    };
    if (accessFor(role(), 'POS-03', 'Diskon') === 'otorisasi') {
      void import('./authorize').then(({ openAuthorizeModal }) => {
        openAuthorizeModal({
          session,
          purpose: 'harga',
          subject: label('menuDiskonTransaksi'),
          onApproved: () => {
            open(true);
          },
        });
      });
      return;
    }
    open(false);
  };

  // Mulai Pesanan Baru menghapus seluruh keranjang; konfirmasi lebih dulu karena tidak tersimpan.
  const startNew = (): void => {
    openModal({
      title: label('pesananBaruJudul'),
      body: label('pesananBaruIsi'),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('pesananBaruLanjut'),
          variant: 'danger',
          onClick: () => {
            session.startNewOrder();
            showToast({ kind: 'success', text: label('pesananBaruDimulai') });
          },
        },
      ],
    });
  };

  const renderCustomerButton = (): void => {
    const current = session.customer();
    for (const button of [customerButton, customerCompact]) {
      button.replaceChildren(
        el(
          'span',
          { className: 'pos-customer-btn__avatar', attrs: { 'aria-hidden': 'true' } },
          current === undefined ? icon('user-round') : initialsOf(current.name),
        ),
        el('span', { className: 'pos-customer-btn__text', text: customerLabel(current) }),
      );
    }
  };

  const orderQuantity = (line: BillLine): HTMLElement => {
    const tag = discountTag(line);
    return el(
      'span',
      { className: 'pos-order__qty' },
      document.createTextNode(
        label('qtyBaris', {
          jumlah: formatDecimal(line.quantity, 3, 0),
          harga: formatRupiah(line.unitPrice).replace('Rp ', ''),
        }),
      ),
      tag === undefined ? false : el('span', { className: 'pos-order__flag', text: ` ${tag}` }),
    );
  };

  const renderOrder = (): void => {
    const state = session.state();
    const frontliner = role() === 'frontliner';
    const subtotal = session.subtotal();
    const discount = session.billDiscountAmount();
    const total = session.total();
    const items = state.lines.map((line, position) => {
      const product = session.product(line.productId);
      const short = product !== undefined && isShort(state.lines, product, 0);
      const fullName = product?.name ?? line.productId;
      const open = el(
        'button',
        { className: 'pos-bill__name', attrs: { type: 'button' } },
        el('span', {
          className: 'pos-bill__text',
          text: clipName(fullName),
          attrs: { title: fullName },
        }),
        product === undefined
          ? false
          : el('span', { className: 'pos-bill__code t-label', text: product.code }),
        product !== undefined &&
          isPromoLine(line, product) &&
          el('span', { className: 'pos-order__promo', text: label('promoTanda') }),
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

    // Tiga pilihan di titik tiga: Open Bill (sama dengan Tahan Bill), Diskon Transaksi, dan Mulai
    // Pesanan Baru. Frontliner tidak boleh memberi diskon dan memakai Cetak Struk Draf sebagai tambahan.
    const menuItems: MenuItem[] = [
      { text: label('menuOpenBill'), icon: 'clipboard-list', onSelect: hold },
    ];
    if (accessFor(role(), 'POS-03', 'Diskon') !== 'tidak') {
      menuItems.push({
        text: label('menuDiskonTransaksi'),
        icon: 'badge-percent',
        onSelect: openDiscount,
      });
    }
    menuItems.push({ text: label('menuPesananBaru'), icon: 'plus', onSelect: startNew });
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
    const summary =
      discount === 0
        ? [
            el(
              'p',
              { className: 'pos-order__subtotal' },
              el('span', { className: 't-section-title', text: label('kolomSubtotal') }),
              el('output', { className: 't-total pos-totals__value', text: formatRupiah(total) }),
            ),
          ]
        : [
            el(
              'p',
              { className: 'pos-order__line' },
              el('span', { text: label('kolomSubtotal') }),
              el('output', { text: formatRupiah(subtotal) }),
            ),
            el(
              'p',
              { className: 'pos-order__line pos-order__line--discount' },
              el('span', { text: label('diskonTransaksiBaris') }),
              el('output', { text: `-${formatRupiah(discount)}` }),
            ),
            el(
              'p',
              { className: 'pos-order__subtotal' },
              el('span', { className: 't-section-title', text: label('kolomTotal') }),
              el('output', { className: 't-total pos-totals__value', text: formatRupiah(total) }),
            ),
          ];
    order.replaceChildren(
      closeSheet,
      customerButton,
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
      ...summary,
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
    void import('./customer-picker').then(({ openCustomerPicker }) => {
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
    });
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
  customerCompact.addEventListener('click', pickCustomer);

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
    session.onNotice((text) => {
      showToast({ kind: 'info', text });
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
      el('div', { className: 'pos-toolbar' }, dropdown.element, form, scan, customerCompact),
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
