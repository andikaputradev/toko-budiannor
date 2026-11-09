import '../../../styles/mobile-owner.css';
import { balanceOf, outstanding } from '../../../shared/data/receivable';
import type {
  Customer,
  PayableInvoice,
  ReceivableInvoice,
  Supplier,
} from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatDate, formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import { remainingOf, supplierBalance } from '../domain/payables';
import { telUrl, whatsappUrl } from '../domain/receivables';
import type { OwnerSession, PayMethod } from '../owner-session';
import { dueText } from '../screen';
import { openSheet } from '../sheet';

function methodField() {
  return createSelectField({
    labelText: label('caraBayar'),
    options: [
      { value: 'tunai', text: label('metodeTunai') },
      { value: 'transfer', text: label('metodeTransfer') },
      { value: 'qris', text: label('metodeQris') },
    ],
  });
}

function amountField(balance: number) {
  const amount = createTextField({
    labelText: label('jumlahBayar'),
    inputMode: 'numeric',
    value: formatDecimal(balance, 0),
  });
  const full = createButton({
    text: label('trxLunasi'),
    variant: 'secondary',
    onClick: () => {
      amount.input.value = formatDecimal(balance, 0);
    },
  });
  return { amount, full };
}

// Lembar bayar piutang: seluruh saldo pelanggan, atau satu invoice bila diberikan.
export function openReceivablePayment(
  session: OwnerSession,
  customer: Customer,
  invoice?: ReceivableInvoice,
): void {
  const balance = invoice === undefined ? outstanding(customer) : balanceOf(invoice);
  const { amount, full } = amountField(balance);
  const method = methodField();
  openSheet({
    title: label('catatBayarPiutang'),
    body: el(
      'div',
      { className: 'own-form' },
      el(
        'div',
        { className: 'trx-sheet-head' },
        el('strong', { text: customer.name }),
        el('span', {
          className: 'mob-muted',
          text: invoice === undefined ? customer.code : `${customer.code}, ${invoice.id}`,
        }),
        el('span', {
          className: 'trx-sheet-head__saldo',
          text: label('saldoPiutang', { saldo: formatRupiah(balance) }),
        }),
      ),
      amount.root,
      full,
      method.root,
    ),
    submitText: label('simpanPembayaran'),
    onSubmit: () => {
      const result = session.recordPayment(
        customer.id,
        amount.input.value,
        method.select.value as PayMethod,
        invoice?.id,
      );
      if (result.ok) {
        showToast({
          kind: 'success',
          text: label('pembayaranTercatat', { jumlah: formatRupiah(result.amount) }),
        });
        return undefined;
      }
      return failureText(result);
    },
  });
}

// Lembar bayar hutang: seluruh hutang supplier, atau satu faktur bila diberikan.
export function openPayablePayment(
  session: OwnerSession,
  supplier: Supplier,
  invoice?: PayableInvoice,
): void {
  const balance = invoice === undefined ? supplierBalance(supplier) : remainingOf(invoice);
  const { amount, full } = amountField(balance);
  const method = methodField();
  openSheet({
    title: label('trxBayarHutang'),
    body: el(
      'div',
      { className: 'own-form' },
      el(
        'div',
        { className: 'trx-sheet-head' },
        el('strong', { text: supplier.name }),
        ...(invoice === undefined
          ? []
          : [el('span', { className: 'mob-muted', text: invoice.id })]),
        el('span', {
          className: 'trx-sheet-head__saldo',
          text: label('htgSaldoHutang', { saldo: formatRupiah(balance) }),
        }),
      ),
      amount.root,
      full,
      method.root,
    ),
    submitText: label('simpanPembayaran'),
    onSubmit: () => {
      const result = session.payPayable(
        supplier.id,
        amount.input.value,
        method.select.value as PayMethod,
        invoice?.id,
      );
      if (result.ok) {
        showToast({
          kind: 'success',
          text: label('htgPembayaranTercatat', { jumlah: formatRupiah(result.amount) }),
        });
        return undefined;
      }
      return failureText(result);
    },
  });
}

// Pratinjau tagihan PDF (simulasi) untuk invoice terpilih, lalu kirim via WA.
export function openBillPreview(
  session: OwnerSession,
  customer: Customer,
  invoices: readonly ReceivableInvoice[],
): void {
  const total = invoices.reduce((sum, invoice) => sum + balanceOf(invoice), 0);
  const lines = [
    label('tagihanJudul'),
    label('tokoNama'),
    `${label('tagihanKepada')}: ${customer.name}`,
    `${label('tanggal')}: ${formatDate(session.now())}`,
    '',
    ...invoices.map(
      (invoice) =>
        `${invoice.id}  ${dueText(formatDate(new Date(`${invoice.dueAt}T12:00:00+07:00`)))}  ${formatRupiah(balanceOf(invoice))}`,
    ),
    '',
    `${label('piuTotalTagihan')}: ${formatRupiah(total)}`,
  ];
  openSheet({
    title: `${label('kirimTagihanWa')}: ${customer.name}`,
    body: el(
      'div',
      { className: 'own-form' },
      el('p', { className: 't-label', text: label('simulasiPdf') }),
      el('pre', {
        className: 'own-pdf',
        attrs: { tabindex: '0', 'aria-label': label('pratinjauTagihan') },
        text: lines.join('\n'),
      }),
    ),
    submitText: label('kirimViaWa'),
    onSubmit: () => {
      const result = session.sendBill(customer.id);
      if (result.ok) {
        showToast({
          kind: result.queued ? 'info' : 'success',
          text: label(result.queued ? 'tagihanAntre' : 'tagihanTerkirim', {
            telepon: customer.phone,
          }),
        });
        return undefined;
      }
      return failureText(result);
    },
  });
}

// Pilihan telepon dan WhatsApp untuk pelanggan atau supplier.
export function openContact(title: string, phone: string, greeting: string): void {
  const call = el('a', {
    className: 'btn btn--primary own-link',
    text: `${label('telepon')} ${phone}`,
    attrs: { href: telUrl(phone) },
  });
  const chat = el('a', {
    className: 'btn btn--secondary own-link',
    text: `${label('whatsapp')} ${phone}`,
    attrs: {
      href: whatsappUrl(phone, greeting),
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  });
  const handle = openModal({
    title,
    body: el('div', { className: 'own-form' }, call, chat),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
  handle.dialog.classList.add('trx-dialog');
}
