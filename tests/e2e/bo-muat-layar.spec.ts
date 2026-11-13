import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran kedua, syarat K2: semua halaman muat satu layar tanpa gulir naik turun
// pada layar acuan klien dan tiga ukuran umum lain. Hanya tabel atau daftar yang boleh menggulir di
// dalam panelnya. Daftar rute dibaca dari menu dan peta rute agar rute baru ikut terukur.

const SIZES = [
  { width: 1366, height: 640 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

const TOLERANCE = 1;

function boRoutes(): string[] {
  const menu = readFileSync(new URL('../../src/apps/bo/domain/menu.ts', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../../src/apps/bo/index.ts', import.meta.url), 'utf8');
  const paths = [
    ...menu.matchAll(/path: '(\/bo\/[^']*)'/g),
    ...index.matchAll(/^ {2}'(\/bo\/[^']+)': \{/gm),
  ].map((match) => match[1] ?? '');
  return [...new Set(paths)].filter((path) => path !== '');
}

async function loginBo(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'pc-1366x768', 'ukuran layar diatur di dalam tes');
});

test('daftar rute Back-Office terbaca lengkap', () => {
  const routes = boRoutes();
  expect(routes.length).toBeGreaterThanOrEqual(45);
  expect(routes).toContain('/bo/dashboard');
  expect(routes).toContain('/bo/barang');
});

for (const size of SIZES) {
  test(`tidak ada halaman BO yang menggulir di ${String(size.width)}x${String(size.height)}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await loginBo(page);
    const over: string[] = [];
    for (const route of boRoutes()) {
      await page.goto(`/#${route}`);
      await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute(
        'href',
        `#${route}`,
      );
      await page.waitForTimeout(250);
      const gap = await page.evaluate(() => {
        const main = document.querySelector('.bo-content');
        return {
          page: document.documentElement.scrollHeight - window.innerHeight,
          content: main === null ? 0 : main.scrollHeight - main.clientHeight,
        };
      });
      if (gap.page > TOLERANCE || gap.content > TOLERANCE) {
        over.push(`${route} halaman=${String(gap.page)} konten=${String(gap.content)}`);
      }
    }
    expect(over, `rute yang melebihi layar:\n${over.join('\n')}`).toEqual([]);
  });
}

test('Kartu Stok berisi barang tetap muat di layar acuan 1366x640', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 640 });
  await loginBo(page);
  await page.goto('/#/bo/laporan/stok?tab=kartu');
  await page.getByRole('button', { name: 'Semen PCC Karya Mandiri' }).click();
  await expect(page.getByRole('heading', { name: 'Semen PCC Karya Mandiri' })).toBeVisible();
  const gap = await page.evaluate(() => {
    const main = document.querySelector('.bo-content');
    return main === null ? 0 : main.scrollHeight - main.clientHeight;
  });
  expect(gap).toBeLessThanOrEqual(TOLERANCE);
});

test('Koreksi Stok berisi empat barang tetap muat dan tabel baris menggulir di dalam', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 640 });
  await loginBo(page);
  await page.goto('/#/bo/mutasi/koreksi');
  const picker = page.getByLabel('Cari atau pindai barang');
  for (const query of ['semen', 'cat', 'paku', 'pipa']) {
    await picker.fill(query);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.bo-korek__lines tbody tr')).toHaveCount(4);
  const gap = await page.evaluate(() => {
    const main = document.querySelector('.bo-content');
    return main === null ? 0 : main.scrollHeight - main.clientHeight;
  });
  expect(gap).toBeLessThanOrEqual(TOLERANCE);
});

test('label kolom isian formulir penjualan tertaut ke kontrolnya', async ({ page }) => {
  await loginBo(page);
  await page.goto('/#/bo/penjualan');
  await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute(
    'href',
    '#/bo/penjualan',
  );
  const broken = await page.evaluate(() => {
    const result: string[] = [];
    for (const caption of document.querySelectorAll('.bo-form-page .field > label.field__label')) {
      if (caption.parentElement?.querySelector('input, select, textarea') === null) {
        continue;
      }
      const target = caption.getAttribute('for');
      if (target === null || document.getElementById(target) === null) {
        result.push(caption.textContent);
      }
    }
    return result;
  });
  expect(broken).toEqual([]);
});

// Area gulir dalam, label tertaut, dan warna aksen harus tetap lolos axe pada seluruh rute BO,
// bukan hanya rute yang ada di katalog audit, pada terang dan gelap di layar acuan klien.
for (const scheme of ['light', 'dark'] as const) {
  test(`axe bersih pada seluruh rute BO, mode ${scheme}, 1366x640`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1366, height: 640 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await loginBo(page);
    const found: string[] = [];
    for (const route of boRoutes()) {
      await page.goto(`/#${route}`);
      await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute(
        'href',
        `#${route}`,
      );
      await page.waitForTimeout(250);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      for (const violation of result.violations) {
        found.push(`${route} ${violation.id} (${String(violation.nodes.length)})`);
      }
    }
    expect(found, `pelanggaran axe: ${found.join(', ')}`).toEqual([]);
  });
}
