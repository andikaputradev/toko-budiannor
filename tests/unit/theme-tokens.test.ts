import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

describe('kontras tema POS', () => {
  it('npm run kontras lolos untuk keempat tema', () => {
    const output = execFileSync('node', ['scripts/check-contrast.mjs'], { encoding: 'utf8' });
    expect(output).toContain('C. Tema POS');
    for (const theme of ['oranye', 'terakota', 'teal', 'gelap']) {
      expect(output).toContain(theme);
    }
    expect(output).toMatch(/0 gagal/);
  });
});

describe('token CSS tema POS', () => {
  it('memuat blok tema dan permukaan gelap login', () => {
    expect(css).toContain("[data-pos-theme='oranye'][data-app='pos']");
    expect(css).toContain("[data-pos-theme='teal'][data-app='pos']");
    expect(css).toContain("[data-pos-theme='gelap'][data-app='pos']");
    expect(css).toContain("[data-app='pos'][data-pos-surface='dark']");
    expect(css).toContain("[data-pos-theme='teal'] [data-app='pos'][data-pos-surface='dark']");
  });

  it('tidak memuat blok untuk Terakota karena itu palet bawaan', () => {
    expect(css).not.toContain("[data-pos-theme='terakota']");
  });

  it('mendefinisikan token aksen lembut', () => {
    expect(css).toContain('--color-accent-soft:');
  });
});
