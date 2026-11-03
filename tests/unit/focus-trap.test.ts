import { describe, expect, it } from 'vitest';
import { cycleIndex, isEscape, trapTab, type FocusTarget } from '../../src/shared/focus-trap';

interface FakeTarget extends FocusTarget {
  readonly name: string;
}

function createTargets(names: readonly string[], log: string[]): FakeTarget[] {
  return names.map((name) => ({
    name,
    focus: () => {
      log.push(name);
    },
  }));
}

function createEvent(key: string, shiftKey = false) {
  const state = { prevented: false };
  return {
    state,
    event: {
      key,
      shiftKey,
      preventDefault: () => {
        state.prevented = true;
      },
    },
  };
}

describe('cycleIndex', () => {
  it('maju dan berputar ke awal', () => {
    expect(cycleIndex(0, 3, false)).toBe(1);
    expect(cycleIndex(2, 3, false)).toBe(0);
  });

  it('mundur dan berputar ke akhir', () => {
    expect(cycleIndex(1, 3, true)).toBe(0);
    expect(cycleIndex(0, 3, true)).toBe(2);
  });

  it('memilih ujung bila fokus di luar daftar', () => {
    expect(cycleIndex(-1, 3, false)).toBe(0);
    expect(cycleIndex(-1, 3, true)).toBe(2);
    expect(cycleIndex(9, 3, false)).toBe(0);
  });

  it('mengembalikan -1 bila daftar kosong', () => {
    expect(cycleIndex(0, 0, false)).toBe(-1);
  });
});

describe('trapTab', () => {
  it('mengabaikan tombol selain Tab', () => {
    const log: string[] = [];
    const targets = createTargets(['a', 'b'], log);
    const { event, state } = createEvent('Enter');
    expect(trapTab(event, targets, targets[0])).toBe(false);
    expect(state.prevented).toBe(false);
    expect(log).toEqual([]);
  });

  it('memindahkan fokus ke elemen berikutnya dan mencegah bawaan peramban', () => {
    const log: string[] = [];
    const targets = createTargets(['a', 'b', 'c'], log);
    const { event, state } = createEvent('Tab');
    expect(trapTab(event, targets, targets[0])).toBe(true);
    expect(state.prevented).toBe(true);
    expect(log).toEqual(['b']);
  });

  it('berputar dari elemen terakhir ke pertama', () => {
    const log: string[] = [];
    const targets = createTargets(['a', 'b', 'c'], log);
    trapTab(createEvent('Tab').event, targets, targets[2]);
    expect(log).toEqual(['a']);
  });

  it('berputar dari elemen pertama ke terakhir dengan Shift', () => {
    const log: string[] = [];
    const targets = createTargets(['a', 'b', 'c'], log);
    trapTab(createEvent('Tab', true).event, targets, targets[0]);
    expect(log).toEqual(['c']);
  });

  it('masuk ke elemen pertama bila fokus berada di luar daftar', () => {
    const log: string[] = [];
    const targets = createTargets(['a', 'b'], log);
    trapTab(createEvent('Tab').event, targets, {});
    expect(log).toEqual(['a']);
  });

  it('menahan Tab tanpa error bila tidak ada elemen yang dapat difokus', () => {
    const { event, state } = createEvent('Tab');
    expect(trapTab(event, [], null)).toBe(true);
    expect(state.prevented).toBe(true);
  });
});

describe('isEscape', () => {
  it('mengenali Escape', () => {
    expect(isEscape({ key: 'Escape' })).toBe(true);
    expect(isEscape({ key: 'Esc' })).toBe(true);
    expect(isEscape({ key: 'Enter' })).toBe(false);
  });
});
