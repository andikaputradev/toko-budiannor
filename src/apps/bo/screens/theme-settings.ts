import '../../../styles/bo-stok.css';
import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createBadge } from '../../../shared/ui/badge';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createChip } from '../../../shared/ui/chip';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import {
  applyAppearance,
  loadMode,
  loadTheme,
  parseMode,
  parseTheme,
  POS_MODES,
  POS_THEMES,
  prefersDark,
  resolveScheme,
  saveMode,
  saveTheme,
  type PosMode,
  type PosTheme,
} from '../../../shared/theme';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';

const THEME_NAMES: Readonly<Record<PosTheme, LabelKey>> = {
  oranye: 'temaOranye',
  terakota: 'temaTerakota',
  teal: 'temaTeal',
  biru: 'temaBiru',
  hijau: 'temaHijau',
  ungu: 'temaUngu',
  merah: 'temaMerah',
  kuning: 'temaKuning',
};

const MODE_VIEW: Readonly<
  Record<PosMode, { readonly name: LabelKey; readonly hint: LabelKey; readonly icon: IconName }>
> = {
  otomatis: { name: 'modeOtomatis', hint: 'tmsModeOtomatisDesk', icon: 'monitor' },
  terang: { name: 'modeTerang', hint: 'tmsModeTerangDesk', icon: 'sun' },
  gelap: { name: 'modeGelap', hint: 'tmsModeGelapDesk', icon: 'moon' },
};

interface Choice {
  readonly theme: PosTheme;
  readonly mode: PosMode;
}

function currentChoice(): Choice {
  const root = document.documentElement;
  return {
    theme: parseTheme(root.dataset['posTheme'] ?? loadTheme()),
    mode: parseMode(root.dataset['posMode'] ?? loadMode()),
  };
}

// Elemen kecil yang membawa atribut tema sendiri agar token warna palet tertentu berlaku di dalamnya.
function scoped(
  tag: 'span' | 'div',
  className: string,
  theme: PosTheme,
  scheme: 'terang' | 'gelap',
  mode?: PosMode,
): HTMLElement {
  return el(tag, {
    className,
    attrs: {
      'data-app': 'bo',
      'data-pos-theme': theme,
      'data-pos-scheme': scheme,
      'data-pos-mode': mode,
    },
  });
}

export function renderThemeSettings(session: BoSession): ScreenHandle {
  const store = session.store;
  let applied = currentChoice();
  let pending = applied;

  const themeGrid = el('div', {
    className: 'bo-tema__palettes',
    attrs: { role: 'group', 'aria-label': label('tmsPaletAria') },
  });
  const modeGrid = el('div', {
    className: 'bo-tema__modes',
    attrs: { role: 'group', 'aria-label': label('tmsModeAria') },
  });
  const status = el('p', { className: 'bo-stok-note', attrs: { 'aria-live': 'polite' } });
  const previewBox = el('section', { className: 'bo-panel bo-tema__preview-panel' });
  const hexLabels: {
    readonly theme: PosTheme;
    readonly node: HTMLElement;
    readonly swatch: HTMLElement;
  }[] = [];

  const apply = createButton({
    text: label('tmsTerapkan'),
    icon: 'check',
    onClick: () => {
      saveTheme(pending.theme);
      saveMode(pending.mode);
      applyAppearance(document.documentElement, pending.theme, pending.mode, prefersDark());
      applied = pending;
      showToast({
        kind: 'success',
        text: label('tmsTerapkanSelesai', {
          tema: label(THEME_NAMES[pending.theme]),
          mode: label(MODE_VIEW[pending.mode].name),
        }),
      });
      paint();
    },
  });
  const revert = createButton({
    text: label('tmsKembalikan'),
    variant: 'secondary',
    icon: 'refresh-cw',
    onClick: () => {
      pending = applied;
      paint();
    },
  });

  const sampleProducts = (): readonly { readonly name: string; readonly stock: string }[] =>
    store
      .getState()
      .data.products.filter((item) => item.active !== false)
      .slice(0, 3)
      .map((item) => ({
        name: item.name,
        stock: `${formatDecimal(item.stock.display + item.stock.besar, 3, 0)} ${item.baseUnit}`,
      }));

  const paintPreview = (): void => {
    const scheme = resolveScheme(pending.mode, prefersDark());
    const frame = scoped('div', 'bo-tema-preview', pending.theme, scheme, pending.mode);
    const products = sampleProducts();
    const gudang = createSelectField({
      labelText: label('tmsContohPilihan'),
      options: [
        { value: 'display', text: label('namaGudangDisplay') },
        { value: 'besar', text: label('namaGudangBesar') },
      ],
      value: 'display',
    });
    const nama = createTextField({
      labelText: label('tmsContohIsianLabel'),
      value: products[0]?.name ?? '',
    });
    const group = (title: string, ...children: (Node | string)[]): HTMLElement =>
      el(
        'div',
        { className: 'bo-tema-preview__group' },
        el('p', { className: 'bo-tema-preview__caption', text: title }),
        ...children,
      );
    frame.append(
      el(
        'div',
        { className: 'bo-tema-preview__bar' },
        el('strong', { text: label('tokoNama') }),
        el('span', {
          className: 'bo-tema-preview__pill',
          text: `${label(THEME_NAMES[pending.theme])} | ${label(MODE_VIEW[pending.mode].name)}`,
        }),
      ),
      createBanner('warning', label('peringatanStok')),
      group(
        label('tmsContohTombol'),
        el(
          'div',
          { className: 'bo-tema-preview__row' },
          createButton({ text: label('tmsContohAksi'), icon: 'save' }),
          createButton({ text: label('tmsContohAksiSekunder'), variant: 'secondary' }),
          createButton({ text: label('tmsContohAksiBahaya'), variant: 'danger', icon: 'trash-2' }),
        ),
      ),
      group(
        label('tmsContohIsian'),
        el('div', { className: 'bo-tema-preview__fields' }, nama.root, gudang.root),
      ),
      group(
        label('tmsContohStatus'),
        el(
          'div',
          { className: 'bo-tema-preview__row' },
          createChip({ text: label('semua'), selected: true }),
          createChip({ text: label('gudangDisplay') }),
          createChip({ text: label('gudangBesar') }),
          createBadge('aman'),
          createBadge('di-bawah-minimum'),
          createBadge('ditinjau'),
          createBadge('draf'),
        ),
      ),
      group(
        label('tmsContohTabel'),
        el(
          'table',
          { className: 'pos-table bo-tema-preview__table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { text: label('kolomNamaBarang') }),
              el('th', { className: 'is-end', text: label('kolomStok') }),
            ),
          ),
          el(
            'tbody',
            {},
            ...products.map((item, index) =>
              el(
                'tr',
                { className: index === 0 ? 'is-selected' : '' },
                el('td', { text: item.name }),
                el('td', { className: 'is-end', text: item.stock }),
              ),
            ),
          ),
        ),
      ),
    );
    previewBox.replaceChildren(
      el('h3', { className: 'bo-stok-panel-title', text: label('tmsPratinjau') }),
      el('p', { className: 'bo-stok-note', text: label('tmsPratinjauBantuan') }),
      frame,
    );
  };

  const paintPalettes = (): void => {
    hexLabels.length = 0;
    themeGrid.replaceChildren(
      ...POS_THEMES.map((key) => {
        const selected = key === pending.theme;
        const hex = el('span', { className: 'bo-tema-card__hex' });
        const probe = scoped('span', 'bo-tema-swatch', key, 'terang');
        hexLabels.push({ theme: key, node: hex, swatch: probe });
        const swatches = (scheme: 'terang' | 'gelap'): HTMLElement =>
          el(
            'span',
            { className: 'bo-tema-card__swatches' },
            scheme === 'terang' ? probe : scoped('span', 'bo-tema-swatch', key, scheme),
            scoped('span', 'bo-tema-swatch bo-tema-swatch--soft', key, scheme),
          );
        const button = el(
          'button',
          {
            className: 'bo-tema-card',
            attrs: { type: 'button', 'aria-pressed': selected ? 'true' : 'false' },
          },
          el(
            'span',
            { className: 'bo-tema-card__head' },
            el('strong', { className: 'bo-tema-card__name', text: label(THEME_NAMES[key]) }),
            selected ? icon('circle-check') : false,
          ),
          hex,
          el(
            'span',
            { className: 'bo-tema-card__samples' },
            el(
              'span',
              { className: 'bo-tema-card__sample' },
              swatches('terang'),
              el('span', { className: 'bo-tema-card__sample-name', text: label('tmsAksenTerang') }),
            ),
            el(
              'span',
              { className: 'bo-tema-card__sample' },
              swatches('gelap'),
              el('span', { className: 'bo-tema-card__sample-name', text: label('tmsAksenGelap') }),
            ),
          ),
          applied.theme === key
            ? el('span', { className: 'bo-tema-card__current', text: label('tmsSedangDipakai') })
            : false,
        );
        button.addEventListener('click', () => {
          pending = { ...pending, theme: key };
          paint();
          themeGrid
            .querySelectorAll<HTMLElement>('.bo-tema-card')
            [POS_THEMES.indexOf(key)]?.focus();
        });
        return button;
      }),
    );
    // Kode warna dibaca dari token agar selalu sama dengan yang dipakai aplikasi.
    requestAnimationFrame(() => {
      for (const item of hexLabels) {
        const value = getComputedStyle(item.swatch)
          .getPropertyValue('--color-accent-default')
          .trim();
        item.node.textContent = value.toUpperCase();
      }
    });
  };

  const paintModes = (): void => {
    modeGrid.replaceChildren(
      ...POS_MODES.map((key) => {
        const view = MODE_VIEW[key];
        const selected = key === pending.mode;
        const button = el(
          'button',
          {
            className: 'bo-tema-mode',
            attrs: { type: 'button', 'aria-pressed': selected ? 'true' : 'false' },
          },
          icon(view.icon),
          el(
            'span',
            { className: 'bo-tema-mode__text' },
            el('strong', { text: label(view.name) }),
            el('span', { className: 'bo-tema-mode__hint', text: label(view.hint) }),
          ),
        );
        button.addEventListener('click', () => {
          pending = { ...pending, mode: key };
          paint();
          modeGrid.querySelectorAll<HTMLElement>('.bo-tema-mode')[POS_MODES.indexOf(key)]?.focus();
        });
        return button;
      }),
    );
  };

  function paint(): void {
    const same = pending.theme === applied.theme && pending.mode === applied.mode;
    apply.disabled = same;
    revert.disabled = same;
    status.textContent = label(same ? 'tmsSudahDiterapkan' : 'tmsBelumDiterapkan');
    paintPalettes();
    paintModes();
    paintPreview();
  }

  // Pemilih cepat di bilah atas Back-Office mengubah atribut yang sama; ikuti agar tidak basi.
  const observer = new MutationObserver(() => {
    const now = currentChoice();
    if (now.theme !== applied.theme || now.mode !== applied.mode) {
      applied = now;
      pending = now;
      paint();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-pos-theme', 'data-pos-mode'],
  });

  const element = el(
    'div',
    { className: 'bo-stok-page bo-tema' },
    el(
      'header',
      { className: 'bo-stok-head' },
      el(
        'div',
        { className: 'bo-stok-head__text' },
        el('h2', { className: 'bo-stok-head__title', text: label('menuTema') }),
        el('p', { className: 'bo-stok-head__sub', text: label('tmsSub') }),
      ),
    ),
    el(
      'div',
      { className: 'bo-tema__layout' },
      el(
        'div',
        { className: 'bo-tema__choices' },
        el(
          'section',
          { className: 'bo-panel' },
          el('h3', { className: 'bo-stok-panel-title', text: label('tmsPaletJudul') }),
          el('p', { className: 'bo-stok-note', text: label('tmsPaletBantuan') }),
          themeGrid,
        ),
        el(
          'section',
          { className: 'bo-panel' },
          el('h3', { className: 'bo-stok-panel-title', text: label('tmsModeJudul') }),
          el('p', { className: 'bo-stok-note', text: label('tmsModeBantuan') }),
          modeGrid,
        ),
        el(
          'section',
          { className: 'bo-panel bo-tema__actions' },
          el(
            'div',
            { className: 'bo-tema__actions-text' },
            status,
            el('p', { className: 'bo-stok-note', text: label('tmsBerlaku') }),
          ),
          el('div', { className: 'bo-form__actions' }, revert, apply),
        ),
      ),
      previewBox,
    ),
  );
  paint();
  return {
    element,
    destroy: () => {
      observer.disconnect();
    },
  };
}
