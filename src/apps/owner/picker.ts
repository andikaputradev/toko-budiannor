import { el, nextId } from '../../shared/dom';
import type { Product } from '../../shared/data/types';
import { findProducts } from './search';

export interface Picker {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
}

export function optionValue(product: Product): string {
  return `${product.code} ${product.name}`;
}

export function createProductPicker(
  labelText: string,
  products: () => readonly Product[],
  onPick: (product: Product) => void,
): Picker {
  const inputId = nextId('own-picker');
  const listId = nextId('own-picker-list');
  const input = el('input', {
    className: 'input own-search',
    attrs: { id: inputId, type: 'search', autocomplete: 'off', list: listId },
  });
  const list = el('datalist', { attrs: { id: listId } });
  const refresh = (): void => {
    list.replaceChildren(
      ...findProducts(products(), input.value)
        .slice(0, 10)
        .map((product) => el('option', { attrs: { value: optionValue(product) } })),
    );
  };
  const commit = (): void => {
    const text = input.value.trim();
    if (text === '') {
      return;
    }
    const all = products();
    const found =
      all.find((product) => optionValue(product) === text) ??
      all.find((product) => product.code.toLowerCase() === text.toLowerCase()) ??
      all.find((product) => product.barcode === text) ??
      findProducts(all, text)[0];
    if (found !== undefined) {
      input.value = '';
      refresh();
      onPick(found);
    }
  };
  input.addEventListener('input', refresh);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  });
  refresh();
  const root = el(
    'div',
    { className: 'field' },
    el('label', { className: 'field__label', text: labelText, attrs: { for: inputId } }),
    input,
    list,
  );
  return { root, input };
}

export * from '../../shared/ui/product-picker';
