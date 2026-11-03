import { createSearchIndex, type SearchIndex } from '../../shared/data/search-index';
import type { Product } from '../../shared/data/types';

let cache: { readonly products: readonly Product[]; readonly index: SearchIndex } | undefined;

export function searchIndexFor(products: readonly Product[]): SearchIndex {
  if (cache?.products !== products) {
    cache = { products, index: createSearchIndex(products) };
  }
  return cache.index;
}

export function findProducts(
  products: readonly Product[],
  query: string,
  limit: number,
): Product[] {
  const text = query.trim();
  if (text.length < 2) {
    return products.slice(0, limit);
  }
  return [...searchIndexFor(products).search(text, limit).hits];
}
