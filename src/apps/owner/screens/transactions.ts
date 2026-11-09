import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
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
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { renderApprovals } from './approvals';
import { docBubble, docStatusBadge, sectionTitle, stampText } from './doc-parts';
import { renderPurchaseForm, renderSalesForm } from './forms';
import { renderNotifications } from './notifications';
import { renderPayPayable, renderPayReceivable } from './pay-pickers';
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

function docRow(row: DocRow, fallback: string): HTMLElement {
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
  const documents = el('div', { className: 'own-stack' });

  const paintDocuments = (): void => {
    const state = store.getState();
    const data = state.data;
    const fallback = label('pelangganUmum');
    const bills = heldBillRows(data);
    const orders = orderRows(data, state.salesOrders, state.purchaseOrders);
    const sales = saleRows(data);
    const group = (title: string, rows: readonly DocRow[], more?: HTMLElement): HTMLElement =>
      el(
        'section',
        { className: 'trx-group' },
        el('h3', { className: 'trx-group__title', text: title }),
        rows.length === 0
          ? createEmptyState({ icon: 'inbox', title: label('trxBelumAdaTransaksi') })
          : el('div', { className: 'trx-doc-list' }, ...rows.map((row) => docRow(row, fallback))),
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
