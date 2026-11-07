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
  it('memuat blok akar tema, blok gelap login, dan permukaan gelap per tema', () => {
    for (const theme of ['oranye', 'terakota', 'teal', 'gelap']) {
      expect(css).toContain(`[data-pos-theme='${theme}'][data-app='pos']`);
      expect(css).toContain(`:where([data-pos-theme='${theme}']) [data-app='pos']`);
    }
    expect(css).toContain("[data-app='pos'][data-pos-surface='dark']");
    expect(css).toContain(
      ":where([data-pos-theme='teal']) [data-app='pos'][data-pos-surface='dark']",
    );
  });

  it('terakota memulihkan palet bawaan agar contoh warna tidak bocor dari tema aktif', () => {
    const block = css.slice(css.indexOf("[data-pos-theme='terakota'][data-app='pos']"));
    const head = block.slice(0, block.indexOf('}'));
    expect(head).toContain('--color-accent-default: var(--primitive-color-terracotta-600);');
  });

  it('mendefinisikan token aksen lembut', () => {
    expect(css).toContain('--color-accent-soft:');
  });
});
