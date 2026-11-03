import { el } from '../../shared/dom';
import { formatTime } from '../../shared/format';
import { icon } from '../../shared/icons';
import { label, type LabelKey } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';
import type { PosSession } from './pos-session';

export interface Topbar {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createTopbar(session: PosSession, title: LabelKey): Topbar {
  const chip = el('a', { className: 'pos-chip', attrs: { href: '#/pos/status' } });
  const nav = el('nav', {
    className: 'pos-topbar__nav',
    attrs: { 'aria-label': label('posKasir') },
  });
  const cashier = el('span', { className: 'pos-topbar__cashier' });
  const clock = el('span', { className: 'pos-topbar__clock' });
  const element = el(
    'header',
    { className: 'pos-topbar' },
    el(
      'div',
      { className: 'pos-topbar__brand' },
      el('strong', { text: label('tokoNama') }),
      el('span', { className: 'pos-topbar__sub', text: label('posKasir') }),
      nav,
    ),
    el('h1', { className: 'pos-topbar__title t-screen-title', text: label(title) }),
    el('div', { className: 'pos-topbar__status' }, chip, cashier, clock),
  );
  const render = (): void => {
    const state = session.store.getState();
    const online = state.online;
    chip.className = online ? 'pos-chip pos-chip--online' : 'pos-chip pos-chip--offline';
    chip.replaceChildren(
      icon(online ? 'wifi' : 'wifi-off'),
      el('span', { text: label(online ? 'koneksiOnline' : 'koneksiOffline') }),
    );
    const user = state.data.users.find((item) => item.id === state.userId);
    cashier.textContent = session.state().loggedIn && user !== undefined ? user.name : '';
    clock.textContent = formatTime(session.now());
    const links = session.state().loggedIn
      ? ([
          ['/pos/riwayat', 'POS-06', 'navRiwayat'],
          ['/pos/biaya', 'POS-07', 'navBiaya'],
        ] as const)
      : [];
    nav.replaceChildren(
      ...links
        .filter(([, screen]) => canOpenScreen(state.role, screen))
        .map(([path, , key]) =>
          el('a', {
            className: 'pos-topbar__link',
            text: label(key),
            attrs: { href: `#${path}` },
          }),
        ),
    );
  };
  const unsubscribe = session.store.subscribe(render);
  const interval = window.setInterval(render, 30000);
  render();
  return {
    element,
    destroy: () => {
      unsubscribe();
      window.clearInterval(interval);
    },
  };
}
