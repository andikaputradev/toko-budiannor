import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatTime } from '../../../shared/format';
import type { HeldBill } from '../../../shared/data/types';
import { label, message } from '../../../shared/messages';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMenuButton, type MenuItem } from '../../../shared/ui/menu';
import { openModal } from '../../../shared/ui/modal';
import { createStepper, type Stepper } from '../../../shared/ui/stepper';
import { showToast } from '../../../shared/ui/toast';
import type { SplitPick } from '../domain/bill';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { billReceipt, openReceiptPreview } from './receipt-preview';

const VISIBLE_LINES = 2;

export function renderBills(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulBill');
  let query = '';

  const search = el('input', {
    className: 'input pos-bills__search',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      placeholder: label('cariBill'),
      'aria-label': label('cariBill'),
    },
  });
  const grid = el('ul', {
    className: 'pos-bills__grid',
    attrs: { 'aria-label': label('daftarBill') },
  });
  const empty = el('div', { className: 'pos-bills__empty' });

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
  const productName = (productId: string): string => session.product(productId)?.name ?? productId;

  const recall = (bill: HeldBill): void => {
    const result = session.recallBill(bill.id);
    if (result.ok) {
      go('/pos/jual');
    } else {
      showToast({ kind: 'error', text: failureText(result) });
    }
  };

  const remove = (bill: HeldBill): void => {
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

  const print = (bill: HeldBill): void => {
    openReceiptPreview({
      session,
      kind: 'draft',
      reference: bill.number,
      build: (width) => billReceipt(session, bill, width),
    });
  };

  // Split Bill: stepper per baris (0 sampai jumlah baris), lalu Pindahkan ke bill baru.
  const split = (bill: HeldBill): void => {
    const error = el('p', { className: 'pos-cash__error', attrs: { role: 'alert' } });
    const steppers: { readonly index: number; readonly stepper: Stepper }[] = [];
    const rows = bill.lines.map((line, index) => {
      const stepper = createStepper({
        labelText: productName(line.productId),
        value: 0,
        min: 0,
        max: line.quantity,
        step: 1,
        onChange: () => {
          error.textContent = '';
        },
      });
      steppers.push({ index, stepper });
      return el(
        'li',
        { className: 'pos-split-bill__row' },
        el(
          'span',
          { className: 'pos-split-bill__name' },
          el('strong', { text: productName(line.productId) }),
          el('span', {
            className: 't-label',
            text: `${formatDecimal(line.quantity)} ${line.unit}`,
          }),
        ),
        stepper.element,
      );
    });
    const handle = openModal({
      title: label('splitJudul', { nomor: bill.number }),
      body: el(
        'div',
        { className: 'pos-split-bill' },
        el('p', { className: 't-label', text: label('splitPetunjuk') }),
        el('ul', { className: 'pos-split-bill__lines' }, ...rows),
        error,
      ),
      actions: [],
    });
    handle.dialog.append(
      el(
        'div',
        { className: 'pos-cash__actions' },
        createButton({
          text: label('batal'),
          variant: 'secondary',
          onClick: () => {
            handle.close();
          },
        }),
        createButton({
          text: label('pindahkan'),
          onClick: () => {
            const picks: SplitPick[] = steppers
              .map(({ index, stepper }) => ({ index, quantity: stepper.value() }))
              .filter((pick) => pick.quantity > 0);
            const known = new Set(session.state().heldBills.map((item) => item.id));
            const result = session.splitHeldBill(bill.id, picks);
            if (!result.ok) {
              error.textContent = failureText(result);
              return;
            }
            const created = session.state().heldBills.find((item) => !known.has(item.id));
            handle.close();
            showToast({
              kind: 'success',
              text: label('billSplitDibuat', { baru: created?.number ?? '', asal: bill.number }),
            });
          },
        }),
      ),
    );
  };

  // Merge Bill: pilih satu bill lain yang digabung ke bill ini; bill sumber dihapus.
  const merge = (target: HeldBill): void => {
    const others = session.state().heldBills.filter((item) => item.id !== target.id);
    const group = nextId('gabung');
    let chosen: string | undefined;
    const error = el('p', { className: 'pos-cash__error', attrs: { role: 'alert' } });
    const options = others.map((bill) => {
      const radio = el('input', {
        attrs: { type: 'radio', name: group, value: bill.id },
      });
      radio.addEventListener('change', () => {
        chosen = bill.id;
        error.textContent = '';
      });
      return el(
        'label',
        { className: 'pos-merge-bill__option' },
        radio,
        el(
          'span',
          { className: 'pos-merge-bill__text' },
          el('strong', { text: bill.number }),
          el('span', { className: 't-label', text: session.customerName(bill.customerId) }),
        ),
      );
    });
    const handle = openModal({
      title: label('mergeJudul', { nomor: target.number }),
      body: el(
        'div',
        { className: 'pos-merge-bill' },
        el('p', {
          className: 't-label',
          text: label(others.length === 0 ? 'tidakAdaBillLain' : 'pilihBillGabung'),
        }),
        el(
          'div',
          {
            className: 'pos-merge-bill__options',
            attrs: { role: 'radiogroup', 'aria-label': label('pilihBillGabung') },
          },
          ...options,
        ),
        error,
      ),
      actions: [],
    });
    handle.dialog.append(
      el(
        'div',
        { className: 'pos-cash__actions' },
        createButton({
          text: label('batal'),
          variant: 'secondary',
          onClick: () => {
            handle.close();
          },
        }),
        createButton({
          text: label('gabungkan'),
          onClick: () => {
            if (chosen === undefined) {
              error.textContent = label('mergePilih');
              return;
            }
            const source = others.find((item) => item.id === chosen);
            const result = session.mergeHeldBills(target.id, chosen);
            if (!result.ok) {
              error.textContent = failureText(result);
              return;
            }
            handle.close();
            showToast({
              kind: 'success',
              text: label('billDigabung', { sumber: source?.number ?? '', tujuan: target.number }),
            });
          },
        }),
      ),
    );
  };

  const card = (bill: HeldBill): HTMLElement => {
    const role = session.store.getState().role;
    const items: MenuItem[] = [
      {
        text: label('ubah'),
        icon: 'pencil',
        onSelect: () => {
          recall(bill);
        },
      },
      {
        text: label('splitBill'),
        icon: 'arrow-left-right',
        onSelect: () => {
          split(bill);
        },
      },
      {
        text: label('mergeBill'),
        icon: 'plus',
        onSelect: () => {
          merge(bill);
        },
      },
    ];
    if (isAllowed(role, 'POS-05', 'Hapus Bill')) {
      items.push({
        text: label('batalkan'),
        icon: 'trash-2',
        onSelect: () => {
          remove(bill);
        },
      });
    }
    const created = new Date(bill.createdAt);
    const shown = bill.lines.slice(0, VISIBLE_LINES);
    const more = bill.lines.length - shown.length;
    return el(
      'li',
      { className: 'pos-bill-card' },
      el(
        'div',
        { className: 'pos-bill-card__head' },
        el(
          'div',
          {},
          el('p', { className: 'pos-bill-card__number t-section-title', text: bill.number }),
          el('p', {
            className: 'pos-bill-card__customer',
            text: session.customerName(bill.customerId),
          }),
        ),
        createMenuButton({ labelText: label('opsiBill', { nomor: bill.number }), items }),
      ),
      el(
        'p',
        { className: 'pos-bill-card__meta t-label' },
        el('span', { text: label('dibuatOlehNama', { nama: session.userName(bill.userId) }) }),
        el('span', {
          className: 'pos-bill-card__time',
          text: `${formatDate(created)} ${formatTime(created)}`,
        }),
      ),
      el(
        'ul',
        { className: 'pos-bill-card__lines' },
        ...shown.map((line) =>
          el(
            'li',
            {},
            el('span', { text: productName(line.productId) }),
            el('span', {
              className: 't-label',
              text: `${formatDecimal(line.quantity)} ${line.unit}`,
            }),
          ),
        ),
      ),
      more > 0
        ? el('p', {
            className: 'pos-bill-card__more t-label',
            text: label('barangLainnya', { n: more }),
          })
        : false,
      createButton({
        text: label('cetakStrukDraf'),
        variant: 'secondary',
        icon: 'printer',
        onClick: () => {
          print(bill);
        },
      }),
    );
  };

  const render = (): void => {
    const bills = visible();
    grid.replaceChildren(...bills.map(card));
    grid.hidden = bills.length === 0;
    empty.replaceChildren(
      ...(bills.length === 0
        ? [createEmptyState({ icon: 'inbox', title: label('billKosong') })]
        : []),
    );
  };

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
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
      grid,
      empty,
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
