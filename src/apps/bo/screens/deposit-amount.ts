import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { parseMoney } from '../domain/deposit';

export interface AmountInput {
  readonly element: HTMLInputElement;
  value(): string;
  set(amount: number): void;
}

// Kolom nominal rupiah: hanya angka, dengan titik pemisah ribuan yang dibentuk saat mengetik.
export function createAmountInput(
  id: string,
  ariaLabel: string,
  onChange: () => void,
): AmountInput {
  const element = el('input', {
    className: 'input',
    attrs: {
      id,
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      placeholder: '0',
      'aria-label': ariaLabel,
    },
  });
  const format = (): void => {
    const amount = parseMoney(element.value);
    element.value = amount > 0 ? formatDecimal(amount, 0) : '';
  };
  element.addEventListener('input', () => {
    format();
    onChange();
  });
  return {
    element,
    value: () => element.value,
    set: (amount) => {
      element.value = amount > 0 ? formatDecimal(amount, 0) : '';
      onChange();
    },
  };
}
