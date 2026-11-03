import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../verifikasi/axe/', import.meta.url);
const base = fileURLToPath(ROOT);

let projects;
try {
  projects = (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory());
} catch {
  throw new Error('verifikasi/axe belum ada: jalankan npm run test:e2e lebih dulu');
}

let scanned = 0;
let violating = 0;
const rules = new Map();
const lines = [];
for (const project of projects.map((entry) => entry.name).sort()) {
  for (const file of (await readdir(join(base, project))).sort()) {
    const report = JSON.parse(await readFile(join(base, project, file), 'utf8'));
    scanned += 1;
    if (report.violations.length > 0) {
      violating += 1;
    }
    for (const violation of report.violations) {
      const key = `${violation.rule} (${violation.impact})`;
      rules.set(key, (rules.get(key) ?? 0) + violation.nodes.length);
      lines.push(
        `${project}  ${report.id}  ${violation.rule} (${violation.impact}) ${String(violation.nodes.length)} simpul: ${violation.help}`,
      );
      for (const node of violation.nodes.slice(0, 3)) {
        lines.push(`    ${node.target}`);
      }
    }
  }
}

console.log(`axe: ${String(scanned)} pindaian, ${String(violating)} memuat pelanggaran`);
for (const line of lines) {
  console.log(line);
}
if (rules.size > 0) {
  console.log('Ringkasan per aturan (jumlah simpul):');
  for (const [rule, count] of [...rules].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${rule}`);
  }
}
if (violating > 0) {
  process.exitCode = 1;
}
