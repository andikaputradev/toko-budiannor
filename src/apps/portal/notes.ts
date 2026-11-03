import { label } from '../../shared/messages';

export type NoteKind = 'revisi' | 'change-request';
export type NoteRound = 1 | 2;

export interface RevisionNote {
  readonly id: string;
  readonly screen: string;
  readonly text: string;
  readonly kind: NoteKind;
  readonly round: NoteRound;
  readonly createdAt: string;
}

export interface NoteDraft {
  readonly screen: string;
  readonly text: string;
  readonly kind: NoteKind;
  readonly round: NoteRound;
}

export const NOTES_KEY = 'tb-pos-catatan-revisi';

function isNote(value: unknown): value is RevisionNote {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item['id'] === 'string' &&
    typeof item['screen'] === 'string' &&
    typeof item['text'] === 'string' &&
    (item['kind'] === 'revisi' || item['kind'] === 'change-request') &&
    (item['round'] === 1 || item['round'] === 2) &&
    typeof item['createdAt'] === 'string'
  );
}

export function parseNotes(raw: string | null): RevisionNote[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isNote) : [];
  } catch {
    return [];
  }
}

export function serializeNotes(notes: readonly RevisionNote[]): string {
  return JSON.stringify(notes);
}

export type AddResult =
  { readonly ok: true; readonly notes: readonly RevisionNote[] } | { readonly ok: false };

export function addNote(
  notes: readonly RevisionNote[],
  draft: NoteDraft,
  now: Date,
  id: string,
): AddResult {
  const text = draft.text.trim();
  if (text === '') {
    return { ok: false };
  }
  return {
    ok: true,
    notes: [
      ...notes,
      {
        id,
        screen: draft.screen,
        text,
        kind: draft.kind,
        round: draft.round,
        createdAt: now.toISOString(),
      },
    ],
  };
}

export function removeNote(notes: readonly RevisionNote[], id: string): RevisionNote[] {
  return notes.filter((item) => item.id !== id);
}

export function notesFor(notes: readonly RevisionNote[], screen: string): RevisionNote[] {
  return notes.filter((item) => item.screen === screen);
}

export interface NoteCounts {
  readonly total: number;
  readonly round1: number;
  readonly round2: number;
  readonly changeRequests: number;
}

export function countNotes(notes: readonly RevisionNote[]): NoteCounts {
  return {
    total: notes.length,
    round1: notes.filter((item) => item.round === 1).length,
    round2: notes.filter((item) => item.round === 2).length,
    changeRequests: notes.filter((item) => item.kind === 'change-request').length,
  };
}

function stamp(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export function exportJson(
  notes: readonly RevisionNote[],
  titleOf: (screen: string) => string,
  now: Date,
): string {
  return JSON.stringify(
    {
      proyek: label('tokoNama'),
      versi: '1.1',
      diekspor: now.toISOString(),
      aturan: label('aturanRevisi'),
      ringkasan: countNotes(notes),
      catatan: notes.map((item) => ({
        id: item.id,
        layar: item.screen,
        judulLayar: titleOf(item.screen),
        jenis: item.kind,
        jenisLabel: item.kind === 'revisi' ? label('jenisRevisi') : label('jenisChangeRequest'),
        putaran: item.round,
        teks: item.text,
        dibuat: item.createdAt,
      })),
    },
    null,
    2,
  );
}

export function exportMarkdown(
  notes: readonly RevisionNote[],
  titleOf: (screen: string) => string,
  now: Date,
): string {
  const counts = countNotes(notes);
  const lines: string[] = [
    `# ${label('judulCatatanRevisi')}: ${label('tokoNama')}`,
    '',
    `${label('diekspor')}: ${stamp(now.toISOString())}`,
    '',
    label('aturanRevisi'),
    '',
    label('ringkasanCatatan', {
      total: counts.total,
      putaran1: counts.round1,
      putaran2: counts.round2,
      cr: counts.changeRequests,
    }),
  ];
  for (const round of [1, 2] as const) {
    lines.push('', `## ${label('putaranNomor', { nomor: round })}`);
    const inRound = notes.filter((item) => item.round === round);
    if (inRound.length === 0) {
      lines.push('', label('tidakAdaCatatanPutaran'));
      continue;
    }
    const screens = [...new Set(inRound.map((item) => item.screen))].sort();
    for (const screen of screens) {
      lines.push('', `### ${screen} ${titleOf(screen)}`, '');
      for (const item of inRound.filter((entry) => entry.screen === screen)) {
        lines.push(
          `- [${item.kind === 'revisi' ? label('jenisRevisi') : label('jenisChangeRequest')}] ${item.text} (${stamp(item.createdAt)})`,
        );
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
