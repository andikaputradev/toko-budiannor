import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const widgetIds = (page: Page): Promise<(string | null)[]> =>
  page
    .locator('section[data-widget]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-widget')));

const overflow = (page: Page): Promise<number> =>
  page.locator('.bo-content').evaluate((node) => node.scrollHeight - node.clientHeight);

test.describe('D1 sembilan widget tanpa scroll', () => {
  test('Owner melihat sembilan widget berurutan menurut gambar klien', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    expect(await widgetIds(page)).toEqual([
      'omset',
      'grafik',
      'kegiatan',
      'laba',
      'beban',
      'aset',
      'pelanggan',
      'barang',
      'hpp',
    ]);
    await expect(page.locator('[data-widget="stok"]')).toHaveCount(0);
  });

  test('Supervisor melihat lima widget tanpa Laba, Beban, Aset, dan Monitoring HPP', async ({
    page,
  }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    expect(await widgetIds(page)).toEqual(['omset', 'grafik', 'kegiatan', 'pelanggan', 'barang']);
  });

  test('halaman tidak melebihi tinggi layar untuk Owner dan Supervisor', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.locator('.bo-sidebar button').last().click();
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe('D2 jenis grafik', () => {
  test('Laba batang, Beban donat, Aset batang mendatar, Grafik garis', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await expect(page.locator('[data-widget="laba"] svg.bo-bars .bo-bars__bar')).toHaveCount(4);
    await expect(page.locator('[data-widget="beban"] svg.bo-donut .bo-donut__segment')).toHaveCount(
      5,
    );
    await expect(page.locator('[data-widget="beban"] .bo-dx-legend__row')).toHaveCount(5);
    await expect(page.locator('[data-widget="aset"] .bo-hbars__row')).toHaveCount(3);
    await expect(page.locator('[data-widget="grafik"] svg polyline')).toHaveCount(1);
  });

  test('batang bergaris lebar dan widget tampil tanpa pelanggaran CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
        violations.push(message.text());
      }
    });
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
    const width = await page
      .locator('[data-widget="aset"] .bo-hbars__fill')
      .first()
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(20);
  });

  test('toggle Harian dan Bulanan mengganti isi widget Omset', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    const omset = page.locator('[data-widget="omset"]');
    await expect(omset).toContainText('Omset Hari Ini');
    await omset.getByRole('button', { name: 'Bulanan' }).click();
    await expect(omset).toContainText('Omset Bulan Ini');
    await expect(omset.getByRole('button', { name: 'Bulanan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('D3 widget peringkat dan Monitoring HPP', () => {
  test('periode Penjualan Pelanggan berpindah ke bulan lalu dan Segarkan kembali ke bulan ini', async ({
    page,
  }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    const widget = page.locator('[data-widget="pelanggan"]');
    await expect(widget.locator('.bo-dx-period__label')).toHaveText('1 Okt - 19 Okt 2026');
    await expect(widget.getByRole('button', { name: 'Periode berikutnya' })).toBeDisabled();

    await widget.getByRole('button', { name: 'Periode sebelumnya' }).click();
    await expect(widget.locator('.bo-dx-period__label')).toHaveText('1 Sep - 30 Sep 2026');
    await expect(widget.getByRole('button', { name: 'Periode sebelumnya' })).toBeDisabled();

    await widget.getByRole('button', { name: 'Segarkan' }).click();
    await expect(widget.locator('.bo-dx-period__label')).toHaveText('1 Okt - 19 Okt 2026');
  });

  test('daftar peringkat bertanda 1 sampai 3 dan bisa difokus papan ketik', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    const widget = page.locator('[data-widget="barang"]');
    await expect(widget.locator('.bo-dx-medal--1')).toHaveText('1');
    await expect(widget.locator('.bo-dx-medal--3')).toHaveText('3');
    await expect(widget.locator('.bo-dx-scroll')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[data-widget="hpp"] .bo-dx-chip--bahaya').first()).toBeVisible();
    await expect(page.locator('[data-widget="hpp"] .bo-dx-chip--aman').first()).toBeVisible();
  });
});
