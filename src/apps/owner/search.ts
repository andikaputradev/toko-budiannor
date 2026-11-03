import { createSearchIndex, type SearchIndex } from '../../shared/data/search-index';
import type { Product } from '../../shared/data/types';

let cache: { readonly products: readonly Product[]; readonly index: SearchIndex } | undefined;

export function findProducts(products: readonly Product[], query: string): Product[] {
  const text = query.trim();
  if (text.length < 2) {
    return [...products];
  }
  if (cache?.products !== products) {
    cache = { products, index: createSearchIndex(products) };
  }
  return [...cache.index.search(text, products.length).hits];
}
