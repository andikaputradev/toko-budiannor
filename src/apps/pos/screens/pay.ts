import { el, nextId } from '../../../shared/dom';
import { formatDate, formatRupiah } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { remainingLimit } from '../../../shared/data/receivable';
import type { PaidMethod, PaymentMethod } from '../../../shared/data/types';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import { lineSubtotal } from '../domain/bill';
import { DEFAULT_DUE_DAYS } from '../domain/forms';
import { CASH_METHODS, maxAmount, QUICK_AMOUNTS } from '../domain/payment';
import { dueDateOf, parseTermDays, TERM_CHOICES } from '../domain/terms';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import { openAuthorizeModal } from './authorize';
import { openPaymentDone } from './payment-done';
import type { ScreenHandle } from './login';

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

const SHORTCUTS: Readonly<Record<string, PaidMethod>> = {
  '1': 'tunai',
  '2': 'qris',
  '3': 'edc',
  '4': 'transfer',
};

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

export function renderPay(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulPembayaran');
  const amountId = nextId('diterima');
  const referenceId = nextId('referensi');
  const dpId = nextId('dp');
  const daysId = nextId('hari');
  const stored = session.state().rows;
  let split =
    stored.filter((row) => row.method !== 'dp' && row.method !== 'piutang' && row.amount > 0)
      .length > 1;
  let pending = 0;
  let dpVia: PaidMethod = stored.find((row) => row.method === 'dp')?.via ?? 'tunai';

  const summaryList = el('ul', { className: 'pos-pay__items' });
  const totalOutput = el('output', { className: 't-total pos-pay__total' });

  const radio = (text: string, onClick: () => void): HTMLButtonElement => {
    const button = createButton({ text, variant: 'secondary', onClick });
    button.setAttribute('role', 'radio');
    button.classList.add('pos-pay__method');
    return button;
  };
  const termsTunai = radio(label('metodeTunai'), () => {
    split = false;
    pending = 0;
    session.chooseSingle('tunai');
  });
  const termsPiutang = radio(label('metodePiutang'), () => {
    session.chooseReceivable('piutang');
  });
  const termsGroup = el(
    'div',
    {
      className: 'pos-pay__terms-choice',
      attrs: { role: 'radiogroup', 'aria-label': label('syaratBayar') },
    },
    termsTunai,
    termsPiutang,
  );

  const methodGroup = (onPick: (method: PaidMethod) => void, name: LabelKey): HTMLDivElement => {
    const group = el('div', {
      className: 'pos-pay__methods',
      attrs: { role: 'group', 'aria-label': label(name) },
    });
    for (const method of CASH_METHODS) {
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
  const methods = methodGroup((method) => {
    pending = 0;
    if (split) {
      session.setMethod(method);
    } else {
      session.chooseSingle(method);
    }
  }, 'caraBayar');
  const dpMethods = methodGroup((method) => {
    dpVia = method;
    session.setDownPayment(
      session.state().rows.find((row) => row.method === 'dp')?.amount ?? 0,
      dpVia,
    );
    paint();
  }, 'caraBayarDp');

  const splitSwitch = createButton({
    text: label('splitPayment'),
    variant: 'secondary',
    onClick: () => {
      split = !split;
      pending = 0;
      if (!split) {
        session.chooseSingle(asPaid(session.state().method));
      } else {
        paint();
      }
    },
  });
  splitSwitch.setAttribute('role', 'switch');
  splitSwitch.classList.add('pos-pay__split');

  const amountInput = el('input', {
    className: 'input pos-pay__amount',
    attrs: { id: amountId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const reference = el('input', {
    className: 'input',
    attrs: { id: referenceId, autocomplete: 'off' },
  });
  const referenceField = el(
    'div',
    { className: 'pos-pay__reference' },
    el('label', {
      className: 'field__label',
      text: label('nomorReferensi'),
      attrs: { for: referenceId },
    }),
    reference,
  );
  const quick = el('div', { className: 'pos-pay__quick' });
  const addRow = createButton({
    text: label('tambahPembayaran'),
    variant: 'secondary',
    onClick: () => {
      if (pending > 0) {
        session.setAmount(session.state().method, pending);
        pending = 0;
      }
    },
  });
  const rows = el('ul', { className: 'pos-pay__rows' });
  const sisa = el('output', { className: 't-total pos-pay__sisa' });
  const change = el('output', { className: 't-total pos-pay__change' });
  const tunaiPanel = el(
    'div',
    { className: 'pos-pay__mode' },
    methods,
    splitSwitch,
    el('label', {
      className: 'field__label',
      text: label('jumlahDiterima'),
      attrs: { for: amountId },
    }),
    amountInput,
    referenceField,
    quick,
    addRow,
    el('h2', { className: 't-section-title', text: label('rincianPembayaran') }),
    rows,
    el('p', { className: 't-label', text: label('sisaBayar') }),
    sisa,
    el('p', { className: 't-label', text: label('kembalian') }),
    change,
  );

  const termChips = el('div', {
    className: 'pos-pay__terms',
    attrs: { role: 'group', 'aria-label': label('tempoLabel') },
  });
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
  const daysInput = el('input', {
    className: 'input pos-pay__days',
    attrs: { id: daysId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const daysError = el('p', { className: 'pos-pay__error', attrs: { role: 'alert' } });
  const dpInput = el('input', {
    className: 'input pos-pay__amount',
    attrs: { id: dpId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const dpOutput = el('output', { className: 'pos-pay__dp' });
  const dueAmount = el('output', { className: 't-total pos-pay__due-amount' });
  const dueDate = el('output', { className: 'pos-pay__due' });
  const limitText = el('p', { className: 't-label' });
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
  const piutangPanel = el(
    'div',
    { className: 'pos-pay__mode' },
    el('div', { className: 'pos-pay__inline' }, termChips, field('hariLainnya', daysId, daysInput)),
    daysError,
    el('div', { className: 'pos-pay__inline' }, field('dpLabel', dpId, dpInput), dpMethods),
    el(
      'div',
      { className: 'pos-pay__figures' },
      figure('uangMuka', dpOutput),
      figure('sisaTagihan', dueAmount),
      figure('jatuhTempo', dueDate),
    ),
    limitText,
  );

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

  const setPending = (value: number): void => {
    const method = asPaid(session.state().method);
    const cap = maxAmount(method, session.total(), session.state().rows);
    pending = cap === undefined ? value : Math.min(value, cap);
    paint();
  };

  const paint = (): void => {
    const state = session.state();
    const summary = session.summary();
    const current = session.customer();
    const receivable =
      state.method === 'piutang' || state.rows.some((row) => row.method === 'piutang');
    const method = asPaid(state.method);
    summaryList.replaceChildren(
      ...state.lines.map((line) =>
        el(
          'li',
          { className: 'pos-pay__item' },
          el('span', { text: session.product(line.productId)?.name ?? line.productId }),
          el('span', {
            className: 't-label',
            text: `${String(line.quantity).replace('.', ',')} ${line.unit}`,
          }),
          el('span', { className: 'is-end', text: formatRupiah(lineSubtotal(line)) }),
        ),
      ),
    );
    totalOutput.textContent = formatRupiah(summary.total);
    termsTunai.setAttribute('aria-checked', receivable ? 'false' : 'true');
    termsPiutang.setAttribute('aria-checked', receivable ? 'true' : 'false');
    tunaiPanel.hidden = receivable;
    piutangPanel.hidden = !receivable;

    if (receivable) {
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
      for (const button of dpMethods.querySelectorAll<HTMLButtonElement>('button')) {
        button.setAttribute('aria-pressed', button.dataset['method'] === dpVia ? 'true' : 'false');
      }
      dpOutput.textContent = formatRupiah(dp);
      dueAmount.textContent = formatRupiah(summary.receivable);
      dueDate.textContent = formatDate(new Date(dueDateOf(session.now(), days)));
      limitText.textContent =
        current === undefined
          ? ''
          : label('sisaLimitPiutang', {
              jumlah: formatRupiah(Math.max(0, remainingLimit(current))),
            });
    } else {
      for (const button of methods.querySelectorAll<HTMLButtonElement>('button')) {
        button.setAttribute('aria-pressed', button.dataset['method'] === method ? 'true' : 'false');
      }
      splitSwitch.setAttribute('aria-checked', split ? 'true' : 'false');
      const row = state.rows.find((item) => item.method === method);
      const editable = split || method === 'tunai';
      amountInput.readOnly = !editable;
      amountInput.value = split
        ? pending === 0
          ? ''
          : plain(pending)
        : row === undefined || row.amount === 0
          ? ''
          : plain(row.amount);
      referenceField.hidden = method === 'tunai';
      quick.hidden = method !== 'tunai';
      addRow.hidden = !split;
      rows.hidden = !split;
      rows.replaceChildren(
        ...(split ? state.rows : []).map((item) => {
          const remove = createButton({
            text: label('hapus'),
            variant: 'secondary',
            onClick: () => {
              session.setAmount(item.method, 0);
            },
          });
          remove.setAttribute(
            'aria-label',
            label('hapusPembayaran', { cara: label(METHOD_LABELS[item.method]) }),
          );
          return el(
            'li',
            { className: 'pos-pay__row' },
            el('span', { text: label(METHOD_LABELS[item.method]) }),
            el('span', { className: 'is-end', text: formatRupiah(item.amount) }),
            remove,
          );
        }),
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
              split = false;
              session.resetPayment();
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
    const ready = summary.status === 'ready';
    finish.toggleAttribute('data-inactive', !ready);
    finish.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };

  const quickButton = (text: string, onClick: () => void): HTMLButtonElement =>
    createButton({ text, variant: 'secondary', onClick });
  quick.append(
    quickButton(label('uangPas'), () => {
      if (split) {
        setPending(session.summary().shortfall);
      } else {
        session.exactAmount();
      }
    }),
    ...QUICK_AMOUNTS.map((amount) =>
      quickButton(plain(amount), () => {
        if (split) {
          setPending(amount);
        } else {
          session.quickAmount(amount);
        }
      }),
    ),
  );

  amountInput.addEventListener('input', () => {
    const value = digitsOf(amountInput.value);
    if (split) {
      setPending(value);
    } else {
      session.setAmount(session.state().method, value);
    }
  });
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
    const typing = event.target instanceof HTMLInputElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (event.key === 'F4') {
      event.preventDefault();
      finish.click();
    } else if (!typing && piutangPanel.hidden && SHORTCUTS[event.key] !== undefined) {
      methods
        .querySelector<HTMLButtonElement>(`[data-method="${SHORTCUTS[event.key] ?? 'tunai'}"]`)
        ?.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = session.subscribe(paint);

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-pay' },
      el(
        'section',
        { className: 'pos-pay__summary', attrs: { 'aria-label': label('totalTagihan') } },
        summaryList,
        el('p', { className: 't-label', text: label('totalTagihan') }),
        totalOutput,
      ),
      el(
        'section',
        { className: 'pos-pay__panel' },
        el('h2', { className: 't-section-title', text: label('syaratBayar') }),
        termsGroup,
        tunaiPanel,
        piutangPanel,
        messageBox,
        el(
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
          finish,
        ),
      ),
    ),
  );
  paint();
  amountInput.focus();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
