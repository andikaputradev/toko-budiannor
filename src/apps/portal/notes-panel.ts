import { el, nextId } from '../../shared/dom';
import { label } from '../../shared/messages';
import { createButton } from '../../shared/ui/button';
import { showToast } from '../../shared/ui/toast';
import {
  addNote,
  countNotes,
  exportJson,
  exportMarkdown,
  NOTES_KEY,
  notesFor,
  parseNotes,
  removeNote,
  serializeNotes,
  type NoteKind,
  type NoteRound,
  type RevisionNote,
} from './notes';

export interface NotesPanel {
  readonly element: HTMLElement;
  refresh(): void;
}

export interface NotesPanelOptions {
  readonly current: () => string;
  readonly titleOf: (screen: string) => string;
  readonly storage: Storage | undefined;
}

let counter = 0;

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { attrs: { href: url, download: name } });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function createNotesPanel(options: NotesPanelOptions): NotesPanel {
  let notes: readonly RevisionNote[] = parseNotes(readStore(options.storage));
  const textId = nextId('rev-teks');
  const kindId = nextId('rev-jenis');
  const roundId = nextId('rev-putaran');
  const heading = el('h2', { className: 't-section-title', text: label('catatanRevisi') });
  const screenLine = el('p', { className: 'rev-notes__screen', attrs: { 'aria-live': 'polite' } });
  const text = el('textarea', {
    className: 'input rev-notes__text',
    attrs: { id: textId, rows: '3', maxlength: '500' },
  });
  const kind = el(
    'select',
    { className: 'input', attrs: { id: kindId } },
    el('option', { text: label('jenisRevisi'), attrs: { value: 'revisi' } }),
    el('option', { text: label('jenisChangeRequest'), attrs: { value: 'change-request' } }),
  );
  const round = el(
    'select',
    { className: 'input', attrs: { id: roundId } },
    el('option', { text: label('putaranNomor', { nomor: 1 }), attrs: { value: '1' } }),
    el('option', { text: label('putaranNomor', { nomor: 2 }), attrs: { value: '2' } }),
  );
  const error = el('p', { className: 'own-hint', attrs: { role: 'alert' } });
  const list = el('ul', { className: 'rev-notes__list' });
  const summary = el('p', { className: 't-label', attrs: { 'aria-live': 'polite' } });

  const persist = (): void => {
    try {
      options.storage?.setItem(NOTES_KEY, serializeNotes(notes));
    } catch {
      return;
    }
  };

  const refresh = (): void => {
    const screen = options.current();
    screenLine.textContent = label('layarAktif', { layar: `${screen} ${options.titleOf(screen)}` });
    const own = notesFor(notes, screen);
    list.replaceChildren(
      ...(own.length === 0
        ? [el('li', { className: 't-label', text: label('belumAdaCatatanLayar') })]
        : own.map((item) => {
            const remove = createButton({
              text: label('hapus'),
              variant: 'secondary',
              onClick: () => {
                notes = removeNote(notes, item.id);
                persist();
                refresh();
              },
            });
            remove.setAttribute(
              'aria-label',
              `${label('hapusCatatan')} ${item.screen}: ${item.text}`,
            );
            return el(
              'li',
              { className: 'rev-notes__item' },
              el('span', {
                className: 'own-kind',
                text: `${item.kind === 'revisi' ? label('jenisRevisi') : label('jenisChangeRequest')}, ${label('putaranNomor', { nomor: item.round })}`,
              }),
              el('p', { text: item.text }),
              remove,
            );
          })),
    );
    const counts = countNotes(notes);
    summary.textContent = label('ringkasanCatatan', {
      total: counts.total,
      putaran1: counts.round1,
      putaran2: counts.round2,
      cr: counts.changeRequests,
    });
  };

  const save = createButton({
    text: label('simpanCatatan'),
    onClick: () => {
      counter += 1;
      const result = addNote(
        notes,
        {
          screen: options.current(),
          text: text.value,
          kind: kind.value === 'change-request' ? ('change-request' satisfies NoteKind) : 'revisi',
          round: round.value === '2' ? (2 satisfies NoteRound) : 1,
        },
        new Date(),
        `N-${Date.now().toString(36)}-${String(counter)}`,
      );
      if (!result.ok) {
        error.textContent = label('catatanKosong');
        text.focus();
        return;
      }
      error.textContent = '';
      notes = result.notes;
      persist();
      text.value = '';
      kind.value = 'revisi';
      round.value = '1';
      refresh();
    },
  });

  const exportAs = (name: string, build: () => string, type: string): void => {
    download(name, build(), type);
    showToast({ kind: 'success', text: label('catatanDiekspor', { berkas: name }) });
  };

  const element = el(
    'section',
    { className: 'rev-notes' },
    heading,
    el('p', { className: 't-label', text: label('aturanRevisi') }),
    screenLine,
    el('label', { className: 'field__label', text: label('isiCatatan'), attrs: { for: textId } }),
    text,
    el(
      'div',
      { className: 'own-grid-2' },
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('jenisCatatan'),
          attrs: { for: kindId },
        }),
        kind,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', {
          className: 'field__label',
          text: label('putaranLabel'),
          attrs: { for: roundId },
        }),
        round,
      ),
    ),
    error,
    save,
    list,
    summary,
    el(
      'div',
      { className: 'rev-notes__export' },
      createButton({
        text: label('eksporJson'),
        variant: 'secondary',
        icon: 'download',
        onClick: () => {
          exportAs(
            'catatan-revisi.json',
            () => exportJson(notes, options.titleOf, new Date()),
            'application/json',
          );
        },
      }),
      createButton({
        text: label('eksporMarkdown'),
        variant: 'secondary',
        icon: 'download',
        onClick: () => {
          exportAs(
            'catatan-revisi.md',
            () => exportMarkdown(notes, options.titleOf, new Date()),
            'text/markdown',
          );
        },
      }),
    ),
  );
  refresh();
  return { element, refresh };
}

function readStore(storage: Storage | undefined): string | null {
  try {
    return storage?.getItem(NOTES_KEY) ?? null;
  } catch {
    return null;
  }
}
