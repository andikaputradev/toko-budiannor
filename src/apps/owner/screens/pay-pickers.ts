import '../../../styles/mobile-owner.css';
import { wibDate } from '../../../shared/data/receivable';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createEmptyState } from '../../../shared/ui/empty';
import { createButton } from '../../../shared/ui/button';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { invoiceStatus } from '../domain/invoice-detail';
import { openPayables, payableRows, remainingOf, supplierBalance } from '../domain/payables';
import { receivableRows } from '../domain/receivables';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { dateText, statusBadge } from './doc-parts';
import { createInvoiceList, createPartyList, type PartyItem } from './party-list';
import { openPayablePayment, openReceivablePayment } from './payment-sheets';

const BACK = '/owner/transaksi';
const MAX_ROWS = 40;

function matches(text: string, ...fields: readonly string[]): boolean {
  const needle = text.trim().toLowerCase();
  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle));
}

interface PickerSetup {
  readonly title: string;
  readonly placeholder: string;
  readonly empty: string;
  readonly items: (text: string) => readonly PartyItem[];
  readonly onSelect: (id: string) => void;
}

function renderPicker(
  session: OwnerSession,
  shell: OwnerShell | undefined,
  setup: PickerSetup,
): ScreenHandle {
  shell?.setTitle(setup.title);
  shell?.setBack(BACK);
  const store = session.store;
  let text = '';
  const search = el('input', {
    className: 'input own-search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      'aria-label': setup.placeholder,
      placeholder: setup.placeholder,
    },
  });
  const list = el('div', { className: 'own-stack' });
  const paint = (): void => {
    const items = setup.items(text).slice(0, MAX_ROWS);
    list.replaceChildren(
      items.length === 0
        ? createEmptyState({ icon: 'inbox', title: setup.empty })
        : createPartyList(items, setup.onSelect),
    );
  };
  search.addEventListener('input', () => {
    text = search.value;
    paint();
  });
  const stop = store.subscribe(paint);
  paint();
  return {
    element: el('div', { className: 'own-stack' }, search, list),
    destroy: stop,
  };
}

// Bayar Piutang dari Transaksi: pilih pelanggan lalu buka lembar bayar yang sama dengan layar Piutang.
export function renderPayReceivable(session: OwnerSession, shell?: OwnerShell): ScreenHandle {
  const data = () => session.store.getState().data;
  return renderPicker(session, shell, {
    title: label('trxBayarPiutang'),
    placeholder: label('trxCariPelanggan'),
    empty: label('tidakAdaPiutangPelanggan'),
    items: (text) =>
      receivableRows(data().customers, session.now())
        .filter((row) => matches(text, row.customer.name, row.customer.code))
        .map((row) => ({
          id: row.customer.id,
          name: row.customer.name,
          meta: row.customer.code,
          amount: row.balance,
          badges:
            row.daysLate > 0
              ? [createMobBadge(label('terlambatHari', { hari: row.daysLate }), 'bahaya', 'clock')]
              : [createMobBadge(label('piuBelumLunas'), 'info', 'clock')],
        })),
    onSelect: (id) => {
      const customer = data().customers.find((item) => item.id === id);
      if (customer !== undefined) {
        openReceivablePayment(session, customer);
      }
    },
  });
}

// Bayar Hutang dari Transaksi: pilih supplier, lalu pilih faktur (atau bayar seluruh hutang).
export function renderPayPayable(session: OwnerSession, shell?: OwnerShell): ScreenHandle {
  const store = session.store;
  const data = () => store.getState().data;
  let selected: string | undefined;
  const root = el('div', { className: 'own-stack' });
  let current: ScreenHandle | undefined;

  const showSuppliers = (): void => {
    selected = undefined;
    current?.destroy();
    current = renderPicker(session, shell, {
      title: label('trxBayarHutang'),
      placeholder: label('trxCariPemasok'),
      empty: label('htgTidakAdaHutang'),
      items: (text) =>
        payableRows(data().suppliers, session.now())
          .filter((row) => matches(text, row.supplier.name))
          .map((row) => ({
            id: row.supplier.id,
            name: row.supplier.name,
            meta: label('htgJumlahFaktur', { jumlah: row.open.length }),
            amount: row.balance,
            badges:
              row.daysLate > 0
                ? [
                    createMobBadge(
                      label('terlambatHari', { hari: row.daysLate }),
                      'bahaya',
                      'clock',
                    ),
                  ]
                : [createMobBadge(label('piuBelumLunas'), 'info', 'clock')],
          })),
      onSelect: (id) => {
        selected = id;
        showInvoices();
      },
    });
    root.replaceChildren(current.element);
  };

  const showInvoices = (): void => {
    current?.destroy();
    const paint = (): void => {
      const supplier = data().suppliers.find((item) => item.id === selected);
      if (supplier === undefined) {
        showSuppliers();
        return;
      }
      const today = wibDate(session.now());
      const open = openPayables(supplier);
      const back = createButton({
        text: label('htgPilihSupplierLain'),
        variant: 'secondary',
        icon: 'chevron-left',
        onClick: showSuppliers,
      });
      const all = createButton({
        text: label('htgBayarSemuaFaktur'),
        icon: 'banknote',
        onClick: () => {
          openPayablePayment(session, supplier);
        },
      });
      root.replaceChildren(
        el(
          'div',
          { className: 'own-stack' },
          back,
          createMobCard({
            tone: 'peringatan',
            title: supplier.name,
            body: [
              el('span', { className: 'mob-value', text: formatRupiah(supplierBalance(supplier)) }),
              el('p', {
                className: 'mob-sub',
                text: label('htgJumlahFaktur', { jumlah: open.length }),
              }),
            ],
          }),
          open.length === 0
            ? createEmptyState({ icon: 'inbox', title: label('htgTidakAdaHutang') })
            : createInvoiceList(
                open.map((invoice) => ({
                  id: invoice.id,
                  title: invoice.id,
                  meta: label('jatuhTempoTgl', { tanggal: dateText(invoice.dueAt) }),
                  amount: remainingOf(invoice),
                  caption: label('sisa'),
                  badge: statusBadge(invoiceStatus(invoice, today)),
                })),
                (id) => {
                  const invoice = open.find((item) => item.id === id);
                  if (invoice !== undefined) {
                    openPayablePayment(session, supplier, invoice);
                  }
                },
              ),
          open.length > 1 ? all : false,
        ),
      );
    };
    const stop = store.subscribe(paint);
    current = { element: root, destroy: stop };
    paint();
  };

  showSuppliers();
  return {
    element: root,
    destroy: () => {
      current?.destroy();
    },
  };
}
