import { el } from '../../../shared/dom';
import { formatDocumentNumber } from '../../../shared/format';
import type { HeldBill, PaymentMethod, Sale } from '../../../shared/data/types';
import { label, type LabelKey } from '../../../shared/messages';
import { failureText } from '../failure';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { discountAmount, lineGross } from '../domain/bill';
import {
  buildReceipt,
  changeOf,
  type PaperWidth,
  type ReceiptInput,
  type ReceiptItem,
  type ReceiptKind,
  type ReceiptPayment,
} from '../domain/receipt';
import { itemsValue } from '../domain/retur';
import type { PosSession, ReturnRecord } from '../pos-session';

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
  retur: 'buktiReturTercetak',
};

function itemsOf(session: PosSession, lines: Sale['lines']): ReceiptItem[] {
  return lines.map((line) => {
    const discount = discountAmount(line);
    return {
      name: session.product(line.productId)?.name ?? line.productId,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      subtotal: lineGross(line),
      ...(discount > 0 ? { discount } : {}),
      ...(line.listPrice === undefined ? {} : { listPrice: line.listPrice }),
    };
  });
}

function methodText(method: PaymentMethod, channel: string | undefined): string {
  const base = label(METHOD_LABELS[method]);
  return channel === undefined ? base : `${base} ${channel}`;
}

function paymentsOf(sale: Sale): ReceiptPayment[] {
  if (sale.payments === undefined) {
    const owed = sale.total - sale.paid;
    return [
      ...(sale.paid > 0 ? [{ method: label(METHOD_LABELS[sale.payment]), amount: sale.paid }] : []),
      ...(owed > 0 ? [{ method: label('metodePiutang'), amount: owed }] : []),
    ];
  }
  return sale.payments
    .filter((row) => row.amount > 0)
    .map((row) => ({
      method:
        row.method === 'dp'
          ? `${label('metodeDp')} (${label(METHOD_LABELS[row.via ?? 'tunai'])})`
          : methodText(row.method, row.channel),
      amount: row.amount,
    }));
}

export function saleReceipt(
  session: PosSession,
  sale: Sale,
  kind: ReceiptKind,
  width: PaperWidth,
): ReceiptInput {
  return {
    kind,
    width,
    number: sale.number,
    at: new Date(sale.createdAt),
    cashier: session.userName(sale.cashierId),
    customer: session.customerName(sale.customerId),
    items: itemsOf(session, sale.lines),
    total: sale.total,
    payments: paymentsOf(sale),
    change: changeOf(sale),
  };
}

export function returnReceipt(
  session: PosSession,
  record: ReturnRecord,
  width: PaperWidth,
): ReceiptInput {
  const sale = session.state().sales.find((item) => item.number === record.saleNumber);
  const items = record.lines.flatMap((entry): ReceiptItem[] => {
    const line = sale?.lines[entry.index];
    return line === undefined
      ? []
      : [
          {
            name: session.product(line.productId)?.name ?? line.productId,
            quantity: entry.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            subtotal: sale === undefined ? 0 : itemsValue(sale, [entry]),
          },
        ];
  });
  const refund = record.refund;
  return {
    kind: 'retur',
    width,
    number: record.number,
    at: new Date(record.at),
    cashier: session.userName(session.store.getState().userId),
    customer: session.customerName(sale?.customerId),
    items,
    total: refund?.amount ?? record.value,
    payments:
      refund === undefined
        ? []
        : [{ method: methodText(refund.method, refund.channel), amount: refund.amount }],
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

// Pratinjau struk draf untuk pesanan yang sedang berjalan (menu Cetak Struk Draf dan Cetak Kode QR).
export function openDraftPreview(session: PosSession): void {
  const state = session.state();
  const draft: HeldBill = {
    id: 'draft',
    number: formatDocumentNumber('B', state.heldBills.length + 1),
    createdAt: session.now().toISOString(),
    userId: session.store.getState().userId,
    customerId: state.customerId,
    lines: state.lines,
  };
  openReceiptPreview({
    session,
    kind: 'draft',
    reference: draft.number,
    build: (width) => billReceipt(session, draft, width),
  });
}
