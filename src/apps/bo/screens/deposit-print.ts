import { el } from '../../../shared/dom';
import type { DepositEntry } from '../../../shared/data/types';
import { formatDate, formatRupiah, formatTime } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { openModal } from '../../../shared/ui/modal';
import type { BoSession } from '../bo-session';
import { DEFAULT_STORE_PROFILE } from '../domain/settings-rbac';
import { logDepositPrint } from './deposit-actions';

function row(term: string, value: string, className = ''): HTMLElement {
  return el(
    'div',
    { className: 'bo-dep-doc__row' },
    el('span', { text: term }),
    el('strong', { className, text: value }),
  );
}

// Pratinjau bukti setor atau bukti pemakaian deposit untuk pelanggan.
export function openDepositReceipt(session: BoSession, entry: DepositEntry): void {
  const data = session.store.getState().data;
  const customer = data.customers.find((item) => item.id === entry.customerId);
  const staff = data.users.find((user) => user.id === entry.userId)?.name ?? entry.userId;
  const at = new Date(entry.at);
  const topUp = entry.kind === 'setor';
  const rows = [
    row(label('boDepositBuktiNomor'), entry.number),
    row(label('tanggal'), `${formatDate(at)}, ${formatTime(at)}`),
    row(label('boDepositBuktiPelanggan'), customer?.name ?? entry.customerId),
    row(label('boDepositBuktiJumlah'), formatRupiah(entry.amount), 'bo-dep-doc__amount'),
  ];
  if (topUp) {
    rows.push(
      row(
        label('labelCaraBayar'),
        label(entry.method === 'transfer' ? 'labelMetodeTransfer' : 'metodeTunai'),
      ),
    );
  } else if (entry.reference !== '') {
    rows.push(row(label('boDepositBuktiPelunasan'), entry.reference));
  }
  if (entry.note !== '') {
    rows.push(row(label('keterangan'), entry.note));
  }
  rows.push(row(label('boDepositBuktiSaldoSetelah'), formatRupiah(entry.balanceAfter)));

  const body = el(
    'div',
    { className: 'bo-dep-doc' },
    el('p', { className: 'bo-ret-doc__sim', text: label('boReturNotaCatatan') }),
    el(
      'header',
      { className: 'bo-dep-doc__head' },
      el('strong', { className: 'bo-ret-doc__store', text: DEFAULT_STORE_PROFILE.name }),
      el('span', { text: DEFAULT_STORE_PROFILE.tagline }),
      el('span', { text: DEFAULT_STORE_PROFILE.address }),
      el('h3', {
        className: 'bo-dep-doc__title',
        text: label(topUp ? 'boDepositBuktiJudulSetor' : 'boDepositBuktiJudulPakai'),
      }),
    ),
    el('div', {}, ...rows),
    el(
      'div',
      { className: 'bo-ret-doc__sign' },
      el(
        'div',
        { className: 'bo-ret-doc__sign-box' },
        el('span', { text: label('boDepositBuktiTtdPetugas') }),
        el('i', { className: 'bo-ret-doc__sign-line' }),
        el('strong', { text: staff }),
      ),
      el(
        'div',
        { className: 'bo-ret-doc__sign-box' },
        el('span', { text: label('boDepositBuktiTtdPelanggan') }),
        el('i', { className: 'bo-ret-doc__sign-line' }),
        el('strong', { text: customer?.name ?? entry.customerId }),
      ),
    ),
  );

  openModal({
    title: label('boDepositBuktiModal'),
    body,
    actions: [
      {
        text: label('boReturNotaCetak'),
        variant: 'primary',
        icon: 'printer',
        onClick: () => {
          logDepositPrint(session, entry);
          window.print();
        },
      },
      { text: label('tutup'), variant: 'secondary' },
    ],
  });
}
