import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// POS, BO, dan Owner tidak ikut dikelompokkan: import() ke layar sekunder membuat potongan terpisah
// sehingga ukuran JS awal tetap di bawah anggaran.
const APPS = ['portal', 'sales'] as const;

const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/;

function globalHeaders(file: URL): Record<string, string> {
  const headers: Record<string, string> = {};
  let inGlobalRule = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inGlobalRule = line.trim() === '/*';
    } else if (inGlobalRule && line.includes(':')) {
      const separator = line.indexOf(':');
      headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return headers;
}

const securityHeaders = globalHeaders(new URL('./public/_headers', import.meta.url));

const devWithoutCsp = (): Plugin => ({
  name: 'dev-without-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(CSP_META, ''),
});

export default defineConfig({
  base: './',
  plugins: [devWithoutCsp()],
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: APPS.map((app) => ({
            name: `app-${app}`,
            test: new RegExp(`src[\\\\/]apps[\\\\/]${app}[\\\\/]`),
          })),
        },
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 4,
  },
});
