import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url);
const JS_BUDGET_KB = 70;
const CSS_BUDGET_KB = 25;
const APPS = ['portal', 'pos', 'bo', 'owner', 'sales'];

const kb = (bytes) => (bytes / 1024).toFixed(2).replace('.', ',');

const names = (await readdir(new URL('assets/', DIST))).sort();
const sizes = new Map();
const sources = new Map();
for (const name of names) {
  const content = await readFile(new URL(`assets/${name}`, DIST));
  sizes.set(name, gzipSync(content).length);
  if (name.endsWith('.js')) {
    sources.set(name, content.toString('utf8'));
  }
}

const html = await readFile(new URL('index.html', DIST), 'utf8');
const entry = /<script[^>]+src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (entry === undefined) {
  throw new Error('Skrip masuk tidak ditemukan pada dist/index.html');
}
const entryCss = [
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\/([^"]+\.css)"/g),
].map((match) => match[1]);

function staticImports(name) {
  const source = sources.get(name) ?? '';
  return [
    ...source.matchAll(
      /(?:^|[;}\s])(?:import|export)\s*(?:[^"'`;]*?from\s*)?["'`]\.\/([^"'`]+\.js)["'`]/g,
    ),
  ].map((match) => match[1]);
}

// Berkas yang dimuat Vite saat import dinamis aplikasi: daftar __vite__mapDeps pada berkas masuk.
const mapDeps = /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]*)\]\)\)\)/.exec(
  sources.get(entry) ?? '',
);
const depTable =
  mapDeps === null ? [] : [...mapDeps[1].matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]);

function preloads(app) {
  const pattern = new RegExp(
    `import\\(["\`']\\./(${app}-[^"\`']+\\.js)["\`']\\)(?:\\.then\\([^)]*\\))?,__vite__mapDeps\\(\\[([\\d,]+)\\]\\)`,
  );
  const found = pattern.exec(sources.get(entry) ?? '');
  if (found === null) {
    throw new Error(`Import dinamis untuk aplikasi ${app} tidak ditemukan pada ${entry}`);
  }
  return found[2].split(',').map((index) => depTable[Number(index)]);
}

function closure(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name !== undefined && !seen.has(name) && sources.has(name)) {
      seen.add(name);
      queue.push(...staticImports(name));
    }
  }
  return seen;
}

const total = (set) => [...set].reduce((sum, name) => sum + (sizes.get(name) ?? 0), 0);

console.log('Ukuran gzip per berkas (KB)');
for (const name of names) {
  console.log(`${kb(sizes.get(name) ?? 0).padStart(8)}  assets/${name}`);
}

let failed = false;
const rows = [];
for (const app of APPS) {
  const deps = preloads(app);
  const js = closure([entry, ...deps.filter((name) => name.endsWith('.js'))]);
  const css = new Set([...entryCss, ...deps.filter((name) => name.endsWith('.css'))]);
  const jsBytes = total(js);
  const cssBytes = total(css);
  const jsFail = jsBytes / 1024 > JS_BUDGET_KB;
  const cssFail = cssBytes / 1024 > CSS_BUDGET_KB;
  failed ||= jsFail || cssFail;
  rows.push({ app, js: jsBytes, css: cssBytes, jsFail, cssFail, files: js.size + css.size });
}

console.log('');
console.log(
  `Anggaran awal per aplikasi: JS gzip <= ${String(JS_BUDGET_KB)} KB, CSS gzip <= ${String(CSS_BUDGET_KB)} KB`,
);
console.log(`${'aplikasi'.padEnd(8)} ${'JS (KB)'.padStart(9)} ${'CSS (KB)'.padStart(9)}  status`);
for (const row of rows) {
  const status = row.jsFail || row.cssFail ? 'GAGAL' : 'LOLOS';
  console.log(
    `${row.app.padEnd(8)} ${kb(row.js).padStart(9)} ${kb(row.css).padStart(9)}  ${status}`,
  );
}

if (failed) {
  console.error('budget: anggaran terlampaui');
  process.exitCode = 1;
} else {
  console.log('budget: semua aplikasi dalam anggaran');
}
