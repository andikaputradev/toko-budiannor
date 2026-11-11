import type { Dataset } from '../../../src/shared/data/types';

// POS hanya menjual stok toko (rak display). Uji alur lama yang menjual jumlah besar memakai data
// dengan stok toko berlimpah supaya batas stok tidak ikut diuji di sana; batas stok diuji khusus
// di stock-limit.test.ts memakai data asli.
export function withAmpleStock(dataset: Dataset): Dataset {
  return {
    ...dataset,
    products: dataset.products.map((product) => ({
      ...product,
      stock: { display: product.stock.display + 1_000_000, besar: product.stock.besar },
    })),
  };
}
