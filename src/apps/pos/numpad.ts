import { el } from '../../shared/dom';
import { label } from '../../shared/messages';
import type { AmountKey } from './domain/amount';

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

function keyText(key: AmountKey, enterText: string | undefined): string {
  if (key === 'Backspace') {
    return label('pinHapus');
  }
  return key === 'Enter' ? (enterText ?? '') : key;
}

// Papan nominal: 1 sampai 9, 000, 0, C, dan hapus (4 kolom, minimal 48 px).
// Tombol enter (dua baris tinggi di kolom kanan) hanya tampil bila enterText diberikan.
export function createMoneyPad(onKey: (key: AmountKey) => void, enterText?: string): Numpad {
  const layout: readonly (AmountKey | undefined)[] = [
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
    enterText === undefined ? undefined : 'Enter',
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
    if (key === 'Enter') {
      classes.push('pos-moneypad__enter');
    }
    const button = el('button', {
      className: classes.join(' '),
      text: keyText(key, enterText),
      attrs: { type: 'button' },
    });
    button.addEventListener('click', () => {
      onKey(key);
    });
    element.append(button);
  }
  return { element };
}
