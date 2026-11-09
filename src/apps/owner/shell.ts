import { el } from '../../shared/dom';
import { formatDate, formatTime } from '../../shared/format';
import { icon, type IconName } from '../../shared/icons';
import { label, message, type LabelKey } from '../../shared/messages';
import { createAppearancePicker } from '../../shared/ui/appearance';
import { createBanner } from '../../shared/ui/banner';
import { createButton } from '../../shared/ui/button';
import { createAvatar, initialsOf } from '../../shared/ui/mobile-card';
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

// Empat tab seperti gambar proposal. Piutang dan Hutang dibuka dari kartu dashboard dan layar Transaksi.
export const NAV: readonly NavEntry[] = [
  { path: '/owner/ringkasan', label: 'navDashboard', icon: 'layout-dashboard' },
  { path: '/owner/stok', label: 'navStok', icon: 'package' },
  { path: '/owner/transaksi', label: 'navTransaksi', icon: 'receipt-text' },
  { path: '/owner/laporan', label: 'navLaporan', icon: 'chart-column' },
];

export interface ShellOptions {
  /** Pita berwarna dengan salam dan avatar (hanya Dashboard). */
  readonly hero?: boolean | undefined;
  /** Rute tujuan tombol kembali pada layar detail. */
  readonly back?: string | undefined;
}

export interface OwnerShell {
  readonly element: HTMLElement;
  readonly content: HTMLElement;
  refreshNow(): void;
  /** Mengganti judul bilah atas (untuk layar detail). */
  setTitle(text: string): void;
  /** Menampilkan atau menyembunyikan tombol kembali ke rute tertentu. */
  setBack(path: string | undefined): void;
  destroy(): void;
}

function greetingKey(date: Date): LabelKey {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    }).format(date),
  );
  if (hour < 11) {
    return 'salamPagi';
  }
  if (hour < 15) {
    return 'salamSiang';
  }
  return hour < 18 ? 'salamSore' : 'salamMalam';
}

export function createOwnerShell(
  session: OwnerSession,
  activePath: string,
  title: LabelKey,
  go: (path: string) => void,
  options: ShellOptions = {},
): OwnerShell {
  const store = session.store;
  const user = store.getState().data.users.find((item) => item.id === session.state().userId);
  const userName = user?.name ?? label('peranOwner');
  const initials = initialsOf(userName);
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
  const tools = el('div', { className: 'own-top__tools' }, syncChip, bell, refresh);

  // Nama tombol diambil dari isinya (bukan aria-label) agar teks yang terlihat selalu menjadi bagian
  // dari nama aksesibelnya (WCAG 2.5.3); tujuan tombol dibaca lewat teks tersembunyi.
  const accountButton = el(
    'button',
    { className: 'mob-hero__who', attrs: { type: 'button' } },
    createAvatar(initials),
    el(
      'span',
      { className: 'mob-hero__greet' },
      el('span', { className: 'mob-hero__small', text: label(greetingKey(session.now())) }),
      ' ',
      el('span', { className: 'mob-hero__name', text: userName }),
    ),
    el('span', { className: 'visually-hidden', text: label('akunDanTampilan') }),
  );

  const titleNode = el('h1', {
    className: options.hero === true ? 'mob-hero__pill' : 'own-top__title',
    text: label(title),
  });
  const backLink = el('a', {
    className: 'mob-back',
    attrs: { 'aria-label': label('kembali') },
  });
  backLink.append(icon('chevron-left'));

  let header: HTMLElement;
  if (options.hero === true) {
    header = el(
      'header',
      { className: 'mob-hero' },
      el('div', { className: 'mob-hero__row' }, accountButton, tools),
      titleNode,
    );
  } else {
    const avatarButton = el(
      'button',
      { className: 'own-icon-button', attrs: { type: 'button' } },
      createAvatar(initials),
      el('span', { className: 'visually-hidden', text: label('akunDanTampilan') }),
    );
    avatarButton.addEventListener('click', () => {
      openAccount();
    });
    header = el('header', { className: 'own-top' }, backLink, titleNode, tools, avatarButton);
  }
  const setBack = (path: string | undefined): void => {
    backLink.hidden = path === undefined;
    if (path !== undefined) {
      backLink.setAttribute('href', `#${path}`);
    }
  };
  setBack(options.back);

  const main = el(
    'main',
    { className: 'own-main', attrs: { id: 'own-main', tabindex: '-1' } },
    ...(options.hero === true ? [header] : []),
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
    { className: 'own-nav own-nav--four', attrs: { 'aria-label': label('navUtama') } },
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
    ...(options.hero === true ? [] : [header]),
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

  function openAccount(): void {
    const state = session.state();
    openModal({
      title: label('akunDanTampilan'),
      body: el(
        'div',
        { className: 'mob-account' },
        el(
          'div',
          { className: 'mob-account__who' },
          createAvatar(initials),
          el(
            'div',
            {},
            el('p', { className: 'mob-account__name', text: userName }),
            el('p', { className: 't-label', text: label('peranOwner') }),
          ),
        ),
        el(
          'div',
          { className: 'own-sheet' },
          el('p', { className: 't-label', text: label('aplikasiMobile') }),
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
        createAppearancePicker(),
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
  }
  syncChip.addEventListener('click', openAccount);
  accountButton.addEventListener('click', openAccount);
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
    setTitle: (text) => {
      titleNode.textContent = text;
    },
    setBack,
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
