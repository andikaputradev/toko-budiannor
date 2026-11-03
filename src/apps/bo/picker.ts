import { el, nextId } from '../../shared/dom';
import type { Product } from '../../shared/data/types';
import { findProducts } from './search';

export interface PickerOptions {
  readonly labelText: string;
  readonly products: () => readonly Product[];
  readonly onPick: (product: Product) => void;
  readonly placeholder?: string | undefined;
}

export interface Picker {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
}

export function optionValue(product: Product): string {
  return `${product.code} ${product.name}`;
}

export function createProductPicker(options: PickerOptions): Picker {
  const inputId = nextId('picker');
  const listId = nextId('picker-list');
  const input = el('input', {
    className: 'input bo-picker__input',
    attrs: {
      id: inputId,
      type: 'search',
      autocomplete: 'off',
      list: listId,
      placeholder: options.placeholder,
    },
  });
  const list = el('datalist', { attrs: { id: listId } });
  let candidates: Product[] = [];

  const refresh = (): void => {
    candidates = findProducts(options.products(), input.value, 10);
    list.replaceChildren(
      ...candidates.map((product) => el('option', { attrs: { value: optionValue(product) } })),
    );
  };
  const resolve = (): Product | undefined => {
    const text = input.value.trim();
    if (text === '') {
      return undefined;
    }
    const all = options.products();
    return (
      all.find((product) => optionValue(product) === text) ??
      all.find((product) => product.code.toLowerCase() === text.toLowerCase()) ??
      all.find((product) => product.barcode === text) ??
      all.find((product) => product.units.some((unit) => unit.barcode === text)) ??
      findProducts(all, text, 1)[0]
    );
  };
  const commit = (): void => {
    const product = resolve();
    if (product !== undefined) {
      input.value = '';
      refresh();
      options.onPick(product);
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
    { className: 'field bo-picker' },
    el('label', { className: 'field__label', text: options.labelText, attrs: { for: inputId } }),
    input,
    list,
  );
  return { root, input };
}
