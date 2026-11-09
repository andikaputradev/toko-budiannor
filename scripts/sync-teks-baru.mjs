// Menambahkan label baru dari src/shared/labels/*.ts ke docs/teks-baru.md (uji messages.test.ts
// mewajibkan setiap label tercatat). Aman dijalankan berulang: hanya teks yang belum ada ditambahkan.
import { readdir, readFile, writeFile } from 'node:fs/promises';

const LABEL_DIR = new URL('../src/shared/labels/', import.meta.url);
const NOTES = new URL('../docs/teks-baru.md', import.meta.url);
const ENTRY =
  /^\s{2}(\w+):\s*(?:\r?\n\s*)?(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`),?\s*$/gm;

function unescape(text) {
  return text.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
}

const found = [];
for (const name of (await readdir(LABEL_DIR)).filter((file) => file.endsWith('.ts')).sort()) {
  const source = await readFile(new URL(name, LABEL_DIR), 'utf8');
  for (const match of source.matchAll(ENTRY)) {
    const text = unescape(match[2] ?? match[3] ?? match[4] ?? '');
    found.push([match[1], text]);
  }
}

let notes = await readFile(NOTES, 'utf8');
const newline = notes.includes('\r\n') ? '\r\n' : '\n';
let next = Math.max(0, ...[...notes.matchAll(/TB-(\d+)/g)].map((match) => Number(match[1]))) + 1;
const lines = [];
for (const [key, text] of found) {
  if (!notes.includes(`"${text}"`) && !lines.some((line) => line.includes(`"${text}".`))) {
    lines.push(`- TB-${String(next)}: "${text}". Kunci ${key}.`);
    next += 1;
  }
}
if (lines.length > 0) {
  notes = `${notes.trimEnd()}${newline}${lines.join(newline)}${newline}`;
  await writeFile(NOTES, notes);
}
console.log(
  `sync-teks-baru: ${String(lines.length)} teks baru dicatat dari ${String(found.length)} label`,
);
