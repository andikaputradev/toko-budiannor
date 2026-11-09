import type { Child } from '../../../shared/dom';
import { el } from '../../../shared/dom';
import type { Dataset, PaymentMethod } from '../../../shared/data/types';
import { formatDecimal, formatPercent, formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { createAreaChart } from '../../../shared/ui/area-chart';
import { createMobBadge, createMobCard, type MobTone } from '../../../shared/ui/mobile-card';
import { createRankList } from '../../../shared/ui/rank-list';
import { compactRupiah, juta, signedRupiah } from '../domain/money';
import {
  balanceSheet,
  expenseReport,
  profitReport,
  salesReport,
  sellerSales,
  topProducts,
  type DateRange,
  type ReportKind,
  type SalesPoint,
} from '../domain/reporting';
import { createTable, dayShort, dayText, emptyNote } from './dash-parts';

export const REPORT_TITLE: Readonly<Record<ReportKind, LabelKey>> = {
  penjualan: 'lapJudulPenjualan',
  'laba-rugi': 'lapJudulLabaRugi',
  neraca: 'lapJudulNeraca',
  biaya: 'lapJudulBiaya',
  'produk-terlaris': 'lapJudulProdukTerlaris',
  'per-penjual': 'lapJudulPerPenjual',
};

const METHOD_TEXT: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

const CHART_WIDTH = 326;
const CHART_HEIGHT = 210;
const LIST_ROWS = 10;
const CATEGORY_ROWS = 8;

export interface DetailInput {
  readonly kind: ReportKind;
  readonly data: Dataset;
  readonly now: Date;
  readonly range: DateRange;
  readonly selected: number | undefined;
  readonly onSelect: (index: number) => void;
  /** Elemen pembacaan nilai yang tetap ada agar pembaruannya diumumkan pembaca layar. */
  readonly readout: HTMLElement;
}

function metric(name: string, value: string): HTMLElement {
  return el(
    'div',
    {},
    el('span', { className: 'mob-sub mob-muted', text: name }),
    el('span', { className: 'dash-metrics__value', text: value }),
  );
}

function empty(): HTMLElement {
  return createMobCard({ body: [emptyNote(label('belumAdaData'))] });
}

function percentText(part: number, whole: number): string {
  return whole <= 0 ? '0%' : formatPercent((part / whole) * 100);
}

function chartCard(
  title: string,
  points: readonly SalesPoint[],
  hourly: boolean,
  input: DetailInput,
): HTMLElement {
  const selected = input.selected;
  const every = hourly ? (points.length > 6 ? 2 : 1) : Math.max(1, Math.ceil(points.length / 6));
  const picked = selected === undefined ? undefined : points[selected];
  input.readout.className = 'dash-readout';
  input.readout.setAttribute('aria-live', 'polite');
  input.readout.textContent =
    picked === undefined
      ? label('dashKetukTitik')
      : `${hourly ? `${label('jam')} ${picked.label}` : dayShort(picked.key)}: ${formatRupiah(picked.value)}`;
  return createMobCard({
    title,
    iconName: 'chart-area',
    body: [
      el(
        'div',
        { className: 'dash-chart' },
        el('p', { className: 'dash-unit', text: label('dashSatuanJuta') }),
        createAreaChart({
          title,
          data: points.map((point) => ({
            label: point.label,
            value: point.value,
            caption: formatRupiah(point.value),
          })),
          axisLabel: juta,
          width: CHART_WIDTH,
          height: CHART_HEIGHT,
          minTop: 1_000_000,
          labelEvery: every,
          selectedIndex: selected,
          onSelect: (_datum, index) => {
            input.onSelect(index);
          },
        }),
        input.readout,
      ),
    ],
  });
}

function sales(input: DetailInput): Child[] {
  const report = salesReport(input.data, input.range, input.now);
  if (report.revenue === 0 && report.count === 0) {
    return [empty()];
  }
  const hourly = report.granularity === 'jam';
  const cards: Child[] = [
    createMobCard({
      title: label('omzet'),
      iconName: 'wallet',
      body: [
        el('p', { className: 'mob-value', text: formatRupiah(report.revenue) }),
        el(
          'div',
          { className: 'dash-metrics' },
          metric(label('transaksi'), formatDecimal(report.count)),
          metric(label('rataPerTransaksi'), compactRupiah(report.average)),
        ),
      ],
    }),
  ];
  if (report.granularity === 'tidak-ada') {
    cards.push(createMobCard({ body: [emptyNote(label('lapTanpaGrafikJam'))] }));
  } else {
    cards.push(
      chartCard(label(hourly ? 'omzetPerJam' : 'omzetPerHari'), report.points, hourly, input),
    );
  }
  if (report.methods.length > 0) {
    cards.push(
      createMobCard({
        title: label('caraBayar'),
        iconName: 'credit-card',
        body: [
          el(
            'div',
            { className: 'dash-rank' },
            createRankList(
              report.methods.map((row) => ({
                name: label(METHOD_TEXT[row.method]),
                caption: `${compactRupiah(row.amount)} (${String(row.percent)}%)`,
                percent: row.percent,
              })),
            ),
          ),
        ],
      }),
    );
  }
  if (report.days.length > 1) {
    cards.push(
      createMobCard({
        title: label('lapRincianHarian'),
        iconName: 'list',
        body: [
          createTable({
            caption: label('lapRincianHarian'),
            columns: [
              { header: label('tanggal') },
              { header: label('transaksi'), numeric: true },
              { header: label('omzet'), numeric: true },
            ],
            rows: report.days.map((day) => ({
              cells: [dayShort(day.date), formatDecimal(day.count), formatRupiah(day.revenue)],
            })),
          }),
        ],
      }),
    );
  }
  return cards;
}

function profit(input: DetailInput): Child[] {
  const report = profitReport(input.data, input.range);
  if (!report.hasData) {
    return [empty()];
  }
  const loss = report.net < 0;
  const share = (part: number): number => (report.sales <= 0 ? 0 : (part / report.sales) * 100);
  return [
    createMobCard({
      tone: loss ? 'bahaya' : 'sukses',
      title: label(loss ? 'lapRugiBersih' : 'labaBersih'),
      iconName: 'chart-line',
      body: [
        el('p', { className: 'mob-value', text: signedRupiah(report.net) }),
        el(
          'div',
          { className: 'dash-metrics' },
          metric(label('lapMarginKotor'), formatPercent(report.grossMargin)),
          metric(label('lapMarginBersih'), formatPercent(report.netMargin)),
        ),
      ],
    }),
    createMobCard({
      title: label('labaRugi'),
      iconName: 'scale',
      body: [
        createTable({
          caption: label('labaRugi'),
          hideHeader: true,
          columns: [
            { header: label('kolomKeterangan') },
            { header: label('jumlah'), numeric: true },
          ],
          rows: [
            { cells: [label('penjualanBersih'), formatRupiah(report.sales)] },
            { cells: [label('hargaPokokPenjualan'), formatRupiah(report.cogs)] },
            { cells: [label('labaKotor'), formatRupiah(report.gross)], strong: true },
            { cells: [label('bebanOperasionalBaris'), formatRupiah(report.expenses)] },
            { cells: [label('labaBersih'), formatRupiah(report.net)], strong: true },
          ],
        }),
      ],
    }),
    createMobCard({
      title: label('lapKomposisiPendapatan'),
      iconName: 'chart-pie',
      body: [
        el(
          'div',
          { className: 'dash-rank' },
          createRankList([
            {
              name: label('hargaPokokPenjualan'),
              caption: `${formatPercent(share(report.cogs))} (${compactRupiah(report.cogs)})`,
              percent: share(report.cogs),
              tone: 'info',
            },
            {
              name: label('bebanOperasionalBaris'),
              caption: `${formatPercent(share(report.expenses))} (${compactRupiah(report.expenses)})`,
              percent: share(report.expenses),
              tone: 'peringatan',
            },
            {
              name: label(loss ? 'lapRugiBersih' : 'labaBersih'),
              caption: `${formatPercent(share(report.net))} (${compactRupiah(report.net)})`,
              percent: Math.max(0, share(report.net)),
              tone: loss ? 'bahaya' : 'sukses',
            },
          ]),
        ),
      ],
    }),
  ];
}

function balance(input: DetailInput): Child[] {
  const sheet = balanceSheet(input.data, input.now);
  const balanced = sheet.assets === sheet.liabilities + sheet.equity;
  const money = (value: number): string =>
    value < 0 ? `-${formatRupiah(-value)}` : formatRupiah(value);
  const badge = createMobBadge(
    label('lapNeracaSeimbang'),
    balanced ? 'sukses' : 'bahaya',
    balanced ? 'circle-check' : 'triangle-alert',
  );
  badge.classList.add('dash-balance');
  const parts: readonly (readonly [LabelKey, number, MobTone])[] = [
    ['lapKasBank', sheet.cash, 'info'],
    ['lapPiutangUsaha', sheet.receivable, 'peringatan'],
    ['lapPersediaan', sheet.inventory, 'sukses'],
  ];
  return [
    el('p', {
      className: 'dash-range',
      text: label('lapPerTanggal', { tanggal: dayText(sheet.asOf) }),
    }),
    badge,
    createMobCard({
      title: label('lapAset'),
      iconName: 'landmark',
      body: [
        createTable({
          caption: label('lapAset'),
          hideHeader: true,
          columns: [
            { header: label('kolomKeterangan') },
            { header: label('jumlah'), numeric: true },
          ],
          rows: [
            { cells: [label('lapKasBank'), money(sheet.cash)] },
            { cells: [label('lapPiutangUsaha'), money(sheet.receivable)] },
            { cells: [label('lapPersediaan'), money(sheet.inventory)] },
            { cells: [label('lapTotalAset'), money(sheet.assets)], strong: true },
          ],
        }),
      ],
    }),
    createMobCard({
      title: label('lapKewajibanEkuitas'),
      iconName: 'scale',
      body: [
        createTable({
          caption: label('lapKewajibanEkuitas'),
          hideHeader: true,
          columns: [
            { header: label('kolomKeterangan') },
            { header: label('jumlah'), numeric: true },
          ],
          rows: [
            { cells: [label('lapHutangUsaha'), money(sheet.liabilities)] },
            { cells: [label('lapEkuitas'), money(sheet.equity)] },
            {
              cells: [label('lapTotalKewajibanEkuitas'), money(sheet.liabilities + sheet.equity)],
              strong: true,
            },
          ],
        }),
      ],
    }),
    createMobCard({
      title: label('lapKomposisiAset'),
      iconName: 'chart-pie',
      body: [
        el(
          'div',
          { className: 'dash-rank' },
          createRankList(
            parts.map(([key, value, tone]) => ({
              name: label(key),
              caption: `${percentText(value, sheet.assets)} (${compactRupiah(value)})`,
              percent: sheet.assets <= 0 ? 0 : (value / sheet.assets) * 100,
              tone,
            })),
          ),
        ),
      ],
    }),
    el('p', { className: 'dash-hint', text: label('lapCatatanNeraca') }),
  ];
}

function expenses(input: DetailInput): Child[] {
  const report = expenseReport(input.data, input.range);
  if (report.total === 0) {
    return [empty()];
  }
  const top = report.shares.slice(0, CATEGORY_ROWS);
  const best = top[0]?.amount ?? 0;
  return [
    createMobCard({
      tone: 'peringatan',
      title: label('lapTotalBiaya'),
      iconName: 'coins',
      body: [el('p', { className: 'mob-value', text: formatRupiah(report.total) })],
    }),
    createMobCard({
      title: label('lapBiayaPerKategori'),
      iconName: 'chart-pie',
      body: [
        el(
          'div',
          { className: 'dash-rank' },
          createRankList(
            top.map((share) => ({
              name: share.category,
              caption: `${compactRupiah(share.amount)} (${formatPercent(share.percent)})`,
              percent: best <= 0 ? 0 : (share.amount / best) * 100,
              tone: 'peringatan',
            })),
          ),
        ),
      ],
    }),
    createMobCard({
      title: label('lapBiayaTerbaru'),
      iconName: 'list',
      body: [
        createTable({
          caption: label('lapBiayaTerbaru'),
          columns: [
            { header: label('tanggal') },
            { header: label('kolomKeterangan') },
            { header: label('jumlah'), numeric: true },
          ],
          rows: report.items.map((item) => ({
            cells: [
              dayShort(item.date),
              el(
                'span',
                {},
                item.category,
                el('span', { className: 'dash-table__sub', text: item.note }),
              ),
              formatRupiah(item.amount),
            ],
          })),
        }),
      ],
    }),
  ];
}

function products(input: DetailInput): Child[] {
  const rows = topProducts(input.data, input.range, LIST_ROWS);
  if (rows.length === 0) {
    return [empty()];
  }
  return [
    createMobCard({
      title: label('lapPeringkatProduk'),
      iconName: 'chart-column',
      body: [
        el(
          'div',
          { className: 'dash-rank' },
          createRankList(
            rows.map((row) => ({
              name: row.name,
              caption: compactRupiah(row.amount),
              percent: row.percent,
            })),
          ),
        ),
      ],
    }),
    createMobCard({
      title: label('lapRincianProduk'),
      iconName: 'list',
      body: [
        createTable({
          caption: label('lapRincianProduk'),
          columns: [
            { header: label('kolomBarang') },
            { header: label('lapKolomNilai'), numeric: true },
          ],
          rows: rows.map((row) => ({
            cells: [
              el(
                'span',
                {},
                row.name,
                el('span', {
                  className: 'dash-table__sub',
                  text: label('lapTerjual', {
                    jumlah: `${formatDecimal(row.quantity)} ${row.unit}`,
                  }),
                }),
              ),
              formatRupiah(row.amount),
            ],
          })),
        }),
      ],
    }),
    el('p', { className: 'dash-hint', text: label('lapCatatanRinci') }),
  ];
}

function sellers(input: DetailInput): Child[] {
  const rows = sellerSales(input.data, input.range);
  if (rows.length === 0) {
    return [empty()];
  }
  return [
    createMobCard({
      title: label('lapPeringkatPenjual'),
      iconName: 'users',
      body: [
        el(
          'div',
          { className: 'dash-rank' },
          createRankList(
            rows.map((row) => ({
              name: row.name,
              caption: compactRupiah(row.amount),
              percent: row.percent,
            })),
          ),
        ),
      ],
    }),
    createMobCard({
      title: label('lapRincianPenjual'),
      iconName: 'list',
      body: [
        createTable({
          caption: label('lapRincianPenjual'),
          columns: [
            { header: label('lapKolomPenjual') },
            { header: label('transaksi'), numeric: true },
            { header: label('omzet'), numeric: true },
          ],
          rows: rows.map((row) => ({
            cells: [
              el(
                'span',
                {},
                row.name,
                el('span', {
                  className: 'dash-table__sub',
                  text: label('lapRataTransaksi', { jumlah: compactRupiah(row.average) }),
                }),
              ),
              formatDecimal(row.count),
              formatRupiah(row.amount),
            ],
          })),
        }),
      ],
    }),
    el('p', { className: 'dash-hint', text: label('lapCatatanRinci') }),
  ];
}

export function buildDetail(input: DetailInput): Child[] {
  switch (input.kind) {
    case 'penjualan':
      return sales(input);
    case 'laba-rugi':
      return profit(input);
    case 'neraca':
      return balance(input);
    case 'biaya':
      return expenses(input);
    case 'produk-terlaris':
      return products(input);
    case 'per-penjual':
      return sellers(input);
  }
}
