import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../src/styles/tokens.css', import.meta.url), 'utf8');
const THEMES = ['oranye', 'terakota', 'teal', 'biru', 'hijau', 'ungu', 'merah', 'kuning'] as const;
const APPS = ['owner', 'sales'] as const;

describe('token tema untuk aplikasi mobile', () => {
  it('setiap palet punya blok terang dan blok gelap untuk Owner dan Sales', () => {
    for (const theme of THEMES) {
      for (const app of APPS) {
        expect(css, `${theme} ${app} terang`).toContain(
          `[data-pos-theme='${theme}'][data-app='${app}']`,
        );
        expect(css, `${theme} ${app} akar`).toContain(
          `:where([data-pos-theme='${theme}']) [data-app='${app}']`,
        );
        expect(css, `${theme} ${app} gelap`).toContain(
          `[data-pos-theme='${theme}'][data-app='${app}'][data-pos-scheme='gelap']`,
        );
      }
    }
  });

  it('skema gelap netral dikeluarkan untuk Owner dan Sales', () => {
    for (const app of APPS) {
      expect(css).toContain(`[data-app='${app}'][data-pos-scheme='gelap'] {`);
    }
  });

  it('gelap otomatis berbasis media query hanya berlaku bila mode belum dipilih', () => {
    expect(css).toContain(":not([data-theme='light']):not([data-pos-mode])");
    expect(css).not.toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*\[data-app='owner'\]:not\(\[data-theme='light'\]\) \{/,
    );
  });
});
