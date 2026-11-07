import { el, nextId } from '../dom';
import { icon } from '../icons';

export interface TextFieldOptions {
  readonly labelText: string;
  readonly value?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly inputMode?: 'text' | 'numeric' | 'decimal' | 'email';
}

export interface TextField {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
  setError(text: string | undefined): void;
}

export interface SelectOption {
  readonly value: string;
  readonly text: string;
}

export interface SelectFieldOptions {
  readonly labelText: string;
  readonly options: readonly SelectOption[];
  readonly value?: string;
  readonly disabled?: boolean;
}

function createError(id: string, text: string): HTMLParagraphElement {
  return el(
    'p',
    { className: 'field__error', attrs: { id } },
    icon('circle-x'),
    el('span', { text }),
  );
}

export function createTextField(options: TextFieldOptions): TextField {
  const inputId = nextId('input');
  const errorId = nextId('error');
  const root = el('div', { className: 'field' });
  const input = el('input', {
    className: 'input',
    attrs: {
      id: inputId,
      type: 'text',
      value: options.value,
      inputmode: options.inputMode,
      disabled: options.disabled === true && '',
    },
  });
  root.append(
    el('label', { className: 'field__label', text: options.labelText, attrs: { for: inputId } }),
    input,
  );
  let errorNode: HTMLParagraphElement | undefined;
  const setError = (text: string | undefined): void => {
    errorNode?.remove();
    errorNode = undefined;
    if (text === undefined) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      return;
    }
    errorNode = createError(errorId, text);
    root.append(errorNode);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
  };
  setError(options.error);
  return { root, input, setError };
}

export function createSelectField(options: SelectFieldOptions): {
  readonly root: HTMLDivElement;
  readonly select: HTMLSelectElement;
} {
  const selectId = nextId('select');
  const select = el(
    'select',
    {
      className: 'input select__control',
      attrs: { id: selectId, disabled: options.disabled === true && '' },
    },
    ...options.options.map((option) =>
      el('option', {
        text: option.text,
        attrs: {
          value: option.value,
          selected: option.value === options.value && '',
        },
      }),
    ),
  );
  const root = el(
    'div',
    { className: 'field' },
    el('label', { className: 'field__label', text: options.labelText, attrs: { for: selectId } }),
    el('div', { className: 'select' }, select, icon('chevron-down')),
  );
  return { root, select };
}
