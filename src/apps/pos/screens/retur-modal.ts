import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import type { RefundMethod, Sale } from '../../../shared/data/types';
import { label, type LabelKey } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createStepper, type Stepper } from '../../../shared/ui/stepper';
import { lineSubtotal } from '../domain/bill';
import { channelsOf } from '../domain/channels';
import {
  defaultRefundMethod,
  itemsValue,
  REASON_LABELS,
  refundableCash,
  REFUND_METHODS,
  RETUR_REASONS,
  type ReturReason,
} from '../domain/retur';
import { failureText } from '../failure';
import type { PosSession, ReturnRecord } from '../pos-session';
import { ROLE_LABELS } from '../roles';
import { createProductThumb } from '../thumb';
import { openReceiptPreview, returnReceipt } from './receipt-preview';
import { openShareReceipt } from './share-receipt';

const METHOD_LABELS: Readonly<Record<RefundMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
};

function plain(value: number): string {
  return formatRupiah(value).replace('Rp ', '');
}

function digitsOf(raw: string): number {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits === '' ? 0 : Number(digits);
}

export function openReturnDone(
  session: PosSession,
  record: ReturnRecord,
  onClose?: () => void,
): void {
  const sale = session.state().sales.find((item) => item.number === record.saleNumber);
  const customer = session.store
    .getState()
    .data.customers.find((item) => item.id === sale?.customerId);
  const amount = record.refund?.amount ?? record.value;
  const handle = openModal({
    title: label('returBerhasil'),
    body: el(
      'div',
      { className: 'pos-done' },
      el(
        'span',
        { className: 'pos-done__mark', attrs: { 'aria-hidden': 'true' } },
        icon('circle-check'),
      ),
      el('output', {
        className: 't-total pos-done__total',
        text: label('dikembalikanNominal', { jumlah: formatRupiah(amount) }),
      }),
      el(
        'p',
        { className: 'pos-done__who' },
        el('strong', { text: record.number }),
        el('span', { text: session.customerName(sale?.customerId) }),
      ),
      el(
        'div',
        { className: 'pos-done__actions' },
        createButton({
          text: label('cetakBuktiRetur'),
          variant: 'secondary',
          icon: 'printer',
          onClick: () => {
            openReceiptPreview({
              session,
              kind: 'retur',
              reference: record.number,
              build: (width) => returnReceipt(session, record, width),
            });
          },
        }),
        createButton({
          text: label('kirimBuktiRetur'),
          variant: 'secondary',
          icon: 'message-circle',
          onClick: () => {
            openShareReceipt({
              title: label('kirimBuktiRetur'),
              reference: record.number,
              amountText: formatRupiah(amount),
              customerName: session.customerName(sale?.customerId),
              phone: customer?.phone ?? '',
              sentLabel: 'buktiReturTerkirimWa',
              sentEmailLabel: 'buktiReturTerkirimEmail',
            });
          },
        }),
      ),
    ),
    actions: [],
    ...(onClose === undefined ? {} : { onClose }),
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('selesai'),
        onClick: () => {
          handle.close();
        },
      }),
    ),
  );
}

export function openReturnModal(
  session: PosSession,
  sale: Sale,
  onDone: () => void,
  onDoneClosed?: () => void,
): void {
  let amountTouched = false;
  // Penjualan DP atau piutang belum dibayar penuh: pengembalian dibatasi uang yang sudah dibayar.
  const cap = (): number => refundableCash(sale, session.state().returns);
  let method: RefundMethod = defaultRefundMethod(sale);
  let channel: string | undefined;
  const groupName = nextId('alasan');
  const amountId = nextId('nominal-retur');
  const noteId = nextId('keterangan-retur');

  const checks: HTMLInputElement[] = [];
  const steppers: Stepper[] = [];
  const rooms = sale.lines.map((line, index) =>
    round3(line.quantity - session.returnedQuantity(sale.number, index)),
  );

  const selectAll = el('input', {
    attrs: { type: 'checkbox', id: nextId('pilih-semua'), 'aria-label': label('pilihSemua') },
  });
  const itemList = el('ul', { className: 'pos-return__items' });
  sale.lines.forEach((line, index) => {
    const room = rooms[index] ?? 0;
    const product = session.product(line.productId);
    const name = product?.name ?? line.productId;
    const cashier = session.store.getState().data.users.find((user) => user.id === sale.cashierId);
    const enteredBy =
      cashier === undefined
        ? label('diinputOleh', { nama: session.userName(sale.cashierId) })
        : label('diinputOlehPeran', {
            nama: cashier.name,
            peran: label(ROLE_LABELS[cashier.role]),
          });
    const box = el('input', {
      attrs: { type: 'checkbox', 'aria-label': name, disabled: room <= 0 && '' },
    });
    checks.push(box);
    const stepper = createStepper({
      labelText: `${label('kolomJumlahRetur')} ${name}`,
      value: room,
      min: 0,
      max: Math.max(room, 0),
      step: 1,
      onChange: () => {
        box.checked = stepper.value() > 0 ? true : box.checked;
        paint();
      },
    });
    steppers.push(stepper);
    box.addEventListener('change', () => {
      paint();
    });
    itemList.append(
      el(
        'li',
        { className: 'pos-return__item' },
        box,
        product === undefined
          ? el('span', { className: 'pos-photo pos-photo--sm' })
          : createProductThumb(product, 'sm'),
        el(
          'span',
          { className: 'pos-return__name' },
          el('strong', { text: name }),
          el('span', {
            className: 't-label',
            text: label('totalBarisRetur', { jumlah: formatRupiah(lineSubtotal(line)) }),
          }),
          el('span', {
            className: 't-label',
            text: label('dibeliSisa', {
              dibeli: formatDecimal(line.quantity),
              satuan: line.unit,
              sisa: formatDecimal(Math.max(room, 0)),
            }),
          }),
          el('span', { className: 't-label', text: enteredBy }),
        ),
        stepper.element,
      ),
    );
  });

  const selection = (): { index: number; quantity: number }[] =>
    checks.flatMap((box, index) =>
      box.checked ? [{ index, quantity: steppers[index]?.value() ?? 0 }] : [],
    );

  const amountInput = el('input', {
    className: 'input pos-return__amount',
    attrs: { id: amountId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const nothingPaid = el('p', {
    className: 't-label pos-return__hint',
    text: label('belumAdaUangDibayar'),
  });
  const methodButtons = new Map<RefundMethod, HTMLButtonElement>();
  const methodGroup = el('div', {
    className: 'pos-return__methods',
    attrs: { role: 'radiogroup', 'aria-label': label('metodePengembalian') },
  });
  for (const value of REFUND_METHODS) {
    const button = createButton({
      text: label(METHOD_LABELS[value]),
      variant: 'secondary',
      onClick: () => {
        method = value;
        channel = undefined;
        paint();
      },
    });
    button.setAttribute('role', 'radio');
    methodButtons.set(value, button);
    methodGroup.append(button);
  }
  const channelGroup = el('div', {
    className: 'pos-return__channels',
    attrs: { role: 'radiogroup', 'aria-label': label('pilihKanal') },
  });
  const renderChannels = (): void => {
    const options = channelsOf(method);
    const hadFocus = channelGroup.contains(document.activeElement);
    channelGroup.hidden = options.length === 0;
    const chips = [undefined, ...options].map((value) => {
      const chip = createButton({
        text: value ?? label('kanalUmum'),
        variant: 'secondary',
        onClick: () => {
          channel = value;
          paint();
        },
      });
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', value === channel ? 'true' : 'false');
      return chip;
    });
    channelGroup.replaceChildren(...chips);
    if (hadFocus) {
      chips.find((chip) => chip.getAttribute('aria-checked') === 'true')?.focus();
    }
  };

  const reasonBoxes = new Map<ReturReason, HTMLInputElement>();
  const reasonGroup = el('div', {
    className: 'pos-return__reasons',
    attrs: { role: 'radiogroup', 'aria-label': label('alasanRetur') },
  });
  for (const value of RETUR_REASONS) {
    const id = nextId('alasan-pilihan');
    const radio = el('input', {
      attrs: { type: 'radio', name: groupName, id, value, checked: value === 'barang' && '' },
    });
    radio.addEventListener('change', () => {
      paint();
    });
    reasonBoxes.set(value, radio);
    reasonGroup.append(
      el(
        'label',
        { className: 'pos-return__reason-option', attrs: { for: id } },
        radio,
        el('span', { text: label(REASON_LABELS[value]) }),
      ),
    );
  }
  const note = el('textarea', {
    className: 'input pos-return__reason',
    attrs: { id: noteId, rows: '2', 'aria-label': label('keterangan') },
  });
  const noteField = el('div', { className: 'pos-return__note' }, note);
  const photo = el('input', {
    className: 'pos-return__photo',
    attrs: { type: 'file', accept: 'image/*', 'aria-label': label('fotoBuktiRetur') },
  });
  photo.hidden = true;
  const photoName = el('span', { className: 't-label pos-return__photoname' });
  const photoTile = el(
    'button',
    {
      className: 'pos-return__phototile',
      attrs: { type: 'button', 'aria-label': label('tambahFotoBukti') },
    },
    icon('image-plus'),
  );
  photoTile.addEventListener('click', () => {
    photo.click();
  });
  photo.addEventListener('change', () => {
    photoName.textContent = photo.files?.[0]?.name ?? '';
  });
  const error = el('p', { className: 'pos-return__error', attrs: { role: 'alert' } });
  const totalOutput = el('output', { className: 't-total pos-return__total' });
  const quantityText = el('p', { className: 't-label pos-return__quantity' });

  const chosenReason = (): ReturReason =>
    [...reasonBoxes].find(([, box]) => box.checked)?.[0] ?? 'barang';

  function paint(): void {
    const items = selection();
    const value = itemsValue(sale, items);
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    totalOutput.textContent = formatRupiah(value);
    quantityText.textContent = label('dariKuantitas', { jumlah: formatDecimal(quantity) });
    const limit = Math.min(value, cap());
    if (!amountTouched) {
      amountInput.value = limit === 0 ? '' : plain(limit);
    }
    nothingPaid.hidden = cap() > 0;
    for (const [key, button] of methodButtons) {
      button.setAttribute('aria-checked', key === method ? 'true' : 'false');
    }
    renderChannels();
    noteField.hidden = chosenReason() !== 'lainnya';
    const enabled = checks.filter((box) => !box.disabled);
    selectAll.checked = enabled.length > 0 && enabled.every((box) => box.checked);
  }

  selectAll.addEventListener('change', () => {
    for (const box of checks) {
      if (!box.disabled) {
        box.checked = selectAll.checked;
      }
    }
    paint();
  });
  amountInput.addEventListener('input', () => {
    amountTouched = true;
    const value = digitsOf(amountInput.value);
    amountInput.value = value === 0 ? '' : plain(value);
  });

  const handle = openModal({
    title: `${label('returPenjualan')} ${sale.number}`,
    body: el(
      'div',
      { className: 'pos-return' },
      el('h3', { className: 't-section-title pos-return__title', text: label('returBarangJasa') }),
      el('p', { className: 't-label pos-return__info', text: label('infoReturBarang') }),
      el(
        'label',
        { className: 'pos-return__all' },
        selectAll,
        el('span', { text: label('pilihSemua') }),
      ),
      el('h4', {
        className: 'pos-return__band',
        text: label('pesananJumlah', { jumlah: sale.lines.length }),
      }),
      itemList,
      el('h3', { className: 't-section-title', text: label('pembayaranDikembalikan') }),
      el('label', {
        className: 'field__label',
        text: label('jumlahDikembalikan'),
        attrs: { for: amountId },
      }),
      amountInput,
      nothingPaid,
      el('h3', { className: 't-section-title', text: label('metodePengembalian') }),
      methodGroup,
      channelGroup,
      el('h3', { className: 't-section-title', text: label('alasanRetur') }),
      reasonGroup,
      noteField,
      el('h3', { className: 't-section-title', text: label('fotoBuktiRetur') }),
      el('div', { className: 'pos-return__photobox' }, photoTile, photoName, photo),
      error,
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-return__foot' },
      el(
        'div',
        { className: 'pos-return__summary' },
        el('span', { className: 't-label', text: label('totalRetur') }),
        totalOutput,
        quantityText,
      ),
      el(
        'div',
        { className: 'pos-return__actions' },
        createButton({
          text: label('batal'),
          variant: 'secondary',
          onClick: () => {
            handle.close();
          },
        }),
        createButton({
          text: label('retur'),
          onClick: () => {
            const result = session.returnItems(sale.number, {
              items: selection(),
              reason: chosenReason(),
              note: note.value,
              refund:
                cap() > 0
                  ? {
                      method,
                      amount: digitsOf(amountInput.value),
                      ...(channel === undefined ? {} : { channel }),
                    }
                  : undefined,
              photoName: photo.files?.[0]?.name,
            });
            if (!result.ok) {
              error.textContent = failureText(result);
              return;
            }
            const record = session.state().returns.find((item) => item.number === result.number);
            handle.close();
            onDone();
            if (record !== undefined) {
              openReturnDone(session, record, onDoneClosed);
            }
          },
        }),
      ),
    ),
  );
  paint();
  checks.find((box) => !box.disabled)?.focus();
}
