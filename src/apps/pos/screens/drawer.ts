import { el } from '../../../shared/dom';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { canOpenScreen } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { openModal, type ModalHandle } from '../../../shared/ui/modal';
import type { PosSession } from '../pos-session';
import { ROLE_LABELS } from '../roles';
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
  { path: '/pos/pelanggan', screen: 'POS-08', key: 'pelanggan', icon: 'user-round' },
  { path: '/pos/karyawan', screen: 'POS-11', key: 'karyawan', icon: 'users' },
  { path: '/pos/status', screen: 'POS-09', key: 'statusSinkronisasi', icon: 'refresh-cw' },
  { path: '/pos/pengaturan', screen: 'POS-12', key: 'pengaturan', icon: 'settings' },
];

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
      footer,
    ),
    actions: [],
  });
}
