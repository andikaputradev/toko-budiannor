import { el } from '../../../shared/dom';
import { formatDate, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { methodTransactions, type MethodTransaction } from '../domain/shift-report';
import { methodText } from '../method-text';
import type { PosSession } from '../pos-session';
import { shiftRangeText } from '../shift-range';
import type { ShiftRef } from './shift-report';

export interface MethodTransactionsOptions {
  readonly session: PosSession;
  readonly shift: ShiftRef;
  readonly key: string;
}

// Daftar transaksi di balik satu baris rekap metode: judul "BCA | rentang waktu", Total Diterima,
// kolom cari, lalu baris Penerimaan (+) dan Retur (-).
export function openMethodTransactions(options: MethodTransactionsOptions): void {
  const { session, shift, key } = options;
  const running = session.state().shift;
  const span =
    shift === 'berjalan'
      ? running === undefined
        ? undefined
        : { startedAt: running.startedAt, endedAt: undefined }
      : { startedAt: shift.startedAt, endedAt: shift.endedAt };
  if (span === undefined) {
    return;
  }
  const state = session.state();
  const rows = methodTransactions(span, key, state.sales, state.deviceSales, state.returns);
  const [method, channel] = key.split(':');
  const name =
    key === 'retur:' || method === undefined
      ? label('returTanpaPengembalian')
      : (channel ?? '') === ''
        ? methodText(method as Parameters<typeof methodText>[0], undefined)
        : (channel ?? '');
  const received = rows
    .filter((item) => item.kind === 'penerimaan')
    .reduce((sum, item) => sum + item.amount, 0);

  const list = el('ul', { className: 'pos-method-tx__list' });
  const search = el('input', {
    className: 'input pos-method-tx__search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      placeholder: label('cariTransaksi'),
      'aria-label': label('cariTransaksi'),
    },
  });
  const line = (item: MethodTransaction): HTMLElement => {
    const at = new Date(item.at);
    const income = item.kind === 'penerimaan';
    return el(
      'li',
      { className: 'pos-method-tx__row' },
      el(
        'span',
        { className: 'pos-method-tx__who' },
        el('strong', { text: item.reference }),
        el('span', {
          className: 't-label',
          text: `${label(income ? 'penerimaanRetur' : 'returRiwayat')} ${formatDate(at)} ${formatTime(at)}`,
        }),
      ),
      el('output', {
        className: 'pos-method-tx__amount',
        text: `${income ? '+' : '-'}${formatRupiah(item.amount)}`,
      }),
    );
  };
  const paint = (): void => {
    const needle = search.value.trim().toLowerCase();
    list.replaceChildren(
      ...rows.filter((item) => item.reference.toLowerCase().includes(needle)).map(line),
    );
  };
  search.addEventListener('input', paint);

  const handle = openModal({
    title: `${name} | ${shiftRangeText(span.startedAt, span.endedAt)}`,
    body: el(
      'div',
      { className: 'pos-method-tx' },
      el(
        'p',
        { className: 'pos-method-tx__total', attrs: { 'data-row': 'total-diterima' } },
        el('span', { text: label('totalDiterima') }),
        el('output', { className: 't-total', text: formatRupiah(received) }),
      ),
      search,
      list,
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-shift-report__actions' },
      createButton({
        text: label('tutup'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
    ),
  );
  paint();
  search.focus();
}
