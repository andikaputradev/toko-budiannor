import { describe, expect, it } from 'vitest';
import {
  addNote,
  countNotes,
  exportJson,
  exportMarkdown,
  notesFor,
  parseNotes,
  removeNote,
  serializeNotes,
  type RevisionNote,
} from '../../../src/apps/portal/notes';
import {
  reviewFlagFromLocation,
  reviewModeFromLocation,
} from '../../../src/shared/simulator/panel';

const NOW = new Date('2026-11-03T03:15:00.000Z');
const TITLES: Readonly<Record<string, string>> = {
  'POS-02': 'Jual Utama',
  'OWN-06': 'Transaksi',
};
const titleOf = (id: string): string => TITLES[id] ?? '';

function sample(): RevisionNote[] {
  let notes: readonly RevisionNote[] = [];
  const drafts = [
    { screen: 'POS-02', text: 'Pindahkan tombol Bayar ke tengah bawah', kind: 'revisi', round: 1 },
    {
      screen: 'POS-02',
      text: 'Tambah tombol Bayar dengan Kartu Debit',
      kind: 'change-request',
      round: 1,
    },
    { screen: 'OWN-06', text: 'Ganti warna lencana', kind: 'revisi', round: 2 },
  ] as const;
  drafts.forEach((draft, index) => {
    const result = addNote(notes, draft, NOW, `N-${String(index + 1)}`);
    if (result.ok) {
      notes = result.notes;
    }
  });
  return [...notes];
}

describe('catatan revisi', () => {
  it('menolak catatan kosong dan menyimpan catatan dengan teks terpangkas', () => {
    expect(
      addNote([], { screen: 'POS-02', text: '   ', kind: 'revisi', round: 1 }, NOW, 'N-1'),
    ).toEqual({
      ok: false,
    });
    const result = addNote(
      [],
      { screen: 'POS-02', text: '  Ubah teks  ', kind: 'revisi', round: 2 },
      NOW,
      'N-1',
    );
    expect(result).toEqual({
      ok: true,
      notes: [
        {
          id: 'N-1',
          screen: 'POS-02',
          text: 'Ubah teks',
          kind: 'revisi',
          round: 2,
          createdAt: '2026-11-03T03:15:00.000Z',
        },
      ],
    });
  });

  it('menyaring per layar, menghapus, dan menghitung per putaran dan Change Request', () => {
    const notes = sample();
    expect(notesFor(notes, 'POS-02')).toHaveLength(2);
    expect(countNotes(notes)).toEqual({ total: 3, round1: 2, round2: 1, changeRequests: 1 });
    expect(removeNote(notes, 'N-2').map((item) => item.id)).toEqual(['N-1', 'N-3']);
  });

  it('menyimpan dan membaca ulang dengan aman terhadap data rusak', () => {
    const notes = sample();
    expect(parseNotes(serializeNotes(notes))).toEqual(notes);
    expect(parseNotes(null)).toEqual([]);
    expect(parseNotes('{rusak')).toEqual([]);
    expect(parseNotes('{"a":1}')).toEqual([]);
    expect(parseNotes(JSON.stringify([{ id: 'x' }, ...notes]))).toEqual(notes);
  });

  it('mengekspor JSON berisi ringkasan, aturan revisi, dan judul layar', () => {
    const data = JSON.parse(exportJson(sample(), titleOf, NOW)) as Record<string, unknown>;
    expect(data['proyek']).toBe('Toko Budiannor');
    expect(data['versi']).toBe('1.1');
    expect(data['diekspor']).toBe('2026-11-03T03:15:00.000Z');
    expect(data['ringkasan']).toEqual({ total: 3, round1: 2, round2: 1, changeRequests: 1 });
    expect(String(data['aturan'])).toContain('Maksimal dua putaran revisi tanpa biaya tambahan');
    const entries = data['catatan'] as Record<string, unknown>[];
    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({
      id: 'N-2',
      layar: 'POS-02',
      judulLayar: 'Jual Utama',
      jenis: 'change-request',
      jenisLabel: 'Change Request',
      putaran: 1,
    });
  });

  it('mengekspor Markdown dikelompokkan per putaran lalu per layar', () => {
    const markdown = exportMarkdown(sample(), titleOf, NOW);
    expect(markdown).toContain('# Catatan Revisi: Toko Budiannor');
    expect(markdown).toContain('Diekspor: 2026-11-03 03:15');
    expect(markdown).toContain('Total catatan: 3. Putaran 1: 2. Putaran 2: 1. Change Request: 1.');
    expect(markdown).toContain('## Putaran 1\n\n### POS-02 Jual Utama\n');
    expect(markdown).toContain(
      '- [Revisi (tanpa biaya)] Pindahkan tombol Bayar ke tengah bawah (2026-11-03 03:15)',
    );
    expect(markdown).toContain('- [Change Request] Tambah tombol Bayar dengan Kartu Debit');
    expect(markdown).toContain('## Putaran 2\n\n### OWN-06 Transaksi\n');
    expect(markdown.endsWith('\n')).toBe(true);
    expect(exportMarkdown([], titleOf, NOW)).toContain('Tidak ada catatan pada putaran ini.');
  });

  it('membaca bendera mode tinjau dari alamat', () => {
    expect(reviewFlagFromLocation('?tinjau=1')).toBe(true);
    expect(reviewFlagFromLocation('?tinjau=0')).toBe(false);
    expect(reviewFlagFromLocation('')).toBeUndefined();
    expect(reviewFlagFromLocation('?tinjau=x')).toBeUndefined();
    expect(reviewModeFromLocation('?tinjau=1')).toBe(true);
  });
});
