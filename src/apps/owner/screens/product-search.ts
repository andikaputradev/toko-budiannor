import { el, nextId } from '../../../shared/dom';
import type { Product } from '../../../shared/data/types';
import { label, message } from '../../../shared/messages';
import { findProducts } from '../search';

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 6;

export interface ProductSearch {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
}

// Kolom cari barang untuk formulir: hasil tampil sebagai daftar tombol besar, ketuk untuk menambah.
export function createProductSearch(
  labelText: string,
  products: () => readonly Product[],
  onPick: (product: Product) => void,
): ProductSearch {
  const inputId = nextId('trx-cari');
  const input = el('input', {
    className: 'input own-search',
    attrs: {
      id: inputId,
      type: 'search',
      autocomplete: 'off',
      placeholder: label('stkCariPlaceholder'),
    },
  });
  const hint = el('p', { className: 'own-hint', attrs: { role: 'status' } });
  const results = el('div', { className: 'trx-results' });
  let timer: number | undefined;
  let current: readonly Product[] = [];

  const pick = (product: Product): void => {
    input.value = '';
    current = [];
    results.replaceChildren();
    hint.textContent = '';
    onPick(product);
  };

  const paint = (): void => {
    const text = input.value.trim();
    hint.textContent = text.length === 1 ? message('MSG-120') : '';
    current = text.length < 2 ? [] : findProducts(products(), text).slice(0, MAX_RESULTS);
    results.replaceChildren(
      ...(text.length >= 2 && current.length === 0
        ? [el('p', { className: 'trx-results__empty', text: label('barangTidakDitemukan') })]
        : current.map((product) => {
            const button = el(
              'button',
              { className: 'trx-result', attrs: { type: 'button' } },
              el('span', { className: 'trx-result__name', text: product.name }),
              el('span', { className: 'trx-result__code', text: product.code }),
            );
            button.addEventListener('click', () => {
              pick(product);
            });
            return button;
          })),
    );
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(paint, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(timer);
      paint();
      const first = current[0];
      if (first !== undefined) {
        pick(first);
      }
    }
  });

  const root = el(
    'div',
    { className: 'field trx-search' },
    el('label', { className: 'field__label', text: labelText, attrs: { for: inputId } }),
    input,
    hint,
    results,
  );
  return { root, input };
}
