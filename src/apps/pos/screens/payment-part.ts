import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { createAmountEntry } from '../amount-entry';
import { remainingDue } from '../domain/payment';
import { checkPart, partLimit, partOf, type PaymentPart, type SavedPart } from '../domain/split';
import type { PosSession } from '../pos-session';
import { createChannelCards, type ChannelCard } from './channel-cards';

export interface PaymentPartOptions {
  readonly session: PosSession;
  readonly index: number;
  readonly onSaved: (saved: SavedPart) => void;
}

type PartTab = 'tunai' | 'nontunai';

// Modal "Pembayaran N" pada tab Split: tab Tunai dan Non-Tunai, papan angka, dan Simpan.
export function openPaymentPart(options: PaymentPartOptions): void {
  const { session, index } = options;
  const existing = partOf(session.state().rows[index]);
  let tab: PartTab = existing === undefined || existing.method === 'tunai' ? 'tunai' : 'nontunai';
  let chosen: ChannelCard | undefined =
    existing === undefined || existing.method === 'tunai'
      ? undefined
      : { method: existing.method, channel: existing.channel, text: '' };

  // Semua kanal non-tunai berbagi batas yang sama: sisa tagihan tanpa baris slot ini.
  const limit = (): number | undefined =>
    partLimit(session.state().rows, index, tab === 'tunai' ? 'tunai' : 'edc', session.total());
  const remaining = (): number =>
    remainingDue(
      session.total(),
      session.state().rows.filter((_, position) => position !== index),
    );

  const error = el('p', { className: 'pos-cash__error', attrs: { role: 'alert' } });
  const entry = createAmountEntry({
    labelText: label('jumlahDiterima'),
    value: existing?.amount ?? 0,
    max: limit(),
    onChange: () => {
      error.textContent = '';
    },
  });
  const cards = createChannelCards((card) => {
    chosen = card;
    error.textContent = '';
    paint();
  });
  const cardsPanel = el('div', { className: 'pos-part__cards' }, cards.element);
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
    cardsPanel.hidden = tab !== 'nontunai';
    cards.select(chosen?.method, chosen?.channel);
    entry.setMax(limit());
    sisa.textContent = formatRupiah(remaining());
  }

  const save = (): void => {
    let part: PaymentPart;
    if (tab === 'tunai') {
      part = { method: 'tunai', amount: entry.value() };
    } else if (chosen === undefined) {
      error.textContent = label('pilihKanalDulu');
      return;
    } else {
      part = { method: chosen.method, channel: chosen.channel, amount: entry.value() };
    }
    const check = checkPart(session.state().rows, index, part);
    if (!check.ok) {
      error.textContent = label(
        check.reason === 'duplikat'
          ? 'pembayaranSudahAda'
          : check.reason === 'kanal'
            ? 'pilihKanalDulu'
            : 'isiNominalPembayaran',
      );
      return;
    }
    session.setPart(index, part);
    const saved = partOf(session.state().rows[index]);
    if (saved === undefined) {
      error.textContent = label('isiNominalPembayaran');
      return;
    }
    handle.close();
    options.onSaved(saved);
  };

  const handle = openModal({
    title: label('pembayaranKe', { n: index + 1 }),
    body: el(
      'div',
      { className: 'pos-part' },
      tablist,
      cardsPanel,
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
              options.onSaved({ ...existing, amount: 0 });
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
