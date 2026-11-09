import '../../../styles/mobile-owner.css';
import { wibDate } from '../../../shared/data/receivable';
import type { Supplier } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { invoiceStatus, payableInvoiceDetail } from '../domain/invoice-detail';
import { remainingOf, supplierBalance, type PayableRow } from '../domain/payables';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { dateText, kvRow, lineItems, paymentRows, sectionTitle, statusBadge } from './doc-parts';
import { createInvoiceList, createPartyList } from './party-list';
import { openContact, openPayablePayment } from './payment-sheets';

const HOME = '/owner/piutang';
const HUTANG = `${HOME}?tab=hutang`;

// Daftar supplier berhutang pada segmen Hutang.
export function payableHub(rows: readonly PayableRow[], go: (path: string) => void): HTMLElement {
  if (rows.length === 0) {
    return createEmptyState({ icon: 'inbox', title: label('htgTidakAdaHutang') });
  }
  return createPartyList(
    rows.map((row) => ({
      id: row.supplier.id,
      name: row.supplier.name,
      meta: label('htgJumlahFaktur', { jumlah: row.open.length }),
      amount: row.balance,
      badges: [
        row.daysLate > 0
          ? createMobBadge(label('terlambatHari', { hari: row.daysLate }), 'bahaya', 'clock')
          : createMobBadge(label('piuBelumLunas'), 'info', 'clock'),
      ],
    })),
    (id) => {
      go(`${HOME}?sup=${encodeURIComponent(id)}`);
    },
  );
}

function supplierActions(supplier: Supplier, balance: number, pay: () => void): HTMLElement {
  const contact = createButton({
    text: label('htgHubungiSupplier'),
    variant: 'secondary',
    icon: 'phone',
    onClick: () => {
      openContact(
        `${label('htgHubungiSupplier')}: ${supplier.name}`,
        supplier.phone,
        label('htgSalamSupplier', { nama: supplier.name }),
      );
    },
  });
  contact.classList.add('trx-quick__button');
  const actions = [contact];
  if (balance > 0) {
    const button = createButton({ text: label('trxBayarHutang'), icon: 'banknote', onClick: pay });
    button.classList.add('trx-quick__button');
    actions.unshift(button);
  }
  return el('div', { className: 'trx-quick trx-quick--two' }, ...actions);
}

function renderSupplierPage(
  session: OwnerSession,
  id: string,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('htgDetailSupplier'));
  shell?.setBack(HUTANG);
  const store = session.store;
  const root = el('div', { className: 'own-stack' });

  const paint = (): void => {
    const supplier = store.getState().data.suppliers.find((item) => item.id === id);
    if (supplier === undefined) {
      root.replaceChildren(createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }));
      return;
    }
    const today = wibDate(session.now());
    const balance = supplierBalance(supplier);
    const invoices = [...(supplier.invoices ?? [])].sort((first, second) => {
      const firstOpen = remainingOf(first) > 0;
      const secondOpen = remainingOf(second) > 0;
      return Number(secondOpen) - Number(firstOpen) || first.dueAt.localeCompare(second.dueAt);
    });
    root.replaceChildren(
      createMobCard({
        tone: 'peringatan',
        body: [
          el('h2', { className: 'trx-party-head__name', text: supplier.name }),
          el('p', { className: 'mob-sub', text: supplier.phone }),
          el('span', { className: 'mob-sub', text: label('htgTotalJudul') }),
          el('span', { className: 'mob-value', text: formatRupiah(balance) }),
        ],
      }),
      supplierActions(supplier, balance, () => {
        openPayablePayment(session, supplier);
      }),
      sectionTitle(label('htgDaftarFaktur')),
      invoices.length === 0
        ? createEmptyState({ icon: 'inbox', title: label('htgTidakAdaFaktur') })
        : createInvoiceList(
            invoices.map((invoice) => ({
              id: invoice.id,
              title: invoice.id,
              meta: label('jatuhTempoTgl', { tanggal: dateText(invoice.dueAt) }),
              amount: remainingOf(invoice),
              caption: label('sisa'),
              badge: statusBadge(invoiceStatus(invoice, today)),
            })),
            (invoiceId) => {
              go(`${HOME}?fak=${encodeURIComponent(invoiceId)}`);
            },
          ),
    );
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: root,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}

// Detail Faktur: barang, jatuh tempo, status, riwayat bayar, dan aksi Bayar Hutang.
function renderPayableInvoice(session: OwnerSession, id: string, shell?: OwnerShell): ScreenHandle {
  shell?.setTitle(label('htgDetailFaktur'));
  const store = session.store;
  const owner = store
    .getState()
    .data.suppliers.find((item) => (item.invoices ?? []).some((invoice) => invoice.id === id));
  if (owner === undefined) {
    shell?.setBack(HUTANG);
    return {
      element: createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }),
      destroy: () => undefined,
    };
  }
  shell?.setBack(`${HOME}?sup=${encodeURIComponent(owner.id)}`);
  const root = el('div', { className: 'own-stack' });

  const paint = (): void => {
    const data = store.getState().data;
    const supplier = data.suppliers.find((item) => item.id === owner.id) ?? owner;
    const invoice = (supplier.invoices ?? []).find((item) => item.id === id);
    if (invoice === undefined) {
      root.replaceChildren(createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }));
      return;
    }
    const byId = new Map(data.products.map((product) => [product.id, product]));
    const detail = payableInvoiceDetail(
      invoice,
      (productId) => byId.get(productId),
      wibDate(session.now()),
    );
    root.replaceChildren(
      createMobCard({
        body: [
          el(
            'div',
            { className: 'trx-head' },
            el(
              'div',
              { className: 'trx-head__main' },
              el('span', { className: 'trx-head__number', text: detail.id }),
              el('span', { className: 'mob-muted', text: supplier.name }),
            ),
            statusBadge(detail.status),
          ),
          el(
            'div',
            { className: 'trx-kv' },
            kvRow(label('piuTanggalTerbit'), dateText(detail.issuedAt)),
            kvRow(label('jatuhTempo'), dateText(detail.dueAt)),
            kvRow(label('piuNilaiInvoice'), formatRupiah(detail.amount)),
            kvRow(label('piuTerbayar'), formatRupiah(detail.paid)),
            kvRow(label('sisa'), formatRupiah(detail.balance), true),
          ),
        ],
      }),
      createMobCard({
        title: label('trxDaftarBarang'),
        iconName: 'package',
        body: [
          lineItems(detail.lines),
          el(
            'div',
            { className: 'trx-kv trx-kv--total' },
            kvRow(label('kolomTotal'), formatRupiah(detail.amount), true),
          ),
        ],
      }),
      createMobCard({
        title: label('piuRiwayatBayar'),
        iconName: 'history',
        body: [paymentRows(detail.payments)],
      }),
      supplierActions(supplier, detail.balance, () => {
        openPayablePayment(session, supplier, invoice);
      }),
    );
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: root,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}

// Layar hutang yang dibuka lewat kueri `sup` (supplier) atau `fak` (faktur).
export function renderPayableScreens(
  session: OwnerSession,
  query: URLSearchParams,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle | undefined {
  const invoice = query.get('fak');
  if (invoice !== null) {
    return renderPayableInvoice(session, invoice, shell);
  }
  const supplier = query.get('sup');
  return supplier === null ? undefined : renderSupplierPage(session, supplier, go, shell);
}
