import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { totalStock } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createBarChart } from '../bar-chart';
import type { BoSession } from '../bo-session';
import { computeDashboard } from '../domain/dashboard';
import type { ScreenHandle } from './login';

function shortDate(day: string): string {
  return formatDate(new Date(`${day}T12:00:00+07:00`))
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)}, ${formatTime(date)} WIB`;
}

export function renderDashboard(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const cards = el('div', { className: 'bo-cards' });
  const chartBox = el('section', { className: 'bo-dash__chart' });
  const tableBox = el('section', { className: 'bo-dash__table' });
  const strip = el('section', { className: 'bo-strip' });
  const updated = el('p', { className: 't-label bo-dash__updated' });

  const card = (name: string, value: string): HTMLElement =>
    el(
      'div',
      { className: 'bo-card' },
      el('p', { className: 't-label', text: name }),
      el('output', { className: 'bo-card__value t-total', text: value }),
    );

  const paint = (): void => {
    const data = computeDashboard(store.getState(), session.now());
    updated.textContent = label('diperbarui', { waktu: formatTime(session.now()) });
    cards.replaceChildren(
      card(label('omzetHariIni'), formatRupiah(data.omzetToday)),
      card(label('transaksiHariIni'), String(data.countToday)),
      card(label('piutangJatuhTempo'), formatRupiah(data.overdueAmount)),
      card(label('stokDiBawahMinimum'), label('jumlahBarang', { jumlah: data.belowMinimum })),
    );
    chartBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('omzet7Hari') }),
      data.series.every((item) => item.revenue === 0)
        ? el('p', { className: 't-label', text: label('belumAdaPenjualan') })
        : createBarChart({
            title: label('omzet7Hari'),
            data: data.series.map((item) => ({
              label: shortDate(item.date),
              value: item.revenue,
              caption: formatRupiah(item.revenue),
            })),
            axisLabel: (value) =>
              value === 0 ? 'Rp 0' : `Rp ${formatDecimal(value / 1_000_000, 1)} jt`,
          }),
    );
    const viewAll = createButton({
      text: label('lihatSemuaStok'),
      variant: 'secondary',
      onClick: () => {
        go('/bo/stok?filter=minimum');
      },
    });
    tableBox.replaceChildren(
      el('h2', { className: 't-section-title', text: label('peringatanStok') }),
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomKode') }),
            el('th', { text: label('kolomNamaBarang') }),
            el('th', { className: 'is-end', text: label('kolomTotal') }),
            el('th', { className: 'is-end', text: label('kolomMin') }),
          ),
        ),
        el(
          'tbody',
          {},
          ...data.critical.map((product) =>
            el(
              'tr',
              {},
              el('td', { text: product.code }),
              el('td', { text: product.name }),
              el('td', { className: 'is-end', text: formatDecimal(totalStock(product), 3, 1) }),
              el('td', { className: 'is-end', text: formatDecimal(product.minStock, 3, 1) }),
            ),
          ),
        ),
      ),
      ...(session.allowed('BO-02', 'Lihat Semua Stok') ? [viewAll] : []),
    );
    const negative = createButton({
      text: String(data.negative),
      variant: 'secondary',
      onClick: () => {
        go('/bo/stok?filter=negatif');
      },
    });
    negative.setAttribute('aria-label', label('stokNegatifAria', { jumlah: data.negative }));
    strip.replaceChildren(
      el('h2', { className: 't-section-title', text: label('perluDitinjau') }),
      el(
        'div',
        { className: 'bo-strip__items' },
        el(
          'div',
          { className: 'bo-strip__item' },
          el('span', { className: 't-label', text: label('stokNegatif') }),
          negative,
        ),
        el(
          'div',
          { className: 'bo-strip__item' },
          el('span', { className: 't-label', text: label('antreanPos') }),
          el('output', {
            className: 't-value',
            text: label('jumlahTransaksi', { jumlah: data.queue }),
          }),
        ),
        el(
          'div',
          { className: 'bo-strip__item' },
          el('span', { className: 't-label', text: label('backupTerakhir') }),
          el('output', {
            className: 't-value',
            text: `${stamp(data.backup.at)} ${label(data.backup.ok ? 'backupBerhasil' : 'backupGagal')}`,
          }),
        ),
      ),
    );
  };
  const stop = store.subscribe(paint);
  paint();

  const element = el(
    'div',
    { className: 'bo-dash' },
    updated,
    cards,
    el('div', { className: 'bo-dash__split' }, chartBox, tableBox),
    strip,
  );
  return {
    element,
    destroy: () => {
      stop();
    },
  };
}
