import { expect, test, type Locator, type Page } from '@playwright/test';

// Layar Transaksi Back-Office sesuai gambar klien 8 sampai 13 (revisi putaran ketiga).
// Berjalan pada build produksi: server dev membuang CSP.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const OWNER = ['haris.owner', 'Kunci2026A'] as const;

async function loginBo(
  page: Page,
  [username, password]: readonly [string, string] = OWNER,
): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function openPage(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page).toHaveURL(new RegExp(`#${hash.replace(/[?.]/g, '\\$&')}$`));
  await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute('href', `#${hash}`);
  await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-loading')).toHaveCount(0);
}

const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('.bo-content');
    return main === null ? 0 : main.scrollHeight - main.clientHeight;
  });
}

test.describe('T2 Daftar Nota (gambar 8)', () => {
  const list = (page: Page): Locator => active(page).locator('.bo-trx-list');
  const headers = (page: Page): Promise<string[]> =>
    list(page).locator('thead th').allTextContents();

  test('kartu judul, empat kotak angka, tombol, filter, dan pencarian', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const root = list(page);
    await expect(root.getByRole('heading', { name: 'Daftar Nota Penjualan' })).toBeVisible();
    for (const text of [
      'Jumlah Transaksi Hari Ini',
      'Total Transaksi Hari Ini',
      'Total Belum Lunas',
      'Total Jatuh Tempo',
    ]) {
      await expect(root.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(root.locator('.bo-trx-kpi__value').first()).toHaveText(/^\d+$/);
    await expect(root.locator('.bo-trx-kpi__value').nth(1)).toHaveText(/^Rp /);
    await expect(root.getByRole('button', { name: 'Buat Faktur Baru' })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Segarkan' })).toBeVisible();
    for (const name of ['Tanggal', 'Pelanggan', 'Status']) {
      await expect(root.getByLabel(name, { exact: true })).toBeVisible();
    }
    await expect(root.getByRole('searchbox', { name: /Cari No/ })).toBeVisible();
  });

  test('kolom Penjualan lalu Pembelian, tanpa kolom Aksi', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    expect(await headers(page)).toEqual([
      'No. Invoice',
      'No. SO',
      'Tanggal',
      'Pelanggan',
      'Pembayaran',
      'Status',
      'Umur Nota',
      'Total',
      'User',
      'Keterangan',
    ]);
    await list(page).getByRole('button', { name: 'Faktur Pembelian' }).click();
    await expect(list(page).getByRole('heading', { name: 'Daftar Nota Pembelian' })).toBeVisible();
    expect(await headers(page)).toEqual([
      'No. Invoice',
      'No. PO',
      'Tanggal',
      'Pemasok',
      'Pembayaran',
      'Status',
      'Umur Nota',
      'Total',
      'User',
      'Keterangan',
    ]);
    await expect(list(page).getByLabel('Pemasok', { exact: true })).toBeVisible();
  });

  test('nomor invoice adalah tautan ke faktur, Buat Faktur Baru membuka formulir', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const link = list(page).getByRole('link', { name: 'FJ26101234', exact: true });
    await expect(link).toHaveAttribute('href', '#/bo/penjualan?no=FJ26101234');
    await expect(link.locator('xpath=ancestor::tr')).toContainText('26101234');
    await expect(link.locator('xpath=ancestor::tr')).toContainText('Barang Besok Diambil');
    await list(page).getByRole('button', { name: 'Buat Faktur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);

    await openPage(page, '/bo/transaksi/daftar-nota?tab=pembelian');
    await list(page).getByRole('button', { name: 'Buat Faktur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/pembelian$/);
  });

  test('filter Status, Pelanggan, dan pencarian menyaring baris; hasil kosong ada pesannya', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const rows = list(page).locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    await list(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Status: Lunas' });
    const statuses = await list(page).locator('tbody tr td:nth-child(6)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses.map((text) => text.trim()))).toEqual(new Set(['Lunas']));
    await list(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Status: Semua' });

    await list(page)
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Pelanggan: Toko Arif' });
    const parties = await list(page).locator('tbody tr td:nth-child(4)').allTextContents();
    expect(parties.length).toBeGreaterThan(0);
    expect(new Set(parties.map((text) => text.trim()))).toEqual(new Set(['Toko Arif']));
    await list(page)
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Pelanggan: Semua' });

    await list(page)
      .getByRole('searchbox', { name: /Cari No/ })
      .fill('zzzz-tidak-ada');
    await expect(list(page).locator('.bo-trx-table__empty')).toHaveText(
      'Tidak ada nota transaksi yang sesuai filter.',
    );
    await list(page)
      .getByRole('searchbox', { name: /Cari No/ })
      .fill('FJ26101234');
    await expect(rows).toHaveCount(1);
  });

  test('muat satu layar di 1280x640: halaman tidak menggulir, tabel punya ruang', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    await expect(list(page).locator('tbody tr').first()).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    const height = await list(page)
      .locator('.bo-trx__lines')
      .evaluate((node) => node.clientHeight);
    expect(height).toBeGreaterThanOrEqual(170);
  });
});
