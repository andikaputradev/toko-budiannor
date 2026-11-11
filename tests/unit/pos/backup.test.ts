import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { createStore } from '../../../src/shared/store/store';
import { backupFileName, buildBackup } from '../../../src/apps/pos/domain/backup';
import { createPosSession } from '../../../src/apps/pos/pos-session';

function setup() {
  const store = createStore({ dataset: generateDataset() });
  store.setUser('U-3');
  let now = 1_000_000;
  const session = createPosSession(store, {
    clock: () => now,
    schedule: (run) => {
      run();
    },
  });
  return { session, advance: (ms: number) => (now += ms) };
}

describe('buildBackup', () => {
  it('memuat penjualan, biaya, retur, bill tertahan, dan shift tertutup sebagai JSON sah', () => {
    const { session } = setup();
    session.startShift(500000);
    expect(session.saveExpense('makan', 'Parkir gudang', 5000)).toEqual({ ok: true });
    session.endShift(495000);
    const state = session.state();
    const text = buildBackup(state, '2026-10-19T03:05:00.000Z');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(['sales', 'expenses', 'returns', 'heldBills', 'closedShifts']),
    );
    expect(parsed['dibuatPada']).toBe('2026-10-19T03:05:00.000Z');
    expect(parsed['sales']).toEqual(JSON.parse(JSON.stringify(state.sales)));
    expect(parsed['expenses']).toHaveLength(1);
    expect(parsed['heldBills']).toHaveLength(state.heldBills.length);
    expect(parsed['returns']).toHaveLength(state.returns.length);
    expect(parsed['closedShifts']).toHaveLength(1);
  });

  it('tidak memuat PIN pengguna, baik bawaan maupun yang baru diganti', () => {
    const { session } = setup();
    session.startShift(500000);
    expect(session.changePin('U-3', '2468', '135790')).toEqual({ ok: true });
    const text = buildBackup(session.state(), '2026-10-19T03:05:00.000Z');
    expect(text).not.toContain('135790');
    expect(text).not.toMatch(/"pins?"/);
    expect(Object.keys(JSON.parse(text) as Record<string, unknown>)).not.toContain('pins');
  });
});

describe('backupFileName', () => {
  it('memakai tanggal dan jam WIB pada nama berkas', () => {
    expect(backupFileName('2026-10-19T03:05:00.000Z')).toBe('cadangan-pos-20261019-1005.json');
    expect(backupFileName('2026-10-19T18:30:00.000Z')).toBe('cadangan-pos-20261020-0130.json');
  });

  it('tetap menghasilkan nama sah untuk waktu yang tidak terbaca', () => {
    expect(backupFileName('bukan-tanggal')).toBe('cadangan-pos.json');
  });
});
