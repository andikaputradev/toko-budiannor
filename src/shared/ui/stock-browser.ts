import '../../styles/mobile-stock.css';
import type { Product, WarehouseId } from '../data/types';
import { el } from '../dom';
import { formatDecimal, formatRupiah } from '../format';
import { icon } from '../icons';
import { label, message } from '../messages';
import { mt } from '../mobile-text';
import {
  browseProducts,
  costView,
  distinct,
  EMPTY_FILTER,
  priceRows,
  stockFlag,
  type BrowseFilter,
} from '../domain/stock-browse';
import type { WarehouseFilter } from '../domain/stock';
import type { Store } from '../store/store';
import { openBarcodeScan } from './barcode-scan';
import { createButton } from './button';
import { createEmptyState } from './empty';
import { openPhotoViewer } from './image-viewer';
import { createProductPhoto } from './product-photo';
import { findProducts } from './product-picker';

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 30;

export interface StockBrowserOptions {
  readonly store: Store;
  /** Owner melihat Harga Beli terakhir dan Hpp Avg; Sales tidak (hanya stok dan harga jual). */
  readonly showCost: boolean;
  /** Dibuka dari tautan Dashboard "Stok Minim": daftar dibatasi ke barang di bawah minimum. */
  readonly belowMinimum?: boolean | undefined;
  /** Ketuk nama barang membuka lembar detail. */
  readonly onOpen?: ((product: Product) => void) | undefined;
  /** Waktu muat data terakhir untuk teks "Diperbarui" (Owner). */
  readonly loadedAt?: (() => string) | undefined;
  /** Memasang pendengar tambahan (mis. sesi) yang menggambar ulang daftar; mengembalikan pelepasnya. */
  readonly subscribe?: ((paint: () => void) => () => void) | undefined;
}

export interface StockBrowser {
  readonly element: HTMLElement;
  destroy(): void;
}

const WAREHOUSES: readonly (readonly [WarehouseFilter, () => string])[] = [
  ['semua', () => mt('stbSemuaGudang')],
  ['display', () => label('stkChipToko')],
  ['besar', () => label('stkChipGudang')],
];

function stockItem(product: Product, warehouse: WarehouseId): HTMLElement {
  const flag = stockFlag(product, warehouse);
  const value = `${formatDecimal(product.stock[warehouse], 3, 0)} ${product.baseUnit}`;
  return el('span', {
    className: `stk-stock__item stk-stock__item--${flag}`,
    text: mt(warehouse === 'display' ? 'stbStokToko' : 'stbStokGudang', { nilai: value }),
  });
}

// Tabel harga kartu: Satuan, Harga Eceran, Harga Grosir; tiga baris tetap agar semua kartu sama tinggi.
function priceTable(product: Product): HTMLElement {
  return el(
    'table',
    { className: 'stk-prices' },
    el('caption', { className: 'visually-hidden', text: label('hargaBertingkat') }),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: label('kolomSatuanJual'), attrs: { scope: 'col' } }),
        el(
          'th',
          { attrs: { scope: 'col' } },
          el('span', { className: 'stk-prices__head', text: mt('stbHargaEceran') }),
        ),
        el(
          'th',
          { attrs: { scope: 'col' } },
          el('span', { className: 'stk-prices__head', text: mt('stbHargaGrosir') }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...priceRows(product).map((row) =>
        row.prices === undefined
          ? el(
              'tr',
              { className: 'stk-prices__blank' },
              el('td', { text: '-', attrs: { 'aria-hidden': 'true' } }),
              el('td', { text: '-', attrs: { 'aria-hidden': 'true' } }),
              el('td', { text: '-', attrs: { 'aria-hidden': 'true' } }),
            )
          : el(
              'tr',
              {},
              el('th', { text: row.unit, attrs: { scope: 'row' } }),
              el('td', { text: formatRupiah(row.prices.eceran) }),
              el('td', { text: formatRupiah(row.prices.grosir) }),
            ),
      ),
    ),
  );
}

function costLine(product: Product): HTMLElement {
  const cost = costView(product);
  return el(
    'div',
    { className: 'stk-cost' },
    el(
      'p',
      { className: 'stk-cost__item' },
      el('span', {
        className: 'stk-cost__label',
        text: mt('stbHargaBeli', { tanggal: cost.lastDate }),
      }),
      el('strong', {
        text: cost.lastPrice === undefined ? '-' : formatRupiah(cost.lastPrice),
      }),
    ),
    el(
      'p',
      { className: 'stk-cost__item' },
      el('span', { className: 'stk-cost__label', text: mt('stbHppAvg') }),
      el('strong', { text: formatRupiah(cost.average) }),
    ),
  );
}

// Layar Stok Barang (Owner) dan Katalog (Sales): kolom cari dengan tombol pindai dan filter Gudang,
// Kategori, Merk yang menempel di atas; kartu barang dengan harga, stok hijau atau merah, dan foto.
export function createStockBrowser(options: StockBrowserOptions): StockBrowser {
  const { store } = options;
  const pageSize = PAGE_SIZE;
  let filter: BrowseFilter = { ...EMPTY_FILTER, belowMinimum: options.belowMinimum === true };
  let shown = pageSize;
  let timer: number | undefined;

  const products = (): readonly Product[] => store.getState().data.products;

  const search = el('input', {
    className: 'input stk-search__input',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      enterkeyhint: 'search',
      'aria-label': label('cari'),
      placeholder: label('stkCariPlaceholder'),
    },
  });
  const scan = el(
    'button',
    {
      className: 'stk-scan',
      attrs: { type: 'button', 'aria-label': mt('stbPindai') },
    },
    icon('scan-barcode'),
  );
  const filterSelect = (
    name: string,
    entries: readonly (readonly [string, string])[],
    value: string,
    onChange: (next: string) => void,
  ): HTMLElement => {
    const select = el(
      'select',
      { className: 'stk-filter__control', attrs: { 'aria-label': name } },
      ...entries.map(([key, text]) => el('option', { text, attrs: { value: key } })),
    );
    select.value = value;
    // Teks yang terlihat boleh dua baris ("Semua" lalu "Gudang") agar kata utuh muat di HP 360 px;
    // kotak pilihan asli berada di atasnya (transparan) sehingga daftar pilihannya tetap bawaan HP.
    const text = el('span', { className: 'stk-filter__text', attrs: { 'aria-hidden': 'true' } });
    const root = el('div', { className: 'stk-filter' }, select, text, icon('chevron-down'));
    const paint = (): void => {
      text.textContent = select.options[select.selectedIndex]?.text ?? '';
      root.classList.toggle('is-active', select.value !== entries[0]?.[0]);
    };
    select.addEventListener('change', () => {
      paint();
      onChange(select.value);
    });
    paint();
    return root;
  };

  const filters = el('div', { className: 'stk-filters' });
  const below = el('div', { className: 'stk-below' });
  const hint = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const list = el('div', { className: 'stk-list' });
  const more = el('div', { className: 'own-more' });
  const stamp = el('p', { className: 't-label stk-stamp' });

  const filtered = (): Product[] => browseProducts(products(), filter, findProducts);

  const card = (product: Product): HTMLElement => {
    const name = el('span', { className: 'stk-card__name', text: product.name });
    const code = el('span', { className: 'stk-card__code', text: `[${product.code}]` });
    const onOpen = options.onOpen;
    let head: HTMLElement;
    if (onOpen === undefined) {
      head = el('h2', { className: 'stk-card__title' }, name, ' ', code);
    } else {
      const open = el(
        'button',
        { className: 'stk-card__open', attrs: { type: 'button' } },
        name,
        ' ',
        code,
      );
      open.addEventListener('click', () => {
        onOpen(product);
      });
      head = el('h2', { className: 'stk-card__title' }, open);
    }
    return el(
      'article',
      { className: 'stk-card' },
      head,
      el(
        'div',
        { className: 'stk-card__body' },
        priceTable(product),
        el(
          'div',
          { className: 'stk-card__photo' },
          createProductPhoto(product, 'md', {
            onZoom: () => {
              openPhotoViewer({ product });
            },
          }),
        ),
      ),
      el(
        'div',
        { className: 'stk-stock' },
        stockItem(product, 'display'),
        stockItem(product, 'besar'),
      ),
      options.showCost ? costLine(product) : false,
    );
  };

  // Tombol "Muat N lagi" hanya muncul bila masih ada barang di luar yang sudah tampil.
  const paintMore = (total: number): void => {
    more.replaceChildren(
      ...(total > shown
        ? [
            createButton({
              text: label('muatLebihBanyak', { jumlah: total - shown }),
              variant: 'secondary',
              onClick: loadMore,
            }),
          ]
        : []),
    );
  };

  // Memuat berikutnya dengan menambah kartu di bawah yang ada, bukan menggambar ulang seluruh daftar,
  // supaya fokus papan ketik dan posisi gulir tidak hilang saat daftar bertambah.
  function loadMore(): void {
    const rows = filtered();
    const from = shown;
    shown += pageSize;
    list.append(...rows.slice(from, shown).map(card));
    paintMore(rows.length);
  }

  const paint = (): void => {
    const rows = filtered();
    list.replaceChildren(
      ...(rows.length === 0
        ? [createEmptyState({ icon: 'inbox', title: label('barangTidakDitemukan') })]
        : rows.slice(0, shown).map(card)),
    );
    paintMore(rows.length);
    hint.textContent = filter.text.trim().length === 1 ? message('MSG-120') : '';
    if (options.loadedAt !== undefined) {
      stamp.textContent = label('diperbarui', { waktu: options.loadedAt() });
    }
  };

  const paintBelow = (): void => {
    below.replaceChildren(
      ...(filter.belowMinimum
        ? [
            (() => {
              const button = el(
                'button',
                {
                  className: 'stk-below__chip',
                  attrs: { type: 'button', 'aria-label': mt('stbHapusMinimum') },
                },
                el('span', { text: label('diBawahMinimum') }),
                icon('x'),
              );
              button.addEventListener('click', () => {
                filter = { ...filter, belowMinimum: false };
                shown = pageSize;
                paintBelow();
                paint();
              });
              return button;
            })(),
          ]
        : []),
    );
  };

  const paintFilters = (): void => {
    const all = products();
    filters.replaceChildren(
      filterSelect(
        mt('stbFilterGudang'),
        WAREHOUSES.map(([value, text]) => [value, text()] as const),
        filter.warehouse,
        (value) => {
          filter = { ...filter, warehouse: value as WarehouseFilter };
          shown = pageSize;
          paint();
        },
      ),
      filterSelect(
        mt('stbFilterKategori'),
        [
          ['', mt('stbSemuaKategori')],
          ...distinct(all, (item) => item.category).map((value) => [value, value] as const),
        ],
        filter.category,
        (value) => {
          filter = { ...filter, category: value };
          shown = pageSize;
          paint();
        },
      ),
      filterSelect(
        mt('stbFilterMerk'),
        [
          ['', mt('stbSemuaMerk')],
          ...distinct(all, (item) => item.brand).map((value) => [value, value] as const),
        ],
        filter.brand,
        (value) => {
          filter = { ...filter, brand: value };
          shown = pageSize;
          paint();
        },
      ),
    );
  };

  const apply = (text: string): void => {
    filter = { ...filter, text };
    shown = pageSize;
    paint();
  };
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      apply(search.value);
    }, DEBOUNCE_MS);
  });
  // Pemindai Bluetooth mengetik kode lalu menekan Enter: cari saat itu juga tanpa menunggu jeda.
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(timer);
      apply(search.value);
    }
  });
  scan.addEventListener('click', () => {
    openBarcodeScan({
      products,
      onResult: (code) => {
        search.value = code;
        window.clearTimeout(timer);
        apply(code);
      },
    });
  });

  const scroller = document.getElementById('own-main');
  // Muat otomatis saat digulir ke dasar daftar. Tidak berlaku saat fokus papan ketik berada di daftar:
  // gulir akibat fokus (Tab) tidak boleh menambah kartu; pengguna papan ketik memakai tombol "Muat N lagi".
  const onScroll = (): void => {
    if (
      scroller !== null &&
      !list.contains(document.activeElement) &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80 &&
      filtered().length > shown
    ) {
      loadMore();
    }
  };
  scroller?.addEventListener('scroll', onScroll, { passive: true });

  const stops = [store.subscribe(paint)];
  if (options.subscribe !== undefined) {
    stops.push(options.subscribe(paint));
  }

  const element = el(
    'div',
    { className: 'own-stack stk' },
    el(
      'div',
      { className: 'stk-bar' },
      el(
        'div',
        { className: 'stk-search' },
        el('div', { className: 'stk-search__field' }, icon('search'), search),
        scan,
      ),
      filters,
      below,
      hint,
    ),
    list,
    more,
    options.loadedAt === undefined ? false : stamp,
  );
  paintFilters();
  paintBelow();
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
