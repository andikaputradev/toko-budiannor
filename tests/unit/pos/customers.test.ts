import { describe, expect, it } from 'vitest';
import type { Customer } from '../../../src/shared/data/types';
import { groupByInitial } from '../../../src/apps/pos/domain/customers';

function customer(name: string, index = 0): Customer {
  return {
    id: `C-${String(index)}`,
    code: `PL${String(index)}`,
    name,
    phone: '',
    tier: 'eceran',
    limit: 0,
    invoices: [],
  };
}

function summary(groups: ReturnType<typeof groupByInitial>): [string, string[]][] {
  return groups.map((group) => [group.letter, group.items.map((item) => item.name)]);
}

describe('groupByInitial', () => {
  it('mengelompokkan per huruf awal urut abjad dan menaruh angka di akhir', () => {
    const groups = groupByInitial([
      customer('Budi', 1),
      customer('99 Toko', 2),
      customer('Agus', 3),
      customer('Zaki', 4),
      customer('Citra', 5),
      customer('Andi', 6),
      customer('123 Cat', 7),
      customer('Bambang', 8),
    ]);
    expect(summary(groups)).toEqual([
      ['A', ['Agus', 'Andi']],
      ['B', ['Bambang', 'Budi']],
      ['C', ['Citra']],
      ['Z', ['Zaki']],
      ['#', ['123 Cat', '99 Toko']],
    ]);
  });

  it('mengabaikan huruf besar dan kecil', () => {
    const groups = groupByInitial([customer('andre', 1), customer('Agus', 2), customer('ANDI', 3)]);
    expect(summary(groups)).toEqual([['A', ['Agus', 'ANDI', 'andre']]]);
  });

  it('menaruh awalan berdiakritik pada huruf dasarnya dan nama kosong pada #', () => {
    const groups = groupByInitial([customer('Élan', 1), customer('Eko', 2), customer('', 3)]);
    expect(summary(groups)).toEqual([
      ['E', ['Eko', 'Élan']],
      ['#', ['']],
    ]);
  });

  it('mempertahankan objek pelanggan dan mengembalikan daftar kosong untuk masukan kosong', () => {
    const one = customer('Agus', 1);
    expect(groupByInitial([one])[0]?.items[0]).toBe(one);
    expect(groupByInitial([])).toEqual([]);
  });
});
