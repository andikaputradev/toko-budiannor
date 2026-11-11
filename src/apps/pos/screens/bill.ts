import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import type { HeldBill } from '../../../shared/data/types';
import { label, message } from '../../../shared/messages';
import { isAllowed } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMenuButton, type MenuItem } from '../../../shared/ui/menu';
import { openModal } from '../../../shared/ui/modal';
import { createStepper, type Stepper } from '../../../shared/ui/stepper';
import { showToast } from '../../../shared/ui/toast';
import { billTotal, lineSubtotal, netTotal, transactionDiscountAmount } from '../domain/bill';
import type { SplitPick } from '../domain/bill';
import { clipName } from '../domain/catalog-view';
import { needsShift } from '../domain/shift';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';
import { createProductThumb } from '../thumb';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import { billReceipt, openReceiptPreview } from './receipt-preview';

// Daftar Open Bill hanya memperlihatkan satu barang; sisanya lewat "+N Barang Lainnya".
const VISIBLE_LINES = 1;

export function renderBills(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulBill');
  let query = '';
  // Bill yang barang lainnya sedang dibuka (bertahan antar penggambaran ulang).
  const expanded = new Set<string>();

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
              text: label(
                source?.discount === undefined ? 'billDigabung' : 'billDigabungTanpaDiskon',
                {
                  sumber: source?.number ?? '',
                  tujuan: target.number,
                },
              ),
            });
          },
        }),
      ),
    );
  };

  // Bayar langsung dari daftar: bill dipanggil ke keranjang lalu layar bayar dibuka.
  const pay = (bill: HeldBill): void => {
    if (needsShift(session.store.getState().role, session.state().shift)) {
      showToast({ kind: 'error', text: label('butuhShift') });
      return;
    }
    const result = session.recallBill(bill.id);
    if (result.ok) {
      go('/pos/bayar');
    } else {
      showToast({ kind: 'error', text: failureText(result) });
    }
  };

  const infoItem = (iconName: IconName, name: string, value: string): HTMLElement =>
    el(
      'div',
      { className: 'pos-bill-card__info' },
      el(
        'span',
        { className: 'pos-bill-card__icon', attrs: { 'aria-hidden': 'true' } },
        icon(iconName),
      ),
      el(
        'span',
        { className: 'pos-bill-card__infotext' },
        el('span', { className: 't-label', text: name }),
        el('strong', { text: value }),
      ),
    );

  const lineItem = (line: HeldBill['lines'][number]): HTMLElement => {
    const product = session.product(line.productId);
    const name = productName(line.productId);
    return el(
      'li',
      { className: 'pos-bill-card__line' },
      product === undefined
        ? el('span', { className: 'pos-photo pos-photo--sm' })
        : createProductThumb(product, 'sm'),
      el(
        'span',
        { className: 'pos-bill-card__linebody' },
        el('strong', { text: clipName(name), attrs: { title: name } }),
        el('span', {
          className: 't-label',
          text: `${formatDecimal(line.quantity)} ${line.unit}${product === undefined ? '' : `, ${product.code}`}`,
        }),
      ),
      el('output', { className: 'pos-bill-card__amount', text: formatRupiah(lineSubtotal(line)) }),
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
    const open = expanded.has(bill.id);
    const shown = open ? bill.lines : bill.lines.slice(0, VISIBLE_LINES);
    const more = bill.lines.length - Math.min(bill.lines.length, VISIBLE_LINES);
    const subtotal = billTotal(bill.lines);
    const discount = transactionDiscountAmount(subtotal, bill.discount);
    const total = netTotal(bill.lines, bill.discount);
    const moreButton =
      more > 0
        ? el(
            'button',
            {
              className: 'pos-bill-card__more',
              attrs: { type: 'button', 'aria-expanded': open ? 'true' : 'false' },
            },
            el('span', { text: open ? label('tutup') : label('barangLainnya', { n: more }) }),
            icon(open ? 'chevron-up' : 'chevron-down'),
          )
        : false;
    if (moreButton !== false) {
      moreButton.addEventListener('click', () => {
        if (open) {
          expanded.delete(bill.id);
        } else {
          expanded.add(bill.id);
        }
        render();
        grid.querySelector<HTMLElement>(`[data-bill="${bill.id}"] .pos-bill-card__more`)?.focus();
      });
    }
    const side = el(
      'div',
      { className: 'pos-bill-card__side' },
      el(
        'p',
        { className: 'pos-bill-card__sum' },
        el('span', { text: label('kolomSubtotal') }),
        el('output', { text: formatRupiah(subtotal) }),
      ),
      discount > 0
        ? el(
            'p',
            { className: 'pos-bill-card__sum' },
            el('span', { text: label('diskonTransaksiBaris') }),
            el('output', { text: `-${formatRupiah(discount)}` }),
          )
        : false,
      el(
        'p',
        { className: 'pos-bill-card__sum pos-bill-card__sum--total' },
        el('span', { text: label('kolomTotal') }),
        el('output', { text: formatRupiah(total) }),
      ),
      el(
        'div',
        { className: 'pos-bill-card__actions' },
        el(
          'button',
          {
            className: 'pos-bill-card__print',
            attrs: { type: 'button', 'aria-label': label('cetakStrukDraf') },
          },
          icon('printer'),
        ),
        isAllowed(role, 'POS-02', 'Bayar')
          ? createButton({
              text: label('bayarJumlah', { jumlah: formatRupiah(total) }),
              pay: true,
              onClick: () => {
                pay(bill);
              },
            })
          : false,
      ),
    );
    side.querySelector('.pos-bill-card__print')?.addEventListener('click', () => {
      print(bill);
    });
    return el(
      'li',
      { className: 'pos-bill-card', attrs: { 'data-bill': bill.id } },
      el(
        'div',
        { className: 'pos-bill-card__head' },
        infoItem('receipt', label('nomorOpenBill'), bill.number),
        infoItem('users', label('namaPelanggan'), session.customerName(bill.customerId)),
        infoItem('user-round', label('dibuatOleh'), session.userName(bill.userId)),
        infoItem(
          'calendar',
          label('waktuOpenBill'),
          `${formatDate(created)} ${formatTime(created)}`,
        ),
        createMenuButton({ labelText: label('opsiBill', { nomor: bill.number }), items }),
      ),
      el(
        'div',
        { className: 'pos-bill-card__body' },
        el(
          'div',
          { className: 'pos-bill-card__items' },
          el('h2', {
            className: 'pos-bill-card__title t-section-title',
            text: label('pesananJumlah', { jumlah: bill.lines.length }),
          }),
          el('ul', { className: 'pos-bill-card__lines' }, ...shown.map(lineItem)),
          moreButton,
        ),
        side,
      ),
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
