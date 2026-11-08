import { formatRupiah } from '../../../shared/format';
import { applyMoneyKey, type MoneyKey } from './shift';

// Entri nominal tanpa DOM: papan angka layar dan papan ketik fisik berbagi satu aturan.
export type AmountKey = MoneyKey | 'Enter';

export interface AmountModel {
  value(): number;
  hasValue(): boolean;
  text(): string;
  setValue(value: number): void;
  setMax(max: number | undefined): void;
  press(key: AmountKey): void;
  pressKeyboard(key: string): boolean;
}

export interface AmountModelOptions {
  value?: number | undefined;
  max?: number | undefined;
  onChange: (value: number) => void;
  onEnter?: (() => void) | undefined;
}

export function keyFromKeyboard(key: string): AmountKey | undefined {
  if (/^\d$/.test(key)) {
    return key as MoneyKey;
  }
  if (key === 'Backspace' || key === 'Enter') {
    return key;
  }
  return undefined;
}

function clamp(value: number, max: number | undefined): number {
  const whole = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return max === undefined ? whole : Math.min(whole, max);
}

export function createAmountModel(options: AmountModelOptions): AmountModel {
  let max = options.max;
  let value = clamp(options.value ?? 0, max);
  let filled = options.value !== undefined;
  return {
    value: () => value,
    hasValue: () => filled,
    text: () => (filled ? formatRupiah(value) : ''),
    setValue(next) {
      value = clamp(next, max);
      filled = true;
    },
    setMax(next) {
      max = next;
      const limited = clamp(value, max);
      if (limited !== value) {
        value = limited;
        options.onChange(value);
      }
    },
    press(key) {
      if (key === 'Enter') {
        options.onEnter?.();
        return;
      }
      value = clamp(applyMoneyKey(value, key), max);
      filled = true;
      options.onChange(value);
    },
    pressKeyboard(key) {
      const mapped = keyFromKeyboard(key);
      if (mapped === undefined) {
        return false;
      }
      this.press(mapped);
      return true;
    },
  };
}
