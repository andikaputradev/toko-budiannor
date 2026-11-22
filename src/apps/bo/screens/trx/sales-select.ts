import { el } from '../../../../shared/dom';
import type { Store } from '../../../../shared/store/store';
import { salesNames } from '../../domain/master-sales';

export interface SalesSelect {
  readonly select: HTMLSelectElement;
  // Memilih nama Sales; nama di luar master (mis. pembuat pesanan lama) ditambahkan sebagai pilihan.
  set(name: string): void;
}

// Kolom Sales kepala dokumen: dipilih dari daftar Sales pada master seperti kolom Ekspedisi,
// bukan diketik. Daftar dibaca ulang saat kolom mendapat fokus karena master bisa berubah di tab lain.
export function createSalesSelect(store: Store, initial: string): SalesSelect {
  const select = el('select', { className: 'input is-select' });
  const fill = (chosen: string): void => {
    const names = salesNames(store);
    if (!names.includes(chosen)) {
      names.push(chosen);
    }
    select.replaceChildren(
      ...names.map((name) => el('option', { text: name, attrs: { value: name } })),
    );
    select.value = chosen;
  };
  fill(initial);
  select.addEventListener('focus', () => {
    fill(select.value);
  });
  return { select, set: fill };
}
