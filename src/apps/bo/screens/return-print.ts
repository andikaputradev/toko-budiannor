import { el } from '../../../shared/dom';
import type { ReturnNote } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { openModal } from '../../../shared/ui/modal';
import type { BoSession } from '../bo-session';
import { DEFAULT_STORE_PROFILE } from '../domain/settings-rbac';
import {
  settlementLabelKey,
  settlementLines,
  WAREHOUSE_LABELS,
  type SettlementPlan,
} from '../domain/returns';
import { logReturnPrint } from './return-actions';

function fact(term: string, value: string): HTMLElement {
  return el(
    'div',
    { className: 'bo-ret-doc__fact' },
    el('dt', { text: term }),
    el('dd', { text: value }),
  );
}

// Pratinjau Nota Retur: isi dan susunan mengikuti nota yang dicetak untuk pelanggan atau pemasok.
export function openReturnNote(session: BoSession, note: ReturnNote): void {
  const data = session.store.getState().data;
  const products = new Map(data.products.map((product) => [product.id, product]));
  const staff = data.users.find((user) => user.id === note.userId)?.name ?? note.userId;
  const sale = note.kind === 'penjualan';
  const plan: SettlementPlan = {
    applied: note.applied,
    toDeposit: note.toDeposit,
    cash: note.cash,
  };
  const at = new Date(note.at);

  const rows = note.lines.map((line, position) => {
    const product = products.get(line.productId);
    const unit = product?.units.find((item) => item.code === line.unit)?.name ?? line.unit;
    return el(
      'tr',
      {},
      el('td', { className: 'bo-ret-doc__no', text: String(position + 1) }),
      el(
        'td',
        {},
        el('strong', { text: product?.name ?? line.productId }),
        el('div', { className: 'bo-ret-doc__code', text: product?.code ?? '' }),
      ),
      el('td', {
        className: 'bo-ret-doc__num',
        text: `${formatDecimal(line.quantity, 3, 0)} ${unit}`,
      }),
      el('td', { className: 'bo-ret-doc__num', text: formatRupiah(line.value) }),
    );
  });

  const money = settlementLines(note.kind, note.settlement, plan);
  const body = el(
    'div',
    { className: 'bo-ret-doc' },
    el('p', { className: 'bo-ret-doc__sim', text: label('boReturNotaCatatan') }),
    el(
      'header',
      { className: 'bo-ret-doc__head' },
      el('strong', { className: 'bo-ret-doc__store', text: DEFAULT_STORE_PROFILE.name }),
      el('span', { text: DEFAULT_STORE_PROFILE.tagline }),
      el('span', { text: DEFAULT_STORE_PROFILE.address }),
      el('h3', {
        className: 'bo-ret-doc__title',
        text: label(sale ? 'boReturNotaJudulPenjualan' : 'boReturNotaJudulPembelian'),
      }),
    ),
    el(
      'dl',
      { className: 'bo-ret-doc__meta' },
      fact(label('boReturNotaNomor'), note.number),
      fact(label('tanggal'), `${formatDate(at)}, ${formatTime(at)}`),
      fact(label('boReturNotaFaktur'), note.sourceNumber),
      fact(label(sale ? 'pelanggan' : 'boReturPihakPemasok'), note.partyName),
      fact(label('boReturNotaGudang'), label(WAREHOUSE_LABELS[note.warehouse])),
      fact(label('boReturNotaPetugas'), staff),
    ),
    el(
      'table',
      { className: 'bo-ret-doc__table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: label('boReturNotaNo') }),
          el('th', { text: label('boReturNotaBarang') }),
          el('th', { className: 'bo-ret-doc__num', text: label('boReturNotaJumlah') }),
          el('th', { className: 'bo-ret-doc__num', text: label('boReturKolomNilai') }),
        ),
      ),
      el('tbody', {}, ...rows),
    ),
    el(
      'div',
      { className: 'bo-ret-doc__sum' },
      el(
        'div',
        { className: 'bo-ret-doc__total' },
        el('span', { text: label('boReturNotaTotal') }),
        el('strong', { text: formatRupiah(note.total) }),
      ),
      el(
        'div',
        { className: 'bo-ret-doc__settle' },
        el('span', {
          className: 'bo-ret-doc__settle-title',
          text: `${label('boReturNotaPenyelesaian')}: ${label(settlementLabelKey(note.kind, note.settlement))}`,
        }),
        ...money.map((row) => el('span', { text: row.text })),
      ),
    ),
    el(
      'p',
      { className: 'bo-ret-doc__reason' },
      el('strong', { text: `${label('boReturNotaAlasan')}: ` }),
      el('span', { text: note.reason }),
    ),
    el(
      'div',
      { className: 'bo-ret-doc__sign' },
      el(
        'div',
        { className: 'bo-ret-doc__sign-box' },
        el('span', { text: label('boReturNotaTtdPetugas') }),
        el('i', { className: 'bo-ret-doc__sign-line' }),
        el('strong', { text: staff }),
      ),
      el(
        'div',
        { className: 'bo-ret-doc__sign-box' },
        el('span', { text: label(sale ? 'boReturNotaTtdPelanggan' : 'boReturNotaTtdPemasok') }),
        el('i', { className: 'bo-ret-doc__sign-line' }),
        el('strong', { text: note.partyName }),
      ),
    ),
  );

  openModal({
    title: label('boReturNotaModal'),
    body,
    actions: [
      {
        text: label('boReturNotaCetak'),
        variant: 'primary',
        icon: 'printer',
        onClick: () => {
          logReturnPrint(session, note);
          window.print();
        },
      },
      { text: label('tutup'), variant: 'secondary' },
    ],
  });
}
