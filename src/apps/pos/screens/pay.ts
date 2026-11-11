import { el, nextId } from '../../../shared/dom';
import { formatDate, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import { remainingLimit } from '../../../shared/data/receivable';
import type { PaidMethod, PaymentMethod } from '../../../shared/data/types';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import { createAmountEntry } from '../amount-entry';
import { DEFAULT_DUE_DAYS } from '../domain/forms';
import { cashSuggestions } from '../domain/payment';
import { MAX_SPLIT_PARTS, partOf } from '../domain/split';
import { dueDateOf, parseTermDays, TERM_CHOICES } from '../domain/terms';
import { PAYMENT_NOTE_MAX, type PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import { openAuthorizeModal } from './authorize';
import { openPaymentDone } from './payment-done';
import { createPaySummary } from './pay-summary';
import type { ScreenHandle } from './login';

type PayTab = 'tunai' | 'nontunai' | 'split' | 'piutang';

const TABS: readonly { readonly id: PayTab; readonly text: LabelKey }[] = [
  { id: 'tunai', text: 'tabTunai' },
  { id: 'nontunai', text: 'tabNonTunai' },
  { id: 'split', text: 'tabSplit' },
  { id: 'piutang', text: 'tabPiutang' },
];

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

// Non-tunai hanya tiga pilihan, tanpa kanal dan tanpa kode QR: QRIS dikonfirmasi manual oleh kasir.
const NON_CASH: readonly PaidMethod[] = ['qris', 'transfer', 'edc'];
const DP_METHODS: readonly PaidMethod[] = ['tunai', 'qris', 'edc', 'transfer'];

function plain(value: number): string {
  return formatRupiah(value).replace('Rp ', '');
}

function digitsOf(raw: string): number {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits === '' ? 0 : Number(digits);
}

function asPaid(method: PaymentMethod): PaidMethod {
  return method === 'dp' || method === 'piutang' ? 'tunai' : method;
}

// Tab awal mengikuti pembayaran yang sudah tersimpan di sesi (mis. kembali dari layar lain).
function initialTab(session: PosSession): PayTab {
  const state = session.state();
  if (state.method === 'piutang' || state.rows.some((row) => row.method === 'piutang')) {
    return 'piutang';
  }
  const paid = state.rows.filter((row) => row.method !== 'dp' && row.amount > 0);
  if (paid.length > 1) {
    return 'split';
  }
  return asPaid(state.method) === 'tunai' ? 'tunai' : 'nontunai';
}

export function renderPay(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulPembayaran');
  const summaryPane = createPaySummary(session);
  const dpId = nextId('dp');
  const daysId = nextId('hari');
  const noteId = nextId('catatan-bayar');
  let tab: PayTab = initialTab(session);
  let destroyed = false;
  let dpVia: PaidMethod = session.state().rows.find((row) => row.method === 'dp')?.via ?? 'tunai';

  const grand = el('output', { className: 't-total pos-pay__grand' });

  const methodGroup = (
    onPick: (method: PaidMethod) => void,
    name: LabelKey,
    methods: readonly PaidMethod[],
  ): HTMLDivElement => {
    const group = el('div', {
      className: 'pos-pay__methods',
      attrs: { role: 'group', 'aria-label': label(name) },
    });
    for (const method of methods) {
      const button = createButton({
        text: label(METHOD_LABELS[method]),
        variant: 'secondary',
        onClick: () => {
          onPick(method);
        },
      });
      button.dataset['method'] = method;
      button.classList.add('pos-pay__method');
      group.append(button);
    }
    return group;
  };

  const messageBox = el('div', { className: 'pos-pay__message', attrs: { 'aria-live': 'polite' } });
  const finish = createButton({
    text: label('bayar'),
    pay: true,
    onClick: () => {
      const sale = session.finish();
      if (sale === undefined) {
        return;
      }
      showToast({ kind: 'success', text: label('transaksiTersimpan', { nomor: sale.number }) });
      openPaymentDone(session, sale, go);
    },
  });

  // Catatan opsional dipakai bersama semua tab pembayaran dan ikut tersimpan pada penjualan.
  const noteInput = el('input', {
    className: 'input pos-pay__note-input',
    attrs: {
      id: noteId,
      type: 'text',
      maxlength: String(PAYMENT_NOTE_MAX),
      autocomplete: 'off',
    },
  });
  noteInput.value = session.state().paymentNote;
  noteInput.addEventListener('input', () => {
    session.setPaymentNote(noteInput.value);
  });
  const noteField = el(
    'div',
    { className: 'pos-pay__note' },
    el('label', {
      className: 'field__label',
      text: label('catatanPembayaran'),
      attrs: { for: noteId },
    }),
    noteInput,
  );

  // Tab Tunai: papan angka di halaman; Uang Pas dan dua pecahan di atas total.
  const entry = createAmountEntry({
    labelText: label('jumlahDiterima'),
    value: session.state().rows.find((row) => row.method === 'tunai')?.amount ?? 0,
    onChange: (value) => {
      session.setAmount('tunai', value);
    },
    onEnter: () => {
      if (entry.value() === 0) {
        session.exactAmount();
      } else {
        finish.focus();
      }
    },
    enabled: () =>
      tab === 'tunai' &&
      document.querySelector('.modal-overlay') === null &&
      document.activeElement !== noteInput,
  });
  const quickLabelId = nextId('nominal-penerimaan');
  const quickLabel = el('p', {
    className: 't-label pos-pay__quick-label',
    text: label('nominalPenerimaan'),
    attrs: { id: quickLabelId },
  });
  const quick = el('div', {
    className: 'pos-pay__quick',
    attrs: { role: 'group', 'aria-labelledby': quickLabelId },
  });
  let quickFor = -1;
  const paintQuick = (total: number): void => {
    if (quickFor === total) {
      return;
    }
    quickFor = total;
    const quickButton = (text: string, onClick: () => void): HTMLButtonElement =>
      createButton({ text, variant: 'secondary', onClick });
    quick.replaceChildren(
      quickButton(label('uangPas'), () => {
        session.exactAmount();
      }),
      ...cashSuggestions(total).map((amount) =>
        quickButton(plain(amount), () => {
          session.quickAmount(amount);
        }),
      ),
    );
  };
  const tunaiPanel = el(
    'div',
    { className: 'pos-pay__mode pos-pay__cash' },
    entry.element,
    quickLabel,
    quick,
  );

  // Tab Non-Tunai: tiga pilihan saja (QRIS, Transfer, EDC).
  const nonCash = methodGroup(
    (method) => {
      session.chooseSingle(method);
    },
    'kanalPembayaran',
    NON_CASH,
  );
  nonCash.classList.add('pos-pay__noncash');
  const nonCashNote = el('div', { className: 'pos-pay__noncash-note' });
  const nonCashPanel = el('div', { className: 'pos-pay__mode' }, nonCash, nonCashNote);

  // Tab Split: tiga slot tetap (Pembayaran 1 sampai 3); masing-masing membuka modal Pembayaran N.
  const parts = el('ul', { className: 'pos-pay__parts' });
  const splitPanel = el('div', { className: 'pos-pay__mode' }, parts);

  const sisa = el('output', { className: 't-total pos-pay__sisa' });
  const change = el('output', { className: 't-total pos-pay__change' });
  const result = el(
    'div',
    { className: 'pos-pay__result' },
    el(
      'div',
      { className: 'pos-pay__figure' },
      el('p', { className: 't-label', text: label('sisaBayar') }),
      sisa,
    ),
    el(
      'div',
      { className: 'pos-pay__figure' },
      el('p', { className: 't-label', text: label('kembalian') }),
      change,
    ),
  );

  const termChips = el('div', {
    className: 'pos-pay__terms',
    attrs: { role: 'group', 'aria-label': label('tempoLabel') },
  });
  const daysError = el('p', { className: 'pos-pay__error', attrs: { role: 'alert' } });
  for (const days of TERM_CHOICES) {
    const chip = createButton({
      text: label('tempoHari', { hari: days }),
      variant: 'secondary',
      onClick: () => {
        daysError.textContent = '';
        session.setTerms(days);
      },
    });
    chip.dataset['days'] = String(days);
    chip.classList.add('pos-pay__method');
    termChips.append(chip);
  }
  const dpMethods = methodGroup(
    (method) => {
      dpVia = method;
      session.setDownPayment(
        session.state().rows.find((row) => row.method === 'dp')?.amount ?? 0,
        dpVia,
      );
      paint();
    },
    'caraBayarDp',
    DP_METHODS,
  );
  const daysInput = el('input', {
    className: 'input pos-pay__days',
    attrs: { id: daysId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const dpInput = el('input', {
    className: 'input pos-pay__amount',
    attrs: { id: dpId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const dpOutput = el('output', { className: 'pos-pay__dp' });
  const dueAmount = el('output', { className: 't-total pos-pay__due-amount' });
  const dueDate = el('output', { className: 'pos-pay__due' });
  const limitText = el('p', { className: 't-label pos-pay__limit' });
  const figure = (key: LabelKey, output: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'pos-pay__figure' },
      el('p', { className: 't-label', text: label(key) }),
      output,
    );
  const field = (key: LabelKey, id: string, input: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'pos-pay__field' },
      el('label', { className: 'field__label', text: label(key), attrs: { for: id } }),
      input,
    );
  // Piutang dua kolom: tempo di kiri, uang muka di kanan, lalu tiga angka ringkasan.
  const piutangPanel = el(
    'div',
    { className: 'pos-pay__mode pos-pay__credit' },
    el(
      'div',
      { className: 'pos-pay__credit-col' },
      termChips,
      field('hariLainnya', daysId, daysInput),
      daysError,
    ),
    el('div', { className: 'pos-pay__credit-col' }, field('dpLabel', dpId, dpInput), dpMethods),
    el(
      'div',
      { className: 'pos-pay__figures' },
      figure('uangMuka', dpOutput),
      figure('sisaTagihan', dueAmount),
      figure('jatuhTempo', dueDate),
    ),
    limitText,
  );

  const panels: Readonly<Record<PayTab, HTMLElement>> = {
    tunai: tunaiPanel,
    nontunai: nonCashPanel,
    split: splitPanel,
    piutang: piutangPanel,
  };
  const tabButtons = new Map<PayTab, HTMLButtonElement>();
  const tablist = el('div', {
    className: 'pos-pay__tabs',
    attrs: { role: 'tablist', 'aria-label': label('caraBayar') },
  });
  for (const item of TABS) {
    const tabId = nextId('tab-bayar');
    const panelId = nextId('panel-bayar');
    const button = el('button', {
      className: 'pos-pay__tab',
      text: label(item.text),
      attrs: {
        type: 'button',
        role: 'tab',
        id: tabId,
        'aria-controls': panelId,
        'aria-selected': 'false',
        tabindex: '-1',
      },
    });
    panels[item.id].setAttribute('role', 'tabpanel');
    panels[item.id].setAttribute('id', panelId);
    panels[item.id].setAttribute('aria-labelledby', tabId);
    button.addEventListener('click', () => {
      selectTab(item.id);
    });
    tabButtons.set(item.id, button);
    tablist.append(button);
  }
  tablist.addEventListener('keydown', (event) => {
    const order = TABS.map((item) => tabButtons.get(item.id)).filter(
      (button): button is HTMLButtonElement => button !== undefined,
    );
    const at = order.findIndex((button) => button === event.target);
    const step: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };
    let next = -1;
    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = order.length - 1;
    } else if (at >= 0 && step[event.key] !== undefined) {
      next = (at + (step[event.key] ?? 0) + order.length) % order.length;
    }
    if (next >= 0) {
      event.preventDefault();
      order[next]?.focus();
    }
  });

  const selectTab = (next: PayTab): void => {
    if (next === tab) {
      return;
    }
    tab = next;
    daysError.textContent = '';
    if (next === 'tunai') {
      session.chooseSingle('tunai');
    } else if (next === 'piutang') {
      session.chooseReceivable('piutang');
    } else {
      session.resetPayment();
    }
    paint();
  };

  const partItem = (position: number): HTMLElement => {
    const saved = partOf(session.state().rows[position]);
    const summaryText =
      saved === undefined ? label('pilihPembayaran') : label(METHOD_LABELS[saved.method]);
    const button = el(
      'button',
      {
        className: 'pos-pay__part',
        attrs: { type: 'button' },
      },
      el('span', {
        className: 'pos-pay__part-title',
        text: label('pembayaranKe', { n: position + 1 }),
      }),
      el('span', { className: 'pos-pay__part-meta', text: summaryText }),
      el('span', {
        className: 'pos-pay__part-amount',
        text: saved === undefined ? '' : formatRupiah(saved.amount),
      }),
      icon('chevron-right'),
    );
    button.addEventListener('click', () => {
      void import('./payment-part').then(({ openPaymentPart }) => {
        if (!destroyed) {
          openPaymentPart({ session, index: position });
        }
      });
    });
    return el('li', {}, button);
  };

  const paintMethods = (group: HTMLElement, method: PaidMethod | undefined): void => {
    for (const button of group.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', button.dataset['method'] === method ? 'true' : 'false');
    }
  };

  const paint = (): void => {
    const state = session.state();
    const summary = session.summary();
    const current = session.customer();
    const method = asPaid(state.method);
    summaryPane.paint();
    grand.textContent = formatRupiah(summary.total);
    for (const item of TABS) {
      const button = tabButtons.get(item.id);
      const selected = item.id === tab;
      button?.setAttribute('aria-selected', selected ? 'true' : 'false');
      button?.setAttribute('tabindex', selected ? '0' : '-1');
      panels[item.id].hidden = !selected;
    }
    result.hidden = tab === 'piutang';
    // Catatan satu kolom bersama: di bawah pilihan pada tab Non-Tunai, di baris bawah pada tab lain.
    const noteHome = tab === 'nontunai' ? nonCashNote : footer;
    if (noteField.parentElement !== noteHome) {
      const hadFocus = document.activeElement === noteInput;
      if (noteHome === footer) {
        footer.insertBefore(noteField, finish);
      } else {
        noteHome.append(noteField);
      }
      noteField.classList.toggle('pos-pay__note--inline', noteHome === nonCashNote);
      if (hadFocus) {
        noteInput.focus();
      }
    }
    if (document.activeElement !== noteInput && noteInput.value !== state.paymentNote) {
      noteInput.value = state.paymentNote;
    }

    if (tab === 'piutang') {
      const days = state.terms?.dueDays ?? current?.dueDays ?? DEFAULT_DUE_DAYS;
      for (const chip of termChips.querySelectorAll<HTMLButtonElement>('button')) {
        chip.setAttribute('aria-pressed', chip.dataset['days'] === String(days) ? 'true' : 'false');
      }
      if (document.activeElement !== daysInput) {
        daysInput.value = (TERM_CHOICES as readonly number[]).includes(days) ? '' : String(days);
      }
      const dp = state.rows.find((row) => row.method === 'dp')?.amount ?? 0;
      if (document.activeElement !== dpInput) {
        dpInput.value = dp === 0 ? '' : plain(dp);
      }
      paintMethods(dpMethods, dpVia);
      dpOutput.textContent = formatRupiah(dp);
      dueAmount.textContent = formatRupiah(summary.receivable);
      dueDate.textContent = formatDate(new Date(dueDateOf(session.now(), days)));
      limitText.textContent =
        current === undefined
          ? ''
          : label('sisaLimitPiutang', {
              jumlah: formatRupiah(Math.max(0, remainingLimit(current))),
            });
    } else if (tab === 'tunai') {
      entry.setValue(state.rows.find((row) => row.method === 'tunai')?.amount ?? 0);
      paintQuick(summary.total);
    } else if (tab === 'nontunai') {
      paintMethods(nonCash, state.rows.some((row) => row.amount > 0) ? method : undefined);
    } else {
      parts.replaceChildren(
        ...Array.from({ length: MAX_SPLIT_PARTS }, (_, position) => partItem(position)),
      );
    }
    sisa.textContent = formatRupiah(summary.shortfall);
    change.textContent = formatRupiah(summary.change);

    const blocked = summary.status === 'blocked' && summary.messageId !== undefined;
    const short = summary.status === 'short' && summary.paid > 0 && summary.messageId !== undefined;
    if (blocked || short) {
      const text = message(summary.messageId, summary.values);
      const children: HTMLElement[] = [createBanner(blocked ? 'danger' : 'warning', text)];
      if (blocked) {
        const actions = el('div', { className: 'pos-pay__limit-actions' });
        if (summary.decision?.ok === false && summary.decision.reason !== 'unregistered') {
          actions.append(
            createButton({
              text: label('mintaOtorisasi'),
              variant: 'secondary',
              onClick: () => {
                openAuthorizeModal({ session });
              },
            }),
          );
        }
        actions.append(
          createButton({
            text: label('gantiCaraBayar'),
            variant: 'secondary',
            onClick: () => {
              selectTab('tunai');
            },
          }),
        );
        children.push(actions);
      }
      messageBox.replaceChildren(...children);
    } else {
      const approved = session.mobileApproval();
      const usesReceivable = state.rows.some(
        (row) => row.method === 'piutang' || row.method === 'dp',
      );
      messageBox.replaceChildren(
        ...(approved === undefined || !usesReceivable
          ? []
          : [createBanner('info', label('disetujuiDariHp', { alasan: approved.note ?? '' }))]),
      );
    }
    // Open Bill lama bisa memuat barang yang stok tokonya sudah terjual: kasir diberi peringatan,
    // pembayaran tidak ditahan (stok negatif ditinjau di Back-Office).
    const stockIssue = session.stockIssue();
    if (stockIssue !== undefined) {
      messageBox.append(createBanner('warning', stockIssue));
    }
    const ready = summary.status === 'ready';
    finish.toggleAttribute('data-inactive', !ready);
    finish.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };

  dpInput.addEventListener('input', () => {
    session.setDownPayment(digitsOf(dpInput.value), dpVia);
    dpInput.value = plain(session.state().rows.find((row) => row.method === 'dp')?.amount ?? 0);
    if (dpInput.value === '0') {
      dpInput.value = '';
    }
  });
  daysInput.addEventListener('input', () => {
    const days = parseTermDays(daysInput.value, session.state().terms?.dueDays ?? DEFAULT_DUE_DAYS);
    if (days === undefined) {
      daysError.textContent = label('jatuhTempoSalah');
      return;
    }
    daysError.textContent = '';
    if (daysInput.value.trim() !== '') {
      session.setTerms(days);
    }
  });

  const unblock = (event: Event): void => {
    if (finish.getAttribute('aria-disabled') === 'true') {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };
  finish.addEventListener('click', unblock, true);

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (event.key === 'F4') {
      event.preventDefault();
      finish.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stopKeys = entry.listenOn(document);
  const stop = session.subscribe(paint);

  const footer = el(
    'div',
    { className: 'pos-pay__footer' },
    createButton({
      text: label('kembali'),
      variant: 'secondary',
      icon: 'chevron-down',
      onClick: () => {
        go('/pos/jual');
      },
    }),
    noteField,
    finish,
  );
  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-pay' },
      summaryPane.element,
      el(
        'section',
        { className: 'pos-pay__panel' },
        el(
          'div',
          { className: 'pos-pay__headline' },
          el(
            'div',
            { className: 'pos-pay__headline-total' },
            el('p', { className: 't-label', text: label('totalPembayaran') }),
            grand,
          ),
          result,
        ),
        tablist,
        ...TABS.map((item) => panels[item.id]),
        messageBox,
        footer,
      ),
    ),
  );
  paint();
  return {
    element,
    destroy: () => {
      destroyed = true;
      stop();
      stopKeys();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
