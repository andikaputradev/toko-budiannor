import { contrast, luminance, themedRows } from './lib/contrast.mjs';
import { flatten, loadTokenDocument, resolveColor } from './lib/tokens.mjs';

const document = await loadTokenDocument(new URL('../tokens/tokens.json', import.meta.url));
const tokens = flatten(document);
const { limits, pairs } = document.contrast;
const TEXT_CLASSES = new Set(['normal', 'primary-pos']);
const LABELS = { light: 'terang', dark: 'gelap' };

function decimal(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

function evaluate(pair) {
  const context = { theme: pair.theme, profile: undefined };
  const foreground = resolveColor(tokens, pair.fg.slice(1, -1), context);
  const background = resolveColor(tokens, pair.bg.slice(1, -1), context);
  if (foreground.alpha !== 1 || background.alpha !== 1) {
    throw new Error(`Pasangan "${pair.name}" memakai warna transparan`);
  }
  const ratio = contrast(luminance(foreground.hex), luminance(background.hex));
  const exempt = pair.class === 'exempt';
  const limit = exempt ? undefined : limits[pair.class];
  if (!exempt && limit === undefined) {
    throw new Error(`Kelas kontras tidak dikenal pada "${pair.name}": ${pair.class}`);
  }
  const passed = exempt || ratio >= limit;
  let level = '-';
  if (TEXT_CLASSES.has(pair.class)) {
    level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : '-';
  }
  let specMatch = '-';
  if (pair.spec !== null) {
    specMatch = Number(ratio.toFixed(2)) === pair.spec ? 'ya' : 'TIDAK';
  }
  let result = 'LOLOS';
  if (exempt) {
    result = 'DIKECUALIKAN';
  } else if (!passed) {
    result = 'GAGAL';
  }
  return {
    name: pair.name,
    theme: LABELS[pair.theme],
    foreground: foreground.hex,
    background: background.hex,
    ratio,
    ratioText: `${decimal(ratio, 2)} : 1`,
    specText: pair.spec === null ? '-' : `${decimal(pair.spec, 2)} : 1`,
    limitText: limit === undefined ? '-' : `${decimal(limit, 1).replace(',0', '')} : 1`,
    level,
    specMatch,
    result,
  };
}

function renderTable(rows) {
  const header = [
    'No',
    'Pasangan',
    'Tema',
    'Teks',
    'Latar',
    'Rasio',
    'Spek 4.2',
    'Batas',
    'Tingkat',
    'Cocok',
    'Hasil',
  ];
  const body = rows.map((row, index) => [
    String(index + 1),
    row.name,
    row.theme,
    row.foreground,
    row.background,
    row.ratioText,
    row.specText,
    row.limitText,
    row.level,
    row.specMatch,
    row.result,
  ]);
  return renderGrid(header, body);
}

function renderGrid(header, body) {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((line) => line[column].length)),
  );
  const format = (line) =>
    line
      .map((cell, column) => cell.padEnd(widths[column]))
      .join(' | ')
      .trimEnd();
  const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
  return [format(header), separator, ...body.map(format)].join('\n');
}

const evaluated = pairs.map(evaluate);
const fromSpec = evaluated.filter((row) => row.specText !== '-');
const additional = evaluated.filter((row) => row.specText === '-');

console.log('Rasio kontras WCAG 2.2, rumus (L1 + 0,05) / (L2 + 0,05)');
console.log('');
console.log('A. Pasangan pada tabel 4.2 spesifikasi');
console.log(renderTable(fromSpec));
console.log('');
console.log('B. Pasangan tambahan [Usulan]');
console.log(renderTable(additional));
console.log('');

const themeRows = themedRows(document, tokens);
console.log('C. Tema POS [Usulan]');
console.log(
  renderGrid(
    ['No', 'Tema', 'Mode', 'Pasangan', 'Teks', 'Latar', 'Rasio', 'Batas', 'Hasil'],
    themeRows.map((row, index) => [
      String(index + 1),
      row.theme,
      LABELS[row.mode],
      row.name,
      row.foreground,
      row.background,
      `${decimal(row.ratio, 2)} : 1`,
      `${decimal(row.limit, 1).replace(',0', '')} : 1`,
      row.passed ? 'LOLOS' : 'GAGAL',
    ]),
  ),
);
console.log('');

const failed =
  evaluated.filter((row) => row.result === 'GAGAL').length +
  themeRows.filter((row) => !row.passed).length;
const exempted = evaluated.filter((row) => row.result === 'DIKECUALIKAN').length;
const mismatched = evaluated.filter((row) => row.specMatch === 'TIDAK').length;
const passed = evaluated.length - failed - exempted;
console.log(
  `Ringkasan: ${evaluated.length} pasangan, ${passed} lolos, ${exempted} dikecualikan, ${failed} gagal, ${mismatched} selisih terhadap tabel 4.2`,
);

if (failed > 0 || mismatched > 0) {
  process.exitCode = 1;
}
