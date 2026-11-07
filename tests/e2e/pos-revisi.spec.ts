import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginPosRaw } from './helpers/routes';

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
