import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import type { SyncItem, SyncKind, SyncStatus } from '../../../shared/data/types';
import { label, message, type LabelKey } from '../../../shared/messages';
import { totalStock } from '../../../shared/data/units';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';

const STATUS_LABELS: Readonly<Record<SyncStatus, LabelKey>> = {
  menunggu: 'statusMenunggu',
  mengirim: 'statusMengirim',
  gagal: 'statusGagal',
  terkirim: 'statusTerkirim',
};

const KIND_LABELS: Readonly<Record<SyncKind, LabelKey>> = {
  transaksi: 'antreanTransaksi',
  biaya: 'antreanBiaya',
  pelanggan: 'antreanPelanggan',
  otorisasi: 'antreanOtorisasi',
};

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function renderStatus(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulStatus');
  const connection = el('section', { className: 'pos-status-card pos-status-card--connection' });
  const counter = el('section', { className: 'pos-status-card' });
  const notice = el('div', { className: 'pos-status__notice', attrs: { 'aria-live': 'polite' } });
  const syncButton = createButton({
    text: label('sinkronSekarang'),
    onClick: () => {
      const result = session.syncNow();
      notice.replaceChildren(
        ...(result.ok ? [] : [createBanner('warning', message(result.messageId))]),
      );
    },
  });
  syncButton.classList.add('pos-status__sync');
  const queueBox = el('section', { className: 'pos-status__queue' });
  const negativeBox = el('section', { className: 'pos-status__negative' });

  const paint = (): void => {
    const store = session.store.getState();
    const state = session.state();
    const online = store.online;
    connection.classList.toggle('is-offline', !online);
    connection.replaceChildren(
      el(
        'p',
        { className: 'pos-status-card__state t-section-title' },
        icon(online ? 'wifi' : 'wifi-off'),
        el('span', { text: label(online ? 'koneksiOnline' : 'koneksiOffline') }),
      ),
      el('p', {
        className: 't-label',
        text: label('terakhirTersambung', { waktu: stamp(state.lastConnected) }),
      }),
      el('p', {
        className: 't-label',
        text: label('terakhirSinkron', { waktu: stamp(state.lastSync) }),
      }),
    );
    const pending = session.pendingQueue();
    counter.replaceChildren(
      el('p', { className: 't-label', text: label('jumlahAntrean') }),
      el('output', { className: 'pos-status-card__count', text: String(pending) }),
      ...(pending === 0 ? [el('p', { className: 't-label', text: message('MSG-019') })] : []),
    );
    const syncing = state.syncing;
    syncButton.textContent = syncing
      ? label('mengirimProgres', { ke: syncing.current, total: syncing.total })
      : label('sinkronSekarang');
    const inactive = syncing !== undefined || !online;
    syncButton.toggleAttribute('data-inactive', inactive);

    const rows = [...state.queue].sort((first: SyncItem, second: SyncItem) =>
      first.createdAt.localeCompare(second.createdAt),
    );
    queueBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('antreanTabel') }),
      rows.length === 0
        ? el('p', { className: 't-label', text: message('MSG-019') })
        : el(
            'div',
            { className: 'pos-status__scroll' },
            el(
              'table',
              { className: 'pos-table pos-table--dense' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('kolomNoTransaksi') }),
                  el('th', { text: label('kolomWaktu') }),
                  el('th', { className: 'is-end', text: label('kolomTotal') }),
                  el('th', { text: label('kolomStatus') }),
                  el('th', { text: label('kolomKeterangan') }),
                ),
              ),
              el(
                'tbody',
                {},
                ...rows.map((item) =>
                  el(
                    'tr',
                    {},
                    el('td', { text: item.saleNumber }),
                    el('td', { text: formatTime(new Date(item.createdAt)) }),
                    el('td', {
                      className: 'is-end',
                      text: item.total > 0 ? formatRupiah(item.total) : '',
                    }),
                    el(
                      'td',
                      {},
                      el('span', {
                        className: `pos-sync pos-sync--${item.status}`,
                        text: label(STATUS_LABELS[item.status]),
                      }),
                    ),
                    el('td', { text: label(KIND_LABELS[item.kind]) }),
                  ),
                ),
              ),
            ),
          ),
    );

    const negatives = store.data.products.filter(
      (product) => store.negativeReview.includes(product.id) && totalStock(product) < 0,
    );
    negativeBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('stokNegatifTabel') }),
      negatives.length === 0
        ? el('p', { className: 't-label', text: label('stokNegatifKosong') })
        : el(
            'table',
            { className: 'pos-table pos-table--dense' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { text: label('kolomBarang') }),
                el('th', { className: 'is-end', text: label('kolomStok') }),
                el('th', { text: label('kolomGudang') }),
              ),
            ),
            el(
              'tbody',
              {},
              ...negatives.map((product) =>
                el(
                  'tr',
                  {},
                  el(
                    'td',
                    {},
                    el('span', { text: product.name }),
                    el('span', { className: 'pos-short', text: label('ditinjauNegatif') }),
                  ),
                  el('td', {
                    className: 'is-end',
                    text: formatDecimal(totalStock(product), 3, 1),
                  }),
                  el('td', {
                    text: label(product.stock.display < 0 ? 'gudangDisplay' : 'gudangBesar'),
                  }),
                ),
              ),
            ),
          ),
    );
  };

  syncButton.addEventListener(
    'click',
    (event) => {
      if (session.state().syncing) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (isPc() && event.key === 'F5') {
      event.preventDefault();
      syncButton.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stops = [session.subscribe(paint), session.store.subscribe(paint)];

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-status' },
      el(
        'div',
        { className: 'pos-status__side' },
        connection,
        counter,
        syncButton,
        notice,
        negativeBox,
        createButton({
          text: label('kembaliKeJual'),
          variant: 'secondary',
          onClick: () => {
            go('/pos/jual');
          },
        }),
      ),
      queueBox,
    ),
  );
  paint();
  return {
    element,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
