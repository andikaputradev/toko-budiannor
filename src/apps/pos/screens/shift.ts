import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createIllustration } from '../../../shared/ui/illustration';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { createAmountEntry } from '../amount-entry';
import { needsShift } from '../domain/shift';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';

export function openOpeningCashModal(session: PosSession, onStarted: () => void): void {
  const error = el('p', { className: 'pos-cash__error', attrs: { role: 'alert' } });
  const entry = createAmountEntry({
    labelText: label('masukkanModal'),
    onChange: () => {
      error.textContent = '';
    },
  });
  const handle = openModal({
    title: label('masukkanModal'),
    body: el('div', { className: 'pos-cash' }, entry.element, error),
    actions: [],
  });
  entry.listenOn(handle.dialog);
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
          const result = session.startShift(entry.hasValue() ? entry.value() : undefined);
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
}

// Akhiri Shift menutup shift lalu langsung keluar (log off): kasir kembali ke layar PIN.
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
  // Selisih Tunai = uang yang dihitung di laci dikurangi saldo akhir kas; tanpa hitungan selisihnya 0.
  const difference = el('output', {
    className: 'pos-shiftsum__diff',
    attrs: { 'aria-live': 'polite' },
    text: formatRupiah(0),
  });
  const entry = createAmountEntry({
    labelText: label('uangTunaiDiLaci'),
    onChange: () => {
      difference.textContent = formatRupiah(
        entry.hasValue() ? entry.value() - summary.closingCash : 0,
      );
    },
  });
  const handle = openModal({
    title: label('selesaiShift'),
    body: el(
      'div',
      { className: 'pos-shiftsum' },
      el(
        'div',
        { className: 'pos-shiftsum__sum' },
        ...rows.map(([text, amount, total]) =>
          el(
            'p',
            {
              className: total ? 'pos-shiftsum__row pos-shiftsum__row--total' : 'pos-shiftsum__row',
            },
            el('span', { text }),
            el('output', { text: formatRupiah(amount) }),
          ),
        ),
        el(
          'p',
          { className: 'pos-shiftsum__row' },
          el('span', { text: label('selisihTunai') }),
          difference,
        ),
      ),
      entry.element,
    ),
    actions: [],
  });
  entry.listenOn(handle.dialog);
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
          session.endShift(entry.hasValue() ? entry.value() : undefined);
          session.logout();
          handle.close();
          showToast({ kind: 'success', text: label('shiftSelesaiKeluar') });
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
