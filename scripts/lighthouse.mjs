import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { preview } from 'vite';

const SERVER_PORT = 4174;
const DEBUG_PORT = 9333;
const RUNS = Number(process.env.LH_RUNS ?? '3');
const OUT = new URL('../verifikasi/lighthouse/', import.meta.url);
const ORIGIN = `http://localhost:${String(SERVER_PORT)}`;

const DESKTOP = { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1, disabled: false };
const BACKOFFICE = { ...DESKTOP, width: 1440, height: 900 };
const PHONE = { mobile: true, width: 360, height: 800, deviceScaleFactor: 2, disabled: false };

// CPU 4x dan 4G lambat (profil "Slow 4G" Lighthouse), disimulasikan oleh Lighthouse.
const THROTTLING = {
  rttMs: 150,
  throughputKbps: 1638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1474.56,
  uploadThroughputKbps: 675,
  cpuSlowdownMultiplier: 4,
};

const TARGETS = [
  {
    id: 'POS-02',
    path: '/?tinjau=1#/pos/jual',
    formFactor: 'desktop',
    screen: DESKTOP,
    login: undefined,
  },
  {
    id: 'BO-03',
    path: '/?tinjau=1#/bo/barang',
    formFactor: 'desktop',
    screen: BACKOFFICE,
    login: undefined,
  },
  {
    id: 'OWN-02',
    path: '/#/owner/ringkasan',
    formFactor: 'mobile',
    screen: PHONE,
    login: { app: 'owner', user: 'haris.owner', password: 'Kunci2026A' },
  },
  {
    id: 'SALES-02',
    path: '/#/sales/katalog',
    formFactor: 'mobile',
    screen: PHONE,
    login: { app: 'sales', user: 'budi.sales', password: 'Kunci2026F' },
  },
];

const METRICS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['total-blocking-time', 'TBT'],
  ['cumulative-layout-shift', 'CLS'],
  ['speed-index', 'SI'],
  ['interactive', 'TTI'],
];

if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  throw new Error('dist belum ada: jalankan npm run build lebih dulu');
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function waitForChrome() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(DEBUG_PORT)}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Chrome belum siap menerima koneksi.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Chrome tidak merespons pada port debug');
}

async function seedLogins(targets) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(DEBUG_PORT)}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  for (const target of targets) {
    if (target.login === undefined) {
      continue;
    }
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/#/${target.login.app}`);
    await page.getByLabel('Nama pengguna').fill(target.login.user);
    await page.getByLabel('Kata sandi', { exact: true }).fill(target.login.password);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.waitForURL(new RegExp(`#/${target.login.app}/`));
    await page.close();
  }
  await browser.close();
}

function summarize(runs) {
  const pick = (read) => median(runs.map(read));
  return {
    performance: pick((lhr) => Math.round((lhr.categories.performance?.score ?? 0) * 100)),
    accessibility: pick((lhr) => Math.round((lhr.categories.accessibility?.score ?? 0) * 100)),
    bestPractices: pick((lhr) => Math.round((lhr.categories['best-practices']?.score ?? 0) * 100)),
    metrics: Object.fromEntries(
      METRICS.map(([key, name]) => [name, pick((lhr) => lhr.audits[key]?.numericValue ?? 0)]),
    ),
    performanceRuns: runs.map((lhr) => Math.round((lhr.categories.performance?.score ?? 0) * 100)),
  };
}

const server = await preview({
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  preview: { port: SERVER_PORT, strictPort: true, host: 'localhost', open: false },
});
const profile = await mkdtemp(join(tmpdir(), 'tbpos-lh-'));
const chrome = spawn(
  chromium.executablePath(),
  [
    '--headless=new',
    `--remote-debugging-port=${String(DEBUG_PORT)}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const results = [];
try {
  await waitForChrome();
  await seedLogins(TARGETS);
  await mkdir(OUT, { recursive: true });
  for (const target of TARGETS) {
    const runs = [];
    for (let run = 0; run < RUNS; run += 1) {
      const result = await lighthouse(`${ORIGIN}${target.path}`, {
        port: DEBUG_PORT,
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        formFactor: target.formFactor,
        screenEmulation: target.screen,
        throttlingMethod: 'simulate',
        throttling: THROTTLING,
        disableStorageReset: true,
      });
      if (result === undefined) {
        throw new Error(`Lighthouse tidak menghasilkan laporan untuk ${target.id}`);
      }
      runs.push(result.lhr);
      if (run === 0) {
        await writeFile(new URL(`${target.id}.json`, OUT), result.report, 'utf8');
      }
    }
    results.push({ id: target.id, ...summarize(runs) });
  }
} finally {
  chrome.kill();
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    () => undefined,
  );
}

console.log(
  `Lighthouse ${String(RUNS)} jalan per layar (median), CPU 4x, 4G lambat (RTT 150 ms, 1,6 Mbps)`,
);
console.log(
  'layar      Perf  Aksesibilitas  PraktikTerbaik   FCP     LCP     TBT     CLS    SI      TTI   (ms)',
);
for (const row of results) {
  const ms = (name) => String(Math.round(row.metrics[name])).padStart(6);
  console.log(
    `${row.id.padEnd(9)} ${String(row.performance).padStart(5)} ${String(row.accessibility).padStart(14)} ${String(row.bestPractices).padStart(15)}  ${ms('FCP')}  ${ms('LCP')}  ${ms('TBT')}  ${row.metrics.CLS.toFixed(3).padStart(6)} ${ms('SI')}  ${ms('TTI')}`,
  );
}
console.log(
  `Skor performa per jalan: ${results.map((r) => `${r.id} [${r.performanceRuns.join(', ')}]`).join('; ')}`,
);
await writeFile(new URL('ringkasan.json', OUT), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
