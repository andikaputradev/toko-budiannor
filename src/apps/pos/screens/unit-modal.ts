import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import {
  fromBase,
  QUANTITY_MESSAGES,
  unitPrice,
  validateQuantity,
} from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { defaultUnitOf } from '../domain/bill';
import { createNumpad } from '../numpad';
import type { PosSession } from '../pos-session';

export interface UnitModalOptions {
  readonly session: PosSession;
  readonly product: Product;
  readonly lineIndex?: number | undefined;
  readonly onDone?: (() => void) | undefined;
}

export function openUnitModal(options: UnitModalOptions): void {
  const { session, product } = options;
  const editing =
    options.lineIndex === undefined ? undefined : session.state().lines[options.lineIndex];
  const tier = session.customer()?.tier ?? 'eceran';
  let unit = editing?.unit ?? defaultUnitOf(product).code;
  const field = createTextField({
    labelText: label('jumlah'),
    value: editing === undefined ? '1' : formatDecimal(editing.quantity).replace('.', ''),
    inputMode: 'decimal',
  });
  const stock = el('p', { className: 't-label' });
  const price = el('p', { className: 'pos-unit__price t-section-title' });
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
    price.textContent = label('hargaPerSatuan', { harga: formatRupiah(each), satuan: unit });
    const amount = quantity();
    subtotal.textContent = `${label('kolomSubtotal')}: ${formatRupiah(Math.round((amount ?? 0) * each))}`;
    stock.textContent = label('stokGudangModal', {
      display: formatDecimal(fromBase(product, unit, product.stock.display), 3, 1),
      besar: formatDecimal(fromBase(product, unit, product.stock.besar), 3, 1),
    });
  };
  for (const item of product.units) {
    const button = el('button', {
      className: 'pos-unit__unit',
      text: item.code,
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
    });
    button.addEventListener('click', () => {
      unit = item.code;
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
        { className: 'pos-unit__head' },
        el('div', { className: 'pos-photo pos-photo--large', text: label('fotoProduk') }),
        el('div', { className: 'pos-unit__info' }, stock, unitGroup, price),
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
        subtotal,
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
    if (editing === undefined || options.lineIndex === undefined) {
      session.addProduct(product, unit, amount);
    } else {
      session.setLine(options.lineIndex, unit, amount);
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
      text: label(editing === undefined ? 'tambahkanKeBill' : 'simpanPerubahan'),
      onClick: submit,
    }),
  );
  if (editing !== undefined && options.lineIndex !== undefined) {
    const index = options.lineIndex;
    buttons.prepend(
      createButton({
        text: label('hapusItem'),
        variant: 'danger',
        onClick: () => {
          openModal({
            title: label('modalJudulHapus'),
            body: message('MSG-015'),
            actions: [
              { text: label('batal'), variant: 'secondary' },
              {
                text: label('hapus'),
                variant: 'danger',
                onClick: () => {
                  session.deleteLine(index);
                  handle.close();
                  options.onDone?.();
                },
              },
            ],
          });
        },
      }),
    );
  }
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
