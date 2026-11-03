import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openGaya(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    problems.push(error.message);
  });
  await page.clock.install();
  await page.goto('/#/gaya');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return problems;
}

test('halaman gaya tanpa pelanggaran axe dan tanpa galat CSP', async ({ page }) => {
  const problems = await openGaya(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
  expect(problems).toEqual([]);
});

test('halaman gaya tidak menggulir ke samping', async ({ page }) => {
  await openGaya(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('empat kerangka tampil dan kerangka Owner gelap memakai latar gelap', async ({ page }) => {
  await openGaya(page);
  await expect(page.locator('.frame')).toHaveCount(4);
  const background = await page
    .locator('.frame[data-theme="dark"]')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).toBe('rgb(22, 24, 27)');
});

test('tabel virtual memuat 3.600 baris dengan sedikit simpul DOM', async ({ page }) => {
  await openGaya(page);
  const table = page.locator('.vtable').first();
  await expect(table).toHaveAttribute('aria-rowcount', '3601');
  const rendered = await table.locator('.vtable__row[data-index]').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(40);
  await table.locator('.vtable__viewport').focus();
  await page.keyboard.press('End');
  await expect(table.locator('[aria-current="true"]')).toHaveAttribute('aria-rowindex', '3601');
});

test('modal mengunci fokus dan Esc menutupnya', async ({ page }) => {
  await openGaya(page);
  const opener = page.getByRole('button', { name: 'Buka modal' }).first();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('toast sukses hilang dalam 4 detik dan toast error bertahan', async ({ page }) => {
  await openGaya(page);
  await page.getByRole('button', { name: 'Toast sukses' }).first().click();
  await page.getByRole('button', { name: 'Toast error' }).first().click();
  await expect(page.locator('.toast')).toHaveCount(2);
  await page.clock.fastForward(4100);
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast--error')).toBeVisible();
});

test('toast tidak menutupi tombol Bayar', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1280, 'Tombol Bayar hanya dirancang untuk layar POS');
  await openGaya(page);
  const pay = page.locator('.frame[data-app="pos"] .btn--pay');
  await pay.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Toast error' }).first().click();
  const toast = await page.locator('.toast').first().boundingBox();
  const target = await pay.boundingBox();
  expect(toast).not.toBeNull();
  expect(target).not.toBeNull();
  if (toast !== null && target !== null) {
    const overlaps =
      toast.x < target.x + target.width &&
      toast.x + toast.width > target.x &&
      toast.y < target.y + target.height &&
      toast.y + toast.height > target.y;
    expect(overlaps).toBe(false);
  }
});
