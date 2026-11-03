import { el, nextId } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { remainingLimit } from '../../../shared/data/receivable';
import type { PaymentMethod } from '../../../shared/data/types';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import { lineSubtotal } from '../domain/bill';
import { METHODS, QUICK_AMOUNTS } from '../domain/payment';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import { openAuthorizeModal } from './authorize';
import type { ScreenHandle } from './login';

const METHOD_LABELS: Readonly<Record<PaymentMethod, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

const SHORTCUTS: Readonly<Record<string, number>> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };

function plain(value: number): string {
  return formatRupiah(value).replace('Rp ', '');
}

export function renderPay(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulPembayaran');
  const amountId = nextId('diterima');
  const referenceId = nextId('referensi');
  const summaryList = el('ul', { className: 'pos-pay__items' });
  const methods = el('div', { className: 'pos-pay__methods', attrs: { role: 'group' } });
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
  const change = el('output', { className: 't-total pos-pay__change' });
  const rows = el('ul', { className: 'pos-pay__rows' });
  const limitText = el('p', { className: 't-label' });
  const messageBox = el('div', { className: 'pos-pay__message', attrs: { 'aria-live': 'polite' } });
  const totalOutput = el('output', { className: 't-total pos-pay__total' });
  const finish = createButton({
    text: label('selesaikanCetak'),
    pay: true,
    onClick: () => {
      const sale = session.finish();
      if (sale === undefined) {
        return;
      }
      showToast({ kind: 'success', text: label('transaksiTersimpan', { nomor: sale.number }) });
      go('/pos/jual');
    },
  });

  const paint = (): void => {
    const state = session.state();
    const summary = session.summary();
    const current = session.customer();
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
    for (const button of methods.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute(
        'aria-pressed',
        button.dataset['method'] === state.method ? 'true' : 'false',
      );
    }
    const row = state.rows.find((item) => item.method === state.method);
    const isReceivable = state.method === 'piutang';
    amountInput.value = row === undefined || row.amount === 0 ? '' : plain(row.amount);
    amountInput.disabled = isReceivable;
    referenceField.hidden = state.method !== 'qris' && state.method !== 'transfer';
    change.textContent = formatRupiah(summary.change);
    rows.replaceChildren(
      ...state.rows.map((item) => {
        const remove = createButton({
          text: label('hapus'),
          variant: 'secondary',
          onClick: () => {
            session.setAmount(item.method, 0);
            if (item.method === 'piutang') {
              session.resetPayment();
            }
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
    limitText.textContent =
      current === undefined
        ? ''
        : label('sisaLimitPiutang', { jumlah: formatRupiah(Math.max(0, remainingLimit(current))) });

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
              session.resetPayment();
            },
          }),
        );
        children.push(actions);
      }
      messageBox.replaceChildren(...children);
    } else {
      const approved = session.mobileApproval();
      const receivable = session
        .state()
        .rows.some((row) => row.method === 'piutang' || row.method === 'dp');
      messageBox.replaceChildren(
        ...(approved === undefined || !receivable
          ? []
          : [createBanner('info', label('disetujuiDariHp', { alasan: approved.note ?? '' }))]),
      );
    }
    const ready = summary.status === 'ready';
    finish.toggleAttribute('data-inactive', !ready);
    finish.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };

  METHODS.forEach((method) => {
    const button = createButton({
      text: label(METHOD_LABELS[method]),
      variant: 'secondary',
      onClick: () => {
        if (method === 'piutang') {
          session.chooseReceivable('piutang');
        } else {
          session.setMethod(method);
        }
      },
    });
    button.dataset['method'] = method;
    button.classList.add('pos-pay__method');
    methods.append(button);
  });

  const quickButton = (text: string, onClick: () => void): HTMLButtonElement =>
    createButton({ text, variant: 'secondary', onClick });
  quick.append(
    quickButton(label('uangPas'), () => {
      session.exactAmount();
    }),
    ...QUICK_AMOUNTS.map((amount) =>
      quickButton(plain(amount), () => {
        session.quickAmount(amount);
      }),
    ),
  );

  amountInput.addEventListener('input', () => {
    const digits = amountInput.value.replace(/\D/g, '').slice(0, 12);
    session.setAmount(session.state().method, digits === '' ? 0 : Number(digits));
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
    const target = event.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (event.key === 'F4') {
      event.preventDefault();
      finish.click();
    } else if (!typing && SHORTCUTS[event.key] !== undefined) {
      const method = METHODS[SHORTCUTS[event.key] ?? 0];
      methods.querySelector<HTMLButtonElement>(`[data-method="${method ?? 'tunai'}"]`)?.click();
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
        methods,
        el('label', {
          className: 'field__label',
          text: label('jumlahDiterima'),
          attrs: { for: amountId },
        }),
        amountInput,
        referenceField,
        quick,
        el('p', { className: 't-label', text: label('kembalian') }),
        change,
        limitText,
        el('h2', { className: 't-section-title', text: label('rincianPembayaran') }),
        rows,
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
