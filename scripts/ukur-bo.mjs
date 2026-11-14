// Ukur apakah halaman Back-Office melebihi tinggi layar (syarat "tanpa scroll" revisi BO).
// Jalankan terhadap build produksi (`npm run build`, lalu `npm run serve`), karena server dev
// membuang CSP dan tampilannya bisa berbeda.
//
//   node scripts/ukur-bo.mjs [--base http://127.0.0.1:4173] [--sizes 1366x640,1280x720]
//        [--routes /bo/barang,/bo/dashboard] [--shots /bo/barang --out hasil]
//
// Keluar dengan kode 1 bila ada rute yang melebihi layar.
/* global document, window -- dipakai di dalam page.evaluate, yang berjalan di peramban */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const DEFAULT_SIZES = '1366x640,1280x720,1366x768,1920x1080';
const TOLERANCE = 1;
// Isi harus terlihat, bukan hanya muat: tabel baris halaman Transaksi minimal 150 px tingginya.
const MIN_LINES_HEIGHT = 150;
// Tampilan lain pada rute yang sama (formulir PO dan SO, Daftar Nota Pembelian) ikut diukur.
const EXTRA_ROUTES = ['/bo/transaksi/daftar-nota?tab=pembelian'];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

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
const sizes = option('sizes', DEFAULT_SIZES)
  .split(',')
  .map((text) => {
    const [width, height] = text.split('x').map(Number);
    return { width, height, name: text };
  });
const routesArg = option('routes', '');
const routes = routesArg === '' ? allRoutes() : routesArg.split(',');
const shots = option('shots', '')
  .split(',')
  .filter((route) => route !== '');
const out = option('out', 'ukur-bo-hasil');
if (shots.length > 0) {
  mkdirSync(out, { recursive: true });
}

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  const page = await context.newPage();
  await page.goto(`${base}/#/bo`);
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/#\/bo\/dashboard/);

  const over = [];
  for (const route of routes) {
    await page.goto(`${base}/#${route}`);
    await page.waitForTimeout(600);
    const gap = await page.evaluate(() => {
      const main = document.querySelector('.bo-content');
      const lines = document.querySelector('.bo-tabpanel:not([hidden]) .bo-trx__lines');
      return {
        page: document.documentElement.scrollHeight - window.innerHeight,
        content: main === null ? 0 : main.scrollHeight - main.clientHeight,
        lines: lines === null ? undefined : lines.clientHeight,
      };
    });
    if (gap.page > TOLERANCE || gap.content > TOLERANCE) {
      over.push(`${route}  halaman=${gap.page} konten=${gap.content}`);
    }
    if (gap.lines !== undefined && gap.lines < MIN_LINES_HEIGHT) {
      over.push(`${route}  isi tidak terlihat: tabel baris hanya ${gap.lines} px`);
    }
    if (shots.includes(route)) {
      const name = route.replace(/[^a-z0-9]+/gi, '_');
      await page.screenshot({ path: join(out, `${size.name}${name}.png`) });
    }
  }
  failures += over.length;
  console.log(
    `\n== ${size.name}: ${String(over.length)} dari ${String(routes.length)} rute melebihi layar`,
  );
  for (const line of over) {
    console.log(`   ${line}`);
  }
  await context.close();
}

await browser.close();
process.exit(failures > 0 ? 1 : 0);
