import type { Product } from '../../../../shared/data/types';
import { message } from '../../../../shared/messages';
import { findProducts } from '../../search';
import { createCombo } from './combo-search';
import { TRX_TEXT as T } from './text';

const MAX_RESULTS = 8;
const MIN_QUERY = 2;

export interface ItemSearchOptions {
  readonly products: () => readonly Product[];
  readonly onPick: (product: Product) => void;
}

export interface ItemSearch {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  focus(): void;
}

// Kotak "Cari/Pilih Barang & Jasa" (gambar klien 12): daftar hasil berisi nama dengan teks cocok
// disorot dan kode di bawahnya. Pilihan dikosongkan dari kotak begitu diambil.
export function createItemSearch(options: ItemSearchOptions): ItemSearch {
  const combo = createCombo<Product>({
    find: (text) => findProducts(options.products(), text, MAX_RESULTS),
    name: (product) => product.name,
    detail: (product) => product.code,
    onPick: (product) => {
      combo.input.value = '';
      options.onPick(product);
    },
    placeholder: T.cariBarang,
    emptyText: message('MSG-006'),
    listLabel: T.cariBarangNama,
    inputLabel: T.cariBarangNama,
    minQuery: MIN_QUERY,
  });
  return combo;
}
