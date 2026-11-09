import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import type { PaymentMethod } from '../../../shared/data/types';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { findDocument, type DocDetail, type DocKey, type DocKind } from '../domain/bills';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import {
  dateText,
  docBubble,
  docStatusBadge,
  kvRow,
  lineItems,
  roleLabel,
  stampText,
} from './doc-parts';

const BACK = '/owner/transaksi';

const TITLES: Readonly<Record<DocKind, LabelKey>> = {
  bill: 'trxDetailBill',
  sale: 'trxDetailTransaksi',
  so: 'trxDetailSo',
  po: 'trxDetailPo',
};

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

function summaryCard(detail: DocDetail): HTMLElement {
  const partyKey: LabelKey = detail.kind === 'po' ? 'pemasok' : 'pelanggan';
  const who = detail.userName === '' ? '' : `${detail.userName} (${roleLabel(detail.userRole)})`;
  return createMobCard({
    body: [
      el(
        'div',
        { className: 'trx-head' },
        docBubble(detail.kind),
        el(
          'div',
          { className: 'trx-head__main' },
          el('span', { className: 'trx-head__number', text: detail.number }),
          el('span', { className: 'mob-muted', text: stampText(detail.at) }),
        ),
        docStatusBadge(detail.status),
      ),
      el(
        'div',
        { className: 'trx-kv' },
        kvRow(label('trxDibuatOleh'), who),
        kvRow(
          label(partyKey),
          detail.partyName === undefined
            ? label('pelangganUmum')
            : detail.partyCode === undefined
              ? detail.partyName
              : `${detail.partyName} (${detail.partyCode})`,
        ),
        ...(detail.method === undefined
          ? []
          : [kvRow(label('caraBayar'), label(METHOD_LABELS[detail.method]))]),
        ...(detail.warehouse === undefined
          ? []
          : [
              kvRow(
                label('gudangPenerima'),
                label(detail.warehouse === 'display' ? 'namaGudangDisplay' : 'namaGudangBesar'),
              ),
            ]),
        ...(detail.dueDate === undefined
          ? []
          : [kvRow(label('jatuhTempo'), dateText(detail.dueDate))]),
        ...(detail.synced === undefined
          ? []
          : [
              kvRow(label('statusSinkron'), label(detail.synced ? 'tersinkron' : 'statusMenunggu')),
            ]),
      ),
    ],
  });
}

function itemsCard(detail: DocDetail): HTMLElement {
  return createMobCard({
    title: label('trxDaftarBarang'),
    iconName: 'package',
    body: [
      lineItems(detail.lines),
      el(
        'div',
        { className: 'trx-kv trx-kv--total' },
        ...(detail.discount > 0
          ? [
              kvRow(label('trxSubtotal'), formatRupiah(detail.gross)),
              kvRow(label('diskon'), `-${formatRupiah(detail.discount)}`),
            ]
          : []),
        kvRow(label('kolomTotal'), formatRupiah(detail.total), true),
      ),
    ],
  });
}

function paymentCard(detail: DocDetail): HTMLElement {
  if (detail.kind === 'bill') {
    return createMobCard({
      tone: 'peringatan',
      title: label('trxPembayaran'),
      iconName: 'clock',
      body: [el('p', { text: label('trxBillBelumDibayar') })],
    });
  }
  return createMobCard({
    title: label('trxPembayaran'),
    iconName: 'wallet',
    body: [
      el(
        'div',
        { className: 'trx-kv' },
        ...detail.payments.map((payment) =>
          kvRow(label(METHOD_LABELS[payment.method]), formatRupiah(payment.amount)),
        ),
        kvRow(label('trxDibayar'), formatRupiah(detail.paid)),
        kvRow(label('sisa'), formatRupiah(detail.remaining), true),
      ),
      detail.remaining > 0
        ? createMobBadge(
            label('trxSisaPiutang', { nilai: formatRupiah(detail.remaining) }),
            'peringatan',
          )
        : createMobBadge(label('statusLunas'), 'sukses', 'circle-check'),
    ],
  });
}

// Detail Transaksi: nomor, waktu, pembuat, pelanggan, barang, total, pembayaran, dan sisa.
export function renderTransactionDetail(
  session: OwnerSession,
  key: DocKey,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label(TITLES[key.kind]));
  shell?.setBack(BACK);
  const store = session.store;
  const root = el('div', {
    className: 'own-stack trx-detail',
    attrs: { tabindex: '0', role: 'region', 'aria-label': label(TITLES[key.kind]) },
  });

  const paint = (): void => {
    const state = store.getState();
    const detail = findDocument(
      { data: state.data, salesOrders: state.salesOrders, purchaseOrders: state.purchaseOrders },
      key,
    );
    root.replaceChildren(
      ...(detail === undefined
        ? [createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') })]
        : [
            summaryCard(detail),
            itemsCard(detail),
            ...(detail.kind === 'po' ? [] : [paymentCard(detail)]),
          ]),
    );
  };

  const stop = store.subscribe(paint);
  paint();
  return { element: root, destroy: stop };
}
