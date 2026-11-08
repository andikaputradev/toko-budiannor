import { append, el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import type { ClosedShift, MethodTotal } from '../domain/shift-report';
import { methodText } from '../method-text';
import type { PosSession } from '../pos-session';
import { shiftRangeText } from '../shift-range';

export type ShiftRef = ClosedShift | 'berjalan';

export interface ShiftReportOptions {
  readonly session: PosSession;
  readonly shift: ShiftRef;
}

interface ShiftWindow {
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
}

function windowOf(session: PosSession, shift: ShiftRef): ShiftWindow | undefined {
  if (shift === 'berjalan') {
    const running = session.state().shift;
    return running === undefined
      ? undefined
      : { userId: running.userId, startedAt: running.startedAt, endedAt: undefined };
  }
  return { userId: shift.userId, startedAt: shift.startedAt, endedAt: shift.endedAt };
}

function totalLabel(item: MethodTotal): string {
  return item.method === 'retur'
    ? label('returTanpaPengembalian')
    : methodText(item.method, item.channel);
}

// Modal laporan satu shift: informasi tunai, rekap penerimaan dan pengeluaran, baris per metode
// (diketuk membuka daftar transaksinya), dan tombol Terima Laporan untuk Owner dan Supervisor.
export function openShiftReport(options: ShiftReportOptions): void {
  const { session, shift } = options;
  const span = windowOf(session, shift);
  if (span === undefined) {
    return;
  }
  const body = el('div', { className: 'pos-shift-report' });
  const foot = el('div', { className: 'pos-shift-report__actions' });

  const row = (key: string, text: string, value: string, note?: string): HTMLElement =>
    el(
      'p',
      { className: 'pos-shift-report__row', attrs: { 'data-row': key } },
      el('span', { text }),
      el('output', { text: value }),
      note === undefined ? false : el('span', { className: 't-label', text: note }),
    );

  const current = (): ClosedShift | undefined =>
    shift === 'berjalan'
      ? undefined
      : session.state().closedShifts.find((item) => item.id === shift.id);

  const paint = (): void => {
    const closed = current();
    const summary = session.shiftSummary();
    const report = closed === undefined ? session.shiftReport() : closed.report;
    if (report === undefined) {
      return;
    }
    const expected = closed === undefined ? (summary?.closingCash ?? 0) : closed.expectedCash;
    const opening = closed === undefined ? (summary?.openingCash ?? 0) : closed.openingCash;
    const status =
      closed === undefined
        ? label('shiftBerjalan')
        : closed.review.status === 'sudah'
          ? `${label('sudahDiperiksa')} ${label('diperiksaOleh', { nama: closed.review.by ?? '' })}`
          : label('belumDiperiksa');
    body.replaceChildren();
    append(body, [
      el(
        'p',
        { className: 'pos-shift-report__head' },
        el('strong', { text: session.userName(span.userId) }),
        el('span', { className: 't-label', text: shiftRangeText(span.startedAt, span.endedAt) }),
      ),
      row('status', label('statusShift'), status),
      el('h3', { className: 't-section-title', text: label('informasiTunai') }),
      row('modal-awal', label('modalAwal'), formatRupiah(opening)),
      row('laporan-tunai', label('laporanTunai'), formatRupiah(expected)),
      closed === undefined
        ? false
        : row('selisih-tunai', label('selisihTunai'), formatRupiah(closed.difference)),
      el('h3', { className: 't-section-title', text: label('penerimaanAkhirPengeluaran') }),
      row(
        'penerimaan',
        label('totalPenerimaanAkhir'),
        formatRupiah(report.receipts.amount),
        label('jumlahTransaksi', { jumlah: report.receipts.count }),
      ),
      row(
        'retur',
        label('totalRetur'),
        formatRupiah(report.returns.amount),
        label('jumlahTransaksi', { jumlah: report.returns.count }),
      ),
      row(
        'biaya',
        label('totalBiaya'),
        formatRupiah(report.expenses.amount),
        label('jumlahTransaksi', { jumlah: report.expenses.count }),
      ),
      el(
        'ul',
        { className: 'pos-shift-report__methods' },
        ...report.byMethod.map((item) => {
          const button = el(
            'button',
            { className: 'pos-shift-report__method', attrs: { type: 'button' } },
            el('span', { text: totalLabel(item) }),
            el('output', { text: formatRupiah(item.amount) }),
          );
          button.addEventListener('click', () => {
            void import('./method-transactions').then(({ openMethodTransactions }) => {
              openMethodTransactions({ session, shift, key: item.key });
            });
          });
          return el('li', {}, button);
        }),
      ),
    ]);
    const canReview =
      closed?.review.status === 'belum' &&
      isAllowed(session.store.getState().role, 'POS-11', 'Terima Laporan');
    foot.replaceChildren(
      createButton({
        text: label('tutup'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      ...(canReview
        ? [
            createButton({
              text: label('terimaLaporan'),
              variant: 'secondary',
              onClick: () => {
                accept(false);
              },
            }),
            createButton({
              text: label('terimaCetakLaporan'),
              onClick: () => {
                accept(true);
              },
            }),
          ]
        : []),
    );
  };

  const accept = (print: boolean): void => {
    if (shift === 'berjalan') {
      return;
    }
    const result = session.reviewShift(shift.id);
    if (!result.ok) {
      showToast({ kind: 'error', text: failureText(result) });
      return;
    }
    paint();
    if (!print) {
      showToast({ kind: 'success', text: label('laporanDiterima') });
      return;
    }
    const printed = session.printReceipt('copy', shift.id);
    showToast(
      printed.ok
        ? { kind: 'success', text: label('laporanTercetak') }
        : { kind: 'error', text: failureText(printed) },
    );
  };

  const handle = openModal({
    title: label('laporanShift'),
    body,
    actions: [],
  });
  handle.dialog.append(foot);
  paint();
}
