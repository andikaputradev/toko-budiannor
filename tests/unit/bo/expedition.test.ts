import { describe, expect, it } from 'vitest';
import {
  createExpeditionNote,
  nextSeedVersion,
  removeLine,
  upsertLine,
  validateLine,
} from '../../../src/apps/bo/domain/expedition';

const invoice = {
  invoiceNumber: 'FJ26101234',
  date: '2026-10-19',
  expedition: 'JNE Cargo',
  customerName: 'Bu Sherly Tjoandra',
  customerAddress: 'Jl. Rajawali No 17',
  customerPhone: '0811230988',
};

const koli = [
  { productName: 'Semen Gresik 40kg', quantity: 10, unit: 'SAK' },
  { productName: 'Besi Beton 08', quantity: 15, unit: 'BTG' },
];

describe('createExpeditionNote', () => {
  it('membuat satu baris datar per barang Koli dengan nomor SJ dan data faktur', () => {
    const note = createExpeditionNote(invoice, koli);
    expect(note.noteNumber).toMatch(/^SJ26/);
    expect(note.invoiceNumber).toBe('FJ26101234');
    expect(note.date).toBe('2026-10-19');
    expect(note.expeditionName).toBe('JNE Cargo');
    expect(note.lines.map((line) => [line.quantity, line.unit, line.name])).toEqual([
      [10, 'SAK', 'Semen Gresik 40kg'],
      [15, 'BTG', 'Besi Beton 08'],
    ]);
    expect(new Set(note.lines.map((line) => line.id)).size).toBe(2);
  });

  it('penerima memuat nama, alamat, dan telepon; bagian kosong dilewati', () => {
    expect(createExpeditionNote(invoice, koli).recipient).toBe(
      'Bu Sherly Tjoandra - Jl. Rajawali No 17 (0811230988)',
    );
    expect(
      createExpeditionNote({ ...invoice, customerAddress: '', customerPhone: '' }, koli).recipient,
    ).toBe('Bu Sherly Tjoandra');
    expect(
      createExpeditionNote({ ...invoice, customerName: '', customerPhone: '' }, koli).recipient,
    ).toBe('Jl. Rajawali No 17');
  });

  it('tanpa barang Koli menghasilkan catatan tanpa baris dan nomor SJ berurutan', () => {
    const first = createExpeditionNote(invoice, []);
    const second = createExpeditionNote(invoice, []);
    expect(first.lines).toEqual([]);
    expect(second.noteNumber).not.toBe(first.noteNumber);
  });
});

describe('upsertLine dan removeLine', () => {
  const base = createExpeditionNote(invoice, koli);

  it('tanpa id menambah baris baru di akhir', () => {
    const next = upsertLine(base, { quantity: 20, unit: 'KRG', name: 'Baut UNC' });
    expect(next.lines).toHaveLength(3);
    expect(next.lines[2]).toMatchObject({ quantity: 20, unit: 'KRG', name: 'Baut UNC' });
    expect(next.lines[2]?.id).not.toBe('');
    expect(base.lines).toHaveLength(2);
  });

  it('dengan id mengganti baris di tempat yang sama', () => {
    const target = base.lines[0];
    if (target === undefined) {
      throw new Error('baris awal wajib ada');
    }
    const next = upsertLine(base, { id: target.id, quantity: 99, unit: 'DUS', name: 'Ganti' });
    expect(next.lines).toHaveLength(2);
    expect(next.lines[0]).toEqual({ id: target.id, quantity: 99, unit: 'DUS', name: 'Ganti' });
    expect(next.lines[1]).toEqual(base.lines[1]);
  });

  it('id yang tidak dikenal ditambahkan sebagai baris baru', () => {
    const next = upsertLine(base, { id: 'tidak-ada', quantity: 1, unit: 'PCS', name: 'Baru' });
    expect(next.lines).toHaveLength(3);
  });

  it('removeLine membuang baris menurut id dan mengabaikan id tak dikenal', () => {
    const target = base.lines[1];
    if (target === undefined) {
      throw new Error('baris kedua wajib ada');
    }
    expect(removeLine(base, target.id).lines.map((line) => line.name)).toEqual([
      'Semen Gresik 40kg',
    ]);
    expect(removeLine(base, 'tidak-ada').lines).toHaveLength(2);
  });
});

describe('validateLine', () => {
  const ok = { quantity: '3', unit: 'KRG', name: 'BAUT UNC' };

  it('isian wajar lolos', () => {
    expect(validateLine(ok)).toBe('ok');
    expect(validateLine({ ...ok, quantity: '2,5' })).toBe('ok');
  });

  it('jumlah nol, negatif, kosong, atau bukan angka ditolak', () => {
    for (const quantity of ['0', '-1', '', 'abc']) {
      expect(validateLine({ ...ok, quantity })).toBe('quantity');
    }
  });

  it('satuan atau nama kosong atau hanya spasi ditolak', () => {
    expect(validateLine({ ...ok, unit: '  ' })).toBe('unit');
    expect(validateLine({ ...ok, name: '' })).toBe('name');
    expect(validateLine({ ...ok, name: '   ' })).toBe('name');
  });
});

describe('nextSeedVersion', () => {
  it('naik setiap kali dipanggil sehingga tautan Surat Jalan yang sama bisa membangun ulang panel', () => {
    const first = nextSeedVersion();
    const second = nextSeedVersion();
    expect(second).toBe(first + 1);
    expect(first).toBeGreaterThan(0);
  });
});
