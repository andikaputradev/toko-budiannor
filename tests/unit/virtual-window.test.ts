import { describe, expect, it } from 'vitest';
import { computeWindow } from '../../src/shared/virtual-window';

const base = { viewportHeight: 240, rowHeight: 40, total: 3600, overscan: 4 };

describe('computeWindow', () => {
  it('menampilkan baris awal dengan overscan di bawah', () => {
    const result = computeWindow({ ...base, scrollTop: 0 });
    expect(result.start).toBe(0);
    expect(result.end).toBe(11);
    expect(result.offset).toBe(0);
    expect(result.totalHeight).toBe(144000);
  });

  it('menggeser jendela mengikuti gulir', () => {
    const result = computeWindow({ ...base, scrollTop: 4000 });
    expect(result.start).toBe(96);
    expect(result.end).toBe(111);
    expect(result.offset).toBe(3840);
  });

  it('menjepit gulir di akhir daftar', () => {
    const result = computeWindow({ ...base, scrollTop: 999999 });
    expect(result.end).toBe(3600);
    expect(result.start).toBeLessThan(3600);
  });

  it('menjepit gulir negatif ke awal', () => {
    expect(computeWindow({ ...base, scrollTop: -50 }).start).toBe(0);
  });

  it('tidak pernah merender lebih dari satu layar ditambah overscan', () => {
    for (let top = 0; top < 144000; top += 777) {
      const { start, end } = computeWindow({ ...base, scrollTop: top });
      expect(end - start).toBeLessThanOrEqual(7 + 2 * base.overscan);
    }
  });

  it('menangani data lebih pendek dari layar', () => {
    const result = computeWindow({ ...base, total: 3, scrollTop: 0 });
    expect(result.start).toBe(0);
    expect(result.end).toBe(3);
  });
});
