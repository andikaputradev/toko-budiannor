import type { LineDiscount } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { createAmountEntry } from '../amount-entry';
import { maxTransactionDiscount, transactionDiscountAmount } from '../domain/bill';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';

export interface BillDiscountOptions {
  readonly session: PosSession;
  // true bila Supervisor atau Owner sudah menyetujui lewat PIN (peran Kasir).
  readonly authorized: boolean;
  readonly onDone?: (() => void) | undefined;
}

// Modal Diskon Transaksi: potongan persen atau nominal atas total pesanan (setelah diskon baris).
export function openBillDiscount(options: BillDiscountOptions): void {
  const { session } = options;
  const subtotal = session.subtotal();
  const existing = session.state().billDiscount;
  let kind: LineDiscount['kind'] = existing?.kind ?? 'persen';

  const maxOf = (): number => maxTransactionDiscount(kind, subtotal);
  const error = el('p', { className: 'pos-line__error', attrs: { role: 'alert' } });
  const discountValue = el('output', { className: 'pos-bdisc__value' });
  const totalValue = el('output', { className: 'pos-bdisc__value pos-bdisc__value--total' });
  const entry = createAmountEntry({
    labelText: label('diskonTransaksiNilai'),
    value: existing?.value ?? 0,
    max: maxOf(),
    onChange: () => {
      error.textContent = '';
      paint();
    },
    format: (value) => (kind === 'persen' ? `${String(value)}%` : formatRupiah(value)),
  });
  const draft = (): LineDiscount | undefined =>
    entry.value() > 0 ? { kind, value: entry.value() } : undefined;

  const kindButtons = new Map<LineDiscount['kind'], HTMLButtonElement>();
  const kindGroup = el('div', {
    className: 'pos-line__kinds',
    attrs: { role: 'radiogroup', 'aria-label': label('menuDiskonTransaksi') },
  });
  for (const [value, text] of [
    ['persen', label('diskonPersen')],
    ['nominal', label('diskonNominal')],
  ] as const) {
    const button = el('button', {
      className: 'pos-unit__unit',
      text,
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
    });
    button.addEventListener('click', () => {
      if (kind !== value) {
        kind = value;
        entry.setMax(maxOf());
        entry.setValue(0);
      }
      error.textContent = '';
      paint();
    });
    kindButtons.set(value, button);
    kindGroup.append(button);
  }

  function paint(): void {
    for (const [value, button] of kindButtons) {
      button.setAttribute('aria-checked', value === kind ? 'true' : 'false');
    }
    const amount = transactionDiscountAmount(subtotal, draft());
    discountValue.textContent = `-${formatRupiah(amount)}`;
    totalValue.textContent = formatRupiah(subtotal - amount);
  }

  const apply = (): void => {
    const result = session.setBillDiscount(draft(), options.authorized);
    if (!result.ok) {
      error.textContent = failureText(result);
      return;
    }
    handle.close();
    showToast({ kind: 'success', text: label('diskonTransaksiDiterapkan') });
    options.onDone?.();
  };

  const row = (text: string, output: HTMLElement, className = ''): HTMLElement =>
    el('p', { className: `pos-bdisc__row ${className}`.trim() }, el('span', { text }), output);

  const handle = openModal({
    title: label('diskonTransaksiJudul'),
    body: el(
      'div',
      { className: 'pos-bdisc' },
      el(
        'div',
        { className: 'pos-bdisc__info' },
        kindGroup,
        row(
          label('kolomSubtotal'),
          el('output', { className: 'pos-bdisc__value', text: formatRupiah(subtotal) }),
        ),
        row(label('diskon'), discountValue),
        row(label('kolomTotal'), totalValue, 'pos-bdisc__row--total'),
        error,
      ),
      entry.element,
    ),
    actions: [],
  });
  entry.listenOn(handle.dialog);
  handle.dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      apply();
    }
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-line__foot' },
      existing === undefined
        ? false
        : createButton({
            text: label('hapusDiskon'),
            variant: 'secondary',
            onClick: () => {
              entry.setValue(0);
              apply();
            },
          }),
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({ text: label('terapkan'), onClick: apply }),
    ),
  );
  paint();
}
