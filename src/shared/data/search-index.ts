import type { Product } from './types';

export const MIN_QUERY_LENGTH = 2;
export const SEARCH_BUDGET_MS = 300;

export interface SearchResult {
  readonly hits: readonly Product[];
  readonly total: number;
  readonly durationMs: number;
}

export interface SearchIndex {
  readonly size: number;
  readonly buildMs: number;
  search(query: string, limit?: number): SearchResult;
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/,.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((token) => token !== '');
}

function lowerBound(sorted: readonly string[], prefix: string): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle] ?? '') < prefix) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function measure(name: string, run: () => void): number {
  const start = `${name}:start`;
  const end = `${name}:end`;
  performance.mark(start);
  run();
  performance.mark(end);
  const duration = performance.measure(name, start, end).duration;
  performance.clearMarks(start);
  performance.clearMarks(end);
  performance.clearMeasures(name);
  return duration;
}

export function createSearchIndex(products: readonly Product[]): SearchIndex {
  const postings = new Map<string, number[]>();
  const barcodes = new Map<string, number>();
  const codes = new Map<string, number>();
  const names: string[] = [];
  let tokens: string[] = [];

  const buildMs = measure('index:build', () => {
    products.forEach((product, position) => {
      names.push(normalize(product.name));
      barcodes.set(product.barcode, position);
      codes.set(product.code.toLowerCase(), position);
      const words = new Set(
        tokenize(`${product.code} ${product.name} ${product.brand} ${product.category}`),
      );
      for (const word of words) {
        const list = postings.get(word);
        if (list === undefined) {
          postings.set(word, [position]);
        } else {
          list.push(position);
        }
      }
    });
    tokens = [...postings.keys()].sort();
  });

  const matchToken = (prefix: string): Set<number> => {
    const found = new Set<number>();
    for (let at = lowerBound(tokens, prefix); at < tokens.length; at += 1) {
      const token = tokens[at];
      if (!token?.startsWith(prefix)) {
        break;
      }
      for (const position of postings.get(token) ?? []) {
        found.add(position);
      }
    }
    return found;
  };

  const run = (query: string, limit: number): { hits: Product[]; total: number } => {
    const normalized = normalize(query);
    if (normalized.length < MIN_QUERY_LENGTH) {
      return { hits: [], total: 0 };
    }
    const barcodeAt = barcodes.get(normalized.replaceAll(' ', ''));
    const codeAt = codes.get(normalized);
    const exact = barcodeAt ?? codeAt;
    if (exact !== undefined) {
      const product = products[exact];
      return product === undefined ? { hits: [], total: 0 } : { hits: [product], total: 1 };
    }
    let candidates: Set<number> | undefined;
    for (const token of normalized.split(' ')) {
      const matches = matchToken(token);
      candidates =
        candidates === undefined
          ? matches
          : new Set([...candidates].filter((position) => matches.has(position)));
      if (candidates.size === 0) {
        break;
      }
    }
    const ordered = [...(candidates ?? [])].sort((first, second) => {
      const firstName = (names[first] ?? '').startsWith(normalized) ? 0 : 1;
      const secondName = (names[second] ?? '').startsWith(normalized) ? 0 : 1;
      return firstName - secondName || first - second;
    });
    const hits: Product[] = [];
    for (const position of ordered.slice(0, limit)) {
      const product = products[position];
      if (product !== undefined) {
        hits.push(product);
      }
    }
    return { hits, total: ordered.length };
  };

  return {
    size: products.length,
    buildMs,
    search: (query, limit = 50) => {
      let outcome: { hits: Product[]; total: number } = { hits: [], total: 0 };
      const durationMs = measure('search', () => {
        outcome = run(query, limit);
      });
      return { hits: outcome.hits, total: outcome.total, durationMs };
    },
  };
}
