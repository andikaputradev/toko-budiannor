import type { LineDiscount, Product } from '../../../shared/data/types';
import { QUANTITY_MESSAGES, unitPrice, validateQuantity } from '../../../shared/data/units';
import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { accessFor } from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { createAmountEntry } from '../amount-entry';
import { lineSubtotal } from '../domain/bill';
import { failureText } from '../failure';
import type { LineDetailPatch, PosSession } from '../pos-session';
import { createProductThumb } from '../thumb';
import { openAuthorizeModal } from './authorize';

export interface LineDetailOptions {
  readonly session: PosSession;
  readonly product: Product;
  readonly lineIndex: number;
  readonly onDone?: (() => void) | undefined;
}

type Section = 'diskon' | 'harga';

// Modal Detail Barang: satuan, jumlah, tenaga penjual, diskon, ubah harga, catatan, dan Cek Stok.
export function openLineDetail(options: LineDetailOptions): void {
  const { session, product, lineIndex } = options;
  const line = session.state().lines[lineIndex];
  if (line === undefined) {
    return;
  }
  const role = session.store.getState().role;
  const tier = session.customer()?.tier ?? 'eceran';
  const access = (action: string) => accessFor(role, 'POS-03', action);
  const canDiscount = access('Diskon') !== 'tidak';
  const canPrice = access('Ubah Harga') !== 'tidak';
  const tierPrice = (code: string): number => unitPrice(product, code, tier);

  // Draf yang belum disimpan. Kasir membuka kunci diskon dan harga lewat PIN Supervisor atau Owner.
  let unit = line.unit;
  let sellerId = line.sellerId;
  let kind: LineDiscount['kind'] = line.discount?.kind ?? 'persen';
  let discountTouched = false;
  let priceTouched = false;
  let authorized = false;
  let open: Section | undefined;

  const quantityField = createTextField({
    labelText: label('jumlah'),
    value: formatDecimal(line.quantity).replace('.', ''),
    inputMode: 'decimal',
  });
  const quantity = (): number | undefined => {
    const raw = quantityField.input.value.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : undefined;
  };
  const discountEntry = createAmountEntry({
    labelText: label('nilaiDiskon'),
    value: line.discount?.value ?? 0,
    onChange: () => {
      discountTouched = true;
      paint();
    },
    enabled: () => open === 'diskon',
    format: (value) => (kind === 'persen' ? `${String(value)}%` : formatRupiah(value)),
  });
  const priceEntry = createAmountEntry({
    labelText: label('hargaBaru'),
    value: line.unitPrice,
    onChange: () => {
      priceTouched = true;
      paint();
    },
    enabled: () => open === 'harga',
  });

  const effectivePrice = (): number =>
    priceTouched ? priceEntry.value() : unit === line.unit ? line.unitPrice : tierPrice(unit);
  const originalPrice = (): number =>
    unit === line.unit ? (line.listPrice ?? tierPrice(unit)) : tierPrice(unit);
  const draftDiscount = (): LineDiscount | undefined => {
    if (!discountTouched) {
      return line.discount;
    }
    const value = discountEntry.value();
    return value > 0 ? { kind, value } : undefined;
  };

  const subtotal = el('output', { className: 'pos-line__subtotal t-total' });
  const priceText = el('p', { className: 'pos-line__price' });
  const error = el('p', { className: 'pos-line__error', attrs: { role: 'alert' } });
  const unitButtons = new Map<string, HTMLButtonElement>();
  const unitGroup = el('div', {
    className: 'pos-line__units',
    attrs: { role: 'radiogroup', 'aria-label': label('kolomSatuan') },
  });
  for (const item of product.units) {
    const button = el('button', {
      className: 'pos-unit__unit',
      text: item.code,
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
    });
    button.addEventListener('click', () => {
      unit = item.code;
      error.textContent = '';
      paint();
    });
    unitButtons.set(item.code, button);
    unitGroup.append(button);
  }

  const setQuantity = (value: number): void => {
    quantityField.input.value = formatDecimal(value).replace('.', '');
    quantityField.setError(undefined);
    paint();
  };
  const step = (direction: 1 | -1): void => {
    const current = quantity() ?? line.quantity;
    const next = Math.round((current + direction) * 1000) / 1000;
    if (next >= 1) {
      setQuantity(next);
    }
  };
  const stepButton = (direction: 1 | -1): HTMLButtonElement => {
    const button = el(
      'button',
      {
        className: 'pos-line__step',
        attrs: {
          type: 'button',
          'aria-label': label(direction === 1 ? 'tambahJumlah' : 'kurangiJumlah'),
        },
      },
      icon(direction === 1 ? 'plus' : 'minus'),
    );
    button.addEventListener('click', () => {
      step(direction);
    });
    return button;
  };

  const sellerFieldId = nextId('penjual');
  const sellerSelect = el('select', { className: 'input', attrs: { id: sellerFieldId } });
  sellerSelect.append(el('option', { text: label('pilihTenagaPenjual'), attrs: { value: '' } }));
  for (const user of session.store.getState().data.users) {
    if (user.active && (user.role === 'frontliner' || user.role === 'sales')) {
      sellerSelect.append(el('option', { text: user.name, attrs: { value: user.id } }));
    }
  }
  sellerSelect.value = line.sellerId ?? '';
  sellerSelect.addEventListener('change', () => {
    sellerId = sellerSelect.value === '' ? undefined : sellerSelect.value;
  });

  const noteId = nextId('catatan');
  const note = el('textarea', {
    className: 'input pos-line__note',
    attrs: { id: noteId, rows: '2', maxlength: '200' },
  });
  note.value = line.note ?? '';

  const kindButtons = new Map<LineDiscount['kind'], HTMLButtonElement>();
  const kindGroup = el('div', {
    className: 'pos-line__kinds',
    attrs: { role: 'radiogroup', 'aria-label': label('berikanDiskon') },
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
        discountEntry.setValue(0);
        discountTouched = true;
      }
      paint();
    });
    kindButtons.set(value, button);
    kindGroup.append(button);
  }
  const originalText = el('p', { className: 'pos-line__original t-label' });
  const restore = createButton({
    text: label('pulihkanHarga'),
    variant: 'secondary',
    onClick: () => {
      priceEntry.setValue(originalPrice());
      priceTouched = true;
      paint();
    },
  });

  const toggles = new Map<Section, HTMLButtonElement>();
  const hints = new Map<Section, HTMLElement>();
  const panels = new Map<Section, HTMLElement>();
  const toggleSection = (which: Section): void => {
    if (open === which) {
      open = undefined;
      paint();
      return;
    }
    const needs = access(which === 'diskon' ? 'Diskon' : 'Ubah Harga') === 'otorisasi';
    if (needs && !authorized) {
      openAuthorizeModal({
        session,
        purpose: 'harga',
        subject: product.name,
        onApproved: () => {
          authorized = true;
          open = which;
          paint();
        },
      });
      return;
    }
    open = which;
    paint();
  };
  const buildSection = (which: Section, text: string, content: readonly HTMLElement[]) => {
    const panelId = nextId('bagian-detail');
    const hint = el('span', { className: 'pos-line__hint' });
    const toggle = el(
      'button',
      {
        className: 'pos-line__toggle',
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId },
      },
      el('span', { text }),
      hint,
      icon('chevron-down'),
    );
    toggle.addEventListener('click', () => {
      toggleSection(which);
    });
    const panel = el(
      'div',
      { className: 'pos-line__panel', attrs: { id: panelId, hidden: '' } },
      ...content,
    );
    toggles.set(which, toggle);
    hints.set(which, hint);
    panels.set(which, panel);
    return el('div', { className: 'pos-line__section' }, toggle, panel);
  };
  const sections: HTMLElement[] = [];
  if (canDiscount) {
    sections.push(
      buildSection('diskon', label('berikanDiskon'), [kindGroup, discountEntry.element]),
    );
  }
  if (canPrice) {
    sections.push(
      buildSection('harga', label('ubahHarga'), [priceEntry.element, originalText, restore]),
    );
  }

  const paint = (): void => {
    for (const [code, button] of unitButtons) {
      button.setAttribute('aria-checked', code === unit ? 'true' : 'false');
    }
    for (const [value, button] of kindButtons) {
      button.setAttribute('aria-checked', value === kind ? 'true' : 'false');
    }
    const price = effectivePrice();
    const discount = draftDiscount();
    const amount = quantity() ?? line.quantity;
    priceText.textContent = label('hargaPerSatuan', {
      harga: `@${formatRupiah(price)}`,
      satuan: unit,
    });
    subtotal.textContent = formatRupiah(
      lineSubtotal({ ...line, unit, quantity: amount, unitPrice: price, discount }),
    );
    if (!priceTouched) {
      priceEntry.setValue(price);
    }
    const original = originalPrice();
    originalText.hidden = price === original;
    originalText.textContent = label('hargaAsli', { harga: formatRupiah(original) });
    restore.hidden = price === original;
    hints
      .get('diskon')
      ?.replaceChildren(
        document.createTextNode(
          discount === undefined
            ? ''
            : discount.kind === 'persen'
              ? `${String(discount.value)}%`
              : formatRupiah(discount.value),
        ),
      );
    hints
      .get('harga')
      ?.replaceChildren(document.createTextNode(price === original ? '' : formatRupiah(price)));
    for (const [which, toggle] of toggles) {
      const expanded = open === which;
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      const panel = panels.get(which);
      if (panel !== undefined) {
        panel.hidden = !expanded;
      }
    }
  };

  const save = (): void => {
    const amount = quantity();
    const issue = amount === undefined ? 'invalid' : validateQuantity(product, amount);
    if (amount === undefined || issue !== 'ok') {
      const empty = quantityField.input.value.trim() === '';
      const key = empty ? 'not-positive' : issue === 'ok' ? 'invalid' : issue;
      error.textContent = message(QUANTITY_MESSAGES[key]);
      return;
    }
    const patch: LineDetailPatch = { unit, quantity: amount };
    if (note.value.trim() !== (line.note ?? '')) {
      patch.note = note.value;
    }
    if (sellerId !== line.sellerId) {
      patch.sellerId = sellerId ?? null;
    }
    if (priceTouched && canPrice) {
      const price = priceEntry.value();
      patch.price = price === tierPrice(unit) ? null : price;
    }
    if (discountTouched && canDiscount) {
      const value = discountEntry.value();
      patch.discount = value > 0 ? { kind, value } : null;
    }
    const result = session.setLineDetail(lineIndex, patch, authorized);
    if (!result.ok) {
      error.textContent = failureText(result);
      return;
    }
    handle.close();
    options.onDone?.();
  };

  const confirmDelete = (): void => {
    openModal({
      title: label('modalJudulHapus'),
      body: message('MSG-015'),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: label('hapus'),
          variant: 'danger',
          onClick: () => {
            session.deleteLine(lineIndex);
            handle.close();
            options.onDone?.();
          },
        },
      ],
    });
  };

  const remove = el(
    'button',
    {
      className: 'pos-line__remove',
      attrs: { type: 'button', 'aria-label': label('hapusItem') },
    },
    icon('trash-2'),
  );
  remove.addEventListener('click', confirmDelete);

  const stock = createButton({
    text: label('cekStokBarang'),
    variant: 'secondary',
    icon: 'package',
    onClick: () => {
      void import('./stock-sheet').then(({ openStockSheet }) => {
        openStockSheet(product);
      });
    },
  });

  const handle = openModal({
    title: label('detailBarang'),
    body: el(
      'div',
      { className: 'pos-line' },
      el(
        'div',
        { className: 'pos-line__head' },
        createProductThumb(product, 'md'),
        el(
          'div',
          { className: 'pos-line__info' },
          el('p', { className: 'pos-line__name t-section-title', text: product.name }),
          el(
            'p',
            { className: 't-label' },
            el('span', { text: label('kodeBarangJudul') }),
            document.createTextNode(': '),
            el('span', { className: 'pos-line__code', text: product.code }),
          ),
          priceText,
        ),
        el(
          'div',
          { className: 'pos-line__total' },
          el('p', { className: 't-label', text: label('kolomSubtotal') }),
          subtotal,
        ),
      ),
      unitGroup,
      el('div', { className: 'pos-line__qty' }, stepButton(-1), quantityField.root, stepButton(1)),
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('tenagaPenjual'),
          attrs: { for: sellerFieldId },
        }),
        sellerSelect,
      ),
      ...sections,
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('catatan'), attrs: { for: noteId } }),
        note,
      ),
      stock,
      error,
    ),
    actions: [],
  });
  discountEntry.listenOn(handle.dialog);
  priceEntry.listenOn(handle.dialog);
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-line__foot' },
      remove,
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({ text: label('simpan'), onClick: save }),
    ),
  );
  quantityField.input.addEventListener('input', () => {
    quantityField.setError(undefined);
    error.textContent = '';
    paint();
  });
  quantityField.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  });
  paint();
}
