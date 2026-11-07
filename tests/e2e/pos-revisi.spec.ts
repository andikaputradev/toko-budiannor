import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginPos, loginPosRaw, startShift } from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

test.describe('shift', () => {
  test('belum mulai shift, modal wajib diisi, lalu shift dimulai', async ({ page }) => {
    await loginPosRaw(page);
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
    await expect(
      page.getByText('Tekan tombol "Mulai Shift" untuk memulai pekerjaan Anda'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Isi modal awal terlebih dahulu.');
    await dialog.getByRole('button', { name: '1', exact: true }).click();
    await dialog.getByRole('button', { name: '000', exact: true }).click();
    await expect(dialog.locator('.pos-cash__value')).toHaveText('Rp 1.000');
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    await expect(dialog.locator('.pos-cash__value')).toHaveText('Rp 0');
    await dialog.getByRole('button', { name: '2', exact: true }).click();
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeHidden();
  });

  test('axe: gerbang shift dan modal modal awal tanpa pelanggaran', async ({ page }) => {
    await loginPosRaw(page);
    await page.evaluate(() => document.fonts.ready);
    const gate = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(gate.violations).toEqual([]);
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    await expect(page.getByRole('dialog', { name: 'Masukkan Modal' })).toBeVisible();
    const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(modal.violations).toEqual([]);
    const keys = page.getByRole('dialog').getByRole('button');
    for (const box of await keys.evaluateAll((nodes) =>
      nodes.map(
        (node) => node.getBoundingClientRect().toJSON() as { width: number; height: number },
      ),
    )) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('Biaya tanpa shift menampilkan gerbang yang sama', async ({ page }) => {
    await loginPosRaw(page);
    await page.evaluate(() => {
      window.location.hash = '/pos/biaya';
    });
    await expect(page).toHaveURL(/#\/pos\/biaya$/);
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
  });

  test('Frontliner langsung melihat kartu barang tanpa gerbang', async ({ page }) => {
    await loginPosRaw(page, 'Agus');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeHidden();
  });
});

test.describe('kerangka', () => {
  test('menu samping membuka layar dan menutup diri', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Riwayat Penjualan' }).click();
    await expect(page).toHaveURL(/#\/pos\/riwayat$/);
    await expect(drawer).toBeHidden();
  });

  test('Frontliner tidak melihat Riwayat, Biaya, dan Selesai Shift', async ({ page }) => {
    await loginPosRaw(page, 'Agus');
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer.getByRole('link', { name: 'Pesanan Baru' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Open Bill', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Riwayat Penjualan' })).toHaveCount(0);
    await expect(drawer.getByRole('link', { name: 'Biaya' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Selesai Shift' })).toHaveCount(0);
  });

  test('pemilih tema mengubah atribut, tersimpan, dan bertahan setelah muat ulang', async ({
    page,
  }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer.getByRole('radio', { name: 'Oranye' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await drawer.getByRole('radio', { name: 'Teal' }).click();
    await expect(drawer.getByRole('radio', { name: 'Teal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await page.evaluate(() => document.documentElement.dataset['posTheme'])).toBe('teal');
    expect(await page.evaluate(() => localStorage.getItem('toko-budiannor-tema-pos'))).toBe('teal');
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset['posTheme'])).toBe('teal');
  });

  test('chip Shift Dimulai, lencana Open Bill, dan Selesai Shift', async ({ page }) => {
    await loginPos(page);
    await expect(page.locator('.pos-shiftchip')).toHaveText('Shift Dimulai');
    await expect(page.locator('.pos-billlink .pos-badge')).toHaveText('3');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Selesai Shift' }).click();
    const summary = page.getByRole('dialog', { name: 'Selesai Shift' });
    await expect(summary).toContainText('Rp 500.000');
    await summary.getByRole('button', { name: 'Akhiri Shift' }).click();
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
    await expect(page.locator('.pos-shiftchip')).toBeHidden();
  });

  test('Keluar menuju login gelap, dan pengguna lain melanjutkan shift yang berjalan', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.locator('[data-pos-surface="dark"]')).toBeVisible();
    await loginPosRaw(page, 'Rizal');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(page.locator('.pos-shiftchip')).toHaveText('Shift Dimulai (Dewi)');
  });

  test('axe: menu samping terbuka tanpa pelanggaran dan semua kontrol 48 px', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Toko Budiannor' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
    const boxes = await page
      .getByRole('dialog')
      .locator('a, button')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) => node.getBoundingClientRect().toJSON() as { width: number; height: number },
        ),
      );
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });
});

test.describe('tema', () => {
  for (const theme of ['oranye', 'terakota', 'teal', 'gelap']) {
    test(`axe: login, gerbang shift, dan layar jual pada tema ${theme}`, async ({ page }) => {
      await page.goto('/#/pos');
      await page.evaluate((value) => {
        localStorage.setItem('toko-budiannor-tema-pos', value);
      }, theme);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const login = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(login.violations).toEqual([]);
      await loginPosRaw(page);
      const gate = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(gate.violations).toEqual([]);
      await startShift(page);
      const sell = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(sell.violations).toEqual([]);
    });
  }
});
