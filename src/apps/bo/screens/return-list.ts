import { el } from '../../../shared/dom';
import type { ReturnNote } from '../../../shared/data/types';
import { formatDate, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import {
  noteItemCount,
  notesOfKind,
  settlementLabelKey,
  summarizeNotes,
  type ReturnKind,
} from '../domain/returns';
import { confirmRefund } from './return-actions';
import { openReturnNote } from './return-print';

export interface ReturnList {
  readonly element: HTMLElement;
  refresh(): void;
}

function statusBadge(note: ReturnNote): HTMLElement {
  const waiting = note.status === 'menunggu';
  return el(
    'span',
    { className: `badge ${waiting ? 'badge--warning' : 'badge--success'}` },
    icon(waiting ? 'clock' : 'circle-check'),
    el('span', { text: label(waiting ? 'boReturStatusMenunggu' : 'boReturStatusSelesai') }),
  );
}

// Daftar retur di sisi kanan layar: ringkasan, kartu per nota, tombol cetak, dan konfirmasi dana.
export function createReturnList(session: BoSession, kind: ReturnKind): ReturnList {
  const store = session.store;
  const count = el('span', { className: 'bo-ret-count' });
  const stats = el('div', { className: 'bo-ret-stats' });
  const list = el('ul', { className: 'bo-ret-notes' });
  const empty = createEmptyState({
    icon: 'receipt-text',
    title: label('boReturDaftarKosongJudul'),
    description: label('boReturDaftarKosongTeks'),
  });
  const element = el(
    'aside',
    { className: 'bo-panel bo-ret-side' },
    el(
      'div',
      { className: 'bo-ret-side__head' },
      el('h2', {
        className: 'bo-ret-card__title',
        text: label(kind === 'penjualan' ? 'boReturDaftarPenjualan' : 'boReturDaftarPembelian'),
      }),
      count,
    ),
    stats,
    list,
    empty,
  );

  const card = (note: ReturnNote): HTMLElement => {
    const actions = el(
      'div',
      { className: 'bo-ret-note__actions' },
      createButton({
        text: label('boReturCetakNota'),
        variant: 'secondary',
        icon: 'printer',
        onClick: () => {
          openReturnNote(session, note);
        },
      }),
    );
    if (note.status === 'menunggu') {
      actions.append(
        createButton({
          text: label('boReturTandaiDana'),
          variant: 'primary',
          icon: 'check',
          onClick: () => {
            const result = confirmRefund(session, note.id);
            if (result.ok) {
              showToast({
                kind: 'success',
                text: label('boReturDanaDiterima', { nomor: note.number }),
              });
              refresh();
            } else {
              showToast({ kind: 'error', text: result.text });
            }
          },
        }),
      );
    }
    return el(
      'li',
      { className: 'bo-ret-note' },
      el(
        'div',
        { className: 'bo-ret-note__top' },
        el('strong', { className: 'bo-ret-note__number', text: note.number }),
        statusBadge(note),
      ),
      el('p', {
        className: 'bo-ret-note__party',
        text: note.partyName,
      }),
      el('p', {
        className: 'bo-ret-note__meta',
        text: `${formatDate(new Date(note.at))} | ${label('boReturKartuFaktur', { nomor: note.sourceNumber })} | ${label('boReturKartuBarang', { jumlah: noteItemCount(note) })}`,
      }),
      el(
        'div',
        { className: 'bo-ret-note__value' },
        el('strong', { text: formatRupiah(note.total) }),
        el('span', {
          className: 'bo-ret-chip',
          text: label(settlementLabelKey(note.kind, note.settlement)),
        }),
      ),
      actions,
    );
  };

  function refresh(): void {
    const notes = notesOfKind(store.getState().returnNotes, kind);
    const summary = summarizeNotes(notes);
    count.textContent = label('boReturRingkasNota', { jumlah: summary.count });
    const parts = [label('boReturRingkasNilai', { nilai: formatRupiah(summary.total) })];
    if (summary.waiting > 0) {
      parts.push(label('boReturRingkasMenunggu', { jumlah: summary.waiting }));
    }
    stats.replaceChildren(...parts.map((text) => el('span', { text })));
    stats.hidden = notes.length === 0;
    list.hidden = notes.length === 0;
    empty.hidden = notes.length > 0;
    list.replaceChildren(...notes.map(card));
  }

  refresh();
  return { element, refresh };
}
