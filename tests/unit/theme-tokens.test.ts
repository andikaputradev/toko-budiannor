import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const THEMES = ['oranye', 'terakota', 'teal', 'biru', 'hijau', 'ungu', 'merah', 'kuning'] as const;

function themedRows(): string[][] {
  const output = execFileSync('node', ['scripts/check-contrast.mjs'], { encoding: 'utf8' });
  expect(output).toContain('C. Tema POS');
  expect(output).toMatch(/0 gagal/);
  return output
    .slice(output.indexOf('C. Tema POS'))
    .split('\n')
    .filter((line) => /^\d+\s+\|/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

describe('kontras tema POS', () => {
  it('kontras: setiap palet lolos pada mode terang dan gelap', () => {
    const rows = themedRows();
    expect(rows).toHaveLength(THEMES.length * 10);
    for (const theme of THEMES) {
      const own = rows.filter((row) => row[1] === theme);
      expect(own, theme).toHaveLength(10);
      expect(own.filter((row) => row[2] === 'terang')).toHaveLength(5);
      expect(own.filter((row) => row[2] === 'gelap')).toHaveLength(5);
      expect(own.every((row) => row[8] === 'LOLOS')).toBe(true);
    }
  });
});

describe('token CSS tema POS', () => {
  it('tokens.css memuat blok akar untuk delapan palet', () => {
    for (const theme of THEMES) {
      expect(css).toContain(`[data-pos-theme='${theme}'][data-app='pos']`);
      expect(css).toContain(`:where([data-pos-theme='${theme}']) [data-app='pos']`);
    }
  });

  it('palet gelap lama tidak lagi memiliki blok data-pos-theme gelap', () => {
    expect(css).not.toContain("[data-pos-theme='gelap']");
  });

  it('blok netral gelap dikeluarkan untuk data-pos-surface dark dan data-pos-scheme gelap', () => {
    expect(css).toContain(
      "[data-app='pos'][data-pos-surface='dark'],\n[data-app='pos'][data-pos-scheme='gelap'] {",
    );
  });

  it('setiap palet punya blok gelap untuk permukaan login dan untuk skema gelap pada akar yang sama', () => {
    for (const theme of THEMES) {
      expect(css).toContain(
        `:where([data-pos-theme='${theme}']) [data-app='pos'][data-pos-surface='dark']`,
      );
      expect(css).toContain(`[data-pos-theme='${theme}'][data-app='pos'][data-pos-scheme='gelap']`);
    }
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
