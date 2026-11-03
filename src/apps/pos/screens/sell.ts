import { el } from '../../../shared/dom';
import { formatDecimal, formatDocumentNumber, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { canOpenScreen, isAllowed } from '../../../shared/permissions';
import { createSearchIndex, type SearchIndex } from '../../../shared/data/search-index';
import type { Customer, HeldBill, Product, Role } from '../../../shared/data/types';
import { fromBase, unitPrice } from '../../../shared/data/units';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import { billTotal, defaultUnitOf, itemCount, lineSubtotal } from '../domain/bill';
import { isShort } from '../domain/stock';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { billReceipt, openReceiptPreview } from './receipt-preview';
import { openUnitModal } from './unit-modal';

const RESULT_LIMIT = 60;
const LONG_PRESS_MS = 500;

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

export function renderSell(session: PosSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const products = store.getState().data.products.filter((product) => product.active !== false);
  const index = indexFor(products);
  const topbar = createTopbar(session, 'judulJual');
  let query = '';
  let category = '';
  let customers = false;
  let customerQuery = '';

  const searchInput = el('input', {
    className: 'input pos-search__input',
    attrs: {
      id: 'pos-search',
      type: 'search',
      autocomplete: 'off',
      'aria-label': label('cari'),
      placeholder: label('cariPlaceholder'),
    },
  });
  const searchError = el('p', { className: 'pos-search__error', attrs: { role: 'alert' } });
  const grid = el('div', { className: 'pos-grid' });
  const note = el('p', { className: 't-label pos-note' });
  const chips = el('div', {
    className: 'pos-categories',
    attrs: { role: 'group', 'aria-label': label('kategoriHarga') },
  });
  const bill = el('section', { className: 'pos-bill-panel' });
  const banner = el('div', { className: 'pos-banner' });

  const role = (): Role => store.getState().role;
  const refocus = (): void => {
    if (document.querySelector('.modal-overlay') === null) {
      searchInput.focus();
    }
  };
  const fail = (text: string): void => {
    showToast({ kind: 'error', text });
  };

  const addProduct = (product: Product): void => {
    const result = session.addProduct(product);
    if (!result.ok) {
      fail(message('MSG-027'));
    }
    refocus();
  };

  const createCard = (product: Product): HTMLButtonElement => {
    const unit = defaultUnitOf(product);
    const tier = session.customer()?.tier ?? 'eceran';
    const stock = (value: number): string =>
      formatDecimal(fromBase(product, unit.code, value), 1, 0);
    const card = el(
      'button',
      { className: 'pos-card', attrs: { type: 'button' } },
      el('span', { className: 'pos-photo', text: label('fotoProduk') }),
      el('span', { className: 'pos-card__name', text: product.name }),
      el('span', {
        className: 'pos-card__price t-value',
        text: label('hargaPerSatuan', {
          harga: formatRupiah(unitPrice(product, unit.code, tier)),
          satuan: unit.code,
        }),
      }),
      el('span', {
        className: 'pos-card__stock t-label',
        text: label('stokKartu', {
          toko: stock(product.stock.display),
          gudang: stock(product.stock.besar),
        }),
      }),
    );
    let timer: number | undefined;
    let pressed = false;
    card.addEventListener('pointerdown', () => {
      pressed = false;
      timer = window.setTimeout(() => {
        pressed = true;
        openUnitModal({ session, product, onDone: refocus });
      }, LONG_PRESS_MS);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      card.addEventListener(type, () => {
        window.clearTimeout(timer);
      });
    }
    card.addEventListener('click', () => {
      if (pressed) {
        pressed = false;
        return;
      }
      addProduct(product);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        openUnitModal({ session, product, onDone: refocus });
      }
    });
    return card;
  };

  const renderGrid = (): void => {
    const hits =
      query.trim().length >= 2
        ? index.search(query, products.length)
        : { hits: products, total: products.length };
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

  const renderChips = (): void => {
    const names = ['', ...new Set(products.map((product) => product.category))];
    chips.replaceChildren(
      ...names.map((name) => {
        const chip = createChip({
          text: name === '' ? label('semua') : name,
          selected: name === category,
          onToggle: () => {
            category = name;
            renderChips();
            renderGrid();
            refocus();
          },
        });
        return chip;
      }),
    );
  };

  const draftReceipt = (): void => {
    const lines = session.state().lines;
    if (lines.length === 0) {
      fail(message('MSG-025'));
      return;
    }
    const draft: HeldBill = {
      id: 'draft',
      number: formatDocumentNumber('B', session.state().heldBills.length + 1),
      createdAt: session.now().toISOString(),
      userId: store.getState().userId,
      customerId: session.state().customerId,
      lines,
    };
    openReceiptPreview({
      session,
      kind: 'draft',
      reference: draft.number,
      build: (width) => billReceipt(session, draft, width),
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
  const showCustomers = (): void => {
    customers = true;
    customerQuery = '';
    renderBill();
  };

  const withHint = (button: HTMLButtonElement, hint: 'pintasanBayar' | 'pintasanTahan'): void => {
    if (isPc()) {
      button.append(
        el('kbd', { className: 'pos-kbd', text: label(hint), attrs: { 'aria-hidden': 'true' } }),
      );
    }
  };

  const renderCustomerPanel = (): void => {
    const input = el('input', {
      className: 'input',
      attrs: {
        type: 'search',
        'aria-label': label('cariPelanggan'),
        placeholder: label('cariPelanggan'),
      },
    });
    input.value = customerQuery;
    const list = el('div', { className: 'pos-customers__list' });
    const entries = (): (Customer | undefined)[] => {
      const all = store.getState().data.customers;
      const needle = customerQuery.trim().toLowerCase();
      return [undefined, ...all.filter((item) => item.name.toLowerCase().includes(needle))];
    };
    const fill = (): void => {
      list.replaceChildren(
        el(
          'div',
          { className: 'pos-customers__head t-label' },
          el('span', { text: label('kolomNama') }),
          el('span', { text: label('kolomKategori') }),
          el('span', { text: label('kolomSisaLimit') }),
        ),
        ...entries().map((item) => {
          const button = el(
            'button',
            { className: 'pos-customers__row', attrs: { type: 'button' } },
            el('span', { text: item === undefined ? label('pelangganUmum') : item.name }),
            el('span', { text: label(tierKey(item?.tier ?? 'eceran')) }),
            el('span', {
              text: item === undefined ? '' : formatRupiah(Math.max(0, remaining(item))),
            }),
          );
          button.addEventListener('click', () => {
            session.setCustomer(item?.id);
            customers = false;
            renderBill();
            renderGrid();
            refocus();
          });
          return button;
        }),
      );
    };
    input.addEventListener('input', () => {
      customerQuery = input.value;
      fill();
    });
    bill.replaceChildren(
      el('h2', { className: 't-section-title', text: label('pilihPelanggan') }),
      input,
      list,
      createButton({
        text: label('pelangganBaru'),
        variant: 'secondary',
        onClick: () => {
          go('/pos/pelanggan-baru');
        },
      }),
      createButton({
        text: label('kembali'),
        variant: 'secondary',
        onClick: () => {
          customers = false;
          renderBill();
          refocus();
        },
      }),
    );
    fill();
    input.focus();
  };

  const renderBill = (): void => {
    if (customers) {
      renderCustomerPanel();
      return;
    }
    const state = session.state();
    const current = session.customer();
    const frontliner = role() === 'frontliner';
    const customerRow = el(
      'div',
      { className: 'pos-customer' },
      el('span', {
        text: label('pelangganTerpilih', {
          nama: current === undefined ? label('pelangganUmum') : current.name,
          tier: label(tierKey(current?.tier ?? 'eceran')),
        }),
      }),
      createButton({ text: label('ganti'), variant: 'secondary', onClick: showCustomers }),
    );
    const body = el('tbody');
    if (state.lines.length === 0) {
      body.append(
        el(
          'tr',
          {},
          el('td', {
            className: 'pos-bill__empty',
            text: message('MSG-007'),
            attrs: { colspan: '4' },
          }),
        ),
      );
    }
    state.lines.forEach((line, position) => {
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
          openUnitModal({ session, product, lineIndex: position, onDone: refocus });
        }
      });
      body.append(
        el(
          'tr',
          {},
          el('td', {}, open),
          el('td', { className: 'is-end', text: formatDecimal(line.quantity, 3, 0) }),
          el('td', { text: line.unit }),
          el('td', { className: 'is-end', text: formatRupiah(lineSubtotal(line)) }),
        ),
      );
    });
    const holdButton = createButton({
      text: label('tahanBill'),
      variant: 'secondary',
      icon: 'pause',
      onClick: hold,
    });
    withHint(holdButton, 'pintasanTahan');
    const actions = el(
      'div',
      { className: 'pos-actions' },
      holdButton,
      createButton({ text: label('panggilBill'), variant: 'secondary', onClick: recall }),
    );
    if (frontliner) {
      actions.append(
        createButton({
          text: label('cetakStrukDraf'),
          variant: 'secondary',
          icon: 'printer',
          onClick: draftReceipt,
        }),
      );
    }
    actions.append(
      createButton({ text: label('pelanggan'), variant: 'secondary', onClick: showCustomers }),
    );
    const children: (HTMLElement | false)[] = [
      customerRow,
      el(
        'div',
        { className: 'pos-bill__scroll' },
        el(
          'table',
          { className: 'pos-bill' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { text: label('kolomBarang') }),
              el('th', { className: 'is-end', text: label('kolomJumlahPendek') }),
              el('th', { text: label('kolomSatuan') }),
              el('th', { className: 'is-end', text: label('kolomSubtotal') }),
            ),
          ),
          body,
        ),
      ),
      el(
        'div',
        { className: 'pos-totals' },
        el('p', {
          className: 't-label',
          text: `${label('jumlahItem')}: ${String(itemCount(state.lines))}`,
        }),
        el(
          'p',
          { className: 'pos-totals__row' },
          el('span', { className: 't-section-title', text: label('totalHuruf') }),
          el('output', {
            className: 't-total pos-totals__value',
            text: formatRupiah(billTotal(state.lines)),
          }),
        ),
      ),
      actions,
    ];
    if (!frontliner && isAllowed(role(), 'POS-02', 'Bayar')) {
      const payButton = createButton({
        text: label('bayar'),
        icon: 'banknote',
        pay: true,
        onClick: pay,
      });
      payButton.toggleAttribute('data-inactive', state.lines.length === 0);
      withHint(payButton, 'pintasanBayar');
      children.push(payButton);
    }
    bill.replaceChildren(...children.filter((child): child is HTMLElement => child !== false));
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
            fail(message(result.messageId));
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

  const onKey = (event: KeyboardEvent): void => {
    if (!isPc() || document.querySelector('.modal-overlay') !== null) {
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
      F9: showCustomers,
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

  const unsubscribers = [
    session.subscribe(() => {
      renderBill();
      renderBanner();
      if (!customers) {
        renderGrid();
      }
    }),
    store.subscribe(() => {
      renderBill();
      renderBanner();
    }),
  ];

  const form = el(
    'form',
    { className: 'pos-search', attrs: { role: 'search' } },
    searchInput,
    createButton({ text: label('cari'), type: 'submit', variant: 'secondary', icon: 'search' }),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderGrid();
  });

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    banner,
    el(
      'main',
      { className: 'pos-sell' },
      el('section', { className: 'pos-catalog' }, form, searchError, chips, grid, note),
      bill,
    ),
  );
  renderChips();
  renderGrid();
  renderBill();
  renderBanner();
  window.setTimeout(refocus, 0);
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      for (const stop of unsubscribers) {
        stop();
      }
      topbar.destroy();
    },
  };
}

function tierKey(
  tier: 'eceran' | 'grosir' | 'kontraktor',
): 'tierEceran' | 'tierGrosir' | 'tierKontraktor' {
  return tier === 'eceran' ? 'tierEceran' : tier === 'grosir' ? 'tierGrosir' : 'tierKontraktor';
}

function remaining(customer: Customer): number {
  return (
    customer.limit -
    customer.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid), 0)
  );
}

export const SELL_SCREEN = 'POS-02';
export function canSell(role: Parameters<typeof canOpenScreen>[0]): boolean {
  return canOpenScreen(role, SELL_SCREEN);
}
