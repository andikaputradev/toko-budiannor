import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { PaymentMethod, Product, WarehouseId } from '../../../shared/data/types';
import { unitPrice } from '../../../shared/data/units';
import { parseQuantity } from '../../../shared/domain/transfer';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import {
  preferredUnit,
  suggestedCost,
  type OrderLineDraft,
  type PurchaseLineDraft,
} from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from '../screen';
import { openOwnerPin } from './approvals';

const METHODS: readonly (readonly [
  PaymentMethod,
  'metodeTunai' | 'metodeQris' | 'metodeTransfer' | 'metodeDp' | 'metodePiutang',
])[] = [
  ['tunai', 'metodeTunai'],
  ['qris', 'metodeQris'],
  ['transfer', 'metodeTransfer'],
  ['dp', 'metodeDp'],
  ['piutang', 'metodePiutang'],
];

function bump(raw: string): string {
  return String((parseQuantity(raw) ?? 0) + 1).replace('.', ',');
}

export function renderSalesForm(session: OwnerSession): ScreenHandle {
  const store = session.store;
  let lines: OrderLineDraft[] = [];
  let payment: PaymentMethod = 'tunai';

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const customer = createSelectField({
    labelText: label('pelanggan'),
    options: [
      { value: '', text: label('pelangganUmum') },
      ...store.getState().data.customers.map((item) => ({ value: item.id, text: item.name })),
    ],
  });
  const method = createSelectField({
    labelText: label('caraBayar'),
    options: METHODS.map(([value, key]) => ({ value, text: label(key) })),
  });
  const down = createTextField({ labelText: label('uangMuka'), inputMode: 'numeric' });
  const linesBox = el('div', { className: 'own-stack' });
  const total = el('output', { className: 'own-card__number' });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const history = el('div', { className: 'own-stack' });

  const tier = (): 'eceran' | 'grosir' | 'kontraktor' =>
    store.getState().data.customers.find((item) => item.id === customer.select.value)?.tier ??
    'eceran';

  const subtotal = (line: OrderLineDraft): number => {
    const product = lookup(line.productId);
    const quantity = parseQuantity(line.quantity);
    return product === undefined || quantity === undefined
      ? 0
      : Math.round(quantity * unitPrice(product, line.unit, tier()));
  };

  const paintTotal = (): void => {
    total.textContent = formatRupiah(lines.reduce((sum, line) => sum + subtotal(line), 0));
  };

  const renderLines = (): void => {
    linesBox.replaceChildren(
      ...lines.map((line, index) => {
        const product = lookup(line.productId);
        if (product === undefined) {
          return el('div');
        }
        const quantity = el('input', {
          className: 'input',
          attrs: {
            inputmode: 'decimal',
            autocomplete: 'off',
            'aria-label': `${label('jumlah')} ${product.name}`,
            'data-line': String(index),
          },
        });
        quantity.value = line.quantity;
        const sum = el('output', { className: 't-value', text: formatRupiah(subtotal(line)) });
        quantity.addEventListener('input', () => {
          lines = lines.map((item, position) =>
            position === index ? { ...item, quantity: quantity.value } : item,
          );
          quantity.removeAttribute('aria-invalid');
          error.textContent = '';
          sum.textContent = formatRupiah(subtotal(lines[index] ?? line));
          paintTotal();
        });
        const unit = el(
          'select',
          {
            className: 'input',
            attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
          },
          ...product.units.map((item) =>
            el('option', { text: item.code, attrs: { value: item.code } }),
          ),
        );
        unit.value = line.unit;
        unit.addEventListener('change', () => {
          lines = lines.map((item, position) =>
            position === index ? { ...item, unit: unit.value } : item,
          );
          renderLines();
        });
        const remove = createButton({
          text: label('hapus'),
          variant: 'secondary',
          icon: 'trash-2',
          onClick: () => {
            lines = lines.filter((_, position) => position !== index);
            renderLines();
          },
        });
        remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
        return el(
          'article',
          { className: 'own-card own-card--line' },
          el('h2', { className: 'own-card__name', text: product.name }),
          el('div', { className: 'own-grid-2' }, quantity, unit),
          el('div', { className: 'own-row' }, sum, remove),
        );
      }),
    );
    paintTotal();
  };

  const picker = createProductPicker(
    label('cariBarang'),
    () => store.getState().data.products,
    (product) => {
      const unit = preferredUnit(product);
      const found = lines.findIndex((line) => line.productId === product.id && line.unit === unit);
      lines =
        found >= 0
          ? lines.map((line, index) =>
              index === found ? { ...line, quantity: bump(line.quantity) } : line,
            )
          : [...lines, { productId: product.id, unit, quantity: '1' }];
      error.textContent = '';
      renderLines();
    },
  );

  const draft = () => ({
    customerId: customer.select.value,
    lines,
    payment,
    downPayment: down.input.value,
  });

  const finish = (number: string): void => {
    showToast({ kind: 'success', text: label('soTersimpan', { nomor: number }) });
    lines = [];
    down.input.value = '';
    renderLines();
    paintHistory();
  };

  const save = createButton({
    text: label('simpanSo'),
    icon: 'save',
    onClick: () => {
      error.textContent = '';
      const result = session.saveSalesOrder(draft());
      if (result.ok) {
        finish(result.number);
        return;
      }
      if ('approval' in result) {
        openOwnerPin(session, {
          title: label('otorisasiJudul'),
          intro: message(result.approval, result.values),
          submitText: label('setujui'),
          run: (reason, pin) => {
            const approved = session.saveSalesOrder(draft(), { reason, pin });
            if (approved.ok) {
              finish(approved.number);
              return undefined;
            }
            if ('approval' in approved) {
              return message(approved.approval, approved.values);
            }
            return 'messageId' in approved
              ? message(approved.messageId, approved.values)
              : label(approved.labelKey);
          },
        });
        return;
      }
      error.textContent =
        'messageId' in result ? message(result.messageId, result.values) : label(result.labelKey);
      if ('line' in result && result.line !== undefined) {
        const target = document.querySelector<HTMLElement>(`[data-line="${String(result.line)}"]`);
        target?.setAttribute('aria-invalid', 'true');
        target?.focus();
      }
    },
  });

  const paintHistory = (): void => {
    const orders = [...store.getState().salesOrders].reverse();
    history.replaceChildren(
      el('h2', { className: 't-section-title', text: label('riwayatSo') }),
      ...(orders.length === 0
        ? [el('p', { className: 't-label', text: label('belumAdaSo') })]
        : orders.map((order) =>
            el(
              'article',
              { className: 'own-card' },
              el('h3', { className: 'own-card__name', text: order.number }),
              el('p', { className: 't-label', text: label('statusDraf') }),
              el('p', { className: 't-value', text: formatRupiah(order.total) }),
            ),
          )),
    );
  };

  const syncDown = (): void => {
    down.root.toggleAttribute('hidden', payment !== 'dp');
  };
  method.select.addEventListener('change', () => {
    payment = method.select.value as PaymentMethod;
    syncDown();
    error.textContent = '';
  });
  customer.select.addEventListener('change', () => {
    renderLines();
    error.textContent = '';
  });

  const stop = store.subscribe(() => undefined);
  const element = el(
    'div',
    { className: 'own-stack' },
    customer.root,
    picker.root,
    linesBox,
    method.root,
    down.root,
    el('p', { className: 't-label', text: label('totalSo') }),
    total,
    error,
    save,
    history,
  );
  syncDown();
  renderLines();
  paintHistory();
  return {
    element,
    destroy: () => {
      stop();
    },
  };
}

export function renderPurchaseForm(
  session: OwnerSession,
  initialCode: string | null,
): ScreenHandle {
  const store = session.store;
  let lines: PurchaseLineDraft[] = [];

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const supplier = createSelectField({
    labelText: label('pemasok'),
    options: [
      { value: '', text: label('pilihPemasok') },
      ...store.getState().data.suppliers.map((item) => ({ value: item.id, text: item.name })),
    ],
  });
  const warehouse = createSelectField({
    labelText: label('gudangPenerima'),
    options: [
      { value: '', text: label('pilihGudangPenerima') },
      { value: 'display', text: label('namaGudangDisplay') },
      { value: 'besar', text: label('namaGudangBesar') },
    ],
  });
  const linesBox = el('div', { className: 'own-stack' });
  const total = el('output', { className: 'own-card__number' });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const history = el('div', { className: 'own-stack' });

  const subtotal = (line: PurchaseLineDraft): number =>
    Math.round(
      (parseQuantity(line.quantity) ?? 0) * Number(line.unitPrice.replace(/\D/g, '') || '0'),
    );
  const paintTotal = (): void => {
    total.textContent = formatRupiah(lines.reduce((sum, line) => sum + subtotal(line), 0));
  };

  const renderLines = (): void => {
    linesBox.replaceChildren(
      ...lines.map((line, index) => {
        const product = lookup(line.productId);
        if (product === undefined) {
          return el('div');
        }
        const sum = el('output', { className: 't-value', text: formatRupiah(subtotal(line)) });
        const make = (
          field: 'quantity' | 'unitPrice',
          aria: string,
          mode: 'decimal' | 'numeric',
        ): HTMLInputElement => {
          const input = el('input', {
            className: 'input',
            attrs: {
              inputmode: mode,
              autocomplete: 'off',
              'aria-label': `${aria} ${product.name}`,
              'data-line': field === 'quantity' ? String(index) : undefined,
              'data-price': field === 'unitPrice' ? String(index) : undefined,
            },
          });
          input.value = line[field];
          input.addEventListener('input', () => {
            lines = lines.map((item, position) =>
              position === index ? { ...item, [field]: input.value } : item,
            );
            input.removeAttribute('aria-invalid');
            error.textContent = '';
            sum.textContent = formatRupiah(subtotal(lines[index] ?? line));
            paintTotal();
          });
          return input;
        };
        const unit = el(
          'select',
          {
            className: 'input',
            attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
          },
          ...product.units.map((item) =>
            el('option', { text: item.code, attrs: { value: item.code } }),
          ),
        );
        unit.value = line.unit;
        unit.addEventListener('change', () => {
          lines = lines.map((item, position) =>
            position === index
              ? { ...item, unit: unit.value, unitPrice: String(suggestedCost(product, unit.value)) }
              : item,
          );
          renderLines();
        });
        const remove = createButton({
          text: label('hapus'),
          variant: 'secondary',
          icon: 'trash-2',
          onClick: () => {
            lines = lines.filter((_, position) => position !== index);
            renderLines();
          },
        });
        remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
        return el(
          'article',
          { className: 'own-card own-card--line' },
          el('h2', { className: 'own-card__name', text: product.name }),
          el(
            'div',
            { className: 'own-grid-2' },
            make('quantity', label('jumlah'), 'decimal'),
            unit,
          ),
          make('unitPrice', label('hargaBeli'), 'numeric'),
          el('div', { className: 'own-row' }, sum, remove),
        );
      }),
    );
    paintTotal();
  };

  const add = (product: Product): void => {
    const unit = preferredUnit(product);
    const found = lines.findIndex((line) => line.productId === product.id && line.unit === unit);
    lines =
      found >= 0
        ? lines.map((line, index) =>
            index === found ? { ...line, quantity: bump(line.quantity) } : line,
          )
        : [
            ...lines,
            {
              productId: product.id,
              unit,
              quantity: '1',
              unitPrice: String(suggestedCost(product, unit)),
            },
          ];
    error.textContent = '';
    renderLines();
  };

  const picker = createProductPicker(
    label('cariBarang'),
    () => store.getState().data.products,
    add,
  );

  const paintHistory = (): void => {
    const orders = [...store.getState().purchaseOrders].reverse();
    history.replaceChildren(
      el('h2', { className: 't-section-title', text: label('riwayatPo') }),
      ...(orders.length === 0
        ? [el('p', { className: 't-label', text: label('belumAdaPo') })]
        : orders.map((order) =>
            el(
              'article',
              { className: 'own-card' },
              el('h3', { className: 'own-card__name', text: order.number }),
              el('p', {
                className: 't-label',
                text: `${store.getState().data.suppliers.find((item) => item.id === order.supplierId)?.name ?? order.supplierId} · ${label('statusDipesan')}`,
              }),
              el('p', { className: 't-value', text: formatRupiah(order.total) }),
            ),
          )),
    );
  };

  const save = createButton({
    text: label('simpanPo'),
    icon: 'save',
    onClick: () => {
      error.textContent = '';
      const result = session.savePurchaseOrder({
        supplierId: supplier.select.value,
        warehouse: warehouse.select.value as '' | WarehouseId,
        lines,
      });
      if (result.ok) {
        showToast({ kind: 'success', text: label('poTersimpan', { nomor: result.number }) });
        lines = [];
        renderLines();
        paintHistory();
        return;
      }
      error.textContent =
        'messageId' in result ? message(result.messageId, result.values) : label(result.labelKey);
      if ('line' in result && result.line !== undefined) {
        const target = document.querySelector<HTMLElement>(
          `[data-line="${String(result.line)}"], [data-price="${String(result.line)}"]`,
        );
        target?.setAttribute('aria-invalid', 'true');
        target?.focus();
      }
    },
  });

  const element = el(
    'div',
    { className: 'own-stack' },
    supplier.root,
    warehouse.root,
    picker.root,
    linesBox,
    el('p', { className: 't-label', text: label('totalPo') }),
    total,
    error,
    save,
    history,
  );
  if (initialCode !== null) {
    const product = store.getState().data.products.find((item) => item.code === initialCode);
    if (product !== undefined) {
      add(product);
    }
  }
  renderLines();
  paintHistory();
  return { element, destroy: () => undefined };
}
