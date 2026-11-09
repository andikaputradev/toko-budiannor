import '../../../styles/mobile-dashboard.css';
import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { wibDate } from '../../../shared/data/receivable';
import { navigate } from '../../../shared/router';
import { createAreaChart } from '../../../shared/ui/area-chart';
import { createMobBadge, createMobCard, type MobTone } from '../../../shared/ui/mobile-card';
import { createRankList } from '../../../shared/ui/rank-list';
import {
  HPP_LIMIT,
  HPP_ROWS,
  hppMonitor,
  lowStockRows,
  monthProfit,
  payableSnapshot,
  receivableSnapshot,
  revenueView,
  topProductRows,
  type HppLevel,
  type HppRow,
  type LowStockRow,
  type ProfitSnapshot,
  type RankPeriod,
  type RevenueCompare,
  type RevenueMode,
} from '../domain/dashboard';
import { compactRupiah, juta, signedRupiah } from '../domain/money';
import { monthStart, type ProductRank } from '../domain/reporting';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import { createPanel, createToggle, dayShort, dayText, emptyNote, navLink } from './dash-parts';

const COMPARE_TEXT: Readonly<Record<RevenueCompare, LabelKey>> = {
  kemarin: 'dibandingKemarin',
  'rata-bulan-lalu': 'dashDibandingRataBulanLalu',
};

const HPP_TEXT: Readonly<Record<HppLevel, LabelKey>> = {
  aman: 'dashHppAman',
  waspada: 'dashHppWaspada',
  lewat: 'dashHppLewat',
};

const HPP_TONE: Readonly<Record<HppLevel, MobTone>> = {
  aman: 'sukses',
  waspada: 'peringatan',
  lewat: 'bahaya',
};

const CHART_WIDTH = 326;
const CHART_HEIGHT = 210;

interface LivePoint {
  readonly label: string;
  readonly read: string;
  readonly value: number;
}

interface LiveModel {
  readonly mode: RevenueMode;
  readonly subtitle: string;
  readonly total: number;
  readonly count: number;
  readonly comparison: number | undefined;
  readonly compare: RevenueCompare;
  readonly points: readonly LivePoint[];
  readonly selected: number | undefined;
}

interface RankModel {
  readonly period: RankPeriod;
  readonly rows: readonly ProductRank[];
}

interface DebtModel {
  readonly receivable: { readonly amount: number; readonly parties: number };
  readonly payable: { readonly amount: number; readonly parties: number };
}

function cardHead(text: string, iconName: IconName): HTMLElement {
  return el(
    'div',
    { className: 'mob-card__head' },
    el('h2', { className: 'mob-card__title' }, icon(iconName), el('span', { text })),
  );
}

export function renderSummary(
  session: OwnerSession,
  go: (path: string) => void = navigate,
): ScreenHandle {
  const store = session.store;
  let mode: RevenueMode = 'harian';
  let rankPeriod: RankPeriod = 'hari-ini';
  let selected: number | undefined;

  /* ===== Omzet Live ===== */
  const readout = el('p', { className: 'dash-readout', attrs: { 'aria-live': 'polite' } });
  const stamp = el('p', { className: 'mob-sub mob-muted dash-stamp' });
  const livePanel = createPanel<LiveModel>('dash-live__body', (model) => {
    const empty = model.total === 0 && model.count === 0;
    const hourly = model.mode === 'harian';
    const every = hourly
      ? model.points.length > 6
        ? 2
        : 1
      : Math.max(1, Math.ceil(model.points.length / 6));
    const comparison = model.comparison;
    const compare =
      comparison === undefined
        ? el('p', { className: 'mob-sub mob-muted', text: label('belumAdaPembanding') })
        : createMobBadge(
            `${comparison >= 0 ? '+' : ''}${String(comparison)}% ${label(COMPARE_TEXT[model.compare])}`,
            comparison >= 0 ? 'sukses' : 'bahaya',
            comparison >= 0 ? 'trending-up' : 'trending-down',
          );
    compare.classList.add('dash-compare');
    return [
      el('p', { className: 'mob-sub mob-muted', text: model.subtitle }),
      el('p', { className: 'mob-value dash-live__value', text: formatRupiah(model.total) }),
      compare,
      el('p', {
        className: 'mob-sub mob-muted',
        text: label('dashJumlahTransaksi', { jumlah: formatDecimal(model.count) }),
      }),
      empty
        ? emptyNote(label(hourly ? 'belumAdaPenjualanHariIni' : 'belumAdaPenjualanPeriode'))
        : el(
            'div',
            { className: 'dash-chart' },
            el('p', { className: 'dash-unit', text: label('dashSatuanJuta') }),
            createAreaChart({
              title: label(hourly ? 'omzetPerJam' : 'omzetPerHari'),
              data: model.points.map((point) => ({
                label: point.label,
                value: point.value,
                caption: formatRupiah(point.value),
              })),
              axisLabel: juta,
              width: CHART_WIDTH,
              height: CHART_HEIGHT,
              minTop: 1_000_000,
              labelEvery: every,
              selectedIndex: model.selected,
              onSelect: (_datum, index) => {
                selected = index;
                paintLive(true);
              },
            }),
          ),
    ];
  });
  const liveToggle = createToggle<RevenueMode>({
    name: label('dashTampilanOmzet'),
    items: [
      ['harian', label('dashHarian')],
      ['bulanan', label('dashBulanan')],
    ],
    value: mode,
    onChange: (value) => {
      mode = value;
      selected = undefined;
      paintLive();
    },
  });
  const liveCard = el(
    'section',
    { className: 'mob-card dash-live' },
    el(
      'div',
      { className: 'dash-live__head' },
      el(
        'h2',
        { className: 'mob-card__title' },
        icon('chart-area'),
        el('span', { text: label('dashOmzetLive') }),
      ),
      liveToggle.element,
    ),
    livePanel.element,
    readout,
    stamp,
  );

  const paintLive = (keepFocus = false): void => {
    const now = session.now();
    const data = store.getState().data;
    const view = revenueView(data, now, mode);
    const hourly = mode === 'harian';
    const today = formatDate(now);
    const points = view.points.map((point) => ({
      label: point.label,
      read: hourly ? `${label('jam')} ${point.label}` : dayShort(point.key),
      value: point.value,
    }));
    if (selected !== undefined && selected >= points.length) {
      selected = undefined;
    }
    const focused = keepFocus && liveCard.contains(document.activeElement);
    livePanel.update({
      mode,
      subtitle: hourly
        ? label('dashHariIniTanggal', { tanggal: today })
        : label('dashBulanIniRentang', {
            awal: dayText(monthStart(wibDate(now))),
            akhir: today,
          }),
      total: view.total,
      count: view.count,
      comparison: view.comparison,
      compare: view.compare,
      points,
      selected,
    });
    const picked = selected === undefined ? undefined : points[selected];
    readout.textContent =
      picked === undefined
        ? label('dashKetukTitik')
        : `${picked.read}: ${formatRupiah(picked.value)}`;
    if (focused && selected !== undefined) {
      const hit = liveCard.querySelectorAll<SVGElement>('.mob-area__hit')[selected];
      hit?.focus();
    }
  };

  /* ===== Laba Rugi ===== */
  const profitPanel = createPanel<ProfitSnapshot>('dash-slot', (model) => {
    const loss = model.net < 0;
    return [
      createMobCard({
        tone: loss ? 'bahaya' : 'sukses',
        title: label('labaRugi'),
        iconName: 'wallet',
        action: {
          text: label('dashLihat'),
          onClick: () => {
            go('/owner/laporan?jenis=laba-rugi');
          },
        },
        body: [
          el('p', {
            className: 'mob-sub mob-muted',
            text: label('dashBulanIniRentang', {
              awal: dayText(model.from),
              akhir: dayText(model.to),
            }),
          }),
          el('p', {
            className: 'mob-sub',
            text: label(loss ? 'dashRugiBersihBulanIni' : 'dashLabaBersihBulanIni'),
          }),
          el('p', { className: 'mob-value', text: signedRupiah(model.net) }),
          el(
            'div',
            { className: 'dash-split' },
            el(
              'div',
              {},
              el('span', { className: 'mob-sub mob-muted', text: label('dashPendapatan') }),
              el('span', { className: 'dash-split__value', text: formatRupiah(model.revenue) }),
            ),
            el(
              'div',
              {},
              el('span', { className: 'mob-sub mob-muted', text: label('dashBeban') }),
              el('span', { className: 'dash-split__value', text: formatRupiah(model.expense) }),
            ),
          ),
          el('p', { className: 'mob-sub mob-muted', text: label('dashBebanKeterangan') }),
        ],
      }),
    ];
  });

  /* ===== Stok Minim ===== */
  const stockPanel = createPanel<readonly LowStockRow[]>('dash-slot', (rows) => [
    createMobCard({
      tone: 'peringatan',
      title: label('dashStokMinim'),
      iconName: 'triangle-alert',
      action: {
        text: label('dashLihat'),
        onClick: () => {
          go('/owner/stok?filter=minimum');
        },
      },
      body: [
        rows.length === 0
          ? el(
              'p',
              { className: 'dash-note dash-note--ok' },
              icon('circle-check'),
              el('span', { text: label('dashStokAman') }),
            )
          : el(
              'ul',
              { className: 'dash-list' },
              ...rows.map((row) =>
                el(
                  'li',
                  {},
                  navLink(
                    '/owner/stok?filter=minimum',
                    'dash-line',
                    el('span', { className: 'dash-line__name', text: row.name }),
                    el('span', {
                      className: 'dash-line__value',
                      text: label('sisaStok', {
                        jumlah: `${formatDecimal(row.remaining)} ${row.unit}`,
                      }),
                    }),
                  ),
                ),
              ),
            ),
      ],
    }),
  ]);

  /* ===== Produk Terlaris ===== */
  const rankPanel = createPanel<RankModel>('dash-rank', (model) => [
    model.rows.length === 0
      ? emptyNote(
          label(
            model.period === 'hari-ini' ? 'belumAdaPenjualanHariIni' : 'belumAdaPenjualanPeriode',
          ),
        )
      : createRankList(
          model.rows.map((row) => ({
            name: row.name,
            caption: compactRupiah(row.amount),
            percent: row.percent,
          })),
        ),
  ]);
  const rankToggle = createToggle<RankPeriod>({
    name: label('dashPeriodeTerlaris'),
    items: [
      ['hari-ini', label('periodeHariIni')],
      ['bulan-ini', label('periodeBulanIni')],
    ],
    value: rankPeriod,
    onChange: (value) => {
      rankPeriod = value;
      paintRank();
    },
  });
  const rankCard = el(
    'section',
    { className: 'mob-card' },
    cardHead(label('dashProdukTerlaris'), 'chart-column'),
    rankToggle.element,
    rankPanel.element,
  );
  const paintRank = (): void => {
    rankPanel.update({
      period: rankPeriod,
      rows: topProductRows(store.getState().data, session.now(), rankPeriod),
    });
  };

  /* ===== Monitoring HPP ===== */
  const hppPanel = createPanel<readonly HppRow[]>('dash-slot', (rows) => [
    createMobCard({
      title: label('dashMonitoringHpp'),
      iconName: 'scale',
      body: [
        rows.length === 0
          ? emptyNote(label('dashHppKosong'))
          : el(
              'div',
              { className: 'dash-rank' },
              createRankList(
                rows.map((row) => ({
                  name: row.name,
                  caption: `${formatDecimal(row.percent, 1)}% ${label(HPP_TEXT[row.level])}`,
                  percent: row.percent,
                  tone: HPP_TONE[row.level],
                })),
              ),
              el('p', {
                className: 'mob-sub mob-muted',
                text: label('dashHppKeterangan', { jumlah: HPP_ROWS, batas: HPP_LIMIT }),
              }),
            ),
      ],
    }),
  ]);

  /* ===== Piutang dan Hutang ===== */
  const debtPanel = createPanel<DebtModel>('dash-pair', (model) => {
    const card = (
      tone: MobTone,
      path: string,
      iconName: IconName,
      title: string,
      amount: number,
      detail: string,
    ): HTMLElement => {
      // Spasi antarbagian dan angka ringkas yang sama dengan teks terlihat: nama aksesibel harus memuat
      // teks yang terlihat sebagai rangkaian kata utuh (WCAG 2.5.3).
      const link = navLink(
        path,
        `mob-card mob-card--${tone} dash-debt`,
        el('span', { className: 'dash-debt__title' }, icon(iconName), el('span', { text: title })),
        ' ',
        el('span', { className: 'mob-value mob-value--sm', text: compactRupiah(amount) }),
        ' ',
        el('span', { className: 'mob-sub', text: detail }),
        el('span', { className: 'dash-debt__go' }, icon('chevron-right')),
      );
      link.setAttribute(
        'aria-label',
        label('dashRingkasanKartu', {
          judul: title,
          jumlah: compactRupiah(amount),
          rincian: detail,
        }),
      );
      return link;
    };
    return [
      card(
        'info',
        '/owner/piutang',
        'hand-coins',
        label('dashPiutangJatuhTempo'),
        model.receivable.amount,
        model.receivable.parties === 0
          ? label('dashPiutangAman')
          : label('dashPelangganTerlambat', { jumlah: model.receivable.parties }),
      ),
      card(
        'peringatan',
        '/owner/piutang?tab=hutang',
        'truck',
        label('dashHutangSupplier'),
        model.payable.amount,
        model.payable.parties === 0
          ? label('dashHutangAman')
          : label('dashSupplierBerhutang', { jumlah: model.payable.parties }),
      ),
    ];
  });

  const paint = (): void => {
    const data = store.getState().data;
    const now = session.now();
    paintLive();
    profitPanel.update(monthProfit(data, now));
    stockPanel.update(lowStockRows(data));
    paintRank();
    hppPanel.update(hppMonitor(data));
    debtPanel.update({
      receivable: receivableSnapshot(data, now),
      payable: payableSnapshot(data),
    });
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const element = el(
    'div',
    { className: 'own-stack dash' },
    liveCard,
    profitPanel.element,
    stockPanel.element,
    rankCard,
    hppPanel.element,
    debtPanel.element,
  );
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
