import { el } from '../../../shared/dom';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { canOpenScreen } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { openModal, type ModalHandle } from '../../../shared/ui/modal';
import type { PosSession } from '../pos-session';
import { ROLE_LABELS } from '../roles';
import { applyTheme, parseTheme, POS_THEMES, saveTheme, type PosTheme } from '../theme';
import { openShiftSummary } from './shift';

interface DrawerItem {
  readonly path: string;
  readonly screen: string;
  readonly key: LabelKey;
  readonly icon: IconName;
}

const ITEMS: readonly DrawerItem[] = [
  { path: '/pos/jual', screen: 'POS-02', key: 'pesananBaru', icon: 'shopping-cart' },
  { path: '/pos/bill', screen: 'POS-05', key: 'openBill', icon: 'clipboard-list' },
  { path: '/pos/riwayat', screen: 'POS-06', key: 'riwayatPenjualan', icon: 'file-text' },
  { path: '/pos/biaya', screen: 'POS-07', key: 'navBiaya', icon: 'wallet' },
  { path: '/pos/pelanggan-baru', screen: 'POS-08', key: 'pelanggan', icon: 'user-round' },
  { path: '/pos/status', screen: 'POS-09', key: 'statusSinkronisasi', icon: 'refresh-cw' },
];

const THEME_LABELS: Readonly<Record<PosTheme, LabelKey>> = {
  oranye: 'temaOranye',
  terakota: 'temaTerakota',
  teal: 'temaTeal',
  gelap: 'temaGelap',
};

export function openDrawer(session: PosSession, go: (path: string) => void): void {
  const state = session.store.getState();
  const user = state.data.users.find((item) => item.id === state.userId);
  const current = window.location.hash.slice(1);
  const close = (): void => {
    handle.close();
  };

  const links = ITEMS.filter((item) => canOpenScreen(state.role, item.screen)).map((item) => {
    const link = el(
      'a',
      {
        className: 'pos-drawer__link',
        attrs: {
          href: `#${item.path}`,
          'aria-current': item.path === current ? 'page' : false,
        },
      },
      icon(item.icon),
      el('span', { text: label(item.key) }),
    );
    link.addEventListener('click', close);
    return link;
  });

  const selected = parseTheme(document.documentElement.dataset['posTheme'] ?? null);
  const themes = el('div', {
    className: 'pos-drawer__themes',
    attrs: { role: 'radiogroup', 'aria-label': label('tema') },
  });
  for (const theme of POS_THEMES) {
    const button = el(
      'button',
      {
        className: 'pos-drawer__theme',
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': theme === selected ? 'true' : 'false',
        },
      },
      el('span', {
        className: 'pos-swatch',
        attrs: { 'data-app': 'pos', 'data-pos-theme': theme, 'aria-hidden': 'true' },
      }),
      el('span', { text: label(THEME_LABELS[theme]) }),
    );
    button.dataset['theme'] = theme;
    button.addEventListener('click', () => {
      applyTheme(document.documentElement, theme);
      saveTheme(theme);
      for (const other of themes.querySelectorAll<HTMLElement>('[role="radio"]')) {
        other.setAttribute('aria-checked', other.dataset['theme'] === theme ? 'true' : 'false');
      }
    });
    themes.append(button);
  }

  const shiftOpen = state.role !== 'frontliner' && session.state().shift !== undefined;
  const footer = el('div', { className: 'pos-drawer__footer' });
  if (shiftOpen) {
    footer.append(
      createButton({
        text: label('selesaiShift'),
        onClick: () => {
          close();
          openShiftSummary(session, () => {
            go('/pos/jual');
          });
        },
      }),
    );
  }
  footer.append(
    createButton({
      text: label('keluar'),
      variant: 'secondary',
      icon: 'log-out',
      onClick: () => {
        close();
        session.logout();
        go('/pos');
      },
    }),
  );

  const handle: ModalHandle = openModal({
    title: label('tokoNama'),
    variant: 'drawer',
    body: el(
      'div',
      { className: 'pos-drawer' },
      el(
        'p',
        { className: 'pos-drawer__user' },
        el('strong', { text: user?.name ?? '' }),
        el('span', {
          className: 't-label',
          text: user === undefined ? '' : label(ROLE_LABELS[user.role]),
        }),
      ),
      el(
        'nav',
        { className: 'pos-drawer__nav', attrs: { 'aria-label': label('menuUtama') } },
        ...links,
      ),
      el('p', { className: 't-label', text: label('tema') }),
      themes,
      footer,
    ),
    actions: [],
  });
}
