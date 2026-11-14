import '../../../../styles/bo-trx.css';
import { el } from '../../../../shared/dom';
import { icon } from '../../../../shared/icons';
import { createButton } from '../../../../shared/ui/button';

export interface Kpi {
  readonly root: HTMLElement;
  set(text: string): void;
}

// Kotak angka pada kartu daftar (gambar klien 8): judul kecil di atas, angka tebal di bawah.
export function createKpi(label: string, tone?: 'warn' | 'danger'): Kpi {
  const value = el('strong', {
    className: `bo-trx-kpi__value${tone === undefined ? '' : ` is-${tone}`}`,
    text: '0',
  });
  return {
    root: el(
      'div',
      { className: 'bo-trx-kpi' },
      el('span', { className: 'bo-trx-kpi__label', text: label }),
      value,
    ),
    set: (text) => {
      value.textContent = text;
    },
  };
}

export function createFilterSelect(
  ariaLabel: string,
  options: readonly { readonly value: string; readonly text: string }[],
): HTMLSelectElement {
  const select = el('select', {
    className: 'input is-select bo-trx-filter',
    attrs: { 'aria-label': ariaLabel },
  });
  for (const option of options) {
    select.append(el('option', { text: option.text, attrs: { value: option.value } }));
  }
  return select;
}

export function createSearchBox(
  ariaLabel: string,
  placeholder: string,
): { readonly root: HTMLElement; readonly input: HTMLInputElement } {
  const input = el('input', {
    className: 'input bo-trx-searchbox__input',
    attrs: { type: 'search', 'aria-label': ariaLabel, placeholder, autocomplete: 'off' },
  });
  return {
    input,
    root: el(
      'div',
      { className: 'bo-trx-searchbox' },
      input,
      el('span', { className: 'bo-trx-search__icon' }, icon('search')),
    ),
  };
}

export function createRefreshButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el(
    'button',
    {
      className: 'bo-trx-iconbtn',
      attrs: { type: 'button', 'aria-label': label, title: label },
    },
    icon('refresh-cw'),
  );
  button.addEventListener('click', onClick);
  return button;
}

export interface ListPageParts {
  readonly heading: HTMLElement;
  // Elemen kecil di bawah judul, mis. pengalih Penjualan dan Pembelian.
  readonly under?: HTMLElement | undefined;
  readonly kpis: readonly Kpi[];
  readonly createText: string;
  readonly onCreate: () => void;
  readonly refresh: HTMLElement;
  readonly filters: readonly HTMLElement[];
  readonly search: HTMLElement;
  readonly table: HTMLElement;
}

// Kerangka halaman daftar (gambar klien 8 dan 10): kartu judul dengan kotak angka, tombol buat baru,
// segarkan, filter, pencarian; lalu tabel yang menggulir di dalam panelnya.
export function createListPage(parts: ListPageParts): HTMLElement {
  const create = createButton({
    text: parts.createText,
    variant: 'primary',
    icon: 'plus',
    onClick: parts.onCreate,
  });
  create.classList.add('bo-trx-create');
  return el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-list' },
    el(
      'section',
      { className: 'bo-trx-listhead' },
      el(
        'div',
        { className: 'bo-trx-listhead__top' },
        el('div', { className: 'bo-trx-listhead__title' }, parts.heading, parts.under),
        el('div', { className: 'bo-trx-kpis' }, ...parts.kpis.map((kpi) => kpi.root)),
      ),
      el(
        'div',
        { className: 'bo-trx-listhead__bar' },
        create,
        parts.refresh,
        el('div', { className: 'bo-trx-filters' }, ...parts.filters),
        parts.search,
      ),
    ),
    el('div', { className: 'bo-trx__body' }, parts.table),
  );
}
