import { describe, expect, it } from 'vitest';
import { collectNotices } from '../../../src/apps/bo/notifications';
import type { BoSession } from '../../../src/apps/bo/bo-session';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';

// Lonceng notifikasi di header Back-Office (revisi final): pemberitahuan dihitung dari data toko.
function sessionOf(store: ReturnType<typeof createStore>, now: Date): BoSession {
  return { store, now: () => now } as unknown as BoSession;
}

describe('collectNotices', () => {
  const now = new Date('2026-10-19T10:00:00+07:00');

  it('mengumpulkan stok minimum dan piutang jatuh tempo dari data contoh, dengan tujuan halamannya', () => {
    const store = createStore({ dataset: generateDataset() });
    const notices = collectNotices(sessionOf(store, now));
    const ids = notices.map((notice) => notice.id);
    expect(ids).toContain('stok-minim');
    expect(ids).toContain('piutang');
    for (const notice of notices) {
      expect(notice.path.startsWith('/bo/'), notice.id).toBe(true);
      expect(notice.text.length, notice.id).toBeGreaterThan(8);
    }
    expect(notices.find((notice) => notice.id === 'stok-minim')?.path).toBe(
      '/bo/stok?filter=minimum',
    );
    expect(notices.find((notice) => notice.id === 'piutang')?.path).toBe(
      '/bo/hutang-piutang/saldo-piutang',
    );
  });

  it('teks memuat jumlah yang diformat dan tidak memakai tanda pisah panjang', () => {
    const store = createStore({ dataset: generateDataset() });
    for (const notice of collectNotices(sessionOf(store, now))) {
      expect(notice.text).not.toMatch(/[\u2013\u2014]/);
      expect(notice.text).not.toContain('{jumlah}');
    }
  });

  it('antrean POS belum terkirim ikut tampil bila ada, urutan dari yang paling mendesak', () => {
    const store = createStore({ dataset: generateDataset() });
    store.reportQueue(4);
    const ids = collectNotices(sessionOf(store, now)).map((notice) => notice.id);
    expect(ids).toContain('antrean');
    expect(ids.indexOf('antrean')).toBe(ids.length - 1);
    if (ids.includes('stok-negatif')) {
      expect(ids.indexOf('stok-negatif')).toBeLessThan(ids.indexOf('stok-minim'));
    }
  });
});
