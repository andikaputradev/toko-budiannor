import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { findPayment } from '../domain/payment-history';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { iconBubble, kvRow, roleLabel, stampText } from './doc-parts';

const BACK = '/owner/transaksi';

const METHOD_LABELS = {
  tunai: 'metodeTunai',
  transfer: 'metodeTransfer',
  qris: 'metodeQris',
} as const satisfies Record<string, LabelKey>;

// Bukti pembayaran hutang piutang: nomor, waktu, pembuat, pihak, cara bayar, faktur yang dilunasi,
// total, dan sisa sesudah pembayaran.
export function renderPaymentDetail(
  session: OwnerSession,
  number: string,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(mt('trxDetailBukti'));
  shell?.setBack(BACK);
  const store = session.store;
  const root = el('div', {
    className: 'own-stack trx-detail',
    attrs: { tabindex: '0', role: 'region', 'aria-label': mt('trxDetailBukti') },
  });

  const paint = (): void => {
    const state = store.getState();
    const record = findPayment(state.debtPayments, number);
    if (record === undefined) {
      root.replaceChildren(createEmptyState({ icon: 'inbox', title: mt('trxBuktiTidakAda') }));
      return;
    }
    const user = state.data.users.find((item) => item.id === record.userId);
    const receivable = record.kind === 'piutang';
    root.replaceChildren(
      createMobCard({
        body: [
          el(
            'div',
            { className: 'trx-head' },
            iconBubble(
              receivable ? 'hand-coins' : 'banknote',
              receivable ? 'sukses' : 'peringatan',
            ),
            el(
              'div',
              { className: 'trx-head__main' },
              el('span', { className: 'trx-head__number', text: record.number }),
              el('span', { className: 'mob-muted', text: stampText(record.at) }),
            ),
            createMobBadge(label(METHOD_LABELS[record.method]), 'info'),
          ),
          el(
            'div',
            { className: 'trx-kv' },
            kvRow(mt('trxJenisBukti'), mt(receivable ? 'trxBuktiPiutang' : 'trxBuktiHutang')),
            kvRow(
              label('trxDibuatOleh'),
              user === undefined ? '' : `${user.name} (${roleLabel(user.role)})`,
            ),
            kvRow(label(receivable ? 'pelanggan' : 'pemasok'), record.partyName),
            kvRow(label('caraBayar'), label(METHOD_LABELS[record.method])),
          ),
        ],
      }),
      createMobCard({
        title: mt('trxFakturDilunasi'),
        iconName: 'receipt-text',
        body: [
          el(
            'div',
            { className: 'trx-kv' },
            ...(record.allocations.length === 0
              ? [el('p', { className: 'mob-muted', text: mt('trxTanpaRincianFaktur') })]
              : record.allocations.map((item) => kvRow(item.invoiceId, formatRupiah(item.amount)))),
            kvRow(mt('trxTotalDibayar'), formatRupiah(record.amount), true),
            kvRow(
              mt(receivable ? 'trxSisaPiutangPihak' : 'trxSisaHutangPihak'),
              formatRupiah(record.remaining),
            ),
          ),
        ],
      }),
    );
  };

  const stop = store.subscribe(paint);
  paint();
  return { element: root, destroy: stop };
}
