import { el, nextId } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import { EXPENSE_KINDS, parseRupiahInput, type ExpenseKind } from '../domain/forms';
import { dayOf } from '../domain/history';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';

const KIND_LABELS: Readonly<Record<ExpenseKind, LabelKey>> = {
  bensin: 'biayaBensin',
  parkir: 'biayaParkir',
  ekspedisi: 'biayaEkspedisi',
  lainnya: 'biayaLainnya',
};

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderExpense(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'judulBiaya');
  const amountId = nextId('biaya-jumlah');
  const noteId = nextId('biaya-ket');
  let kind: ExpenseKind = 'bensin';
  let amount = 0;

  const chips = el('div', {
    className: 'pos-expense__chips',
    attrs: { role: 'group', 'aria-label': label('jenisBiaya') },
  });
  const amountInput = el('input', {
    className: 'input pos-expense__amount',
    attrs: { id: amountId, inputmode: 'numeric', autocomplete: 'off' },
  });
  const amountError = el('p', { className: 'pos-expense__error', attrs: { role: 'alert' } });
  const note = el('textarea', {
    className: 'input pos-expense__note',
    attrs: { id: noteId, rows: '4' },
  });
  const noteError = el('p', { className: 'pos-expense__error', attrs: { role: 'alert' } });
  const before = el('output', { className: 't-value' });
  const after = el('output', { className: 't-value' });
  const tableBox = el('div', { className: 'pos-expense__table' });
  const save = createButton({
    text: label('simpanBiaya'),
    icon: 'save',
    onClick: () => {
      submit();
    },
  });
  save.classList.add('pos-expense__save');

  const paint = (): void => {
    for (const button of chips.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', button.dataset['kind'] === kind ? 'true' : 'false');
    }
    const balance = session.cashBalance();
    before.textContent = formatRupiah(balance);
    after.textContent = formatRupiah(amount > 0 && amount <= balance ? balance - amount : balance);
    save.toggleAttribute('data-inactive', amount <= 0);
    const day = dayOf(session.now().toISOString());
    const rows = session.state().expenses.filter((item) => dayOf(item.at) === day);
    tableBox.replaceChildren(
      rows.length === 0
        ? el('p', { className: 't-label', text: label('biayaKosong') })
        : el(
            'table',
            { className: 'pos-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { text: label('kolomJam') }),
                el('th', { text: label('kolomJenis') }),
                el('th', { text: label('keterangan') }),
                el('th', { className: 'is-end', text: label('jumlah') }),
              ),
            ),
            el(
              'tbody',
              {},
              ...[...rows]
                .reverse()
                .map((item) =>
                  el(
                    'tr',
                    {},
                    el('td', { text: formatTime(new Date(item.at)) }),
                    el('td', { text: label(KIND_LABELS[item.kind]) }),
                    el('td', { text: item.note }),
                    el('td', { className: 'is-end', text: formatRupiah(item.amount) }),
                  ),
                ),
            ),
          ),
    );
  };

  function submit(): void {
    amountError.textContent = '';
    noteError.textContent = '';
    const result = session.saveExpense(kind, note.value, amount);
    if (result.ok) {
      showToast({ kind: 'success', text: message('MSG-009') });
      kind = 'bensin';
      amount = 0;
      amountInput.value = '';
      note.value = '';
      paint();
      return;
    }
    const text = message(result.messageId, result.values);
    if (result.messageId === 'MSG-042') {
      noteError.textContent = text;
    } else {
      amountError.textContent = text;
    }
  }

  for (const value of EXPENSE_KINDS) {
    const chip = el('button', {
      className: 'chip pos-expense__chip',
      text: label(KIND_LABELS[value]),
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    chip.dataset['kind'] = value;
    chip.addEventListener('click', () => {
      kind = value;
      noteError.textContent = '';
      paint();
    });
    chips.append(chip);
  }
  amountInput.addEventListener('input', () => {
    amount = parseRupiahInput(amountInput.value);
    amountInput.value = amount === 0 ? '' : formatRupiah(amount).replace('Rp ', '');
    amountError.textContent = '';
    paint();
  });

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    } else if (isPc() && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      submit();
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
      { className: 'pos-expense' },
      el(
        'section',
        { className: 'pos-expense__form' },
        chips,
        el('label', { className: 'field__label', text: label('jumlah'), attrs: { for: amountId } }),
        amountInput,
        amountError,
        el('label', {
          className: 'field__label',
          text: label('keterangan'),
          attrs: { for: noteId },
        }),
        note,
        noteError,
        el(
          'div',
          { className: 'pos-expense__balance' },
          el('p', {}, el('span', { className: 't-label', text: label('saldoSebelum') }), before),
          el('p', {}, el('span', { className: 't-label', text: label('saldoSesudah') }), after),
        ),
        el(
          'div',
          { className: 'pos-expense__actions' },
          createButton({
            text: label('batal'),
            variant: 'secondary',
            onClick: () => {
              go('/pos/jual');
            },
          }),
          save,
        ),
      ),
      el(
        'section',
        {
          className: 'pos-expense__side',
          attrs: { tabindex: '0', 'aria-label': label('biayaHariIni') },
        },
        el('h2', { className: 't-section-title', text: label('biayaHariIni') }),
        tableBox,
      ),
    ),
  );
  const unblock = (event: Event): void => {
    if (amount <= 0) {
      event.stopImmediatePropagation();
      event.preventDefault();
      amountError.textContent = message('MSG-029');
    }
  };
  save.addEventListener('click', unblock, true);
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
