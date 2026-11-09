import type { Product } from '../../../shared/data/types';
import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { parseQuantity } from '../../../shared/domain/transfer';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { createSelectField } from '../../../shared/ui/field';
import { createStepper } from '../../../shared/ui/stepper';
import { parsePriceOverride, preferredUnit } from '../domain/orders';

export interface EditorLine {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: string;
  /** Harga hasil ubah (angka). Undefined berarti mengikuti harga acuan. */
  readonly price: string | undefined;
}

export interface LineEditorOptions {
  readonly lookup: (id: string) => Product | undefined;
  /** Harga acuan per satuan: harga tier pelanggan (SO) atau perkiraan HPP (PO). */
  readonly listPrice: (product: Product, unit: string) => number;
  readonly priceLabel: string;
  /** Dipanggil setiap baris, jumlah, atau harga berubah (untuk menghitung ulang total). */
  readonly onChange: () => void;
}

export interface LineEditor {
  readonly element: HTMLElement;
  lines(): readonly EditorLine[];
  add(product: Product): void;
  clear(): void;
  /** Menggambar ulang, misalnya setelah tier pelanggan berubah. */
  refresh(): void;
  total(): number;
  markInvalid(index: number, field: 'quantity' | 'price'): void;
}

const MAX_QUANTITY = 1_000_000;

function groupDigits(value: number): string {
  return formatDecimal(value, 0);
}

export function createLineEditor(options: LineEditorOptions): LineEditor {
  let lines: EditorLine[] = [];
  const box = el('div', { className: 'trx-lines' });
  const fields: { quantity: HTMLInputElement | null; price: HTMLInputElement | null }[] = [];

  const listOf = (line: EditorLine): number => {
    const product = options.lookup(line.productId);
    return product === undefined ? 0 : options.listPrice(product, line.unit);
  };
  const priceOf = (line: EditorLine): number => parsePriceOverride(line.price) ?? listOf(line);
  const subtotalOf = (line: EditorLine): number =>
    Math.round((parseQuantity(line.quantity) ?? 0) * priceOf(line));
  const changed = (line: EditorLine): boolean => {
    const override = parsePriceOverride(line.price);
    return override !== undefined && override !== listOf(line);
  };

  const patch = (index: number, change: Partial<EditorLine>): void => {
    lines = lines.map((line, position) => (position === index ? { ...line, ...change } : line));
  };

  const card = (line: EditorLine, index: number): HTMLElement => {
    const product = options.lookup(line.productId);
    if (product === undefined) {
      return el('div');
    }
    const sum = el('output', { className: 'trx-line__sum', text: formatRupiah(subtotalOf(line)) });
    const remove = el(
      'button',
      {
        className: 'trx-icon-button',
        attrs: { type: 'button', 'aria-label': `${label('hapus')} ${product.name}` },
      },
      icon('trash-2'),
    );
    remove.addEventListener('click', () => {
      lines = lines.filter((_, position) => position !== index);
      render();
    });

    const stepper = createStepper({
      labelText: `${label('jumlah')} ${product.name}`,
      value: parseQuantity(line.quantity) ?? 1,
      min: product.allowDecimal ? 0.001 : 1,
      max: MAX_QUANTITY,
      step: product.allowDecimal ? 0.5 : 1,
      onChange: (value) => {
        patch(index, { quantity: String(value).replace('.', ',') });
        fields[index]?.quantity?.removeAttribute('aria-invalid');
        sum.textContent = formatRupiah(subtotalOf(lines[index] ?? line));
        options.onChange();
      },
    });
    const quantityInput = stepper.element.querySelector('input');

    const unitField = createSelectField({
      labelText: label('kolomSatuan'),
      options: product.units.map((item) => ({ value: item.code, text: item.code })),
      value: line.unit,
    });
    const unit = unitField.select;
    unit.value = line.unit;
    unit.addEventListener('change', () => {
      patch(index, { unit: unit.value, price: undefined });
      render();
    });

    const priceId = nextId('trx-harga');
    const price = el('input', {
      className: 'input trx-price__input',
      attrs: {
        id: priceId,
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
      },
    });
    const note = el(
      'p',
      { className: 'trx-line__changed' },
      createMobBadge(label('trxHargaDiubah'), 'peringatan'),
      el('span', { className: 'trx-line__origin' }),
    );
    const paintNote = (): void => {
      const current = lines[index] ?? line;
      note.hidden = !changed(current);
      const origin = note.querySelector('.trx-line__origin');
      if (origin !== null) {
        origin.textContent = label('hargaAsli', { harga: formatRupiah(listOf(current)) });
      }
    };
    const showFormatted = (): void => {
      const current = lines[index] ?? line;
      price.value = groupDigits(priceOf(current));
    };
    showFormatted();
    paintNote();
    price.addEventListener('focus', () => {
      price.value = String(priceOf(lines[index] ?? line));
      price.select();
    });
    price.addEventListener('input', () => {
      price.value = price.value.replace(/\D/g, '');
      price.removeAttribute('aria-invalid');
      patch(index, { price: price.value === '' ? undefined : price.value });
      sum.textContent = formatRupiah(subtotalOf(lines[index] ?? line));
      paintNote();
      options.onChange();
    });
    price.addEventListener('blur', () => {
      const current = lines[index] ?? line;
      if (!changed(current)) {
        patch(index, { price: undefined });
      }
      showFormatted();
      paintNote();
    });

    fields[index] = { quantity: quantityInput, price };

    return el(
      'article',
      { className: 'trx-line' },
      el(
        'div',
        { className: 'trx-line__head' },
        el(
          'div',
          { className: 'trx-line__title' },
          el('h3', { className: 'trx-line__name', text: product.name }),
          el('span', { className: 'trx-line__code', text: product.code }),
        ),
        remove,
      ),
      el(
        'div',
        { className: 'trx-line__controls' },
        el(
          'div',
          { className: 'field' },
          el('span', { className: 'field__label', text: label('jumlah') }),
          stepper.element,
        ),
        unitField.root,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: `${options.priceLabel} / ${line.unit}`,
          attrs: { for: priceId },
        }),
        el(
          'div',
          { className: 'trx-price' },
          el('span', { className: 'trx-price__rp', text: 'Rp' }),
          price,
        ),
        note,
      ),
      el(
        'div',
        { className: 'trx-line__foot' },
        el('span', { className: 'mob-muted', text: label('trxSubtotal') }),
        sum,
      ),
    );
  };

  function render(): void {
    fields.length = 0;
    box.replaceChildren(
      ...(lines.length === 0
        ? [el('p', { className: 'trx-empty', text: label('trxBelumAdaBarang') })]
        : lines.map(card)),
    );
    options.onChange();
  }

  render();
  return {
    element: box,
    lines: () => lines,
    add: (product) => {
      const unit = preferredUnit(product);
      const found = lines.findIndex((line) => line.productId === product.id && line.unit === unit);
      if (found >= 0) {
        patch(found, {
          quantity: String((parseQuantity(lines[found]?.quantity ?? '0') ?? 0) + 1).replace(
            '.',
            ',',
          ),
        });
      } else {
        lines = [...lines, { productId: product.id, unit, quantity: '1', price: undefined }];
      }
      render();
      const target = found >= 0 ? found : lines.length - 1;
      box.children.item(target)?.scrollIntoView({ block: 'nearest' });
    },
    clear: () => {
      lines = [];
      render();
    },
    refresh: render,
    total: () => lines.reduce((sum, line) => sum + subtotalOf(line), 0),
    markInvalid: (index, field) => {
      const target = fields[index]?.[field];
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
    },
  };
}
