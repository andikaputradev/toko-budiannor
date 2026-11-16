// Ukur keseragaman tampilan Back-Office (CATATAN dokumen klien 16 November 2026).
// Jalankan terhadap build produksi (`npm run build`, lalu `npm run serve`):
//
//   node scripts/ukur-seragam.mjs [--base http://127.0.0.1:4173] [--size 1280x640]
//        [--routes /bo/barang,/bo/dashboard] [--verbose]
//
// Memeriksa pada tiap rute: (1) teks berhuruf kapital semua pada label, kepala, dan tombol,
// (2) label yang berada di atas isian (seharusnya di kiri), (3) kepala tabel berwarna lain,
// (4) bentuk isian dan tombol yang tidak seragam, (5) istilah terlarang (Nota, Gudang Display,
// Gudang Besar). Keluar dengan kode 1 bila ada temuan.
/* global document, window, getComputedStyle -- dipakai di dalam page.evaluate */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const EXTRA_ROUTES = [
  '/bo/transaksi/daftar-nota?tab=pembelian',
  '/bo/mutasi?baru=1',
  '/bo/mutasi/koreksi?baru=1',
  '/bo/opname?baru=1',
];

function allRoutes() {
  const menu = readFileSync(new URL('../src/apps/bo/domain/menu.ts', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../src/apps/bo/index.ts', import.meta.url), 'utf8');
  const paths = [
    ...menu.matchAll(/path: '(\/bo\/[^']*)'/g),
    ...index.matchAll(/^ {2}'(\/bo\/[^']+)': \{/gm),
  ].map((match) => match[1]);
  return [...new Set([...paths, ...EXTRA_ROUTES])];
}

const base = option('base', 'http://127.0.0.1:4173');
const [width, height] = option('size', '1280x640').split('x').map(Number);
const routesArg = option('routes', '');
const routes = routesArg === '' ? allRoutes() : routesArg.split(',');
const verbose = process.argv.includes('--verbose');

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();
await page.goto(`${base}/#/bo`);
await page.getByLabel('Nama pengguna').fill('haris.owner');
await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
await page.getByRole('button', { name: 'Masuk' }).click();
await page.waitForURL(/#\/bo\/dashboard/);

const report = {};
for (const route of routes) {
  await page.goto(`${base}/#${route}`);
  await page.waitForTimeout(700);
  report[route] = await page.evaluate(() => {
    const panel = document.querySelector('.bo-tabpanel:not([hidden])') ?? document.body;
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        !node.closest('.visually-hidden')
      );
    };
    const text = (node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const out = { upper: [], above: [], head: [], shape: [], term: [], size: [] };
    const ALLOWED = new Set([
      'PO',
      'SO',
      'HPP',
      'QRIS',
      'EDC',
      'PDF',
      'WA',
      'TTD',
      'CSV',
      'SKU',
      'PSO',
      'HSO',
      'RFID',
      'KTP',
      'NPWP',
      'PPN',
      'QR',
      'UMKM',
      'FIFO',
      'OK',
      'PIN',
      'USB',
      'BCA',
      'BRI',
      'BNI',
      'CV',
      'UD',
      'PT',
      'WIB',
      'IDR',
      'JU',
      'FJ',
      'FB',
      'T',
      'KS',
      'TF',
      'KAS',
      'ID',
    ]);
    const labelNodes = panel.querySelectorAll(
      'button, label, th, legend, h1, h2, h3, h4, h5, h6, [class*="pill"], [class*="badge"], [class*="chip"], [class*="title"], [class*="label"]',
    );
    for (const node of labelNodes) {
      if (!visible(node) || node.children.length > 3) continue;
      const own = text(node);
      if (own === '' || own.length > 60) continue;
      const transform = getComputedStyle(node).textTransform;
      const letters = own.replace(/[^A-Za-z]/g, '');
      const words = own.split(' ').filter((word) => /^[A-Z]{3,}$/.test(word) && !ALLOWED.has(word));
      if (transform === 'uppercase' && letters.length > 2) {
        out.upper.push(`css:${own}`);
      } else if (words.length > 0 && words.length === own.split(' ').length) {
        out.upper.push(`teks:${own}`);
      }
    }
    for (const label of panel.querySelectorAll('label')) {
      if (!visible(label)) continue;
      const id = label.getAttribute('for');
      const control = id
        ? document.getElementById(id)
        : label.querySelector('input, select, textarea');
      if (control === null || !visible(control)) continue;
      if (control.type === 'checkbox' || control.type === 'radio' || control.type === 'hidden')
        continue;
      const a = label.getBoundingClientRect();
      const b = control.getBoundingClientRect();
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (a.bottom <= b.top + 3 && overlap > 8) out.above.push(text(label));
    }
    const heads = new Map();
    for (const th of panel.querySelectorAll('th')) {
      if (!visible(th)) continue;
      const colour = getComputedStyle(th).backgroundColor;
      const row = th.closest('tr');
      const rowColour = row === null ? '' : getComputedStyle(row).backgroundColor;
      const key = colour === 'rgba(0, 0, 0, 0)' ? rowColour : colour;
      heads.set(key, (heads.get(key) ?? 0) + 1);
    }
    out.head = [...heads.entries()].map(([colour, count]) => `${colour}x${count}`);
    const shapes = new Map();
    for (const node of panel.querySelectorAll(
      'input:not([type=checkbox]):not([type=radio]), select, textarea, button',
    )) {
      if (!visible(node)) continue;
      const radius = getComputedStyle(node).borderTopLeftRadius;
      const kind = node.tagName === 'BUTTON' ? 'tombol' : 'isian';
      const key = `${kind}:${radius}`;
      shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
    out.shape = [...shapes.entries()].map(([key, count]) => `${key}x${count}`);
    const bodyText = text(panel);
    for (const term of [/\bNota\b/g, /Gudang Display/g, /Gudang Besar/g, /\bnota\b/g]) {
      const found = bodyText.match(term);
      if (found !== null) out.term.push(`${term.source}x${found.length}`);
    }
    const sizes = new Map();
    for (const node of panel.querySelectorAll('th, label, button')) {
      if (!visible(node)) continue;
      const kind = node.tagName === 'TH' ? 'th' : node.tagName === 'LABEL' ? 'label' : 'button';
      const key = `${kind}:${getComputedStyle(node).fontSize}`;
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    out.size = [...sizes.entries()].map(([key, count]) => `${key}x${count}`);
    return out;
  });
}
await browser.close();

let findings = 0;
const totals = { upper: 0, above: 0, term: 0, headColours: new Set(), shapes: new Set() };
for (const [route, result] of Object.entries(report)) {
  const bad = [];
  if (result.upper.length > 0) bad.push(`kapital: ${result.upper.slice(0, 6).join(' | ')}`);
  if (result.above.length > 0) bad.push(`label di atas: ${result.above.slice(0, 6).join(' | ')}`);
  if (result.term.length > 0) bad.push(`istilah: ${result.term.join(', ')}`);
  totals.upper += result.upper.length;
  totals.above += result.above.length;
  totals.term += result.term.length;
  for (const entry of result.head) totals.headColours.add(entry.split('x')[0]);
  for (const entry of result.shape) totals.shapes.add(entry.split('x')[0]);
  if (bad.length > 0 || verbose) {
    findings += bad.length;
    console.log(`${route}\n  ${bad.join('\n  ')}`);
    if (verbose)
      console.log(
        `  kepala: ${result.head.join(', ')}\n  bentuk: ${result.shape.join(', ')}\n  ukuran: ${result.size.join(', ')}`,
      );
  }
}
console.log(
  `\nRingkasan ${width}x${height}: ${Object.keys(report).length} rute; kapital ${totals.upper}; label di atas ${totals.above}; istilah ${totals.term}`,
);
console.log(`Warna kepala tabel berbeda: ${[...totals.headColours].join(' ; ')}`);
console.log(`Bentuk isian dan tombol berbeda: ${[...totals.shapes].join(' ; ')}`);
process.exit(findings > 0 ? 1 : 0);
