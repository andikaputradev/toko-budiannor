import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'public',
  'spec',
]);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.txt',
  '.dart',
  '.svg',
  '.yml',
  '.yaml',
]);
const TEXT_FILENAMES = new Set(['.editorconfig', '.gitignore', '.prettierrc', '.prettierignore']);
const FORBIDDEN = new Map([
  [0x2013, 'en dash'],
  [0x2014, 'em dash'],
]);

async function collect(directory, found) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await collect(path, found);
      }
    } else if (TEXT_EXTENSIONS.has(extname(entry.name)) || TEXT_FILENAMES.has(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

function inspect(content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    let column = 0;
    for (const character of line) {
      column += 1;
      const label = FORBIDDEN.get(character.codePointAt(0));
      if (label !== undefined) {
        hits.push({ line: lineIndex + 1, column, label });
      }
    }
  });
  return hits;
}

const root = process.cwd();
const files = (await collect(root, [])).sort();
let violations = 0;

for (const file of files) {
  const hits = inspect(await readFile(file, 'utf8'));
  for (const hit of hits) {
    violations += 1;
    console.log(`${relative(root, file)}:${hit.line}:${hit.column} ${hit.label}`);
  }
}

console.log(`lint:teks ${files.length} berkas diperiksa, ${violations} pelanggaran`);

if (violations > 0) {
  process.exitCode = 1;
}
