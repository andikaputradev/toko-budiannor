import { el } from '../dom';
import { label } from '../messages';

export interface PinPadOptions {
  readonly maxLength?: number;
  readonly onChange?: (value: string) => void;
}

export interface PinPad {
  readonly element: HTMLDivElement;
  value(): string;
  reset(): void;
  press(digit: string): void;
  backspace(): void;
}

const DIGIT_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function createPinPad(options: PinPadOptions = {}): PinPad {
  const maxLength = options.maxLength ?? 6;
  let value = '';
  const dots = el('div', { className: 'pinpad__dots', attrs: { 'aria-hidden': 'true' } });
  for (let index = 0; index < maxLength; index += 1) {
    dots.append(el('span', { className: 'pinpad__dot' }));
  }
  const status = el('p', {
    className: 'visually-hidden',
    attrs: { role: 'status' },
  });
  const grid = el('div', { className: 'pinpad__grid' });

  const render = (): void => {
    Array.from(dots.children).forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < value.length);
    });
    status.textContent = label('pinTercatat', { jumlah: value.length, maks: maxLength });
    options.onChange?.(value);
  };
  const addKey = (text: string, action: () => void, className = 'pinpad__key'): void => {
    const key = el('button', { className, text, attrs: { type: 'button' } });
    key.addEventListener('click', action);
    grid.append(key);
  };

  for (const row of DIGIT_ROWS) {
    for (const digit of row) {
      addKey(digit, () => {
        if (value.length < maxLength) {
          value += digit;
          render();
        }
      });
    }
  }
  addKey(
    label('pinHapus'),
    () => {
      value = value.slice(0, -1);
      render();
    },
    'pinpad__key pinpad__key--action',
  );
  addKey('0', () => {
    if (value.length < maxLength) {
      value += '0';
      render();
    }
  });
  addKey(
    label('pinKosong'),
    () => {
      value = '';
      render();
    },
    'pinpad__key pinpad__key--action',
  );

  const press = (digit: string): void => {
    if (/^\d$/.test(digit) && value.length < maxLength) {
      value += digit;
      render();
    }
  };
  const backspace = (): void => {
    value = value.slice(0, -1);
    render();
  };

  const element = el('div', { className: 'pinpad' }, dots, status, grid);
  render();
  return {
    element,
    value: () => value,
    reset: () => {
      value = '';
      render();
    },
    press,
    backspace,
  };
}
