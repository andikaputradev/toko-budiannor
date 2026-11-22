import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import {
  docKeyFromQuery,
  docQuery,
  heldBillRows,
  orderRows,
  saleRows,
  type DocRow,
} from '../domain/bills';
import { paymentRows, type PaymentRow } from '../domain/payment-history';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { renderApprovals } from './approvals';
import { docBubble, docStatusBadge, iconBubble, sectionTitle, stampText } from './doc-parts';
import { renderPurchaseForm, renderSalesForm } from './forms';
import { renderNotifications } from './notifications';
import { renderPayPayable, renderPayReceivable } from './pay-pickers';
import { renderPaymentDetail } from './payment-detail';
import { openSendDoc } from './send-doc';
import { renderTransactionDetail } from './transaction-detail';

const SALES_PAGE = 15;

interface ActionTile {
  readonly tab: string;
  readonly text: LabelKey;
  readonly icon: IconName;
  readonly solid: boolean;
}

const TILES: readonly ActionTile[] = [
  { tab: 'so', text: 'trxInputSo', icon: 'file-text', solid: true },
  { tab: 'po', text: 'trxInputPo', icon: 'package-plus', solid: true },
  { tab: 'bayar-hutang', text: 'trxBayarHutang', icon: 'banknote', solid: false },
  { tab: 'bayar-piutang', text: 'trxBayarPiutang', icon: 'hand-coins', solid: false },
];

function docLink(row: DocRow, fallback: string): HTMLElement {
  const meta = [stampText(row.at), row.userName].filter((part) => part !== '').join(', ');
  return el(
    'a',
    {
      className: 'trx-doc',
      attrs: { href: `#/owner/transaksi?${docQuery(row)}` },
    },
    docBubble(row.kind),
    el(
      'span',
      { className: 'trx-doc__main' },
      el(
        'span',
        { className: 'trx-doc__top' },
        el('span', { className: 'trx-doc__number', text: row.number }),
        el('span', { className: 'trx-doc__total', text: formatRupiah(row.total) }),
      ),
      el('span', { className: 'trx-doc__meta', text: meta }),
      el(
        'span',
        { className: 'trx-doc__foot' },
        el('span', { className: 'trx-doc__party', text: row.partyName ?? fallback }),
        docStatusBadge(row.status),
      ),
    ),
    icon('chevron-right'),
  );
}

// Draf SO dan PO punya tombol aksi "Kirim WA" di samping barisnya untuk mengirim PDF-nya.
function docRow(row: DocRow, fallback: string, onSend: (row: DocRow) => void): HTMLElement {
  const link = docLink(row, fallback);
  if (row.kind !== 'so' && row.kind !== 'po') {
    return link;
  }
  const send = el(
    'button',
    { className: 'mob-send', attrs: { type: 'button' } },
    icon('message-circle'),
    el('span', { text: mt('waKirimPdf') }),
    el('span', { className: 'visually-hidden', text: ` ${row.number}` }),
  );
  send.addEventListener('click', () => {
    onSend(row);
  });
  return el('div', { className: 'mob-send-row' }, link, send);
}

const PAYMENT_METHODS = {
  tunai: 'metodeTunai',
  transfer: 'metodeTransfer',
  qris: 'metodeQris',
} as const satisfies Record<PaymentRow['method'], LabelKey>;

// Bukti pembayaran hutang atau piutang: ketuk membuka detail buktinya.
function paymentLink(row: PaymentRow): HTMLElement {
  const receivable = row.kind === 'piutang';
  const meta = [stampText(row.at), row.userName].filter((part) => part !== '').join(', ');
  return el(
    'a',
    {
      className: 'trx-doc',
      attrs: { href: `#/owner/transaksi?bukti=${encodeURIComponent(row.number)}` },
    },
    iconBubble(receivable ? 'hand-coins' : 'banknote', receivable ? 'sukses' : 'peringatan'),
    el(
      'span',
      { className: 'trx-doc__main' },
      el(
        'span',
        { className: 'trx-doc__top' },
        el('span', { className: 'trx-doc__number', text: row.number }),
        el('span', { className: 'trx-doc__total', text: formatRupiah(row.total) }),
      ),
      el('span', { className: 'trx-doc__meta', text: meta }),
      el(
        'span',
        { className: 'trx-doc__foot' },
        el('span', { className: 'trx-doc__party', text: row.partyName }),
        createMobBadge(label(PAYMENT_METHODS[row.method]), 'info'),
      ),
    ),
    icon('chevron-right'),
  );
}

function renderHub(session: OwnerSession, shell?: OwnerShell): ScreenHandle {
  shell?.setBack(undefined);
  const store = session.store;
  let shown = SALES_PAGE;

  const tiles = el(
    'div',
    { className: 'trx-tiles' },
    ...TILES.map((tile) =>
      el(
        'a',
        {
          className: tile.solid ? 'trx-tile trx-tile--solid' : 'trx-tile trx-tile--soft',
          attrs: { href: `#/owner/transaksi?tab=${tile.tab}` },
        },
        icon(tile.icon),
        el('span', { text: label(tile.text) }),
      ),
    ),
  );
  const approvals = renderApprovals(session);
  const payments = el('div', { className: 'own-stack' });
  const documents = el('div', { className: 'own-stack' });

  const paintDocuments = (): void => {
    const state = store.getState();
    const data = state.data;
    const fallback = label('pelangganUmum');
    const bills = heldBillRows(data);
    const orders = orderRows(data, state.salesOrders, state.purchaseOrders);
    const sales = saleRows(data);
    const send = (row: DocRow): void => {
      openSendDoc(session, row);
    };
    const group = (title: string, rows: readonly DocRow[], more?: HTMLElement): HTMLElement =>
      el(
        'section',
        { className: 'trx-group' },
        el('h3', { className: 'trx-group__title', text: title }),
        rows.length === 0
          ? createEmptyState({ icon: 'inbox', title: label('trxBelumAdaTransaksi') })
          : el(
              'div',
              { className: 'trx-doc-list' },
              ...rows.map((row) => docRow(row, fallback, send)),
            ),
        more,
      );
    const more =
      sales.length > shown
        ? createButton({
            text: label('muatLebihBanyak', { jumlah: Math.min(SALES_PAGE, sales.length - shown) }),
            variant: 'secondary',
            onClick: () => {
              shown += SALES_PAGE;
              paintDocuments();
            },
          })
        : undefined;
    const paid = paymentRows(data, state.debtPayments);
    payments.replaceChildren(
      el(
        'section',
        { className: 'trx-group' },
        el('h3', { className: 'trx-group__title', text: mt('trxPembayaranHutangPiutang') }),
        paid.length === 0
          ? createEmptyState({ icon: 'inbox', title: mt('trxBelumAdaPembayaran') })
          : el('div', { className: 'trx-doc-list' }, ...paid.map(paymentLink)),
      ),
    );
    documents.replaceChildren(
      sectionTitle(label('trxBillFaktur')),
      group(`${label('trxBillDitahan')} (${String(bills.length)})`, bills),
      ...(orders.length === 0 ? [] : [group(label('trxSoPo'), orders)]),
      group(label('trxTransaksiTerbaru'), sales.slice(0, shown), more),
    );
  };

  const stop = store.subscribe(paintDocuments);
  paintDocuments();
  const note = el(
    'p',
    { className: 'trx-note' },
    icon('info'),
    el('span', { text: label('trxCatatanLabaRugi') }),
  );
  return {
    element: el(
      'div',
      { className: 'own-stack trx-hub' },
      sectionTitle(label('trxBuatTransaksi')),
      tiles,
      approvals.element,
      payments,
      documents,
      note,
    ),
    destroy: () => {
      stop();
      approvals.destroy();
    },
  };
}

export function renderTransactions(
  session: OwnerSession,
  query: URLSearchParams,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  const key = docKeyFromQuery(query);
  if (key !== undefined) {
    return renderTransactionDetail(session, key, shell);
  }
  const receipt = query.get('bukti');
  if (receipt !== null && receipt !== '') {
    return renderPaymentDetail(session, receipt, shell);
  }
  const tab = query.get('tab');
  if (tab === 'so') {
    return renderSalesForm(session, go, shell);
  }
  if (tab === 'po') {
    return renderPurchaseForm(session, query.get('barang'), go, shell);
  }
  if (tab === 'bayar-piutang') {
    return renderPayReceivable(session, shell);
  }
  if (tab === 'bayar-hutang') {
    return renderPayPayable(session, shell);
  }
  if (tab === 'notifikasi') {
    return renderNotifications(session, shell);
  }
  return renderHub(session, shell);
}
