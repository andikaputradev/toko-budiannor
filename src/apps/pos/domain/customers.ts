import type { Customer } from '../../../shared/data/types';

export interface CustomerGroup {
  readonly letter: string;
  readonly items: readonly Customer[];
}

// Awalan angka, simbol, atau nama kosong masuk grup ini, selalu paling akhir.
export const OTHER_INITIAL = '#';

const collator = new Intl.Collator('id', { sensitivity: 'base' });

// Huruf awal A sampai Z tanpa memandang besar kecil; huruf berdiakritik memakai huruf dasarnya.
function initialOf(name: string): string {
  const first = name.trim().normalize('NFD').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : OTHER_INITIAL;
}

// Mengelompokkan pelanggan per huruf awal nama, urut abjad, dengan grup "#" di akhir dan nama
// di dalam grup urut abjad tanpa memandang besar kecil.
export function groupByInitial(customers: readonly Customer[]): readonly CustomerGroup[] {
  const groups = new Map<string, Customer[]>();
  for (const customer of customers) {
    const letter = initialOf(customer.name);
    groups.set(letter, [...(groups.get(letter) ?? []), customer]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => {
      if (first === second) {
        return 0;
      }
      if (first === OTHER_INITIAL) {
        return 1;
      }
      return second === OTHER_INITIAL ? -1 : first.localeCompare(second);
    })
    .map(([letter, items]) => ({
      letter,
      items: [...items].sort((first, second) => collator.compare(first.name, second.name)),
    }));
}
