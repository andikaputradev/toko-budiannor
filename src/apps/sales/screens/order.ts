import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { PaymentMethod, Product, Tier } from '../../../shared/data/types';
import { unitPrice } from '../../../shared/data/units';
import { preferredUnit, type OrderLineDraft } from '../../../shared/domain/orders';
import { parseQuantity } from '../../../shared/domain/transfer';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { createProductPicker } from '../../../shared/ui/product-picker';
import type { ScreenHandle } from '../../../shared/ui/screen';
import { openSheet } from '../../../shared/ui/sheet';
import { showToast } from '../../../shared/ui/toast';
import type { SalesSession } from '../sales-session';

const METHODS: readonly (readonly [PaymentMethod, LabelKey])[] = [
  ['tunai', 'metodeTunai'],
  ['qris', 'metodeQris'],
  ['transfer', 'metodeTransfer'],
  ['dp', 'metodeDp'],
  ['piutang', 'metodePiutang'],
];

const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
  kontraktor: 'tierKontraktor',
};

export function renderOrder(session: SalesSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const lines = (): readonly OrderLineDraft[] => session.state().draft.lines;

  const customer = createSelectField({
    labelText: label('pelanggan'),
    options: [
      { value: '', text: label('pelangganUmum') },
      ...store.getState().data.customers.map((item) => ({ value: item.id, text: item.name })),
    ],
    value: session.state().draft.customerId,
  });
  const method = createSelectField({
    labelText: label('caraBayar'),
    options: METHODS.map(([value, key]) => ({ value, text: label(key) })),
    value: session.state().draft.payment,
  });
  const down = createTextField({ labelText: label('uangMuka'), inputMode: 'numeric' });
  down.input.value = session.state().draft.downPayment;
  const tierNote = el('p', { className: 't-label' });
  const linesBox = el('div', { className: 'own-stack' });
  const total = el('output', { className: 'own-card__number' });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });

  const subtotal = (line: OrderLineDraft): number => {
    const product = lookup(line.productId);
    const quantity = parseQuantity(line.quantity);
    return product === undefined || quantity === undefined
      ? 0
      : Math.round(quantity * unitPrice(product, line.unit, session.tier()));
  };
  const paintTotal = (): void => {
    total.textContent = formatRupiah(lines().reduce((sum, line) => sum + subtotal(line), 0));
    tierNote.textContent = label('tierHargaNilai', { tier: label(TIER_LABELS[session.tier()]) });
  };

  const renderLines = (): void => {
    linesBox.replaceChildren(
      ...lines().map((line, index) => {
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
          session.setDraft({
            lines: lines().map((item, position) =>
              position === index ? { ...item, quantity: quantity.value } : item,
            ),
          });
          quantity.removeAttribute('aria-invalid');
          error.textContent = '';
          const current = lines()[index];
          sum.textContent = formatRupiah(current === undefined ? 0 : subtotal(current));
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
          session.setDraft({
            lines: lines().map((item, position) =>
              position === index ? { ...item, unit: unit.value } : item,
            ),
          });
          renderLines();
        });
        const remove = createButton({
          text: label('hapus'),
          variant: 'secondary',
          icon: 'trash-2',
          onClick: () => {
            session.setDraft({ lines: lines().filter((_, position) => position !== index) });
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
      session.addLine(product, preferredUnit(product));
      error.textContent = '';
      renderLines();
    },
  );

  const finish = (number: string, approval: boolean): void => {
    showToast({
      kind: 'success',
      text: label(approval ? 'soMenungguApproval' : 'soTersimpan', { nomor: number }),
    });
    go(`/sales/riwayat?so=${encodeURIComponent(number)}`);
  };

  const save = createButton({
    text: label('simpanSo'),
    icon: 'save',
    onClick: () => {
      error.textContent = '';
      const result = session.saveOrder();
      if (result.ok) {
        finish(result.number, result.approval);
        return;
      }
      if ('warning' in result) {
        openSheet({
          title: label('validasiPiutang'),
          body: el(
            'div',
            { className: 'own-form' },
            el('p', { text: result.warning.text }),
            el('p', { className: 't-label', text: label('ketPersetujuan') }),
          ),
          submitText: label('mintaPersetujuan'),
          cancelText: label('ubahOrder'),
          onSubmit: () => {
            const requested = session.saveOrder({ requestApproval: true });
            if (requested.ok) {
              finish(requested.number, requested.approval);
              return undefined;
            }
            if ('warning' in requested) {
              return requested.warning.text;
            }
            return 'messageId' in requested
              ? message(requested.messageId, requested.values)
              : label(requested.labelKey);
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

  const syncDown = (): void => {
    down.root.toggleAttribute('hidden', session.state().draft.payment !== 'dp');
  };
  method.select.addEventListener('change', () => {
    session.setDraft({ payment: method.select.value as PaymentMethod });
    syncDown();
    error.textContent = '';
  });
  down.input.addEventListener('input', () => {
    session.setDraft({ downPayment: down.input.value });
    error.textContent = '';
  });
  customer.select.addEventListener('change', () => {
    session.setDraft({ customerId: customer.select.value });
    renderLines();
    error.textContent = '';
  });

  const element = el(
    'div',
    { className: 'own-stack' },
    customer.root,
    tierNote,
    picker.root,
    linesBox,
    method.root,
    down.root,
    el('p', { className: 't-label', text: label('totalSo') }),
    total,
    error,
    save,
  );
  syncDown();
  renderLines();
  return { element, destroy: () => undefined };
}
