import { el, nextId } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  createColorBars,
  createDonutTotal,
  createHorizontalBars,
  createLineChart,
  type ChartTone,
} from '../dashboard-charts';
import {
  computeFullDashboard,
  dashboardWidgets,
  hppTone,
  type DashboardWidgetId,
  type ExpenseKind,
  type FullDashboardData,
  type RankedItem,
} from '../domain/dashboard';
import type { ScreenHandle } from './login';

type Period = 'harian' | 'bulanan';

const EXPENSE_LABELS: Readonly<Record<ExpenseKind, LabelKey>> = {
  gaji: 'bebanGaji',
  katering: 'dxBebanKatering',
  bensin: 'dxBebanBensin',
  operasional: 'bebanOperasionalSingkat',
  listrik: 'dxBebanListrik',
};

const EXPENSE_TONES: Readonly<Record<ExpenseKind, ChartTone>> = {
  gaji: 1,
  katering: 2,
  bensin: 3,
  operasional: 4,
  listrik: 6,
};

// Elemen yang mengisi lebar batang lewat CSSOM (variabel --bar); CSP menolak atribut style.
function bar(percent: number, className: string): HTMLElement {
  const fill = el('span', { className });
  fill.style.setProperty('--bar', `${String(Math.max(2, Math.min(100, percent)))}%`);
  return el('span', { className: 'bo-dx-bar' }, fill);
}

// Daftar yang bisa digulir di dalam kartu: harus bisa difokus papan ketik dan bernama.
function scroller(name: string, ...children: HTMLElement[]): HTMLElement {
  return el(
    'div',
    { className: 'bo-dx-scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': name } },
    ...children,
  );
}

function segmented(
  groupName: string,
  active: Period,
  onSelect: (period: Period) => void,
): HTMLElement {
  const option = (period: Period, text: string): HTMLElement => {
    const button = el('button', {
      className: `bo-dx-seg__btn${active === period ? ' bo-dx-seg__btn--active' : ''}`,
      attrs: { type: 'button', 'aria-pressed': active === period ? 'true' : 'false' },
      text,
    });
    button.addEventListener('click', () => {
      onSelect(period);
    });
    return button;
  };
  return el(
    'div',
    { className: 'bo-dx-seg', attrs: { role: 'group', 'aria-label': groupName } },
    option('harian', label('omsetHarian')),
    option('bulanan', label('omsetBulanan')),
  );
}

function card(
  id: DashboardWidgetId,
  iconName: IconName,
  title: string,
  body: HTMLElement,
  ...actions: Node[]
): HTMLElement {
  const titleId = nextId('dx-title');
  return el(
    'section',
    { className: 'bo-dx-card', attrs: { 'data-widget': id, 'aria-labelledby': titleId } },
    el(
      'div',
      { className: 'bo-dx-card__header' },
      el(
        'div',
        { className: 'bo-dx-card__title' },
        icon(iconName),
        el('h2', { text: title, attrs: { id: titleId } }),
      ),
      actions.length > 0 && el('div', { className: 'bo-dx-card__actions' }, ...actions),
    ),
    body,
  );
}

function legendRow(tone: ChartTone, name: string, value: string): HTMLElement {
  return el(
    'div',
    { className: 'bo-dx-legend__row' },
    el('span', { className: `bo-dx-legend__dot bo-tone-${String(tone)}` }),
    el('span', { className: 'bo-dx-legend__name', text: name }),
    el('strong', { className: 'bo-dx-legend__value', text: value }),
  );
}

function medal(position: number): HTMLElement {
  return el('span', {
    className: `bo-dx-medal${position <= 3 ? ` bo-dx-medal--${String(position)}` : ''}`,
    text: String(position),
  });
}

function rankRow(position: number, item: RankedItem): HTMLElement {
  return el(
    'div',
    { className: 'bo-dx-rank__item' },
    medal(position),
    el(
      'div',
      { className: 'bo-dx-rank__main' },
      el(
        'div',
        { className: 'bo-dx-rank__line' },
        el('strong', { className: 'bo-dx-rank__name', text: item.name }),
        el('span', { className: 'bo-dx-rank__amount', text: formatRupiah(item.amount) }),
        el('span', { className: 'bo-dx-chip', text: `${String(item.percent)}%` }),
      ),
      bar(item.percent, 'bo-dx-bar__fill bo-tone-1'),
    ),
  );
}

export function renderDashboard(session: BoSession): ScreenHandle {
  const store = session.store;
  const container = el('div', { className: 'bo-dx' });

  const periods: Record<'omset' | 'grafik' | 'laba' | 'beban', Period> = {
    omset: 'harian',
    grafik: 'harian',
    laba: 'harian',
    beban: 'harian',
  };
  const rankIndex = { pelanggan: 0, barang: 0 };

  const refreshButton = (onRefresh: () => void): HTMLElement => {
    const button = el(
      'button',
      {
        className: 'bo-dx-icon-btn',
        attrs: { type: 'button', 'aria-label': label('dxSegarkan'), title: label('dxSegarkan') },
      },
      icon('refresh-cw'),
    );
    button.addEventListener('click', () => {
      onRefresh();
      showToast({
        kind: 'info',
        text: `${label('dxDiperbarui')} ${formatTime(session.now())}`,
      });
    });
    return button;
  };

  const widgetBuilders = (
    data: FullDashboardData,
  ): Record<DashboardWidgetId, () => HTMLElement> => {
    const setPeriod = (key: keyof typeof periods) => (period: Period) => {
      periods[key] = period;
      paint();
    };

    const omset = (): HTMLElement => {
      const info =
        periods.omset === 'harian' ? data.omset.dailyBreakdown : data.omset.monthlyBreakdown;
      const stat = (name: string, value: string): HTMLElement =>
        el(
          'div',
          { className: 'bo-dx-stat' },
          el('span', { className: 'bo-dx-stat__label', text: name }),
          el('strong', { className: 'bo-dx-stat__value', text: value }),
        );
      return card(
        'omset',
        'wallet',
        label('omsetSingkat'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-omset' },
          el('p', {
            className: 'bo-dx-caption',
            text: label(periods.omset === 'harian' ? 'omsetHariIniJudul' : 'omsetBulanIniJudul'),
          }),
          el('div', { className: 'bo-dx-big', text: formatRupiah(info.current) }),
          el(
            'div',
            { className: 'bo-dx-stats' },
            stat(label('dxTotal'), formatRupiah(info.total)),
            stat(label('totalTransaksiNilai'), `${String(info.count)} Kali`),
            stat(label('rataRataTransaksi'), formatRupiah(info.average)),
          ),
        ),
        el('span', {
          className: 'bo-dx-chip bo-dx-chip--ok',
          text: `+${String(info.trendPercent)}%`,
        }),
        segmented(label('omsetSingkat'), periods.omset, setPeriod('omset')),
      );
    };

    const grafik = (): HTMLElement => {
      const points =
        periods.grafik === 'harian' ? data.chartSeries.daily : data.chartSeries.monthly;
      return card(
        'grafik',
        'trending-up',
        label('dxGrafikJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-line' },
          el('div', { className: 'bo-dx-line__chart' }, createLineChart(points, 420, 104)),
          el('p', { className: 'bo-dx-trend', text: data.chartSeries.trendText }),
        ),
        segmented(label('dxGrafikJudul'), periods.grafik, setPeriod('grafik')),
      );
    };

    const kegiatan = (): HTMLElement =>
      card(
        'kegiatan',
        'calendar',
        label('kegiatanMendatangJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body' },
          scroller(
            label('dxDaftarKegiatan'),
            ...data.upcomingEvents.map((event) =>
              el(
                'div',
                { className: 'bo-dx-event' },
                el('span', { className: 'bo-dx-event__date', text: event.dateText }),
                el(
                  'div',
                  { className: 'bo-dx-event__info' },
                  el('strong', { text: event.code }),
                  el('span', {
                    text: `Jatuh Tempo ${event.type === 'utang' ? 'Utang' : 'Piutang'} · ${event.name}`,
                  }),
                ),
              ),
            ),
          ),
        ),
      );

    const laba = (): HTMLElement => {
      const info = periods.laba === 'harian' ? data.profit.daily : data.profit.monthly;
      return card(
        'laba',
        'trending-up',
        label('labaJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-split' },
          el(
            'div',
            { className: 'bo-dx-split__chart' },
            createColorBars(
              [
                { label: label('pendapatan'), value: info.pendapatan, tone: 1 },
                { label: label('nilaiHpp'), value: info.nilaiHpp, tone: 2 },
                { label: label('pengeluaran'), value: info.pengeluaran, tone: 3 },
                { label: label('labaJudul'), value: Math.max(0, info.laba), tone: 4 },
              ],
              label('dxGrafikLaba'),
            ),
          ),
          el(
            'div',
            { className: 'bo-dx-split__text' },
            el(
              'div',
              { className: 'bo-dx-legend' },
              legendRow(1, label('pendapatan'), formatRupiah(info.pendapatan)),
              legendRow(2, label('nilaiHpp'), formatRupiah(info.nilaiHpp)),
              legendRow(3, label('pengeluaran'), formatRupiah(info.pengeluaran)),
            ),
            el(
              'p',
              { className: 'bo-dx-headline bo-dx-headline--ok' },
              el('span', { text: label('labaJudul') }),
              el('strong', { text: formatRupiah(info.laba) }),
            ),
          ),
        ),
        segmented(label('labaJudul'), periods.laba, setPeriod('laba')),
      );
    };

    const beban = (): HTMLElement => {
      const info = periods.beban === 'harian' ? data.expense.daily : data.expense.monthly;
      return card(
        'beban',
        'wallet',
        label('bebanJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-split' },
          el(
            'div',
            { className: 'bo-dx-split__chart bo-dx-split__chart--round' },
            createDonutTotal(
              info.items.map((item) => ({
                label: label(EXPENSE_LABELS[item.key]),
                value: item.amount,
                tone: EXPENSE_TONES[item.key],
              })),
              [label('dxTotalBeban'), formatRupiah(info.beban)],
              label('dxGrafikBeban'),
            ),
          ),
          el(
            'div',
            { className: 'bo-dx-split__text' },
            el(
              'div',
              { className: 'bo-dx-legend' },
              ...info.items.map((item) =>
                legendRow(
                  EXPENSE_TONES[item.key],
                  label(EXPENSE_LABELS[item.key]),
                  formatRupiah(item.amount),
                ),
              ),
            ),
            el(
              'p',
              { className: 'bo-dx-headline bo-dx-headline--bad' },
              el('span', { text: label('bebanJudul') }),
              el('strong', { text: formatRupiah(info.beban) }),
            ),
          ),
        ),
        segmented(label('bebanJudul'), periods.beban, setPeriod('beban')),
      );
    };

    const aset = (): HTMLElement =>
      card(
        'aset',
        'banknote',
        label('asetSaatIniJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-aset' },
          el(
            'p',
            { className: 'bo-dx-headline bo-dx-headline--info' },
            el('span', { text: label('dxTotalAset') }),
            el('strong', { text: formatRupiah(data.assets.total) }),
          ),
          createHorizontalBars(
            [
              {
                label: label('labelKas'),
                value: data.assets.kas,
                text: formatRupiah(data.assets.kas),
                tone: 1,
              },
              {
                label: label('labelPiutang'),
                value: data.assets.piutang,
                text: formatRupiah(data.assets.piutang),
                tone: 3,
              },
              {
                label: label('labelStok'),
                value: data.assets.stok,
                text: formatRupiah(data.assets.stok),
                tone: 2,
              },
            ],
            label('dxGrafikAset'),
          ),
        ),
      );

    const rank = (
      id: 'pelanggan' | 'barang',
      iconName: IconName,
      title: string,
      listName: string,
    ): HTMLElement => {
      const index = rankIndex[id];
      const period = data.rankPeriods[index];
      const items = id === 'pelanggan' ? (period?.customers ?? []) : (period?.products ?? []);
      const step = (delta: number): HTMLElement => {
        const target = index + delta;
        const disabled = data.rankPeriods[target] === undefined;
        const button = el(
          'button',
          {
            className: 'bo-dx-icon-btn bo-dx-icon-btn--sm',
            attrs: {
              type: 'button',
              'aria-label': label(delta > 0 ? 'dxPeriodeSebelumnya' : 'dxPeriodeBerikutnya'),
              ...(disabled ? { disabled: '' } : {}),
            },
          },
          icon(delta > 0 ? 'chevron-left' : 'chevron-right'),
        );
        button.addEventListener('click', () => {
          rankIndex[id] = target;
          paint();
        });
        return button;
      };
      return card(
        id,
        iconName,
        title,
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-rank' },
          el(
            'div',
            {
              className: 'bo-dx-period',
              attrs: { role: 'group', 'aria-label': label('dxPeriode') },
            },
            step(1),
            el('span', { className: 'bo-dx-period__label', text: period?.label ?? '' }),
            step(-1),
          ),
          scroller(listName, ...items.map((item, position) => rankRow(position + 1, item))),
        ),
        refreshButton(() => {
          rankIndex[id] = 0;
          paint();
        }),
      );
    };

    const hpp = (): HTMLElement =>
      card(
        'hpp',
        'triangle-alert',
        label('monitoringHppJudul'),
        el(
          'div',
          { className: 'bo-dx-card__body bo-dx-rank' },
          scroller(
            label('dxDaftarHpp'),
            ...data.hppMonitoring.map((item, position) => {
              const tone = hppTone(item.percent);
              return el(
                'div',
                { className: 'bo-dx-rank__item' },
                medal(position + 1),
                el(
                  'div',
                  { className: 'bo-dx-rank__main' },
                  el(
                    'div',
                    { className: 'bo-dx-rank__line' },
                    el('strong', { className: 'bo-dx-rank__name', text: item.name }),
                    el('span', {
                      className: 'bo-dx-rank__amount bo-dx-rank__amount--bad',
                      text: formatRupiah(item.hpp),
                    }),
                    el('span', {
                      className: `bo-dx-chip bo-dx-chip--${tone}`,
                      text: `${String(item.percent)}%`,
                    }),
                  ),
                  bar(item.percent, `bo-dx-bar__fill bo-dx-bar__fill--${tone}`),
                ),
              );
            }),
          ),
        ),
        refreshButton(paint),
      );

    return {
      omset,
      grafik,
      kegiatan,
      laba,
      beban,
      aset,
      pelanggan: () =>
        rank('pelanggan', 'users', label('penjualanPelangganJudul'), label('dxDaftarPelanggan')),
      barang: () =>
        rank('barang', 'shopping-cart', label('penjualanBarangJudul'), label('dxDaftarBarang')),
      hpp,
    };
  };

  function paint(): void {
    const role = store.getState().role;
    const data = computeFullDashboard(store.getState(), session.now(), role);
    const builders = widgetBuilders(data);
    const widgets = dashboardWidgets(role);
    container.classList.toggle('bo-dx--spv', widgets.length === 5);
    container.replaceChildren(...widgets.map((id) => builders[id]()));
  }

  const unsubscribe = store.subscribe(paint);
  paint();

  return {
    element: container,
    destroy: () => {
      unsubscribe();
    },
  };
}
