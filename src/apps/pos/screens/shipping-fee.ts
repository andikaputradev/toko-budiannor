import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { createAmountEntry } from '../amount-entry';
import { MAX_SHIPPING_FEE } from '../domain/bill';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';

// Teks modal ini sengaja tidak masuk label bersama: modul ini dimuat malas, sedangkan label bersama
// dimuat semua aplikasi dan anggaran JS awal POS hampir habis.
const TEXT = {
  nilai: 'Nilai biaya kirim',
  hapus: 'Hapus Biaya Kirim',
  ditambahkan: 'Biaya kirim ditambahkan ke total.',
  dihapus: 'Biaya kirim dihapus.',
} as const;

export interface ShippingFeeOptions {
  readonly session: PosSession;
  readonly onDone?: (() => void) | undefined;
}

// Modal Biaya Kirim (menu titik tiga): nominal rupiah yang ditambahkan ke total pesanan setelah
// diskon. Papan angka sama dengan Diskon Transaksi; nilai 0 atau tombol Hapus menghilangkannya.
export function openShippingFee(options: ShippingFeeOptions): void {
  const { session } = options;
  const existing = session.shippingFee();
  // Subtotal barang setelah Diskon Transaksi; biaya kirim ditambahkan di atasnya.
  const goods = session.subtotal() - session.billDiscountAmount();

  const error = el('p', { className: 'pos-line__error', attrs: { role: 'alert' } });
  const feeValue = el('output', { className: 'pos-bdisc__value' });
  const totalValue = el('output', { className: 'pos-bdisc__value pos-bdisc__value--total' });
  const entry = createAmountEntry({
    labelText: TEXT.nilai,
    value: existing,
    max: MAX_SHIPPING_FEE,
    onChange: () => {
      error.textContent = '';
      paint();
    },
  });

  function paint(): void {
    feeValue.textContent = `+${formatRupiah(entry.value())}`;
    totalValue.textContent = formatRupiah(goods + entry.value());
  }

  const apply = (): void => {
    const result = session.setShippingFee(entry.value());
    if (!result.ok) {
      error.textContent = failureText(result);
      return;
    }
    handle.close();
    showToast({ kind: 'success', text: entry.value() > 0 ? TEXT.ditambahkan : TEXT.dihapus });
    options.onDone?.();
  };

  const row = (text: string, output: HTMLElement, className = ''): HTMLElement =>
    el('p', { className: `pos-bdisc__row ${className}`.trim() }, el('span', { text }), output);

  const handle = openModal({
    title: label('menuBiayaKirim'),
    body: el(
      'div',
      { className: 'pos-bdisc' },
      el(
        'div',
        { className: 'pos-bdisc__info' },
        row(
          label('kolomSubtotal'),
          el('output', { className: 'pos-bdisc__value', text: formatRupiah(goods) }),
        ),
        row(label('menuBiayaKirim'), feeValue),
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
      existing === 0
        ? false
        : createButton({
            text: TEXT.hapus,
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
