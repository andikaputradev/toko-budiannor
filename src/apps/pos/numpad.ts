import { el } from '../../shared/dom';
import { label } from '../../shared/messages';

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
