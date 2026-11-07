import { expect, test, type Page } from '@playwright/test';
import { loginPos, loginPosRaw } from './helpers/routes';

// Spesifikasi ini mengatur ukuran layarnya sendiri, jadi hanya berjalan di satu proyek.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'tablet-1280x800',
    'Ukuran layar diatur oleh spesifikasi ini sendiri',
  );
});

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function openHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '/pos/riwayat';
  });
  await expect(page.locator('.pos-split')).toBeVisible();
}

test.describe('ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('modal selebar layar pada 360 px', async ({ page }) => {
    await loginPosRaw(page);
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(360, 0);
  });

  test('topbar tidak meluap pada 360 px', async ({ page }) => {
    await loginPos(page);
    const overflow = await page
      .locator('.pos-topbar')
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('login tidak punya scroll horizontal pada 360 px', async ({ page }) => {
    await page.goto('/#/pos');
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('riwayat: daftar dulu, detail setelah dipilih, lalu tombol Kembali', async ({ page }) => {
    await loginPos(page);
    await openHistory(page);
    const split = page.locator('.pos-split');
    await expect(split).toHaveAttribute('data-pane', 'daftar');
    await expect(page.locator('.pos-history__detail')).toBeHidden();
    await page.locator('.pos-history__item').first().click();
    await expect(split).toHaveAttribute('data-pane', 'detail');
    await expect(page.locator('.pos-history__detail')).toBeVisible();
    await expect(page.locator('.pos-history__list')).toBeHidden();
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await expect(split).toHaveAttribute('data-pane', 'daftar');
    await expect(page.locator('.pos-history__list')).toBeVisible();
  });
});

test.describe('tablet potret 768 x 1024', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('login tidak punya scroll horizontal pada 768 px', async ({ page }) => {
    await page.goto('/#/pos');
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('tablet lanskap 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('riwayat: daftar dan detail berdampingan tanpa tombol Kembali', async ({ page }) => {
    await loginPos(page);
    await openHistory(page);
    await expect(page.locator('.pos-history__list')).toBeVisible();
    await expect(page.locator('.pos-history__detail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembali', exact: true })).toBeHidden();
  });
});
