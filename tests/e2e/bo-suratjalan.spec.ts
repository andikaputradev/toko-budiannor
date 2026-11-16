import { expect, test, type Page } from '@playwright/test';

// Surat Jalan mengikuti pola daftar dengan tombol "+ Buat" (CATATAN klien 16 November): daftar
// dokumen tersimpan, formulir pada tab yang sama, dan Simpan Surat Jalan menyimpan dokumennya.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const panel = (page: Page) => page.locator('.bo-tabpanel:not([hidden])');

test('daftar Surat Jalan kosong, Buat membuka formulir, Simpan menyimpan dan membukanya lagi', async ({
  page,
}) => {
  await loginBo(page);
  await page.goto('/#/bo/transaksi/surat-jalan');
  await expect(
    panel(page).getByRole('heading', { name: 'Daftar Surat Jalan Ekspedisi' }),
  ).toBeVisible();
  await expect(panel(page).locator('.bo-trx-table__empty')).toContainText('Belum ada surat jalan');
  await panel(page).getByRole('button', { name: 'Buat Surat Jalan' }).click();
  await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan\?baru=1$/);
  await expect(page.locator('.bo-tab')).toHaveCount(2);
  await panel(page).getByRole('button', { name: 'Simpan Surat Jalan' }).click();
  await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan$/);
  const row = panel(page).locator('.bo-trx-table tbody tr').first();
  await expect(row).toContainText('SJ2610');
  await expect(row).toContainText('JNE Cargo');
  await expect(row.locator('td').last()).toHaveText('3');
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan\?no=SJ2610/);
  await expect(panel(page).getByLabel('Nama Ekspedisi')).toHaveValue('JNE Cargo');
  await panel(page).getByRole('button', { name: 'Kembali ke Daftar' }).click();
  await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan$/);
});
