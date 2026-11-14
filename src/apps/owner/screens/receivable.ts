import '../../../styles/mobile-owner.css';
import { remainingLimit, wibDate } from '../../../shared/data/receivable';
import type { Customer, Tier } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import type { IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { PAGE_SIZE } from '../domain/constants';
import { invoiceStatus, receivableInvoiceDetail } from '../domain/invoice-detail';
import { payableRows, openInvoiceCount, totalPayable } from '../domain/payables';
import {
  receivableRows,
  totalReceivable,
  totalReceivableOverdue,
  type ReceivableRow,
} from '../domain/receivables';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { dateText, kvRow, lineItems, paymentRows, sectionTitle, statusBadge } from './doc-parts';
import { renderPayableScreens, payableHub } from './payable';
import { createInvoiceList, createPartyList, type PartyItem } from './party-list';
import { openBillPreview, openContact, openReceivablePayment } from './payment-sheets';

const HOME = '/owner/piutang';

const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
};

type Tab = 'piutang' | 'hutang';

function quickActions(
  session: OwnerSession,
  customer: Customer,
  options: {
    readonly pay?: (() => void) | undefined;
    readonly invoices: () => Customer['invoices'];
  },
): HTMLElement {
  const tile = (
    text: string,
    name: IconName,
    run: () => void,
    primary = false,
  ): HTMLButtonElement => {
    const button = createButton({
      text,
      variant: primary ? 'primary' : 'secondary',
      icon: name,
      onClick: run,
    });
    button.classList.add('trx-quick__button');
    return button;
  };
  const greeting = label('salamTagihan', { nama: customer.name });
  return el(
    'div',
    { className: 'trx-quick' },
    ...(options.pay === undefined
      ? []
      : [tile(label('catatBayarPiutang'), 'banknote', options.pay, true)]),
    tile(label('kirimTagihanWa'), 'send', () => {
      const open = options.invoices().filter((invoice) => invoice.amount > invoice.paid);
      openBillPreview(session, customer, open);
    }),
    tile(label('hubungiPelanggan'), 'phone', () => {
      openContact(`${label('hubungiPelanggan')}: ${customer.name}`, customer.phone, greeting);
    }),
  );
}

function customerItem(row: ReceivableRow): PartyItem {
  return {
    id: row.customer.id,
    name: row.customer.name,
    meta:
      row.customer.phone === '' ? row.customer.code : `${row.customer.code}, ${row.customer.phone}`,
    amount: row.balance,
    badges: [
      row.daysLate > 0
        ? createMobBadge(label('terlambatHari', { hari: row.daysLate }), 'bahaya', 'clock')
        : createMobBadge(label('piuBelumLunas'), 'info', 'clock'),
      createMobBadge(label('piuJumlahInvoice', { jumlah: row.openInvoices.length }), 'netral'),
    ],
  };
}

function renderHub(
  session: OwnerSession,
  initial: Tab,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('piuJudul'));
  shell?.setBack(undefined);
  const store = session.store;
  let tab: Tab = initial;
  let shown = PAGE_SIZE;

  const segment = el('div', {
    className: 'own-segment',
    attrs: { role: 'group', 'aria-label': label('piuJudul') },
  });
  const summary = el('div', { className: 'trx-summary' });
  const list = el('div', { className: 'own-stack' });
  const more = el('div', { className: 'own-more' });
  const stamp = el('p', { className: 't-label own-stamp' });

  const paintSegment = (): void => {
    segment.replaceChildren(
      ...(['piutang', 'hutang'] as const).map((value) => {
        const button = el('button', {
          className: 'own-segment__button',
          text: label(value === 'piutang' ? 'piuSegmenPiutang' : 'piuSegmenHutang'),
          attrs: { type: 'button', 'aria-pressed': tab === value ? 'true' : 'false' },
        });
        button.addEventListener('click', () => {
          if (tab !== value) {
            tab = value;
            shown = PAGE_SIZE;
            paint();
          }
        });
        return button;
      }),
    );
  };

  const paintReceivable = (): void => {
    const rows = receivableRows(store.getState().data.customers, session.now());
    summary.replaceChildren(
      createMobCard({
        tone: 'info',
        title: label('labelTotalPiutang'),
        iconName: 'hand-coins',
        body: [
          el('span', { className: 'mob-value', text: formatRupiah(totalReceivable(rows)) }),
          el('p', {
            className: 'mob-sub',
            text: label('piuRingkasanPiutang', {
              pelanggan: rows.length,
              terlambat: formatRupiah(totalReceivableOverdue(rows)),
            }),
          }),
        ],
      }),
    );
    list.replaceChildren(
      rows.length === 0
        ? createEmptyState({ icon: 'inbox', title: label('tidakAdaPiutang') })
        : createPartyList(rows.slice(0, shown).map(customerItem), (id) => {
            go(`${HOME}?cust=${encodeURIComponent(id)}`);
          }),
    );
    more.replaceChildren(
      ...(rows.length > shown
        ? [
            createButton({
              text: label('muatLebihBanyak', { jumlah: rows.length - shown }),
              variant: 'secondary',
              onClick: () => {
                shown += PAGE_SIZE;
                paint();
              },
            }),
          ]
        : []),
    );
  };

  const paintPayable = (): void => {
    const rows = payableRows(store.getState().data.suppliers, session.now());
    const hub = payableHub(rows, go);
    summary.replaceChildren(
      createMobCard({
        tone: 'peringatan',
        title: label('htgTotalJudul'),
        iconName: 'banknote',
        body: [
          el('span', { className: 'mob-value', text: formatRupiah(totalPayable(rows)) }),
          el('p', {
            className: 'mob-sub',
            text: label('htgRingkasan', {
              faktur: openInvoiceCount(rows),
              supplier: rows.length,
            }),
          }),
        ],
      }),
    );
    list.replaceChildren(hub);
    more.replaceChildren();
  };

  const paint = (): void => {
    paintSegment();
    if (tab === 'piutang') {
      paintReceivable();
    } else {
      paintPayable();
    }
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
  };

  const onScroll = (): void => {
    const scroller = document.getElementById('own-main');
    if (
      tab === 'piutang' &&
      scroller !== null &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80
    ) {
      const count = receivableRows(store.getState().data.customers, session.now()).length;
      if (count > shown) {
        shown += PAGE_SIZE;
        paint();
      }
    }
  };
  const scroller = document.getElementById('own-main');
  scroller?.addEventListener('scroll', onScroll, { passive: true });

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: el('div', { className: 'own-stack' }, segment, summary, list, more, stamp),
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      scroller?.removeEventListener('scroll', onScroll);
    },
  };
}

function missing(shell: OwnerShell | undefined, back: string): ScreenHandle {
  shell?.setBack(back);
  return {
    element: createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }),
    destroy: () => undefined,
  };
}

// Halaman pelanggan: ringkasan piutang, aksi cepat, dan daftar invoice.
function renderCustomerPage(
  session: OwnerSession,
  id: string,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('piuDetailPelanggan'));
  shell?.setBack(HOME);
  const store = session.store;
  const root = el('div', { className: 'own-stack' });

  const paint = (): void => {
    const customer = store.getState().data.customers.find((item) => item.id === id);
    if (customer === undefined) {
      root.replaceChildren(createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }));
      return;
    }
    const today = wibDate(session.now());
    const row = receivableRows([customer], session.now())[0];
    const balance = row?.balance ?? 0;
    const sorted = [...customer.invoices].sort((first, second) => {
      const firstOpen = first.amount > first.paid;
      const secondOpen = second.amount > second.paid;
      return Number(secondOpen) - Number(firstOpen) || first.dueAt.localeCompare(second.dueAt);
    });
    root.replaceChildren(
      createMobCard({
        tone: 'info',
        body: [
          el('h2', { className: 'trx-party-head__name', text: customer.name }),
          el('p', {
            className: 'mob-sub',
            text: customer.phone === '' ? customer.code : `${customer.code}, ${customer.phone}`,
          }),
          el(
            'div',
            { className: 'mob-grid-2 trx-stats' },
            el(
              'div',
              {},
              el('span', { className: 'mob-sub', text: label('labelTotalPiutang') }),
              el('span', { className: 'mob-value mob-value--sm', text: formatRupiah(balance) }),
            ),
            el(
              'div',
              {},
              el('span', { className: 'mob-sub', text: label('piuTerlambat') }),
              el('span', {
                className: 'mob-value mob-value--sm',
                text: formatRupiah(row?.overdueAmount ?? 0),
              }),
            ),
          ),
        ],
      }),
      el(
        'div',
        { className: 'trx-kv trx-kv--card' },
        kvRow(label('piuKategoriHarga'), label(TIER_LABELS[customer.tier])),
        kvRow(label('piuLimit'), formatRupiah(customer.limit)),
        kvRow(label('piuSisaLimit'), formatRupiah(Math.max(0, remainingLimit(customer)))),
      ),
      quickActions(session, customer, {
        pay:
          balance > 0
            ? () => {
                openReceivablePayment(session, customer);
              }
            : undefined,
        invoices: () => customer.invoices,
      }),
      sectionTitle(label('piuDaftarInvoice')),
      sorted.length === 0
        ? createEmptyState({ icon: 'inbox', title: label('piuTidakAdaInvoice') })
        : createInvoiceList(
            sorted.map((invoice) => ({
              id: invoice.id,
              title: invoice.id,
              meta: label('jatuhTempoTgl', { tanggal: dateText(invoice.dueAt) }),
              amount: Math.max(0, invoice.amount - invoice.paid),
              caption: label('sisa'),
              badge: statusBadge(invoiceStatus(invoice, today)),
            })),
            (invoiceId) => {
              go(`${HOME}?inv=${encodeURIComponent(invoiceId)}`);
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

// Detail Invoice: rincian, barang, riwayat bayar, dan aksi.
function renderInvoiceDetail(session: OwnerSession, id: string, shell?: OwnerShell): ScreenHandle {
  shell?.setTitle(label('piuDetailInvoice'));
  const store = session.store;
  const owner = store
    .getState()
    .data.customers.find((item) => item.invoices.some((invoice) => invoice.id === id));
  if (owner === undefined) {
    return missing(shell, HOME);
  }
  shell?.setBack(`${HOME}?cust=${encodeURIComponent(owner.id)}`);
  const root = el('div', { className: 'own-stack' });

  const paint = (): void => {
    const data = store.getState().data;
    const customer = data.customers.find((item) => item.id === owner.id) ?? owner;
    const invoice = customer.invoices.find((item) => item.id === id);
    if (invoice === undefined) {
      root.replaceChildren(createEmptyState({ icon: 'inbox', title: label('trxDokumenTidakAda') }));
      return;
    }
    const byId = new Map(data.products.map((product) => [product.id, product]));
    const detail = receivableInvoiceDetail(
      customer,
      invoice,
      data.products,
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
              el('span', { className: 'mob-muted', text: customer.name }),
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
      quickActions(session, customer, {
        pay:
          detail.balance > 0
            ? () => {
                openReceivablePayment(session, customer, invoice);
              }
            : undefined,
        invoices: () => [invoice],
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

export function renderReceivables(
  session: OwnerSession,
  query: URLSearchParams = new URLSearchParams(),
  go: (path: string) => void = () => undefined,
  shell?: OwnerShell,
): ScreenHandle {
  const payable = renderPayableScreens(session, query, go, shell);
  if (payable !== undefined) {
    return payable;
  }
  const invoice = query.get('inv');
  if (invoice !== null) {
    return renderInvoiceDetail(session, invoice, shell);
  }
  const customer = query.get('cust');
  if (customer !== null) {
    return renderCustomerPage(session, customer, go, shell);
  }
  return renderHub(session, query.get('tab') === 'hutang' ? 'hutang' : 'piutang', go, shell);
}
