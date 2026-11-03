import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface VercelRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function headersFile(): Map<string, string> {
  const global = read('public/_headers').split(/\r?\n\r?\n/)[0] ?? '';
  const map = new Map<string, string>();
  for (const line of global.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    map.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return map;
}

describe('header hosting', () => {
  it('vercel.json memuat header global yang sama dengan public/_headers', () => {
    const config = JSON.parse(read('vercel.json')) as { headers: VercelRule[] };
    const global = config.headers.find((rule) => rule.source === '/(.*)');
    expect(global).toBeDefined();
    const vercel = new Map((global?.headers ?? []).map((item) => [item.key, item.value]));
    expect(vercel).toEqual(headersFile());
  });

  it('vercel.json membangun dist dengan perintah build proyek', () => {
    const config = JSON.parse(read('vercel.json')) as Record<string, unknown>;
    expect(config['buildCommand']).toBe('npm run build');
    expect(config['outputDirectory']).toBe('dist');
  });
});
