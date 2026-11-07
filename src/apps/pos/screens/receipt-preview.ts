import { el } from '../../../shared/dom';
import type { HeldBill, PaymentMethod, Sale } from '../../../shared/data/types';
import { label, type LabelKey } from '../../../shared/messages';
import { failureText } from '../failure';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { lineSubtotal } from '../domain/bill';
import {
  buildReceipt,
  type PaperWidth,
  type ReceiptInput,
  type ReceiptItem,
  type ReceiptKind,
} from '../domain/receipt';
import type { PosSession } from '../pos-session';

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

const SUCCESS_LABELS: Readonly<Record<ReceiptKind, LabelKey>> = {
  draft: 'strukDrafTercetak',
  copy: 'salinanTercetak',
  sale: 'strukTercetak',
};

function itemsOf(session: PosSession, lines: Sale['lines']): ReceiptItem[] {
  return lines.map((line) => ({
    name: session.product(line.productId)?.name ?? line.productId,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    subtotal: lineSubtotal(line),
  }));
}

export function saleReceipt(
  session: PosSession,
  sale: Sale,
  kind: ReceiptKind,
  width: PaperWidth,
): ReceiptInput {
  const owed = sale.total - sale.paid;
  return {
    kind,
    width,
    number: sale.number,
    at: new Date(sale.createdAt),
    cashier: session.userName(sale.cashierId),
    customer: session.customerName(sale.customerId),
    items: itemsOf(session, sale.lines),
    total: sale.total,
    payments: [
      ...(sale.paid > 0 ? [{ method: label(METHOD_LABELS[sale.payment]), amount: sale.paid }] : []),
      ...(owed > 0 ? [{ method: label('metodePiutang'), amount: owed }] : []),
    ],
    change: 0,
  };
}

export function billReceipt(session: PosSession, bill: HeldBill, width: PaperWidth): ReceiptInput {
  return {
    kind: 'draft',
    width,
    number: bill.number,
    at: new Date(bill.createdAt),
    cashier: session.userName(bill.userId),
    customer: session.customerName(bill.customerId),
    items: itemsOf(session, bill.lines),
    total: 0,
    payments: [],
    change: 0,
  };
}

export interface PreviewOptions {
  readonly session: PosSession;
  readonly kind: ReceiptKind;
  readonly reference: string;
  readonly build: (width: PaperWidth) => ReceiptInput;
}

export function openReceiptPreview(options: PreviewOptions): void {
  const { session, kind } = options;
  let width: PaperWidth = session.store.getState().paperWidth;
  const sheet = el('pre', {
    className: 'pos-receipt',
    attrs: { tabindex: '0', 'aria-label': label('pratinjauStruk') },
  });
  const notice = el('div', { className: 'pos-receipt__notice', attrs: { role: 'alert' } });
  const chips = new Map<PaperWidth, HTMLButtonElement>();
  const group = el('div', {
    className: 'pos-receipt__widths',
    attrs: { role: 'group', 'aria-label': label('lebarKertas') },
  });
  const paint = (): void => {
    sheet.textContent = buildReceipt(options.build(width)).join('\n');
    sheet.dataset['width'] = String(width);
    for (const [value, chip] of chips) {
      chip.setAttribute('aria-pressed', value === width ? 'true' : 'false');
    }
  };
  for (const value of [58, 80] as const) {
    const chip = el('button', {
      className: 'chip',
      text: label(value === 58 ? 'lebar58' : 'lebar80'),
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    chip.addEventListener('click', () => {
      width = value;
      session.store.setPaperWidth(value);
      paint();
    });
    chips.set(value, chip);
    group.append(chip);
  }
  const handle = openModal({
    title: label('pratinjauStruk'),
    body: el(
      'div',
      { className: 'pos-receipt__body' },
      el('p', { className: 't-label', text: label('lebarKertas') }),
      group,
      sheet,
      notice,
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-receipt__actions' },
      createButton({
        text: label('tutup'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({
        text: label('cetak'),
        icon: 'printer',
        onClick: () => {
          const result = session.printReceipt(kind, options.reference);
          if (result.ok) {
            showToast({ kind: 'success', text: label(SUCCESS_LABELS[kind]) });
            handle.close();
            return;
          }
          notice.textContent = kind === 'draft' ? label('strukDrafGagal') : failureText(result);
        },
      }),
    ),
  );
  paint();
  group.querySelector<HTMLElement>('button')?.focus();
}
