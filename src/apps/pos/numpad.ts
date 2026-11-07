import { el } from '../../shared/dom';
import { label } from '../../shared/messages';
import type { MoneyKey } from './domain/shift';

export interface Numpad {
  readonly element: HTMLDivElement;
}

export function createNumpad(onKey: (key: string) => void): Numpad {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', label('tombolKoma'), '0', 'Backspace'];
  const element = el('div', { className: 'pos-numpad' });
  for (const key of keys) {
    const isBackspace = key === 'Backspace';
    const button = el('button', {
      className: isBackspace ? 'pos-numpad__key pos-numpad__key--action' : 'pos-numpad__key',
      text: isBackspace ? label('pinHapus') : key,
      attrs: { type: 'button' },
    });
    button.addEventListener('click', () => {
      onKey(key);
    });
    element.append(button);
  }
  return { element };
}

// Papan uang modal: 1 sampai 9, 000, 0, C, dan hapus (4 kolom, minimal 48 px).
export function createMoneyPad(onKey: (key: MoneyKey) => void): Numpad {
  const layout: readonly (MoneyKey | undefined)[] = [
    '1',
    '2',
    '3',
    'C',
    '4',
    '5',
    '6',
    'Backspace',
    '7',
    '8',
    '9',
    undefined,
    '000',
    '0',
  ];
  const element = el('div', { className: 'pos-moneypad' });
  for (const key of layout) {
    if (key === undefined) {
      element.append(el('span', { attrs: { 'aria-hidden': 'true' } }));
      continue;
    }
    const action = key === 'C' || key === 'Backspace';
    const classes = ['pos-numpad__key'];
    if (action) {
      classes.push('pos-numpad__key--action');
    }
    if (key === '000') {
      classes.push('pos-moneypad__wide');
    }
    const button = el('button', {
      className: classes.join(' '),
      text: key === 'Backspace' ? label('pinHapus') : key,
      attrs: { type: 'button' },
    });
    button.addEventListener('click', () => {
      onKey(key);
    });
    element.append(button);
  }
  return { element };
}
