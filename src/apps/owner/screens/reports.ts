import '../../../styles/mobile-dashboard.css';
import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import { formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createChip } from '../../../shared/ui/chip';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { compactRupiah } from '../domain/money';
import {
  checkRange,
  monthStart,
  parseReportKind,
  reportHeadlines,
  reportStatus,
  resolveRange,
  type DateRange,
  type RangeKind,
  type ReportHeadline,
  type ReportKind,
  REPORT_KINDS,
} from '../domain/reporting';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { dayText, navLink } from './dash-parts';
import { buildDetail, REPORT_TITLE } from './reports-detail';

const RANGES: readonly (readonly [RangeKind, LabelKey])[] = [
  ['hari-ini', 'periodeHariIni'],
  ['bulan-ini', 'periodeBulanIni'],
  ['tanggal', 'pilihTanggal'],
];

const REPORT_ICON: Readonly<Record<ReportKind, IconName>> = {
  penjualan: 'receipt-text',
  'laba-rugi': 'chart-line',
  neraca: 'scale',
  biaya: 'coins',
  'produk-terlaris': 'chart-column',
  'per-penjual': 'users',
};

function summaryText(kind: ReportKind, headline: ReportHeadline): string {
  const amount = headline.amount;
  switch (kind) {
    case 'penjualan':
      return amount === undefined || amount === 0
        ? label('lapRingkasKosong')
        : label('lapRingkasPenjualan', { jumlah: compactRupiah(amount) });
    case 'laba-rugi':
      return amount === undefined
        ? label('lapRingkasKosong')
        : label('lapRingkasLabaRugi', { jumlah: compactRupiah(amount) });
    case 'neraca':
      return amount === undefined
        ? label('lapRingkasKosong')
        : label('lapRingkasNeraca', { jumlah: compactRupiah(amount) });
    case 'biaya':
      return amount === undefined || amount === 0
        ? label('lapRingkasKosong')
        : label('lapRingkasBiaya', { jumlah: compactRupiah(amount) });
    case 'produk-terlaris':
      return headline.name === undefined
        ? label('lapRingkasKosong')
        : label('lapRingkasProduk', { nama: headline.name });
    case 'per-penjual':
      return headline.name === undefined || amount === undefined
        ? label('lapRingkasKosong')
        : label('lapRingkasPenjual', { nama: headline.name, jumlah: compactRupiah(amount) });
  }
}

function rangeSummary(range: DateRange, fallback: string): string {
  const from = range.from === '' ? fallback : range.from;
  const to = range.to === '' ? fallback : range.to;
  return from === to
    ? dayText(from)
    : label('lapRentang', { awal: dayText(from), akhir: dayText(to) });
}

function renderList(session: OwnerSession, shell: OwnerShell | undefined): ScreenHandle {
  const store = session.store;
  const connection = el('div', { className: 'dash-conn' });
  const list = el('ul', {
    className: 'dash-reports',
    attrs: { 'aria-label': label('lapDaftarLaporan') },
  });
  const paint = (): void => {
    const online = store.getState().online;
    const now = session.now();
    const status = reportStatus(online, new Date(session.state().loadedAt), now);
    const fresh = status === 'segar';
    const headlines = reportHeadlines(store.getState().data, now);
    connection.replaceChildren(
      createMobBadge(
        label(online ? 'lapKoneksiOnline' : 'lapKoneksiOffline'),
        online ? 'sukses' : 'peringatan',
        online ? 'wifi' : 'wifi-off',
      ),
      ...(online ? [] : [el('p', { className: 'dash-hint', text: label('lapKeteranganOffline') })]),
      el('p', { className: 'dash-hint', text: label('lapKeteranganTitik') }),
    );
    list.replaceChildren(
      ...REPORT_KINDS.map((kind) => {
        const dot = createMobBadge(
          label(fresh ? 'statusSegar' : 'statusLokal'),
          fresh ? 'sukses' : 'peringatan',
        );
        dot.classList.add('dash-status');
        dot.prepend(el('span', { className: 'dash-dot', attrs: { 'aria-hidden': 'true' } }));
        return el(
          'li',
          {},
          navLink(
            `/owner/laporan?jenis=${kind}`,
            'mob-card dash-report',
            el('span', { className: 'dash-report__icon' }, icon(REPORT_ICON[kind])),
            el(
              'span',
              { className: 'dash-report__text' },
              el('span', { className: 'dash-report__title', text: label(REPORT_TITLE[kind]) }),
              el('span', {
                className: 'dash-report__sum',
                text: summaryText(kind, headlines[kind]),
              }),
              dot,
            ),
            el('span', { className: 'dash-report__go' }, icon('chevron-right')),
          ),
        );
      }),
    );
  };
  shell?.setBack(undefined);
  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const element = el('div', { className: 'own-stack dash' }, connection, list);
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

function renderDetail(
  session: OwnerSession,
  kind: ReportKind,
  shell: OwnerShell | undefined,
): ScreenHandle {
  const store = session.store;
  shell?.setTitle(label(REPORT_TITLE[kind]));
  shell?.setBack('/owner/laporan');
  const hasFilter = kind !== 'neraca';
  const today = (): string => wibDate(session.now());
  let rangeKind: RangeKind = 'bulan-ini';
  let custom: DateRange = { from: monthStart(today()), to: today() };
  let selected: number | undefined;

  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('periode') },
  });
  const dates = el('div', { className: 'dash-dates' });
  const rangeText = el('p', { className: 'dash-range' });
  const error = el('p', { className: 'dash-error', attrs: { role: 'alert' } });
  const readout = el('p', { className: 'dash-readout' });
  const body = el('div', { className: 'own-stack' });
  const stamp = el('p', { className: 'mob-sub mob-muted' });
  const note = el('p', { className: 'dash-hint', text: label('eksporDiBackOffice') });

  const currentRange = (): DateRange => resolveRange(rangeKind, today(), custom);

  const renderChips = (): void => {
    chips.replaceChildren(
      ...RANGES.map(([value, key]) =>
        createChip({
          text: label(key),
          selected: rangeKind === value,
          onToggle: () => {
            rangeKind = value;
            selected = undefined;
            renderChips();
            renderDates();
            paint();
          },
        }),
      ),
    );
  };

  const renderDates = (): void => {
    if (rangeKind !== 'tanggal') {
      dates.replaceChildren();
      return;
    }
    const field = (name: LabelKey, value: string, set: (next: string) => void): HTMLElement => {
      const input = el('input', {
        className: 'input',
        attrs: { type: 'date', max: today() },
      });
      input.value = value;
      input.addEventListener('change', () => {
        set(input.value);
        selected = undefined;
        paint();
      });
      return el('label', { className: 'dash-field' }, el('span', { text: label(name) }), input);
    };
    dates.replaceChildren(
      field('dariTanggal', custom.from, (next) => {
        custom = { ...custom, from: next };
      }),
      field('sampaiTanggal', custom.to, (next) => {
        custom = { ...custom, to: next };
      }),
    );
  };

  const paint = (): void => {
    const range = currentRange();
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
    error.textContent = '';
    rangeText.textContent = hasFilter ? rangeSummary(range, today()) : '';
    const focused = body.contains(document.activeElement);
    if (hasFilter) {
      const check = checkRange(range);
      if (!check.ok) {
        error.textContent = message(check.messageId);
        rangeText.textContent = '';
        body.replaceChildren();
        return;
      }
    }
    body.replaceChildren(
      ...buildDetail({
        kind,
        data: store.getState().data,
        now: session.now(),
        range,
        selected,
        onSelect: (index) => {
          selected = index;
          paint();
        },
        readout,
      }).filter((child): child is Node | string => !!child),
    );
    if (focused && selected !== undefined) {
      body.querySelectorAll<SVGElement>('.mob-area__hit')[selected]?.focus();
    }
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const filter = hasFilter
    ? el('div', { className: 'dash-filter' }, chips, dates, rangeText, error)
    : false;
  // Laporan tanpa filter (Neraca) tidak punya kontrol yang dapat difokus, jadi areanya sendiri dibuat
  // dapat difokus agar papan ketik dapat menggulirnya.
  const element = el(
    'div',
    {
      className: 'own-stack dash',
      attrs: {
        tabindex: hasFilter ? false : '0',
        role: hasFilter ? false : 'region',
        'aria-label': hasFilter ? false : label(REPORT_TITLE[kind]),
      },
    },
    filter,
    body,
    note,
    stamp,
  );
  if (hasFilter) {
    renderChips();
    renderDates();
  }
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

export function renderReports(
  session: OwnerSession,
  query?: URLSearchParams,
  _go?: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.element.classList.add('dash-bar');
  const kind = parseReportKind(query?.get('jenis'));
  return kind === undefined ? renderList(session, shell) : renderDetail(session, kind, shell);
}
