import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import type { HeldBill } from '../../../shared/data/types';
import { label, message } from '../../../shared/messages';
import { failureText } from '../failure';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { billTotal, itemCount } from '../domain/bill';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { billReceipt, openReceiptPreview } from './receipt-preview';

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderBills(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulBill');
  let query = '';
  let selectedId: string | undefined;

  const search = el('input', {
    className: 'input pos-bills__search',
    attrs: { type: 'search', autocomplete: 'off', 'aria-label': label('cariBill') },
  });
  const listBox = el('div', { className: 'pos-bills__list' });
  const detail = el('section', { className: 'pos-bills__detail' });

  const visible = (): HeldBill[] => {
    const needle = query.trim().toLowerCase();
    return [...session.state().heldBills]
      .filter(
        (bill) =>
          needle === '' ||
          bill.number.toLowerCase().includes(needle) ||
          session.customerName(bill.customerId).toLowerCase().includes(needle),
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  };
  const selected = (): HeldBill | undefined => {
    const bills = visible();
    return bills.find((bill) => bill.id === selectedId) ?? bills[0];
  };

  const call = (): void => {
    const bill = selected();
    if (bill === undefined) {
      return;
    }
    const result = session.recallBill(bill.id);
    if (result.ok) {
      go('/pos/jual');
    } else {
      showToast({ kind: 'error', text: failureText(result) });
    }
  };
  const remove = (): void => {
    const bill = selected();
    if (bill === undefined || !isAllowed(session.store.getState().role, 'POS-05', 'Hapus Bill')) {
      return;
    }
    openModal({
      title: label('hapusBill'),
      body: message('MSG-016', { nomor: bill.number }),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('hapus'),
          variant: 'danger',
          onClick: () => {
            session.deleteHeldBill(bill.id);
            showToast({ kind: 'success', text: label('billDihapus', { nomor: bill.number }) });
          },
        },
      ],
    });
  };
  const print = (): void => {
    const bill = selected();
    if (bill === undefined) {
      return;
    }
    openReceiptPreview({
      session,
      kind: 'draft',
      reference: bill.number,
      build: (width) => billReceipt(session, bill, width),
    });
  };

  const renderList = (): void => {
    const bills = visible();
    const current = selected();
    if (bills.length === 0) {
      listBox.replaceChildren(createEmptyState({ icon: 'inbox', title: label('billKosong') }));
      return;
    }
    const body = el('tbody');
    for (const bill of bills) {
      const open = el('button', {
        className: 'pos-bills__pick',
        text: bill.number,
        attrs: { type: 'button', 'aria-pressed': bill.id === current?.id ? 'true' : 'false' },
      });
      open.addEventListener('click', () => {
        selectedId = bill.id;
        render();
      });
      body.append(
        el(
          'tr',
          { className: bill.id === current?.id ? 'is-selected' : '' },
          el('td', {}, open),
          el('td', { text: formatTime(new Date(bill.createdAt)) }),
          el('td', { text: session.customerName(bill.customerId) }),
          el('td', { className: 'is-end', text: String(itemCount(bill.lines)) }),
          el('td', { className: 'is-end', text: formatRupiah(billTotal(bill.lines)) }),
          el('td', { text: session.userName(bill.userId) }),
        ),
      );
    }
    listBox.replaceChildren(
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomNoBill') }),
            el('th', { text: label('kolomWaktu') }),
            el('th', { text: label('pelanggan') }),
            el('th', { className: 'is-end', text: label('kolomItem') }),
            el('th', { className: 'is-end', text: label('kolomTotal') }),
            el('th', { text: label('kolomDibuatOleh') }),
          ),
        ),
        body,
      ),
    );
  };

  const renderDetail = (): void => {
    const bill = selected();
    if (bill === undefined) {
      detail.replaceChildren();
      return;
    }
    const canDelete = isAllowed(session.store.getState().role, 'POS-05', 'Hapus Bill');
    const lines = el(
      'ul',
      {
        className: 'pos-bills__lines',
        attrs: { tabindex: '0', 'aria-label': label('daftarBarang') },
      },
      ...bill.lines.map((line) =>
        el(
          'li',
          {},
          el('span', { text: session.product(line.productId)?.name ?? line.productId }),
          el('span', {
            className: 't-label',
            text: `${formatDecimal(line.quantity)} ${line.unit}`,
          }),
        ),
      ),
    );
    const actions = el(
      'div',
      { className: 'pos-bills__actions' },
      createButton({
        text: label('cetakStrukDraf'),
        variant: 'secondary',
        icon: 'printer',
        onClick: print,
      }),
      createButton({ text: label('panggilBill'), onClick: call }),
    );
    if (canDelete) {
      const removeButton = createButton({
        text: label('hapusBill'),
        variant: 'danger',
        icon: 'trash-2',
        onClick: remove,
      });
      removeButton.classList.add('pos-bills__delete');
      actions.append(removeButton);
    }
    detail.replaceChildren(
      el('h2', { className: 't-section-title', text: `${label('isiBill')} ${bill.number}` }),
      lines,
      actions,
    );
  };

  const render = (): void => {
    renderList();
    renderDetail();
  };

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const exact = session
      .state()
      .heldBills.find((bill) => bill.number.toLowerCase() === search.value.trim().toLowerCase());
    if (exact !== undefined) {
      selectedId = exact.id;
      query = '';
      search.value = '';
      render();
    }
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
      return;
    }
    if (!isPc() || event.target instanceof HTMLInputElement) {
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      print();
    } else if (event.key === 'Delete') {
      remove();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = session.subscribe(render);

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-bills' },
      el(
        'section',
        { className: 'pos-bills__main' },
        el(
          'div',
          { className: 'pos-bills__bar' },
          search,
          createButton({
            text: label('kembaliKeJual'),
            variant: 'secondary',
            onClick: () => {
              go('/pos/jual');
            },
          }),
        ),
        listBox,
      ),
      detail,
    ),
  );
  render();
  search.focus();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
