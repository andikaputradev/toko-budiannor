import type { PaidMethod } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createAmountEntry } from '../amount-entry';
import { remainingDue } from '../domain/payment';
import { checkPart, partLimit, partOf, type PaymentPart } from '../domain/split';
import type { PosSession } from '../pos-session';

export interface PaymentPartOptions {
  readonly session: PosSession;
  readonly index: number;
}

type PartTab = 'tunai' | 'nontunai';

// Non-tunai pada Split sama dengan tab Non-Tunai: hanya QRIS, Transfer, dan EDC.
const NON_CASH: readonly { readonly method: PaidMethod; readonly text: LabelKey }[] = [
  { method: 'qris', text: 'metodeQris' },
  { method: 'transfer', text: 'metodeTransfer' },
  { method: 'edc', text: 'metodeEdc' },
];

// Modal "Pembayaran N" pada tab Split: tab Tunai dan Non-Tunai, papan angka, dan Simpan. Dua kolom
// (pilihan dan nominal di kiri, papan angka di kanan) supaya muat satu layar tanpa scroll bar.
export function openPaymentPart(options: PaymentPartOptions): void {
  const { session, index } = options;
  const existing = partOf(session.state().rows[index]);
  let tab: PartTab = existing === undefined || existing.method === 'tunai' ? 'tunai' : 'nontunai';
  let chosen: PaidMethod | undefined =
    existing === undefined || existing.method === 'tunai' ? undefined : existing.method;

  // Semua cara non-tunai berbagi batas yang sama: sisa tagihan tanpa baris slot ini.
  const limit = (): number | undefined =>
    partLimit(session.state().rows, index, tab === 'tunai' ? 'tunai' : 'edc', session.total());
  const remaining = (): number =>
    remainingDue(
      session.total(),
      session.state().rows.filter((_, position) => position !== index),
    );

  const error = el('p', { className: 'pos-cash__error pos-part__error', attrs: { role: 'alert' } });
  const entry = createAmountEntry({
    labelText: label('jumlahDiterima'),
    value: existing?.amount ?? 0,
    max: limit(),
    onChange: () => {
      error.textContent = '';
    },
  });
  const methodButtons = new Map<PaidMethod, HTMLButtonElement>();
  const methods = el('div', {
    className: 'pos-pay__methods pos-part__methods',
    attrs: { role: 'group', 'aria-label': label('kanalPembayaran') },
  });
  for (const item of NON_CASH) {
    const button = createButton({
      text: label(item.text),
      variant: 'secondary',
      onClick: () => {
        chosen = item.method;
        error.textContent = '';
        paint();
      },
    });
    button.classList.add('pos-pay__method');
    methodButtons.set(item.method, button);
    methods.append(button);
  }
  const sisa = el('output', { className: 't-total pos-part__sisa' });

  const tabButtons = new Map<PartTab, HTMLButtonElement>();
  const tablist = el('div', {
    className: 'pos-pay__tabs pos-part__tabs',
    attrs: { role: 'tablist', 'aria-label': label('caraBayar') },
  });
  for (const [id, text] of [
    ['tunai', label('tabTunai')],
    ['nontunai', label('tabNonTunai')],
  ] as const) {
    const button = el('button', {
      className: 'pos-pay__tab',
      text,
      attrs: { type: 'button', role: 'tab', 'aria-selected': 'false' },
    });
    button.addEventListener('click', () => {
      tab = id;
      error.textContent = '';
      paint();
    });
    tabButtons.set(id, button);
    tablist.append(button);
  }

  function paint(): void {
    for (const [id, button] of tabButtons) {
      button.setAttribute('aria-selected', id === tab ? 'true' : 'false');
    }
    methods.hidden = tab !== 'nontunai';
    for (const [method, button] of methodButtons) {
      button.setAttribute('aria-pressed', method === chosen ? 'true' : 'false');
    }
    entry.setMax(limit());
    sisa.textContent = formatRupiah(remaining());
  }

  const save = (): void => {
    let part: PaymentPart;
    if (tab === 'tunai') {
      part = { method: 'tunai', amount: entry.value() };
    } else if (chosen === undefined) {
      error.textContent = label('pilihCaraNonTunai');
      return;
    } else {
      part = { method: chosen, amount: entry.value() };
    }
    const check = checkPart(session.state().rows, index, part);
    if (!check.ok) {
      error.textContent = label(
        check.reason === 'duplikat'
          ? 'pembayaranSudahAda'
          : check.reason === 'maksimal'
            ? 'splitMaksimalTiga'
            : 'isiNominalPembayaran',
      );
      return;
    }
    session.setPart(index, part);
    if (partOf(session.state().rows[index]) === undefined) {
      error.textContent = label('isiNominalPembayaran');
      return;
    }
    handle.close();
  };

  const handle = openModal({
    title: label('pembayaranKe', { n: index + 1 }),
    body: el(
      'div',
      { className: 'pos-part' },
      tablist,
      methods,
      el(
        'div',
        { className: 'pos-part__remain' },
        el('p', { className: 't-label', text: label('sisaBayar') }),
        sisa,
      ),
      entry.element,
      error,
    ),
    actions: [],
  });
  entry.listenOn(handle.dialog);
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-part__actions' },
      existing === undefined
        ? false
        : createButton({
            text: label('hapus'),
            variant: 'secondary',
            onClick: () => {
              session.setPart(index, undefined);
              handle.close();
            },
          }),
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({ text: label('simpan'), onClick: save }),
    ),
  );
  paint();
}
