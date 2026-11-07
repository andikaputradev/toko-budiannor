import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createIllustration } from '../../../shared/ui/illustration';
import { openModal } from '../../../shared/ui/modal';
import { applyMoneyKey, needsShift, type MoneyKey } from '../domain/shift';
import { failureText } from '../failure';
import { createMoneyPad } from '../numpad';
import type { PosSession } from '../pos-session';

export function openOpeningCashModal(session: PosSession, onStarted: () => void): void {
  let value: number | undefined;
  const display = el('output', {
    className: 'pos-cash__value',
    attrs: { 'aria-live': 'polite', 'data-placeholder': 'Rp' },
  });
  const error = el('p', { className: 'pos-cash__error', attrs: { role: 'alert' } });
  const paint = (): void => {
    display.textContent = value === undefined ? '' : formatRupiah(value);
  };
  const press = (key: MoneyKey): void => {
    value = applyMoneyKey(value ?? 0, key);
    error.textContent = '';
    paint();
  };
  const pad = createMoneyPad(press);
  const handle = openModal({
    title: label('masukkanModal'),
    body: el(
      'div',
      { className: 'pos-cash' },
      el('p', { className: 't-label', text: label('masukkanModal') }),
      display,
      error,
      pad.element,
    ),
    actions: [],
  });
  handle.dialog.addEventListener('keydown', (event) => {
    if (/^\d$/.test(event.key)) {
      press(event.key as MoneyKey);
    }
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({
        text: label('lanjut'),
        onClick: () => {
          const result = session.startShift(value);
          if (result.ok) {
            handle.close();
            onStarted();
            return;
          }
          error.textContent = failureText(result);
        },
      }),
    ),
  );
  paint();
}

export function openShiftSummary(session: PosSession, onEnded: () => void): void {
  const summary = session.shiftSummary();
  if (summary === undefined) {
    return;
  }
  const rows: readonly (readonly [string, number, boolean])[] = [
    [label('modalAwal'), summary.openingCash, false],
    [label('penjualanTunai'), summary.cashSales, false],
    [label('navBiaya'), summary.expenses, false],
    [label('returTunai'), summary.cashReturns, false],
    [label('saldoAkhirKas'), summary.closingCash, true],
  ];
  const handle = openModal({
    title: label('selesaiShift'),
    body: el(
      'div',
      { className: 'pos-shiftsum' },
      ...rows.map(([text, amount, total]) =>
        el(
          'p',
          { className: total ? 'pos-shiftsum__row pos-shiftsum__row--total' : 'pos-shiftsum__row' },
          el('span', { text }),
          el('output', { text: formatRupiah(amount) }),
        ),
      ),
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({
        text: label('akhiriShift'),
        onClick: () => {
          session.endShift();
          handle.close();
          onEnded();
        },
      }),
    ),
  );
}

export function createShiftGate(session: PosSession, onStarted: () => void): HTMLElement {
  return el(
    'main',
    { className: 'pos-gate' },
    createIllustration('kasir'),
    el('h1', { className: 'pos-gate__title t-screen-title', text: label('belumMulaiShift') }),
    el('p', { className: 'pos-gate__hint', text: label('petunjukMulaiShift') }),
    createButton({
      text: label('mulaiShift'),
      pay: true,
      onClick: () => {
        openOpeningCashModal(session, onStarted);
      },
    }),
  );
}

// Menggantikan <main> layar dengan gerbang "Belum Mulai Shift" selama shift belum berjalan.
export function guardWithShift(session: PosSession, root: HTMLElement): () => void {
  const content = root.querySelector<HTMLElement>(':scope > main');
  if (content === null) {
    return () => undefined;
  }
  const holder = el('div', { className: 'pos-shiftswitch' });
  content.replaceWith(holder);
  let blocked: boolean | undefined;
  const gate = createShiftGate(session, () => {
    paint();
  });
  const paint = (): void => {
    const next = needsShift(session.store.getState().role, session.state().shift);
    if (next === blocked) {
      return;
    }
    const wasBlocked = blocked === true;
    blocked = next;
    holder.replaceChildren(next ? gate : content);
    if (!next && wasBlocked) {
      content.querySelector<HTMLElement>('input')?.focus();
    }
  };
  const stops = [session.subscribe(paint), session.store.subscribe(paint)];
  paint();
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
