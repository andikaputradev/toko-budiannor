import { el } from '../../shared/dom';
import { formatTime } from '../../shared/format';
import { icon } from '../../shared/icons';
import { label, type LabelKey } from '../../shared/messages';
import { canOpenScreen } from '../../shared/permissions';
import { navigate } from '../../shared/router';
import type { PosSession } from './pos-session';
import { openDrawer } from './screens/drawer';

export interface Topbar {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createTopbar(session: PosSession, title: LabelKey): Topbar {
  const menu = el(
    'button',
    {
      className: 'pos-menu',
      attrs: { type: 'button', 'aria-label': label('menu'), 'aria-haspopup': 'dialog' },
    },
    icon('menu'),
  );
  menu.addEventListener('click', () => {
    openDrawer(session, navigate);
  });
  const shiftChip = el('span', { className: 'pos-shiftchip' });
  const chip = el('a', { className: 'pos-chip', attrs: { href: '#/pos/status' } });
  const badge = el('span', { className: 'pos-badge' });
  const bills = el(
    'a',
    { className: 'pos-billlink', attrs: { href: '#/pos/bill' } },
    icon('receipt'),
    badge,
  );
  const cashier = el('span', { className: 'pos-topbar__cashier' });
  const clock = el('span', { className: 'pos-topbar__clock' });
  const element = el(
    'header',
    { className: 'pos-topbar' },
    el(
      'div',
      { className: 'pos-topbar__lead' },
      menu,
      el('h1', { className: 'pos-topbar__title t-screen-title', text: label(title) }),
    ),
    el('div', { className: 'pos-topbar__center' }, shiftChip),
    el('div', { className: 'pos-topbar__status' }, chip, bills, cashier, clock),
  );
  const render = (): void => {
    const state = session.store.getState();
    const loggedIn = session.state().loggedIn;
    const online = state.online;
    menu.hidden = !loggedIn;
    chip.className = online ? 'pos-chip pos-chip--online' : 'pos-chip pos-chip--offline';
    chip.setAttribute('aria-label', label(online ? 'koneksiOnline' : 'koneksiOffline'));
    chip.replaceChildren(
      icon(online ? 'wifi' : 'wifi-off'),
      el('span', { text: label(online ? 'koneksiOnline' : 'koneksiOffline') }),
    );
    const user = state.data.users.find((item) => item.id === state.userId);
    cashier.textContent = loggedIn && user !== undefined ? user.name : '';
    clock.textContent = formatTime(session.now());
    const shift = session.state().shift;
    shiftChip.hidden = !loggedIn || shift === undefined;
    shiftChip.textContent =
      shift === undefined
        ? ''
        : shift.userId === state.userId
          ? label('shiftDimulai')
          : label('shiftDimulaiOleh', { nama: session.userName(shift.userId) });
    const count = session.state().heldBills.length;
    bills.hidden = !loggedIn || !canOpenScreen(state.role, 'POS-05');
    badge.textContent = String(count);
    bills.setAttribute('aria-label', label('openBillJumlah', { jumlah: count }));
  };
  const unsubscribe = [session.store.subscribe(render), session.subscribe(render)];
  const interval = window.setInterval(render, 30000);
  render();
  return {
    element,
    destroy: () => {
      for (const stop of unsubscribe) {
        stop();
      }
      window.clearInterval(interval);
    },
  };
}
