import { el } from '../dom';
import { icon } from '../icons';
import { label } from '../messages';
import { round3 } from '../data/units';

export interface StepperOptions {
  readonly labelText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}

export interface Stepper {
  readonly element: HTMLElement;
  value(): number;
  setValue(value: number): void;
  setMax(max: number): void;
}

function format(value: number): string {
  return String(value).replace('.', ',');
}

export function createStepper(options: StepperOptions): Stepper {
  let max = options.max;
  let current = Math.min(Math.max(options.value, options.min), max);
  const input = el('input', {
    className: 'input stepper__input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      'aria-label': options.labelText,
    },
  });
  const set = (next: number, notify: boolean): void => {
    const clamped = round3(
      Math.min(Math.max(Number.isFinite(next) ? next : options.min, options.min), max),
    );
    current = clamped;
    input.value = format(clamped);
    if (notify) {
      options.onChange(clamped);
    }
  };
  const button = (
    name: 'kurangiJumlah' | 'tambahJumlah',
    symbol: 'minus' | 'plus',
    delta: number,
  ) => {
    const control = el(
      'button',
      {
        className: 'stepper__button',
        attrs: { type: 'button', 'aria-label': label(name) },
      },
      icon(symbol),
    );
    control.addEventListener('click', () => {
      set(current + delta, true);
    });
    return control;
  };
  input.addEventListener('input', () => {
    const parsed = Number(input.value.trim().replace(',', '.'));
    current = round3(
      Math.min(Math.max(Number.isFinite(parsed) ? parsed : options.min, options.min), max),
    );
    options.onChange(current);
  });
  input.addEventListener('blur', () => {
    input.value = format(current);
  });
  input.value = format(current);
  return {
    element: el(
      'div',
      { className: 'stepper', attrs: { role: 'group', 'aria-label': options.labelText } },
      button('kurangiJumlah', 'minus', -options.step),
      input,
      button('tambahJumlah', 'plus', options.step),
    ),
    value: () => current,
    setValue: (value) => {
      set(value, false);
    },
    setMax: (next) => {
      max = next;
      set(current, false);
    },
  };
}
