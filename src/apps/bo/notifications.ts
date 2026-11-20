import { el } from '../../shared/dom';
import { formatDecimal, formatRupiah } from '../../shared/format';
import { icon, type IconName } from '../../shared/icons';
import type { BoSession } from './bo-session';
import { computeDashboard } from './domain/dashboard';
import { countBelowMinimum, countNegative } from './domain/stock-view';

// Lonceng notifikasi di header Back-Office (revisi final): lencana merah berisi jumlah pemberitahuan
// dan panel kecil berisi daftarnya. Dimuat malas dari shell supaya JS awal tidak membesar.
const TEXT = {
  judul: 'Notifikasi',
  kosong: 'Tidak ada notifikasi baru.',
  tutup: 'Tutup notifikasi',
  lonceng: 'Notifikasi',
  baru: '{jumlah} baru',
  stokMinim: '{jumlah} barang di bawah stok minimum',
  stokNegatif: '{jumlah} barang bernilai stok negatif',
  piutang: 'Piutang jatuh tempo {jumlah}',
  antrean: '{jumlah} transaksi POS belum terkirim',
} as const;

export interface Notice {
  readonly id: string;
  readonly text: string;
  readonly path: string;
  readonly icon: IconName;
}

// Pemberitahuan dihitung dari data toko saat ini; urutannya dari yang paling mendesak.
export function collectNotices(session: BoSession): readonly Notice[] {
  const state = session.store.getState();
  const products = state.data.products;
  const notices: Notice[] = [];
  const negative = countNegative(products);
  if (negative > 0) {
    notices.push({
      id: 'stok-negatif',
      text: TEXT.stokNegatif.replace('{jumlah}', formatDecimal(negative)),
      path: '/bo/stok',
      icon: 'triangle-alert',
    });
  }
  const below = countBelowMinimum(products);
  if (below > 0) {
    notices.push({
      id: 'stok-minim',
      text: TEXT.stokMinim.replace('{jumlah}', formatDecimal(below)),
      path: '/bo/stok?filter=minimum',
      icon: 'package',
    });
  }
  const overdue = computeDashboard(state, session.now()).overdueAmount;
  if (overdue > 0) {
    notices.push({
      id: 'piutang',
      text: TEXT.piutang.replace('{jumlah}', formatRupiah(overdue)),
      path: '/bo/hutang-piutang/saldo-piutang',
      icon: 'wallet',
    });
  }
  if (state.posQueue > 0) {
    notices.push({
      id: 'antrean',
      text: TEXT.antrean.replace('{jumlah}', formatDecimal(state.posQueue)),
      path: '/bo/dashboard',
      icon: 'wifi-off',
    });
  }
  return notices;
}

export interface NotificationOptions {
  readonly button: HTMLButtonElement;
  readonly badge: HTMLElement;
  // Elemen akar Back-Office tempat panel dipasang.
  readonly host: HTMLElement;
  readonly session: BoSession;
  readonly go: (path: string) => void;
}

// Menghubungkan lonceng ke panel; mengembalikan fungsi pelepas.
export function attachNotifications(options: NotificationOptions): () => void {
  const { button, badge, host, session, go } = options;
  const panelId = 'bo-notif';
  const list = el('ul', { className: 'bo-notif__list' });
  const closeButton = el(
    'button',
    {
      className: 'bo-icon-button bo-notif__close',
      attrs: { type: 'button', 'aria-label': TEXT.tutup },
    },
    icon('x'),
  );
  const panel = el(
    'section',
    { className: 'bo-notif', attrs: { id: panelId, 'aria-label': TEXT.judul } },
    el(
      'div',
      { className: 'bo-notif__head' },
      el('h2', { className: 'bo-notif__title', text: TEXT.judul }),
      closeButton,
    ),
    list,
  );
  panel.hidden = true;
  host.append(panel);
  button.setAttribute('aria-controls', panelId);
  button.setAttribute('aria-expanded', 'false');

  let signature = '';
  const paint = (): void => {
    const notices = collectNotices(session);
    const next = notices.map((notice) => `${notice.id}:${notice.text}`).join('|');
    if (next === signature) {
      return;
    }
    signature = next;
    badge.hidden = notices.length === 0;
    badge.textContent = String(notices.length);
    button.setAttribute(
      'aria-label',
      notices.length === 0
        ? TEXT.lonceng
        : `${TEXT.lonceng}, ${TEXT.baru.replace('{jumlah}', String(notices.length))}`,
    );
    list.replaceChildren(
      ...(notices.length === 0
        ? [el('li', { className: 'bo-notif__empty', text: TEXT.kosong })]
        : notices.map((notice) => {
            const link = el(
              'a',
              { className: 'bo-notif__item', attrs: { href: `#${notice.path}` } },
              icon(notice.icon),
              el('span', { text: notice.text }),
            );
            link.addEventListener('click', (event) => {
              event.preventDefault();
              setOpen(false);
              go(notice.path);
            });
            return el('li', {}, link);
          })),
    );
  };

  function setOpen(open: boolean, restoreFocus = false): void {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      paint();
      (panel.querySelector<HTMLElement>('.bo-notif__item') ?? closeButton).focus();
    } else if (restoreFocus) {
      button.focus();
    }
  }

  const onToggle = (): void => {
    setOpen(panel.hidden !== false);
  };
  const onOutside = (event: MouseEvent): void => {
    if (
      !panel.hidden &&
      event.target instanceof Node &&
      !panel.contains(event.target) &&
      !button.contains(event.target)
    ) {
      setOpen(false);
    }
  };
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false, true);
    }
  };
  const onClose = (): void => {
    setOpen(false, true);
  };
  button.addEventListener('click', onToggle);
  closeButton.addEventListener('click', onClose);
  document.addEventListener('click', onOutside);
  document.addEventListener('keydown', onEscape);

  const unsubscribe = session.store.subscribe(paint);
  const interval = window.setInterval(paint, 30000);
  paint();

  return () => {
    unsubscribe();
    window.clearInterval(interval);
    button.removeEventListener('click', onToggle);
    closeButton.removeEventListener('click', onClose);
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onEscape);
    panel.remove();
  };
}
