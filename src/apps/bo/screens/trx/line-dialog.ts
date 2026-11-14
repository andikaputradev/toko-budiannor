import { el, nextId } from '../../../../shared/dom';
import type { Product } from '../../../../shared/data/types';
import { formatDecimal, formatRupiah } from '../../../../shared/format';
import { icon } from '../../../../shared/icons';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import type { BoSession } from '../../bo-session';
import { createDocLine, type DocLine } from '../../domain/doc-line';
import {
  discountExprFrom,
  discountFields,
  lineTotal,
  parsePriceText,
  parseQuantityText,
  priceHistory,
  stockLabel,
  unitOptions,
  unitPriceFor,
  validateDetail,
} from '../../domain/line-detail';
import { shortDate } from '../../short-date';
import { TRX_TEXT as T } from './text';

export interface LineDialogOptions {
  readonly kind: 'jual' | 'beli';
  readonly product: Product;
  readonly session: BoSession;
  // Ada saat mengubah baris yang sudah ada; kosong saat menambah barang baru.
  readonly line?: DocLine | undefined;
  // Harga Histori Beli hanya untuk Owner.
  readonly canSeeCost: boolean;
  readonly onCommit: (line: DocLine) => void;
  readonly onDelete?: (() => void) | undefined;
}

const HISTORY_LIMIT = 3;

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

// Dialog Rincian Barang (gambar klien 12): dibuka saat barang dipilih dari kotak cari atau saat
// baris tabel diklik. Lanjut memvalidasi lalu mengirim baris; Hapus membuang baris yang diubah.
export function openLineDialog(options: LineDialogOptions): void {
  const { kind, product, session } = options;
  const base = options.line ?? createDocLine(product, kind);
  const units = unitOptions(product);
  let expr = base.discountExpr;

  const field = (id: string, text: string, ...controls: (Node | string)[]): HTMLElement =>
    el(
      'div',
      { className: 'bo-trx-dlg__row' },
      el('label', { className: 'bo-trx-dlg__label', text, attrs: { for: id } }),
      el('div', { className: 'bo-trx-dlg__control' }, ...controls),
    );
  const prefixed = (prefix: string, control: HTMLElement): HTMLElement =>
    el(
      'span',
      { className: 'bo-trx-dlg__money' },
      el('span', { className: 'bo-trx-dlg__prefix', text: prefix }),
      control,
    );
  const textInput = (id: string, value: string, mode: 'decimal' | 'numeric'): HTMLInputElement =>
    el('input', {
      className: 'input is-num',
      attrs: { id, type: 'text', inputmode: mode, autocomplete: 'off', value },
    });

  const ids = {
    name: nextId('dlg-nama'),
    qty: nextId('dlg-qty'),
    unit: nextId('dlg-satuan'),
    price: nextId('dlg-harga'),
    percent: nextId('dlg-persen'),
    nominal: nextId('dlg-nominal'),
    warehouse: nextId('dlg-gudang'),
    shipping: nextId('dlg-ongkos'),
  };

  const nameInput = el('input', {
    className: 'input',
    attrs: { id: ids.name, type: 'text', readonly: '', value: product.name },
  });
  const clearName = el(
    'button',
    {
      className: 'bo-trx-dlg__clear',
      attrs: { type: 'button', 'aria-label': T.kosongkanNama, title: T.kosongkanNama },
    },
    icon('x'),
  );
  const qtyInput = textInput(ids.qty, String(base.quantity).replace('.', ','), 'decimal');
  const unitSelect = el('select', { className: 'input is-select', attrs: { id: ids.unit } });
  for (const unit of units) {
    unitSelect.append(el('option', { text: unit.code, attrs: { value: unit.code } }));
  }
  unitSelect.value = units.some((unit) => unit.code === base.unit)
    ? base.unit
    : (units[0]?.code ?? '');
  const priceInput = textInput(ids.price, formatDecimal(base.unitPrice, 2), 'numeric');
  const percentInput = textInput(ids.percent, '', 'decimal');
  const nominalInput = textInput(ids.nominal, '', 'numeric');
  const totalBox = el('div', { className: 'bo-trx-dlg__total' });
  const warehouseSelect = el('select', {
    className: 'input is-select',
    attrs: { id: ids.warehouse },
  });
  warehouseSelect.append(
    el('option', { text: T.toko, attrs: { value: 'toko' } }),
    el('option', { text: T.gudangBesar, attrs: { value: 'gudang' } }),
  );
  warehouseSelect.value = base.warehouse;
  const stockText = el('span', { className: 'bo-trx-dlg__stock' });
  const shippingInput = textInput(ids.shipping, formatDecimal(base.shipping, 2), 'numeric');
  const history = el('div', { className: 'bo-trx-dlg__history' });
  const problem = el('p', { className: 'bo-trx-dlg__error', attrs: { role: 'alert' } });

  const price = (): number => finiteOr(parsePriceText(priceInput.value), 0);
  const quantity = (): number => {
    const value = parseQuantityText(qtyInput.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const paintHistory = (): void => {
    if (kind === 'beli' && !options.canSeeCost) {
      history.hidden = true;
      return;
    }
    const rows = priceHistory({
      state: session.store.getState(),
      product,
      kind,
      limit: HISTORY_LIMIT,
      unit: unitSelect.value,
    });
    history.replaceChildren(
      el('h4', {
        className: 'bo-trx-dlg__history-title',
        text: kind === 'jual' ? T.histJual : T.histBeli,
      }),
      ...(rows.length === 0
        ? [el('p', { className: 'bo-trx-dlg__history-empty', text: T.belumRiwayat })]
        : rows.map((row) =>
            el(
              'div',
              { className: 'bo-trx-dlg__history-row' },
              el('span', { text: shortDate(row.at) }),
              el('span', { text: formatRupiah(row.price) }),
            ),
          )),
    );
  };

  const paintTotals = (): void => {
    totalBox.textContent = formatRupiah(lineTotal(price(), quantity(), expr));
    stockText.textContent = `${T.stok} : ${stockLabel(
      product,
      warehouseSelect.value === 'gudang' ? 'gudang' : 'toko',
      unitSelect.value,
    )}`;
  };

  // Mengisi satu isian diskon mengosongkan yang lain; padanannya ditampilkan di isian lawan.
  const syncDiscount = (source: 'percent' | 'nominal' | 'price'): void => {
    const fields = discountFields(expr, price());
    if (source !== 'percent') {
      percentInput.value = fields.percent;
    }
    if (source !== 'nominal') {
      nominalInput.value = fields.nominal;
    }
  };
  percentInput.addEventListener('input', () => {
    expr = discountExprFrom({ percent: percentInput.value, nominal: '' });
    syncDiscount('percent');
    paintTotals();
  });
  nominalInput.addEventListener('input', () => {
    expr = discountExprFrom({ percent: '', nominal: nominalInput.value });
    syncDiscount('nominal');
    paintTotals();
  });
  priceInput.addEventListener('input', () => {
    syncDiscount('price');
    paintTotals();
  });
  priceInput.addEventListener('blur', () => {
    const value = parsePriceText(priceInput.value);
    if (Number.isFinite(value)) {
      priceInput.value = formatDecimal(value, 2);
    }
  });
  qtyInput.addEventListener('input', paintTotals);
  warehouseSelect.addEventListener('change', paintTotals);
  unitSelect.addEventListener('change', () => {
    // Harga tiap satuan berbeda: ikut harga eceran satuan yang dipilih, tetap bisa diubah lagi.
    priceInput.value = formatDecimal(unitPriceFor(product, unitSelect.value), 2);
    syncDiscount('price');
    paintTotals();
    paintHistory();
  });

  const form = el(
    'form',
    { className: 'bo-trx-dlg', attrs: { novalidate: '' } },
    el(
      'div',
      { className: 'bo-trx-dlg__row' },
      el('span', { className: 'bo-trx-dlg__label', text: T.kode }),
      el(
        'div',
        { className: 'bo-trx-dlg__control' },
        el('strong', { className: 'bo-trx-dlg__code', text: product.code }),
      ),
    ),
    field(
      ids.name,
      T.namaBarang,
      el('span', { className: 'bo-trx-dlg__name' }, nameInput, clearName),
    ),
    field(
      ids.qty,
      T.kuantitas,
      el('span', { className: 'bo-trx-dlg__pair' }, qtyInput, unitSelect),
    ),
    field(ids.price, T.harga, prefixed('Rp', priceInput)),
    field(
      ids.percent,
      T.diskon,
      el(
        'span',
        { className: 'bo-trx-dlg__pair' },
        prefixed('%', percentInput),
        prefixed('Rp', nominalInput),
      ),
    ),
    el(
      'div',
      { className: 'bo-trx-dlg__row' },
      el('span', { className: 'bo-trx-dlg__label', text: T.totalHarga }),
      el('div', { className: 'bo-trx-dlg__control' }, totalBox),
    ),
    field(
      ids.warehouse,
      `${T.gudang} *`,
      el('span', { className: 'bo-trx-dlg__pair' }, warehouseSelect, stockText),
    ),
    kind === 'beli' && field(ids.shipping, T.ongkosKirim, prefixed('Rp', shippingInput)),
    history,
    problem,
  );

  const handle = openModal({ title: T.rincianBarang, body: form, actions: [] });
  handle.dialog.classList.add('bo-trx-dlg-modal');

  const removeButton = createButton({
    text: T.hapus,
    variant: 'secondary',
    onClick: () => {
      if (options.line !== undefined) {
        options.onDelete?.();
      }
      handle.close();
    },
  });
  const nextButton = createButton({ text: T.lanjut, variant: 'primary', type: 'submit' });
  form.append(el('div', { className: 'bo-trx-dlg__actions' }, removeButton, nextButton));
  clearName.addEventListener('click', () => {
    handle.close();
  });

  const fail = (text: string, control: HTMLElement): void => {
    problem.textContent = text;
    control.focus();
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    problem.textContent = '';
    const issue = validateDetail({
      quantity: qtyInput.value,
      unitPrice: priceInput.value,
      allowDecimal: product.allowDecimal,
    });
    if (issue === 'quantity') {
      fail(T.errKuantitas, qtyInput);
      return;
    }
    if (issue === 'decimal') {
      fail(T.errDesimal, qtyInput);
      return;
    }
    if (issue === 'price') {
      fail(T.errHarga, priceInput);
      return;
    }
    options.onCommit({
      ...base,
      warehouse: warehouseSelect.value === 'gudang' ? 'gudang' : 'toko',
      unit: unitSelect.value,
      quantity: quantity(),
      unitPrice: price(),
      discountExpr: expr,
      shipping: kind === 'beli' ? finiteOr(parsePriceText(shippingInput.value), 0) : 0,
    });
    handle.close();
  });

  syncDiscount('price');
  paintTotals();
  paintHistory();
  qtyInput.focus();
  qtyInput.select();
}
