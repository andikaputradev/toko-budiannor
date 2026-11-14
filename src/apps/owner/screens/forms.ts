import '../../../styles/mobile-owner.css';
import type { PaymentMethod, Product, Tier, WarehouseId } from '../../../shared/data/types';
import { remainingLimit } from '../../../shared/data/receivable';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import { suggestedCost, type SalesOrderDraft } from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { openOwnerPin } from './approvals';
import { createLineEditor, type LineEditor } from './line-editor';
import { createProductSearch } from './product-search';

const BACK = '/owner/transaksi';

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

const TIER_LABELS: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
};

// Bilah bawah yang menempel: total dan tombol simpan tetap terlihat saat daftar barang panjang.
function createActionBar(
  totalLabel: string,
  total: HTMLElement,
  error: HTMLElement,
  save: HTMLElement,
): HTMLElement {
  return el(
    'div',
    { className: 'trx-bar' },
    error,
    el(
      'div',
      { className: 'trx-bar__row' },
      el(
        'div',
        { className: 'trx-bar__total' },
        el('span', { className: 'trx-bar__label', text: totalLabel }),
        total,
      ),
      save,
    ),
  );
}

export function renderSalesForm(
  session: OwnerSession,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('trxJudulSo'));
  shell?.setBack(BACK);
  const store = session.store;
  let payment: PaymentMethod = 'tunai';
  const ref: { editor?: LineEditor } = {};

  const data = () => store.getState().data;
  const customerOf = () => data().customers.find((item) => item.id === customer.select.value);
  const tierOf = (): Tier => customerOf()?.tier ?? 'eceran';

  const customer = createSelectField({
    labelText: label('pelanggan'),
    options: [
      { value: '', text: label('pelangganUmum') },
      ...data().customers.map((item) => ({ value: item.id, text: `${item.name} (${item.code})` })),
    ],
  });
  const customerInfo = el('div', { className: 'trx-chips' });
  const method = createSelectField({
    labelText: label('caraBayar'),
    options: METHODS.map(([value, key]) => ({ value, text: label(key) })),
  });
  const down = createTextField({ labelText: label('uangMuka'), inputMode: 'numeric' });
  const total = el('output', { className: 'trx-bar__value', text: formatRupiah(0) });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });

  const paintTotal = (): void => {
    total.textContent = formatRupiah(ref.editor?.total() ?? 0);
    error.textContent = '';
  };

  const paintInfo = (): void => {
    const current = customerOf();
    customerInfo.replaceChildren(
      createMobBadge(label('trxKategoriHarga', { tier: label(TIER_LABELS[tierOf()]) }), 'info'),
      ...(current === undefined
        ? []
        : [
            createMobBadge(
              label('trxSisaLimit', { nilai: formatRupiah(Math.max(0, remainingLimit(current))) }),
              remainingLimit(current) > 0 ? 'netral' : 'bahaya',
            ),
          ]),
    );
  };

  const lines = createLineEditor({
    lookup: (id) => data().products.find((item) => item.id === id),
    listPrice: (product: Product, unit: string) => product.prices[unit]?.[tierOf()] ?? 0,
    priceLabel: label('kolomHarga'),
    onChange: paintTotal,
  });
  ref.editor = lines;

  const picker = createProductSearch(
    label('trxCariBarang'),
    () => data().products,
    (product) => {
      lines.add(product);
    },
  );

  const draft = (): SalesOrderDraft => ({
    customerId: customer.select.value,
    lines: lines.lines().map((line) => ({
      productId: line.productId,
      unit: line.unit,
      quantity: line.quantity,
      price: line.price,
    })),
    payment,
    downPayment: down.input.value,
  });

  const finish = (number: string): void => {
    showToast({ kind: 'success', text: label('soTersimpan', { nomor: number }) });
    go(BACK);
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
            return 'approval' in approved
              ? message(approved.approval, approved.values)
              : failureText(approved);
          },
        });
        return;
      }
      error.textContent = failureText(result);
      if ('line' in result && result.line !== undefined) {
        lines.markInvalid(
          result.line,
          'messageId' in result && result.messageId === 'MSG-080' ? 'price' : 'quantity',
        );
      }
    },
  });
  save.classList.add('trx-bar__save');

  const syncMethod = (): void => {
    down.root.toggleAttribute('hidden', payment !== 'dp');
  };
  method.select.addEventListener('change', () => {
    payment = method.select.value as PaymentMethod;
    syncMethod();
    error.textContent = '';
  });
  customer.select.addEventListener('change', () => {
    paintInfo();
    lines.refresh();
  });

  const element = el(
    'div',
    { className: 'own-stack trx-form' },
    createMobCard({
      body: [el('div', { className: 'mob-stack' }, customer.root, customerInfo)],
    }),
    createMobCard({
      title: label('trxDaftarBarang'),
      iconName: 'package',
      body: [el('div', { className: 'mob-stack' }, picker.root, lines.element)],
    }),
    createMobCard({
      title: label('trxPembayaran'),
      iconName: 'wallet',
      body: [el('div', { className: 'mob-stack' }, method.root, down.root)],
    }),
    createActionBar(label('kolomTotal'), total, error, save),
  );
  syncMethod();
  paintInfo();
  paintTotal();
  return { element, destroy: () => undefined };
}

export function renderPurchaseForm(
  session: OwnerSession,
  initialCode: string | null,
  go: (path: string) => void,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('trxJudulPo'));
  shell?.setBack(BACK);
  const store = session.store;
  const ref: { editor?: LineEditor } = {};
  const data = () => store.getState().data;

  const supplier = createSelectField({
    labelText: label('pemasok'),
    options: [
      { value: '', text: label('pilihPemasok') },
      ...data().suppliers.map((item) => ({ value: item.id, text: item.name })),
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
  const total = el('output', { className: 'trx-bar__value', text: formatRupiah(0) });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });

  const paintTotal = (): void => {
    total.textContent = formatRupiah(ref.editor?.total() ?? 0);
    error.textContent = '';
  };

  const lines = createLineEditor({
    lookup: (id) => data().products.find((item) => item.id === id),
    listPrice: (product, unit) => suggestedCost(product, unit),
    priceLabel: label('hargaBeli'),
    onChange: paintTotal,
  });
  ref.editor = lines;

  const picker = createProductSearch(
    label('trxCariBarang'),
    () => data().products,
    (product) => {
      lines.add(product);
    },
  );

  const save = createButton({
    text: label('simpanPo'),
    icon: 'save',
    onClick: () => {
      error.textContent = '';
      const result = session.savePurchaseOrder({
        supplierId: supplier.select.value,
        warehouse: warehouse.select.value as '' | WarehouseId,
        lines: lines.lines().map((line) => {
          const product = data().products.find((item) => item.id === line.productId);
          return {
            productId: line.productId,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice:
              line.price ?? String(product === undefined ? 0 : suggestedCost(product, line.unit)),
          };
        }),
      });
      if (result.ok) {
        showToast({ kind: 'success', text: label('poTersimpan', { nomor: result.number }) });
        go(BACK);
        return;
      }
      error.textContent = failureText(result);
      if ('line' in result && result.line !== undefined) {
        lines.markInvalid(
          result.line,
          'messageId' in result && result.messageId === 'MSG-080' ? 'price' : 'quantity',
        );
      }
    },
  });
  save.classList.add('trx-bar__save');

  const element = el(
    'div',
    { className: 'own-stack trx-form' },
    createMobCard({
      body: [el('div', { className: 'mob-stack' }, supplier.root, warehouse.root)],
    }),
    createMobCard({
      title: label('trxDaftarBarang'),
      iconName: 'package',
      body: [el('div', { className: 'mob-stack' }, picker.root, lines.element)],
    }),
    createActionBar(label('kolomTotal'), total, error, save),
  );
  if (initialCode !== null) {
    const product = data().products.find((item) => item.code === initialCode);
    if (product !== undefined) {
      lines.add(product);
    }
  }
  paintTotal();
  return { element, destroy: () => undefined };
}
