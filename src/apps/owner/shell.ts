import { el } from '../../shared/dom';
import { formatDate, formatTime } from '../../shared/format';
import { icon, type IconName } from '../../shared/icons';
import { label, message, type LabelKey } from '../../shared/messages';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import { openModal } from '../../shared/ui/modal';
import { showToast } from '../../shared/ui/toast';
import { REFRESH_MS } from './domain/constants';
import type { OwnerSession } from './owner-session';
import { attachPull } from './pull-refresh';

export interface NavEntry {
  readonly path: string;
  readonly label: LabelKey;
  readonly icon: IconName;
}

export const NAV: readonly NavEntry[] = [
  { path: '/owner/ringkasan', label: 'navRingkasan', icon: 'layout-dashboard' },
  { path: '/owner/stok', label: 'navStok', icon: 'package' },
  { path: '/owner/transaksi', label: 'navTransaksi', icon: 'clipboard-list' },
  { path: '/owner/laporan', label: 'navLaporan', icon: 'file-text' },
  { path: '/owner/piutang', label: 'navPiutang', icon: 'wallet' },
];

export interface OwnerShell {
  readonly element: HTMLElement;
  readonly content: HTMLElement;
  refreshNow(): void;
  destroy(): void;
}

export function createOwnerShell(
  session: OwnerSession,
  activePath: string,
  title: LabelKey,
  go: (path: string) => void,
): OwnerShell {
  const store = session.store;
  const syncChip = el('button', { className: 'own-chip', attrs: { type: 'button' } });
  const bell = el('a', {
    className: 'own-icon-button',
    attrs: { href: '#/owner/transaksi?tab=notifikasi' },
  });
  const refresh = el('button', { className: 'own-icon-button', attrs: { type: 'button' } });
  const banner = el('div', { className: 'own-banner' });
  const pushBox = el('div', {
    className: 'own-push',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const indicator = el('div', { className: 'own-pull', attrs: { 'aria-hidden': 'true' } });
  const content = el('div', { className: 'own-content' });
  const main = el(
    'main',
    { className: 'own-main', attrs: { id: 'own-main', tabindex: '-1' } },
    indicator,
    content,
  );
  const skip = el('a', {
    className: 'skip-link',
    text: label('lewatiKonten'),
    attrs: { href: '#own-main' },
  });
  const nav = el(
    'nav',
    { className: 'own-nav', attrs: { 'aria-label': label('navUtama') } },
    ...NAV.map((entry) =>
      el(
        'a',
        {
          className: 'own-nav__link',
          attrs: { href: `#${entry.path}`, 'aria-current': entry.path === activePath && 'page' },
        },
        icon(entry.icon),
        el('span', { text: label(entry.label) }),
      ),
    ),
  );
  const element = el(
    'div',
    { className: 'own' },
    skip,
    el(
      'header',
      { className: 'own-top' },
      el('h1', { className: 'own-top__title', text: label(title) }),
      el('div', { className: 'own-top__tools' }, syncChip, bell, refresh),
    ),
    banner,
    pushBox,
    main,
    nav,
  );

  const refreshNow = (): void => {
    const result = session.refresh();
    if (!result.ok && 'messageId' in result) {
      showToast({ kind: 'error', text: message(result.messageId, result.values) });
    }
  };

  const openStatus = (): void => {
    const state = session.state();
    openModal({
      title: label('statusSinkron'),
      body: el(
        'div',
        { className: 'own-sheet' },
        el('p', { text: label('aplikasiMobile') }),
        el('p', {
          className: 't-label',
          text: label('terakhirSinkron', {
            waktu: `${formatDate(new Date(state.lastSync))}, ${formatTime(new Date(state.lastSync))}`,
          }),
        }),
        state.queue.length === 0
          ? el('p', { text: label('antreanKosong') })
          : el(
              'ul',
              { className: 'own-list' },
              ...state.queue.map((item) =>
                el('li', {
                  text: `${item.text}: ${label(item.status === 'menunggu' ? 'statusMenunggu' : item.status === 'mengirim' ? 'statusMengirim' : 'statusTerkirim')}`,
                }),
              ),
            ),
      ),
      actions: [
        { text: label('tutup'), variant: 'secondary' },
        {
          text: label('keluar'),
          variant: 'danger',
          onClick: () => {
            session.logout();
            go('/owner');
          },
        },
      ],
    });
  };
  syncChip.addEventListener('click', openStatus);
  refresh.addEventListener('click', () => {
    if (store.getState().online) {
      refreshNow();
    }
  });

  let pushTimer: number | undefined;
  const paint = (): void => {
    const state = session.state();
    const online = store.getState().online;
    const pending = session.pending();
    syncChip.className = online ? 'own-chip' : 'own-chip own-chip--offline';
    syncChip.replaceChildren(
      icon(online ? 'wifi' : 'wifi-off'),
      el('span', {
        text: online
          ? state.syncing
            ? label('mengirimAntrean', { jumlah: pending })
            : label('tersinkron')
          : pending > 0
            ? label('offlineMenunggu', { jumlah: pending })
            : label('offlineLokal'),
      }),
    );
    syncChip.setAttribute('aria-label', `${label('statusSinkron')}: ${syncChip.textContent}`);
    const unread = state.notifications.filter((item) => !item.read).length;
    bell.replaceChildren(
      icon('bell'),
      ...(unread > 0
        ? [
            el('span', {
              className: 'own-badge',
              text: String(unread),
              attrs: { 'aria-hidden': 'true' },
            }),
          ]
        : []),
    );
    bell.setAttribute(
      'aria-label',
      unread > 0 ? label('notifikasiBelumDibaca', { jumlah: unread }) : label('notifikasi'),
    );
    refresh.replaceChildren(icon('refresh-cw'));
    refresh.setAttribute('aria-label', label('muatUlang'));
    refresh.toggleAttribute('data-inactive', !online);
    refresh.setAttribute('aria-disabled', online ? 'false' : 'true');
    banner.replaceChildren(
      ...(online
        ? []
        : [createBanner('offline', label('offlineDataTerakhir', { jam: session.loadedText() }))]),
    );
    const push = state.push;
    window.clearTimeout(pushTimer);
    pushBox.replaceChildren(
      ...(push === undefined
        ? []
        : [
            el(
              'div',
              { className: 'own-push__card' },
              icon('bell'),
              el('div', {}, el('strong', { text: push.title }), el('p', { text: push.body })),
              createButton({
                text: label('tutup'),
                variant: 'secondary',
                onClick: () => {
                  session.dismissPush();
                },
              }),
            ),
          ]),
    );
    if (push !== undefined) {
      pushTimer = window.setTimeout(() => {
        session.dismissPush();
      }, 8000);
    }
  };
  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const detach = attachPull({ target: main, indicator, onRefresh: refreshNow });
  const interval = window.setInterval(() => {
    if (store.getState().online) {
      session.refresh();
    }
  }, REFRESH_MS);
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
  });
  paint();
  return {
    element,
    content,
    refreshNow,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      detach();
      window.clearInterval(interval);
      window.clearTimeout(pushTimer);
    },
  };
}
