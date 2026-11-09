import { el, type Child } from '../../../shared/dom';
import type { InvoicePayment, Role } from '../../../shared/data/types';
import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createMobBadge, type MobTone } from '../../../shared/ui/mobile-card';
import type { DetailLine, DocKind, DocStatus } from '../domain/bills';
import type { InvoiceStatus } from '../domain/invoice-detail';
import { dueText } from '../screen';

export function sectionTitle(text: string, aside?: Child): HTMLElement {
  return el(
    'div',
    { className: 'trx-section' },
    el('h2', { className: 'trx-section__title', text }),
    aside,
  );
}

// Tanggal ISO (YYYY-MM-DD) menjadi "09 Okt 2026".
export function dateText(iso: string): string {
  return dueText(formatDate(new Date(`${iso}T12:00:00+07:00`)));
}

export function kvRow(key: string, value: Child, strong = false): HTMLElement {
  return el(
    'div',
    { className: strong ? 'mob-row mob-row--strong' : 'mob-row' },
    el('span', { className: strong ? '' : 'mob-muted', text: key }),
    el('span', { className: 'mob-row__value' }, value),
  );
}

export function statusBadge(status: InvoiceStatus): HTMLElement {
  if (status.kind === 'lunas') {
    return createMobBadge(label('statusLunas'), 'sukses', 'circle-check');
  }
  if (status.kind === 'terlambat') {
    return createMobBadge(label('terlambatHari', { hari: status.daysLate }), 'bahaya', 'clock');
  }
  return createMobBadge(label('piuBelumLunas'), 'info', 'clock');
}

export function iconBubble(name: IconName, tone: string): HTMLElement {
  return el(
    'span',
    { className: `trx-bubble trx-bubble--${tone}`, attrs: { 'aria-hidden': 'true' } },
    icon(name),
  );
}

// Baris barang: nama, jumlah x satuan x harga, diskon, harga diubah, dan subtotal.
export function lineItems(lines: readonly DetailLine[]): HTMLElement {
  return el(
    'ul',
    { className: 'trx-items' },
    ...lines.map((line) =>
      el(
        'li',
        { className: 'trx-item' },
        el(
          'div',
          { className: 'trx-item__main' },
          el('span', { className: 'trx-item__name', text: line.name }),
          el('span', {
            className: 'trx-item__calc',
            text: label('trxRumusBaris', {
              jumlah: formatDecimal(line.quantity, 3, 0),
              satuan: line.unit,
              harga: formatRupiah(line.unitPrice),
            }),
          }),
          line.listPrice === undefined
            ? false
            : el(
                'span',
                { className: 'trx-item__note' },
                createMobBadge(label('trxHargaDiubah'), 'peringatan'),
                el('span', {
                  text: label('hargaAsli', { harga: formatRupiah(line.listPrice) }),
                }),
              ),
          line.discount > 0
            ? el('span', {
                className: 'trx-item__note',
                text: `${label('diskon')} -${formatRupiah(line.discount)}`,
              })
            : false,
        ),
        el('span', { className: 'trx-item__sum', text: formatRupiah(line.subtotal) }),
      ),
    ),
  );
}

const KIND_LABELS: Readonly<Record<DocKind, LabelKey>> = {
  bill: 'trxKindBill',
  sale: 'trxKindPenjualan',
  so: 'tabSo',
  po: 'tabPo',
};

const KIND_ICONS: Readonly<Record<DocKind, IconName>> = {
  bill: 'pause',
  sale: 'receipt',
  so: 'file-text',
  po: 'package-plus',
};

const KIND_TONES: Readonly<Record<DocKind, string>> = {
  bill: 'peringatan',
  sale: 'sukses',
  so: 'info',
  po: 'info',
};

const STATUS_VIEW: Readonly<Record<DocStatus, readonly [LabelKey, MobTone]>> = {
  ditahan: ['trxStatusDitahan', 'peringatan'],
  lunas: ['statusLunas', 'sukses'],
  dp: ['metodeDp', 'info'],
  piutang: ['metodePiutang', 'peringatan'],
  draf: ['statusDraf', 'netral'],
  dipesan: ['statusDipesan', 'info'],
  'diterima-sebagian': ['trxStatusDiterimaSebagian', 'peringatan'],
  diterima: ['trxStatusDiterima', 'sukses'],
};

const ROLE_LABELS: Readonly<Record<Role, LabelKey>> = {
  owner: 'peranOwner',
  supervisor: 'peranSupervisor',
  kasir: 'peranKasir',
  frontliner: 'peranFrontliner',
  sales: 'peranSales',
};

export function docKindLabel(kind: DocKind): string {
  return label(KIND_LABELS[kind]);
}

export function docBubble(kind: DocKind): HTMLElement {
  return iconBubble(KIND_ICONS[kind], KIND_TONES[kind]);
}

export function docStatusBadge(status: DocStatus): HTMLElement {
  const [key, tone] = STATUS_VIEW[status];
  return createMobBadge(label(key), tone);
}

export function roleLabel(role: Role | undefined): string {
  return role === undefined ? '' : label(ROLE_LABELS[role]);
}

// Tanggal dan jam dari penanda waktu ISO, mis. "18 Okt 2026, 09:25".
export function stampText(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)}, ${formatTime(date)}`;
}

const PAY_LABELS: Readonly<Record<InvoicePayment['method'], LabelKey>> = {
  tunai: 'metodeTunai',
  transfer: 'metodeTransfer',
  qris: 'metodeQris',
};

// Riwayat bayar invoice: tanggal dan cara bayar di kiri, jumlah di kanan.
export function paymentRows(payments: readonly InvoicePayment[]): HTMLElement {
  return payments.length === 0
    ? el('p', { className: 'mob-muted', text: label('piuBelumAdaBayar') })
    : el(
        'div',
        { className: 'trx-kv' },
        ...payments.map((payment) =>
          kvRow(
            `${dateText(payment.at)}, ${label(PAY_LABELS[payment.method])}`,
            formatRupiah(payment.amount),
          ),
        ),
      );
}
