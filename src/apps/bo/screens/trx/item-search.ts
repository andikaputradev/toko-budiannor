import { el, nextId } from '../../../../shared/dom';
import type { Product } from '../../../../shared/data/types';
import { icon } from '../../../../shared/icons';
import { message } from '../../../../shared/messages';
import { findProducts } from '../../search';
import { TRX_TEXT as T } from './text';

const MAX_RESULTS = 8;
const MIN_QUERY = 2;

export interface ItemSearchOptions {
  readonly products: () => readonly Product[];
  readonly onPick: (product: Product) => void;
}

export interface ItemSearch {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  focus(): void;
}

const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Memecah nama menjadi teks biasa dan elemen mark pada kata yang cocok dengan pencarian.
export function highlight(text: string, query: string): Node[] {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .sort((first, second) => second.length - first.length);
  if (words.length === 0) {
    return [document.createTextNode(text)];
  }
  const parts = text.split(new RegExp(`(${words.map(escapePattern).join('|')})`, 'gi'));
  return parts
    .map((part, index) =>
      index % 2 === 1 ? el('mark', { text: part }) : document.createTextNode(part),
    )
    .filter((node) => node.textContent !== '');
}

// Kotak "Cari/Pilih Barang & Jasa" (gambar klien 12): daftar hasil berisi nama dengan teks cocok
// disorot dan kode di bawahnya. Combobox ARIA: panah memilih, Enter mengambil, Esc menutup.
export function createItemSearch(options: ItemSearchOptions): ItemSearch {
  const listId = nextId('trx-opts');
  const input = el('input', {
    className: 'input bo-trx-search__input',
    attrs: {
      type: 'search',
      role: 'combobox',
      autocomplete: 'off',
      placeholder: T.cariBarang,
      'aria-label': T.cariBarangNama,
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': listId,
    },
  });
  const list = el('ul', {
    className: 'bo-trx-search__list',
    attrs: { id: listId, role: 'listbox', 'aria-label': T.cariBarangNama, hidden: '' },
  });
  let results: Product[] = [];
  let active = 0;

  const close = (): void => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const mark = (): void => {
    [...list.children].forEach((child, index) => {
      const selected = index === active;
      child.setAttribute('aria-selected', selected ? 'true' : 'false');
      child.classList.toggle('is-active', selected);
      if (selected) {
        input.setAttribute('aria-activedescendant', child.id);
        child.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const pick = (product: Product): void => {
    input.value = '';
    close();
    options.onPick(product);
  };

  const open = (): void => {
    const text = input.value;
    if (text.trim().length < MIN_QUERY) {
      close();
      return;
    }
    results = findProducts(options.products(), text, MAX_RESULTS);
    active = 0;
    const items =
      results.length === 0
        ? [
            el('li', {
              className: 'bo-trx-search__empty',
              text: message('MSG-006'),
              attrs: { role: 'option', 'aria-disabled': 'true' },
            }),
          ]
        : results.map((product, index) => {
            const item = el(
              'li',
              {
                className: 'bo-trx-search__option',
                attrs: {
                  id: `${listId}-${String(index)}`,
                  role: 'option',
                  'aria-selected': 'false',
                },
              },
              el('span', { className: 'bo-trx-search__name' }, ...highlight(product.name, text)),
              el('span', { className: 'bo-trx-search__code', text: product.code }),
            );
            // mousedown dengan preventDefault menjaga fokus pada kotak cari sampai pilihan diambil.
            item.addEventListener('mousedown', (event) => {
              event.preventDefault();
              pick(product);
            });
            return item;
          });
    list.replaceChildren(...items);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    mark();
  };

  input.addEventListener('input', open);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) {
        open();
        return;
      }
      const last = Math.max(0, results.length - 1);
      if (event.key === 'ArrowDown') {
        active = active >= last ? 0 : active + 1;
      } else {
        active = active <= 0 ? last : active - 1;
      }
      mark();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = list.hidden ? undefined : results[active];
      if (chosen !== undefined) {
        pick(chosen);
      }
    }
  });

  const root = el(
    'div',
    { className: 'bo-trx-search' },
    input,
    el('span', { className: 'bo-trx-search__icon' }, icon('search')),
    list,
  );
  return {
    root,
    input,
    focus: () => {
      input.focus();
    },
  };
}
