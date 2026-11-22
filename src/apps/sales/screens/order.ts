import '../../../styles/mobile-sales.css';
import { el } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { checkReceivable } from '../../../shared/data/receivable';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import type { PaymentMethod, Product } from '../../../shared/data/types';
import { preferredUnit, type OrderLineDraft } from '../../../shared/domain/orders';
import { parseQuantity } from '../../../shared/domain/transfer';
import { createActionBar } from '../../../shared/ui/action-bar';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { createMobBadge, createMobCard } from '../../../shared/ui/mobile-card';
import { createProductSearch } from '../../../shared/ui/product-search';
import { openSheet } from '../../../shared/ui/sheet';
import { createStepper } from '../../../shared/ui/stepper';
import { showToast } from '../../../shared/ui/toast';
import type { ApprovalWarning } from '../domain/approval';
import { TIER_LABELS } from '../domain/catalog';
import { creditSummary, creditWarning, overdueBanner } from '../domain/credit';
import {
  changeUnit,
  draftTotals,
  formatPriceInput,
  lineView,
  patchLine,
  priceFromInput,
  replaceLine,
  withoutLine,
} from '../domain/order-lines';
import type { Failure } from '../sales-session';
import type { SalesScreen } from './screen-type';

const METHODS: readonly (readonly [PaymentMethod, LabelKey])[] = [
  ['tunai', 'metodeTunai'],
  ['qris', 'metodeQris'],
  ['transfer', 'metodeTransfer'],
  ['dp', 'metodeDp'],
  ['piutang', 'metodePiutang'],
];

const MAX_QUANTITY = 1_000_000;

const isCredit = (method: PaymentMethod): boolean => method === 'piutang' || method === 'dp';

export const renderOrder: SalesScreen = (session, go, _query, shell) => {
  shell.setTitle(label('trxJudulSo'));
  shell.setBack('/sales/katalog');
  const store = session.store;
  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const lines = (): readonly OrderLineDraft[] => session.state().draft.lines;
  const draft = () => session.state().draft;
  const totals = () => draftTotals(lines(), lookup, session.tier());
  const customerOf = () =>
    store.getState().data.customers.find((item) => item.id === draft().customerId);
  const downPayment = (): number => Number(draft().downPayment.replace(/\D/g, '') || '0');

  const customer = createSelectField({
    labelText: label('pelanggan'),
    options: [
      { value: '', text: label('pelangganUmum') },
      ...store.getState().data.customers.map((item) => ({ value: item.id, text: item.name })),
    ],
    value: draft().customerId,
  });
  const customerInfo = el('div', { className: 'sls-info' });
  const customerNotes = el('div', { className: 'sls-notes' });
  const linesBox = el('div', { className: 'sls-lines' });
  const emptyBox = el('p', { className: 'sls-empty', text: mt('slsBelumAdaBarang') });
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const total = el('output', { className: 'trx-bar__value' });
  const payNote = el('p', { className: 'sls-note' });
  const offlineNote = el('p', { className: 'sls-summary__note' });
  const down = createTextField({ labelText: label('uangMuka'), inputMode: 'numeric' });
  down.input.value = draft().downPayment;
  const method = createSelectField({
    labelText: label('caraBayar'),
    options: METHODS.map(([value, key]) => ({ value, text: label(key) })),
    value: draft().payment,
  });
  method.select.addEventListener('change', () => {
    session.setDraft({ payment: method.select.value as PaymentMethod });
    error.textContent = '';
    paintPayment();
  });

  let shownNotes = '';
  const paintCustomer = (): void => {
    const selected = customerOf();
    const summary = selected === undefined ? undefined : creditSummary(selected, session.now());
    customerInfo.replaceChildren(
      ...(summary === undefined
        ? []
        : [
            el('p', {
              className: 'sls-info__line',
              text: label('slsLimitPiutang', {
                limit: formatRupiah(summary.limit),
                terpakai: formatRupiah(summary.outstanding),
                sisa: formatRupiah(Math.max(0, summary.remaining)),
              }),
            }),
          ]),
    );
    const notes: string[] = [];
    const credit = isCredit(draft().payment);
    if (selected === undefined) {
      if (credit) {
        notes.push(message('MSG-034'));
      }
    } else if (summary !== undefined) {
      const late = overdueBanner(summary, credit);
      if (late !== undefined) {
        notes.push(late);
      }
      if (credit) {
        const decision = checkReceivable(
          selected,
          Math.max(0, totals().total - (draft().payment === 'dp' ? downPayment() : 0)),
          session.now(),
        );
        const warning = creditWarning(decision, selected, session.now());
        if (warning?.reason === 'over-limit') {
          notes.push(warning.text);
        }
      }
    }
    // Banner digambar ulang hanya bila teksnya berubah agar pembaca layar tidak mengulang pengumuman.
    const key = notes.join(' | ');
    if (key !== shownNotes) {
      shownNotes = key;
      customerNotes.replaceChildren(...notes.map((text) => createBanner('warning', text)));
    }
  };

  const paintSummary = (): void => {
    const sum = totals();
    total.textContent = formatRupiah(sum.total);
    const online = store.getState().online;
    offlineNote.textContent = online ? '' : label('slsOfflineSimpan');
    const method = draft().payment;
    payNote.textContent =
      method === 'dp'
        ? `${label('sisaTagihan')}: ${formatRupiah(Math.max(0, sum.total - downPayment()))}`
        : method === 'piutang'
          ? label('slsPiutangPenuh')
          : '';
    payNote.hidden = payNote.textContent === '';
    paintCustomer();
  };

  const paintPayment = (): void => {
    method.select.value = draft().payment;
    down.root.hidden = draft().payment !== 'dp';
    paintSummary();
  };

  const renderLine = (line: OrderLineDraft, index: number): HTMLElement => {
    const product = lookup(line.productId);
    if (product === undefined) {
      return el('div');
    }
    const current = (): OrderLineDraft => lines()[index] ?? line;
    const view = () => lineView(product, current(), session.tier());

    const stepper = createStepper({
      labelText: `${label('jumlah')} ${product.name}`,
      value: parseQuantity(line.quantity) ?? 1,
      min: product.allowDecimal ? 0.001 : 1,
      max: MAX_QUANTITY,
      step: 1,
      onChange: (value) => {
        session.setDraft({
          lines: patchLine(lines(), index, { quantity: String(value).replace('.', ',') }),
        });
        stepper.element.querySelector('input')?.removeAttribute('aria-invalid');
        error.textContent = '';
        refresh();
      },
    });
    const unit = createSelectField({
      labelText: label('kolomSatuan'),
      options: product.units.map((item) => ({ value: item.code, text: item.code })),
      value: line.unit,
    });
    unit.select.addEventListener('change', () => {
      session.setDraft({
        lines: replaceLine(lines(), index, changeUnit(current(), unit.select.value)),
      });
      renderLines();
    });

    const price = createTextField({
      labelText: label('slsHargaPerSatuan', { satuan: line.unit }),
      inputMode: 'numeric',
    });
    const money = el(
      'div',
      { className: 'sls-money' },
      el('span', { className: 'sls-money__prefix', text: 'Rp', attrs: { 'aria-hidden': 'true' } }),
    );
    price.input.replaceWith(money);
    money.append(price.input);
    price.input.value = formatDecimal(view().price, 0);
    price.input.setAttribute('autocomplete', 'off');
    price.input.addEventListener('input', () => {
      const formatted = formatPriceInput(price.input.value);
      price.input.value = formatted;
      const next = priceFromInput(formatted, view().listPrice);
      session.setDraft({ lines: patchLine(lines(), index, { price: next }) });
      price.setError(next !== undefined && Number(next) <= 0 ? message('MSG-066') : undefined);
      error.textContent = '';
      refresh();
    });
    price.input.addEventListener('blur', () => {
      price.input.value =
        price.input.value === '' ? formatDecimal(view().listPrice, 0) : price.input.value;
    });

    const flags = el('div', { className: 'sls-line__flags' });
    const hint = el('p', { className: 'sls-line__hint' });
    const restore = createButton({
      text: label('pulihkanHarga'),
      variant: 'secondary',
      icon: 'refresh-cw',
      onClick: () => {
        session.setDraft({ lines: patchLine(lines(), index, { price: undefined }) });
        price.input.value = formatDecimal(view().listPrice, 0);
        price.setError(undefined);
        refresh();
      },
    });
    restore.classList.add('sls-line__restore');
    const sum = el('output', { className: 'sls-line__sum' });
    const remove = el(
      'button',
      {
        className: 'sls-icon-button',
        attrs: { type: 'button', 'aria-label': `${label('hapus')} ${product.name}` },
      },
      icon('trash-2'),
    );
    remove.addEventListener('click', () => {
      session.setDraft({ lines: withoutLine(lines(), index) });
      renderLines();
    });

    const refresh = (): void => {
      const now = view();
      sum.textContent = formatRupiah(now.subtotal);
      hint.textContent = label('slsHargaTier', {
        tier: label(TIER_LABELS[session.tier()]),
        harga: formatRupiah(now.listPrice),
      });
      restore.hidden = !now.changed;
      flags.replaceChildren(
        ...(now.changed ? [createMobBadge(label('slsHargaDiubah'), 'info', 'pencil')] : []),
        ...(now.below ? [createMobBadge(label('slsDiBawahTier'), 'bahaya', 'triangle-alert')] : []),
      );
      paintSummary();
    };

    const article = el(
      'article',
      { className: 'mob-card sls-line', attrs: { 'data-line': String(index) } },
      el(
        'div',
        { className: 'sls-line__head' },
        el(
          'div',
          { className: 'sls-line__id' },
          el('h2', { className: 'sls-line__name', text: product.name }),
          el('p', { className: 'sls-line__code', text: `[${product.code}] ${product.category}` }),
        ),
        remove,
      ),
      el(
        'div',
        { className: 'sls-line__grid' },
        el(
          'div',
          { className: 'field' },
          el('span', { className: 'field__label', text: label('jumlah') }),
          stepper.element,
        ),
        unit.root,
      ),
      price.root,
      el('div', { className: 'sls-line__meta' }, hint, restore, flags),
      el('div', { className: 'sls-line__total' }, el('span', { text: label('slsSubtotal') }), sum),
    );
    refresh();
    return article;
  };

  const renderLines = (): void => {
    const rows = lines();
    linesBox.replaceChildren(...rows.map(renderLine));
    emptyBox.hidden = rows.length > 0;
    paintSummary();
  };

  const picker = createProductSearch(
    label('trxCariBarang'),
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

  const failureText = (result: Failure): string =>
    'messageId' in result ? message(result.messageId, result.values) : label(result.labelKey);

  const askApproval = (warning: ApprovalWarning): void => {
    openSheet({
      title: label(
        warning.reasons.some((reason) => reason !== 'below-list')
          ? 'validasiPiutang'
          : 'slsPersetujuanHarga',
      ),
      body: el(
        'div',
        { className: 'own-form sls-ask' },
        createBanner('warning', warning.text),
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
        return 'warning' in requested ? requested.warning.text : failureText(requested);
      },
    });
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
        askApproval(result.warning);
        return;
      }
      error.textContent = failureText(result);
      if ('line' in result && result.line !== undefined) {
        const card = linesBox.querySelector<HTMLElement>(`[data-line="${String(result.line)}"]`);
        const target =
          'messageId' in result && result.messageId === 'MSG-066'
            ? card?.querySelector<HTMLElement>('.sls-money input')
            : card?.querySelector<HTMLElement>('.stepper__input');
        target?.setAttribute('aria-invalid', 'true');
        target?.focus();
      }
    },
  });

  save.classList.add('trx-bar__save');

  down.input.addEventListener('input', () => {
    session.setDraft({ downPayment: down.input.value });
    error.textContent = '';
    paintSummary();
  });
  customer.select.addEventListener('change', () => {
    session.setDraft({ customerId: customer.select.value });
    error.textContent = '';
    renderLines();
  });

  // Yang diisi lebih dahulu hanya nama pelanggan dan cara bayar, baru rincian barang (sama dengan Owner).
  const customerCard = createMobCard({
    className: 'sls-customer',
    body: [customer.root, method.root, down.root, payNote, customerInfo, customerNotes],
  });
  const summary = createActionBar(label('totalSo'), total, error, save, offlineNote);

  const element = el(
    'div',
    { className: 'own-stack sls-screen trx-form' },
    customerCard,
    createMobCard({
      title: label('trxDaftarBarang'),
      iconName: 'package',
      className: 'sls-picker',
      body: [el('div', { className: 'mob-stack' }, picker.root, emptyBox)],
    }),
    linesBox,
    summary,
  );
  const stop = store.subscribe(paintSummary);
  paintPayment();
  renderLines();
  return { element, destroy: stop };
};
