import { el } from '../../../shared/dom';
import { label, type LabelKey } from '../../../shared/messages';
import {
  applyAppearance,
  parseMode,
  parseTheme,
  POS_MODES,
  POS_THEMES,
  prefersDark,
  saveMode,
  saveTheme,
  type PosMode,
  type PosTheme,
} from '../theme';

export const THEME_LABELS: Readonly<Record<PosTheme, LabelKey>> = {
  oranye: 'temaOranye',
  terakota: 'temaTerakota',
  teal: 'temaTeal',
  biru: 'temaBiru',
  hijau: 'temaHijau',
  ungu: 'temaUngu',
};

export const MODE_LABELS: Readonly<Record<PosMode, LabelKey>> = {
  otomatis: 'modeOtomatis',
  terang: 'modeTerang',
  gelap: 'modeGelap',
};

function currentTheme(): PosTheme {
  return parseTheme(document.documentElement.dataset['posTheme'] ?? null);
}

function currentMode(): PosMode {
  return parseMode(document.documentElement.dataset['posMode'] ?? null);
}

function repaint(): void {
  applyAppearance(document.documentElement, currentTheme(), currentMode(), prefersDark());
}

export function radioGroup<T extends string>(options: {
  readonly name: LabelKey;
  readonly values: readonly T[];
  readonly selected: T;
  readonly text: (value: T) => string;
  readonly swatchOf?: ((value: T) => string) | undefined;
  readonly onPick: (value: T) => void;
}): HTMLElement {
  const group = el('div', {
    className: 'pos-drawer__themes',
    attrs: { role: 'radiogroup', 'aria-label': label(options.name) },
  });
  for (const value of options.values) {
    const children: Node[] = [];
    if (options.swatchOf !== undefined) {
      children.push(
        el('span', {
          className: 'pos-swatch',
          attrs: {
            'data-app': 'pos',
            'data-pos-theme': options.swatchOf(value),
            'aria-hidden': 'true',
          },
        }),
      );
    }
    children.push(el('span', { text: options.text(value) }));
    const button = el(
      'button',
      {
        className: 'pos-drawer__theme',
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': value === options.selected ? 'true' : 'false',
        },
      },
      ...children,
    );
    button.dataset['value'] = value;
    button.addEventListener('click', () => {
      options.onPick(value);
      for (const other of group.querySelectorAll<HTMLElement>('[role="radio"]')) {
        other.setAttribute('aria-checked', other.dataset['value'] === value ? 'true' : 'false');
      }
    });
    group.append(button);
  }
  return group;
}

// Pemilih palet dan mode, dipakai di panel Pengaturan Lainnya.
export function createAppearanceControls(): HTMLElement {
  const themes = radioGroup<PosTheme>({
    name: 'tema',
    values: POS_THEMES,
    selected: currentTheme(),
    text: (value) => label(THEME_LABELS[value]),
    swatchOf: (value) => value,
    onPick: (value) => {
      saveTheme(value);
      document.documentElement.dataset['posTheme'] = value;
      repaint();
    },
  });
  const modes = radioGroup<PosMode>({
    name: 'modeTampilan',
    values: POS_MODES,
    selected: currentMode(),
    text: (value) => label(MODE_LABELS[value]),
    onPick: (value) => {
      saveMode(value);
      document.documentElement.dataset['posMode'] = value;
      repaint();
    },
  });
  return el(
    'div',
    { className: 'pos-appearance' },
    el('p', { className: 't-label', text: label('tema') }),
    themes,
    el('p', { className: 't-label', text: label('modeTampilan') }),
    modes,
  );
}
