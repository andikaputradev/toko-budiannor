import '../../../styles/mobile-owner.css';
import type { PaymentMethod, Product, Tier } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import { createMobCard } from '../../../shared/ui/mobile-card';
import { createActionBar } from '../../../shared/ui/action-bar';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { createProductSearch } from '../../../shared/ui/product-search';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import { suggestedCost, type SalesOrderDraft } from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import type { OwnerShell } from '../shell';
import { openOwnerPin } from './approvals';
import { createLineEditor, type LineEditor } from './line-editor';

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
    lines.refresh();
  });

  const element = el(
    'div',
    { className: 'own-stack trx-form' },
    // Yang diisi lebih dahulu hanya nama pelanggan dan cara bayar, baru rincian barang.
    createMobCard({
      body: [el('div', { className: 'mob-stack' }, customer.root, method.root, down.root)],
    }),
    createMobCard({
      title: label('trxDaftarBarang'),
      iconName: 'package',
      body: [el('div', { className: 'mob-stack' }, picker.root, lines.element)],
    }),
    createActionBar(label('kolomTotal'), total, error, save),
  );
  syncMethod();
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
  const method = createSelectField({
    labelText: label('caraBayar'),
    // Cara bayar Purchase Order: tunai atau hutang (dibayar kemudian).
    options: [
      { value: 'tunai', text: label('metodeTunai') },
      { value: 'hutang', text: mt('metodeHutang') },
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
        // Barang pembelian masuk ke Gudang; pilihan gudang tidak ditanyakan di formulir HP.
        warehouse: 'besar',
        payment: method.select.value === 'hutang' ? 'hutang' : 'tunai',
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
      body: [el('div', { className: 'mob-stack' }, supplier.root, method.root)],
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
