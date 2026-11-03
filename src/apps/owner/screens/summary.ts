import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createBarChart } from '../../../shared/ui/bar-chart';
import { createChip } from '../../../shared/ui/chip';
import { summarize, type Period } from '../domain/summary';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';

const PERIODS: readonly (readonly [Period, LabelKey])[] = [
  ['hari-ini', 'periodeHariIni'],
  ['kemarin', 'periodeKemarin'],
  ['7-hari', 'periode7Hari'],
];

const COMPARE_TEXT: Readonly<Record<Period, LabelKey>> = {
  'hari-ini': 'dibandingKemarin',
  kemarin: 'dibandingSebelumnya',
  '7-hari': 'dibanding7Hari',
};

function shortDate(day: string): string {
  return formatDate(new Date(`${day}T12:00:00+07:00`))
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

export function renderSummary(session: OwnerSession): ScreenHandle {
  const store = session.store;
  let period: Period = 'hari-ini';
  let selected: number | undefined;

  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('periode') },
  });
  const card = el('section', { className: 'own-card own-card--revenue' });
  const chartBox = el('section', { className: 'own-card own-card--chart' });
  const small = el('div', { className: 'own-grid-2' });
  const stamp = el('p', { className: 't-label own-stamp' });

  const renderChips = (): void => {
    chips.replaceChildren(
      ...PERIODS.map(([value, key]) =>
        createChip({
          text: label(key),
          selected: value === period,
          onToggle: () => {
            period = value;
            selected = undefined;
            renderChips();
            paint();
          },
        }),
      ),
    );
  };

  const paint = (): void => {
    const summary = summarize(store.getState().data, session.now(), period);
    const empty = summary.revenue === 0 && summary.count === 0;
    const compare =
      summary.comparison === undefined
        ? el('p', { className: 'own-compare', text: label('belumAdaPembanding') })
        : el(
            'p',
            { className: 'own-compare' },
            icon(summary.comparison >= 0 ? 'trending-up' : 'trending-down'),
            el('span', {
              text: `${summary.comparison >= 0 ? '+' : ''}${String(summary.comparison)}% ${label(COMPARE_TEXT[period])}`,
            }),
          );
    card.replaceChildren(
      el('p', { className: 't-label', text: label('omzet') }),
      el('output', { className: 'own-card__value', text: formatRupiah(summary.revenue) }),
      compare,
    );
    const hourly = period !== '7-hari';
    const title = label(hourly ? 'omzetPerJam' : 'omzetPerHari');
    const data = summary.bars.map((bar) => ({
      label: hourly ? bar.key : shortDate(bar.key),
      value: bar.value,
      caption: formatRupiah(bar.value),
    }));
    const picked = selected === undefined ? undefined : data[selected];
    chartBox.replaceChildren(
      el('h2', { className: 't-section-title', text: title }),
      ...(empty
        ? [
            el('p', {
              className: 't-label',
              text: label(
                period === 'hari-ini' ? 'belumAdaPenjualanHariIni' : 'belumAdaPenjualanPeriode',
              ),
            }),
          ]
        : []),
      createBarChart({
        title,
        data,
        axisLabel: (value) => (value === 0 ? '0' : `${formatDecimal(value / 1_000_000, 1)} jt`),
        width: 296,
        height: 240,
        minTop: 1_000_000,
        minSlot: 48,
        selectedIndex: selected,
        onSelect: (_datum, index) => {
          selected = index;
          paint();
        },
      }),
      el('p', {
        className: 't-value own-readout',
        attrs: { 'aria-live': 'polite' },
        text:
          picked === undefined
            ? label('ketukBatang')
            : `${hourly ? `${label('jam')} ` : ''}${picked.label}: ${picked.caption}`,
      }),
    );
    small.replaceChildren(
      el(
        'div',
        { className: 'own-card own-card--small' },
        el('p', { className: 't-label', text: label('transaksi') }),
        el('output', { className: 'own-card__number', text: formatDecimal(summary.count) }),
      ),
      el(
        'div',
        { className: 'own-card own-card--small' },
        el('p', { className: 't-label', text: label('rataPerTransaksi') }),
        el('output', { className: 'own-card__number', text: formatRupiah(summary.average) }),
      ),
    );
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const element = el('div', { className: 'own-stack' }, chips, card, chartBox, small, stamp);
  renderChips();
  paint();
  return {
    element,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}
