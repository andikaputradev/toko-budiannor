/* global window, Event */
// Tangkap layar aplikasi mobile (Owner atau Sales) lewat Chromium tanpa kepala, untuk pemeriksaan visual.
// Contoh:
//   node scripts/shot.mjs owner owner/ringkasan out/dashboard.png --theme biru --mode gelap
//   node scripts/shot.mjs sales sales/katalog out/katalog.png --click "button.mob-photo-button"
// Tulis rute tanpa awalan # atau / (Git Bash di Windows mengubah awalan /). Query boleh: owner/laporan?jenis=neraca.
// Opsi: --theme oranye|terakota|teal|biru|hijau|ungu, --mode terang|gelap|otomatis,
//       --width 390 --height 844 (tinggi besar, mis. 2400, menangkap seluruh isi gulir),
//       --click <selektor> (boleh diulang), --wait <ms>, --base http://localhost:5199, --offline.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const [app, route, out, ...rest] = process.argv.slice(2);
if (!['owner', 'sales', 'bo'].includes(app) || route === undefined || out === undefined) {
  console.error(
    'Pemakaian: node scripts/shot.mjs <owner|sales|bo> <rute, mis. owner/stok> <keluaran.png> [opsi]',
  );
  process.exit(2);
}
const options = { click: [] };
for (let index = 0; index < rest.length; index += 1) {
  const flag = rest[index];
  if (flag === '--offline') {
    options.offline = true;
  } else if (flag?.startsWith('--')) {
    const value = rest[(index += 1)];
    if (flag === '--click') {
      options.click.push(value);
    } else {
      options[flag.slice(2)] = value;
    }
  }
}
const base = options.base ?? 'http://localhost:5199';
const CREDENTIALS = {
  owner: { user: 'haris.owner', password: 'Kunci2026A' },
  bo: { user: 'haris.owner', password: 'Kunci2026A' },
  sales: { user: 'budi.sales', password: 'Kunci2026F' },
};
const credentials = CREDENTIALS[app];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: {
    width: Number(options.width ?? (app === 'bo' ? 1440 : 390)),
    height: Number(options.height ?? (app === 'bo' ? 900 : 844)),
  },
  deviceScaleFactor: 1,
  colorScheme: options.mode === 'gelap' ? 'dark' : 'light',
});
await context.addInitScript(
  ([theme, mode]) => {
    try {
      if (theme) window.localStorage.setItem('toko-budiannor-tema-pos', theme);
      if (mode) window.localStorage.setItem('toko-budiannor-mode-pos', mode);
    } catch {
      // abaikan
    }
  },
  [options.theme, options.mode],
);
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});
await page.goto(`${base}/#/${app}`);
await page.locator('input[type="text"]').first().fill(credentials.user);
await page.locator('input[type="password"]').first().fill(credentials.password);
await page
  .locator('form')
  .first()
  .evaluate((form) => form.requestSubmit());
await page.waitForURL(`**/#/${app}/**`);
if (options.offline) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
}
await page.evaluate(
  (hash) => {
    window.location.hash = hash;
  },
  `/${route.replace(/^#?\/?/, '')}`,
);
await page.waitForTimeout(Number(options.wait ?? 900));
for (const selector of options.click) {
  await page.locator(selector).first().click();
  await page.waitForTimeout(400);
}
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
if (problems.length > 0) {
  console.log(`PERINGATAN: ${String(problems.length)} masalah konsol`);
  for (const problem of problems.slice(0, 8)) console.log(`  ${problem}`);
}
console.log(`tersimpan: ${out}`);
