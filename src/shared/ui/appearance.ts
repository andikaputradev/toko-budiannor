import { el } from '../dom';
import { label, type LabelKey } from '../messages';
import {
  applyAppearance,
  loadMode,
  loadTheme,
  parseMode,
  parseTheme,
  POS_MODES,
  POS_THEMES,
  prefersDark,
  saveMode,
  saveTheme,
  watchScheme,
  type PosMode,
  type PosTheme,
} from '../theme';
import { openModal, type ModalHandle } from './modal';

const THEME_NAMES: Readonly<Record<PosTheme, LabelKey>> = {
  oranye: 'temaOranye',
  terakota: 'temaTerakota',
  teal: 'temaTeal',
  biru: 'temaBiru',
  hijau: 'temaHijau',
  ungu: 'temaUngu',
};

const MODE_NAMES: Readonly<Record<PosMode, LabelKey>> = {
  otomatis: 'modeOtomatis',
  terang: 'modeTerang',
  gelap: 'modeGelap',
};

let stopWatching: (() => void) | undefined;

// Memasang tema dan mode tersimpan pada elemen akar dan mengikuti perubahan mode HP.
export function startAppearance(root: HTMLElement = document.documentElement): void {
  applyAppearance(root, loadTheme(), loadMode(), prefersDark());
  stopWatching ??= watchScheme((dark) => {
    applyAppearance(root, loadTheme(), loadMode(), dark);
  });
}

// Enam kotak warna dan tiga mode; pilihan langsung berlaku dan tersimpan (dibagi dengan POS dan BO).
export function createAppearancePicker(): HTMLElement {
  const root = document.documentElement;
  const app = root.dataset['app'] ?? 'owner';
  const box = el('div', { className: 'mob-appearance' });
  const paint = (): void => {
    const theme = parseTheme(root.dataset['posTheme'] ?? loadTheme());
    const mode = parseMode(root.dataset['posMode'] ?? loadMode());
    const themeButtons = POS_THEMES.map((key) => {
      const button = el(
        'button',
        {
          className: 'mob-theme',
          attrs: { type: 'button', 'aria-pressed': key === theme ? 'true' : 'false' },
        },
        el('span', {
          className: 'mob-theme__swatch',
          attrs: { 'data-app': app, 'data-pos-theme': key },
        }),
        el('span', { text: label(THEME_NAMES[key]) }),
      );
      button.addEventListener('click', () => {
        saveTheme(key);
        applyAppearance(root, key, parseMode(root.dataset['posMode'] ?? loadMode()), prefersDark());
        paint();
      });
      return button;
    });
    const modeButtons = POS_MODES.map((key) => {
      const button = el('button', {
        className: 'mob-mode',
        text: label(MODE_NAMES[key]),
        attrs: { type: 'button', 'aria-pressed': key === mode ? 'true' : 'false' },
      });
      button.addEventListener('click', () => {
        saveMode(key);
        applyAppearance(
          root,
          parseTheme(root.dataset['posTheme'] ?? loadTheme()),
          key,
          prefersDark(),
        );
        paint();
      });
      return button;
    });
    box.replaceChildren(
      el('p', { className: 'mob-appearance__label', text: label('pilihWarna') }),
      el('div', { className: 'mob-theme-grid' }, ...themeButtons),
      el('p', { className: 'mob-appearance__label', text: label('pilihMode') }),
      el('div', { className: 'mob-mode-grid' }, ...modeButtons),
    );
  };
  paint();
  return box;
}

export function openAppearanceSheet(): ModalHandle {
  return openModal({
    title: label('menuTema'),
    body: createAppearancePicker(),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
