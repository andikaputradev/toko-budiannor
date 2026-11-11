import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { QUANTITY_MESSAGES, unitPrice, validateQuantity } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { defaultUnitOf } from '../domain/bill';
import { rackOf } from '../domain/catalog-view';
import { createNumpad } from '../numpad';
import type { AddProductResult, PosSession } from '../pos-session';
import { createProductThumb } from '../thumb';

export interface UnitModalOptions {
  readonly session: PosSession;
  readonly product: Product;
  readonly onDone?: (() => void) | undefined;
}

// Teks galat bila barang ditolak masuk keranjang (batas baris atau stok toko).
function rejectionText(product: Product, result: Extract<AddProductResult, { ok: false }>): string {
  if (result.reason === 'max-lines') {
    return message('MSG-027');
  }
  if (result.reason === 'out-of-stock') {
    return label('stokBarangKosong', { nama: product.name });
  }
  return label('stokTokoTerbatas', {
    nama: product.name,
    jumlah: `${formatDecimal(result.available, 3, 0)} ${product.baseUnit}`,
  });
}

// Modal satuan dan jumlah (tahan kartu): dua kolom dengan tinggi tetap supaya muat satu layar tanpa
// scroll bar. Kiri: foto, stok Toko dan Gudang beserta No Rak, daftar satuan berharga. Kanan: jumlah
// dan papan angka.
export function openUnitModal(options: UnitModalOptions): void {
  const { session, product } = options;
  const tier = session.customer()?.tier ?? 'eceran';
  let unit = defaultUnitOf(product).code;
  const field = createTextField({
    labelText: label('jumlah'),
    value: '1',
    inputMode: 'decimal',
  });
  // Stok dalam satuan dasar, sama dengan kartu barang.
  const stockText = (text: string, quantity: number): HTMLElement =>
    el('span', {
      className: 'pos-unit__stock-item',
      text: `${text}: ${formatDecimal(quantity, 3, 0)} ${product.baseUnit}`,
    });
  const subtotal = el('p', { className: 'pos-unit__subtotal t-value' });
  const unitButtons = new Map<string, HTMLButtonElement>();
  const unitGroup = el('div', {
    className: 'pos-unit__units',
    attrs: { role: 'radiogroup', 'aria-label': label('kolomSatuan') },
  });

  const quantity = (): number | undefined => {
    const raw = field.input.value.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : undefined;
  };
  const paint = (): void => {
    for (const [code, button] of unitButtons) {
      button.setAttribute('aria-checked', code === unit ? 'true' : 'false');
    }
    const each = unitPrice(product, unit, tier);
    const amount = quantity();
    subtotal.textContent = `${label('kolomSubtotal')}: ${formatRupiah(Math.round((amount ?? 0) * each))}`;
  };
  for (const item of product.units) {
    const button = el(
      'button',
      {
        className: 'pos-unit__unit pos-unit__row',
        attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
      },
      el('span', { className: 'pos-unit__code', text: item.code }),
      el('span', {
        className: 'pos-unit__rowprice',
        text: label('hargaPerSatuan', {
          harga: formatRupiah(unitPrice(product, item.code, tier)),
          satuan: item.code,
        }),
      }),
    );
    button.addEventListener('click', () => {
      unit = item.code;
      field.setError(undefined);
      paint();
    });
    unitButtons.set(item.code, button);
    unitGroup.append(button);
  }

  const handle = openModal({
    title: product.name,
    body: el(
      'div',
      { className: 'pos-unit' },
      el(
        'div',
        { className: 'pos-unit__info' },
        el(
          'div',
          { className: 'pos-unit__head' },
          createProductThumb(product, 'md'),
          el(
            'p',
            { className: 'pos-unit__stock t-label' },
            stockText(label('stokToko'), product.stock.display),
            stockText(label('stokGudang'), product.stock.besar),
            el('span', {
              className: 'pos-unit__stock-item',
              text: `${label('stokNoRak')}: ${rackOf(product)}`,
            }),
          ),
        ),
        unitGroup,
        subtotal,
      ),
      el(
        'div',
        { className: 'pos-unit__entry' },
        field.root,
        createNumpad((key) => {
          const current = field.input.value;
          field.input.value =
            key === 'Backspace'
              ? current.slice(0, -1)
              : /^[\d,]$/.test(key)
                ? current + key
                : current;
          field.setError(undefined);
          paint();
        }).element,
      ),
    ),
    actions: [],
  });

  const submit = (): void => {
    const amount = quantity();
    const issue = amount === undefined ? 'invalid' : validateQuantity(product, amount);
    if (amount === undefined || issue !== 'ok') {
      const empty = field.input.value.trim() === '';
      const key = empty ? 'not-positive' : issue === 'ok' ? 'invalid' : issue;
      field.setError(message(QUANTITY_MESSAGES[key]));
      return;
    }
    const result = session.addProduct(product, unit, amount);
    if (!result.ok) {
      field.setError(rejectionText(product, result));
      return;
    }
    handle.close();
    options.onDone?.();
  };

  const buttons = el(
    'div',
    { className: 'pos-unit__actions' },
    createButton({
      text: label('batal'),
      variant: 'secondary',
      onClick: () => {
        handle.close();
      },
    }),
    createButton({
      text: label('tambahkanKeBill'),
      onClick: submit,
    }),
  );
  handle.dialog.append(buttons);
  field.input.addEventListener('input', () => {
    field.setError(undefined);
    paint();
  });
  field.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  paint();
  field.input.focus();
  field.input.select();
}
