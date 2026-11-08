import { el } from '../../shared/dom';
import { label } from '../../shared/messages';
import { createAmountModel } from './domain/amount';
import { createMoneyPad } from './numpad';

export interface AmountEntry {
  readonly element: HTMLElement;
  value(): number;
  hasValue(): boolean;
  setValue(value: number): void;
  setMax(max: number | undefined): void;
  focus(): void;
  // Ketikan papan ketik fisik juga diterima dari target ini (mis. dialog atau dokumen).
  // Mengembalikan fungsi pelepas.
  listenOn(target: EventTarget): () => void;
}

export interface AmountEntryOptions {
  labelText: string;
  value?: number | undefined;
  max?: number | undefined;
  enterText?: string;
  onChange: (value: number) => void;
  onEnter?: () => void;
  // Ketikan papan ketik hanya diterima selama fungsi ini mengembalikan true.
  enabled?: () => boolean;
}

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// Entri nominal bersama: tampilan rupiah beraria-live di atas papan angka layar.
// Tombol enter pada papan hanya ada bila onEnter diberikan.
export function createAmountEntry(options: AmountEntryOptions): AmountEntry {
  const display = el('output', {
    className: 'pos-amount__value',
    attrs: { 'aria-live': 'polite', 'aria-label': options.labelText, 'data-placeholder': 'Rp' },
  });
  const paint = (): void => {
    display.textContent = model.text();
  };
  const model = createAmountModel({
    value: options.value,
    max: options.max,
    onChange: (value) => {
      paint();
      options.onChange(value);
    },
    onEnter: options.onEnter,
  });
  const pad = createMoneyPad(
    (key) => {
      model.press(key);
    },
    options.onEnter === undefined ? undefined : (options.enterText ?? label('tombolOk')),
  );
  const element = el(
    'div',
    { className: 'pos-amount' },
    el('p', { className: 't-label', text: options.labelText }),
    display,
    pad.element,
  );
  // Satu ketikan ditangani sekali walau dua target (entri dan dialog) sama-sama mendengar.
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (options.enabled?.() === false) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && FIELD_TAGS.has(target.tagName)) {
      return;
    }
    if (
      event.key === 'Enter' &&
      (options.onEnter === undefined || target instanceof HTMLButtonElement)
    ) {
      return;
    }
    if (model.pressKeyboard(event.key)) {
      event.preventDefault();
    }
  };
  element.addEventListener('keydown', onKeydown);
  paint();
  return {
    element,
    value: () => model.value(),
    hasValue: () => model.hasValue(),
    setValue(value) {
      model.setValue(value);
      paint();
    },
    setMax(max) {
      model.setMax(max);
    },
    focus() {
      pad.element.querySelector('button')?.focus();
    },
    listenOn(target) {
      const handler = onKeydown as EventListener;
      target.addEventListener('keydown', handler);
      return () => {
        target.removeEventListener('keydown', handler);
      };
    },
  };
}
