import { el } from '../../shared/dom';
import { formatDate, formatTime } from '../../shared/format';
import { icon, type IconName } from '../../shared/icons';
import { label, type LabelKey } from '../../shared/messages';
import { createAppearancePicker } from '../../shared/ui/appearance';
import { createBanner } from '../../shared/ui/banner';
import { createAvatar, initialsOf } from '../../shared/ui/mobile-card';
import { openModal } from '../../shared/ui/modal';
import type { SalesSession } from './sales-session';

export interface NavEntry {
  readonly path: string;
  readonly label: LabelKey;
  readonly icon: IconName;
}

export const NAV: readonly NavEntry[] = [
  { path: '/sales/katalog', label: 'navKatalog', icon: 'package' },
  { path: '/sales/order', label: 'navOrder', icon: 'shopping-cart' },
  { path: '/sales/riwayat', label: 'navRiwayat', icon: 'history' },
];

export interface SalesShellOptions {
  /** Rute tujuan tombol kembali pada layar detail. */
  readonly back?: string | undefined;
}

export interface SalesShell {
  readonly element: HTMLElement;
  readonly content: HTMLElement;
  setTitle(text: string): void;
  setBack(path: string | undefined): void;
  destroy(): void;
}

export function createSalesShell(
  session: SalesSession,
  activePath: string,
  title: LabelKey,
  go: (path: string) => void,
  options: SalesShellOptions = {},
): SalesShell {
  const store = session.store;
  const userName = session.userName();
  const initials = initialsOf(userName);
  const chip = el('button', { className: 'own-chip', attrs: { type: 'button' } });
  const banner = el('div', { className: 'own-banner' });
  const content = el('div', { className: 'own-content' });
  const main = el(
    'main',
    { className: 'own-main', attrs: { id: 'own-main', tabindex: '-1' } },
    content,
  );
  const skip = el('a', {
    className: 'skip-link',
    text: label('lewatiKonten'),
    attrs: { href: '#own-main' },
  });
  const links = NAV.map((entry) => {
    const link = el('a', {
      className: 'own-nav__link',
      attrs: { href: `#${entry.path}`, 'aria-current': entry.path === activePath && 'page' },
    });
    return { entry, link };
  });
  const nav = el(
    'nav',
    { className: 'own-nav own-nav--three', attrs: { 'aria-label': label('navUtama') } },
    ...links.map((item) => item.link),
  );
  const titleNode = el('h1', { className: 'own-top__title', text: label(title) });
  const backLink = el('a', { className: 'mob-back', attrs: { 'aria-label': label('kembali') } });
  backLink.append(icon('chevron-left'));
  const setBack = (path: string | undefined): void => {
    backLink.hidden = path === undefined;
    if (path !== undefined) {
      backLink.setAttribute('href', `#${path}`);
    }
  };
  setBack(options.back);
  // Nama tombol lewat teks tersembunyi (bukan aria-label): inisial yang tampak tidak ada di dalam
  // aria-label sehingga aturan axe "label-content-name-mismatch" (WCAG 2.5.3) gagal.
  const avatarButton = el(
    'button',
    { className: 'own-icon-button', attrs: { type: 'button' } },
    createAvatar(initials),
    el('span', { className: 'visually-hidden', text: label('akunDanTampilan') }),
  );
  const element = el(
    'div',
    { className: 'own' },
    skip,
    el(
      'header',
      { className: 'own-top' },
      backLink,
      titleNode,
      el('div', { className: 'own-top__tools' }, chip, avatarButton),
    ),
    banner,
    main,
    nav,
  );

  const openAccount = (): void => {
    const state = session.state();
    const printer = el('select', {
      className: 'input',
      attrs: { id: 'sal-printer' },
    });
    printer.append(el('option', { text: label('tanpaPrinter'), attrs: { value: '' } }));
    for (const name of session.printers) {
      printer.append(el('option', { text: name, attrs: { value: name } }));
    }
    printer.value = state.printer ?? '';
    printer.addEventListener('change', () => {
      session.setPrinter(printer.value === '' ? undefined : printer.value);
    });
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
            el('p', { className: 't-label', text: label('peranSales') }),
          ),
        ),
        el(
          'div',
          { className: 'own-sheet own-form' },
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
          el('label', {
            className: 'field__label',
            text: label('printerBluetooth'),
            attrs: { for: 'sal-printer' },
          }),
          printer,
          el('p', { className: 't-label', text: label('simulasiPrinter') }),
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
            go('/sales');
          },
        },
      ],
    });
  };
  chip.addEventListener('click', openAccount);
  avatarButton.addEventListener('click', openAccount);

  const paint = (): void => {
    const online = store.getState().online;
    const pending = session.pending();
    const syncing = session.state().syncing;
    chip.className = online ? 'own-chip' : 'own-chip own-chip--offline';
    chip.replaceChildren(
      icon(online ? 'wifi' : 'wifi-off'),
      el('span', {
        text: online
          ? syncing
            ? label('mengirimAntrean', { jumlah: pending })
            : label('tersinkron')
          : pending > 0
            ? label('offlineMenunggu', { jumlah: pending })
            : label('offlineLokal'),
      }),
    );
    chip.setAttribute('aria-label', `${label('statusSinkron')}: ${chip.textContent}`);
    banner.replaceChildren(
      ...(online ? [] : [createBanner('offline', label('offlineSales', { antrean: pending }))]),
    );
    const lines = session.state().draft.lines.length;
    for (const { entry, link } of links) {
      link.replaceChildren(
        icon(entry.icon),
        el('span', {
          text:
            entry.path === '/sales/order' && lines > 0
              ? `${label(entry.label)} (${String(lines)})`
              : label(entry.label),
        }),
      );
    }
  };
  const stops = [session.subscribe(paint), store.subscribe(paint)];
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
  });
  paint();
  return {
    element,
    content,
    setTitle: (text) => {
      titleNode.textContent = text;
    },
    setBack,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}
