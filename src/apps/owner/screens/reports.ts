import { el } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { wibDate } from '../../../shared/data/receivable';
import {
  expenseSummary,
  MAX_REPORT_DAYS,
  profitLoss,
  rangeDays,
} from '../../../shared/data/report';
import { createChip } from '../../../shared/ui/chip';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';

type Segment = 'laba-rugi' | 'beban';
type Range = 'hari-ini' | 'bulan-ini' | 'tanggal';

const RANGES: readonly (readonly [Range, LabelKey])[] = [
  ['hari-ini', 'periodeHariIni'],
  ['bulan-ini', 'periodeBulanIni'],
  ['tanggal', 'pilihTanggal'],
];

export function money(value: number): string {
  return value < 0 ? `-${formatRupiah(Math.abs(value))}` : formatRupiah(value);
}

export function renderReports(session: OwnerSession): ScreenHandle {
  const store = session.store;
  let segment: Segment = 'laba-rugi';
  let range: Range = 'bulan-ini';
  const today = (): string => wibDate(session.now());
  let start = today();
  let end = today();

  const segmentBox = el('div', {
    className: 'own-segment',
    attrs: { role: 'group', 'aria-label': label('jenisLaporan') },
  });
  const chips = el('div', {
    className: 'own-chips',
    attrs: { role: 'group', 'aria-label': label('periode') },
  });
  const dates = el('div', { className: 'own-dates' });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const reportCard = el('section', { className: 'own-card own-card--report' });
  const note = el('p', { className: 't-label', text: label('eksporDiBackOffice') });
  const stamp = el('p', { className: 't-label own-stamp' });

  const bounds = (): { from: string; to: string } => {
    if (range === 'hari-ini') {
      return { from: today(), to: today() };
    }
    if (range === 'bulan-ini') {
      return { from: `${today().slice(0, 8)}01`, to: today() };
    }
    return { from: start, to: end };
  };

  const renderSegment = (): void => {
    segmentBox.replaceChildren(
      ...(
        [
          ['laba-rugi', 'labaRugi'],
          ['beban', 'bebanOperasional'],
        ] as const
      ).map(([value, key]) => {
        const button = el('button', {
          className: 'own-segment__button',
          text: label(key),
          attrs: { type: 'button', 'aria-pressed': value === segment ? 'true' : 'false' },
        });
        button.addEventListener('click', () => {
          segment = value;
          renderSegment();
          paint();
        });
        return button;
      }),
    );
  };

  const renderChips = (): void => {
    chips.replaceChildren(
      ...RANGES.map(([value, key]) =>
        createChip({
          text: label(key),
          selected: range === value,
          onToggle: () => {
            range = value;
            renderChips();
            renderDates();
            paint();
          },
        }),
      ),
    );
  };

  const renderDates = (): void => {
    if (range !== 'tanggal') {
      dates.replaceChildren();
      return;
    }
    const make = (name: LabelKey, value: string, set: (next: string) => void): HTMLElement => {
      const input = el('input', {
        className: 'input',
        attrs: { type: 'date', 'aria-label': label(name) },
      });
      input.value = value;
      input.addEventListener('change', () => {
        set(input.value);
        paint();
      });
      return input;
    };
    dates.replaceChildren(
      make('dariTanggal', start, (next) => {
        start = next;
      }),
      make('sampaiTanggal', end, (next) => {
        end = next;
      }),
    );
  };

  const row = (name: string, value: string, strong = false): HTMLElement =>
    el(
      'div',
      { className: strong ? 'own-row own-row--strong' : 'own-row' },
      el('span', { text: name }),
      el('output', { text: value }),
    );

  const paint = (): void => {
    const { from, to } = bounds();
    error.textContent = '';
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
    if (to < from) {
      error.textContent = message('MSG-039');
      reportCard.replaceChildren();
      return;
    }
    if (rangeDays(from, to) > MAX_REPORT_DAYS) {
      error.textContent = message('MSG-104');
      reportCard.replaceChildren();
      return;
    }
    const data = store.getState().data;
    const result = profitLoss(data, from, to);
    const expenses = expenseSummary(data, from, to);
    if (result.sales === 0 && expenses.total === 0) {
      reportCard.replaceChildren(el('p', { className: 't-label', text: label('belumAdaData') }));
      return;
    }
    if (segment === 'laba-rugi') {
      reportCard.replaceChildren(
        row(label('penjualanBersih'), money(result.sales)),
        row(label('hargaPokokPenjualan'), money(result.cogs)),
        row(label('labaKotor'), money(result.gross), true),
        row(label('bebanOperasionalBaris'), money(result.expenses)),
        row(label('labaBersih'), money(result.net), true),
      );
    } else {
      const top = expenses.rows.slice(0, 10);
      reportCard.replaceChildren(
        ...(top.length === 0
          ? [el('p', { className: 't-label', text: label('belumAdaData') })]
          : [
              ...top.map((item) => row(item.category, money(item.amount))),
              row(label('totalBeban'), money(expenses.total), true),
            ]),
      );
    }
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  const element = el(
    'div',
    { className: 'own-stack' },
    segmentBox,
    chips,
    dates,
    error,
    reportCard,
    note,
    stamp,
  );
  renderSegment();
  renderChips();
  renderDates();
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
