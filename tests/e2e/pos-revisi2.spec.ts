import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginPos, settle } from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEME_KEY = 'toko-budiannor-tema-pos';
const MODE_KEY = 'toko-budiannor-mode-pos';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

async function seedStorage(page: Page, values: Record<string, string | null>): Promise<void> {
  await page.goto('/#/pos');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  }, values);
  await page.reload();
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  return page.getByRole('dialog', { name: 'Toko Budiannor' });
}

test.describe('tampilan', () => {
  test('mode Otomatis mengikuti emulateMedia gelap dan terang tanpa memuat ulang', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-mode', 'otomatis');
    await expect(root).toHaveAttribute('data-pos-scheme', 'terang');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-pos-scheme', 'terang');
  });

  test('memilih palet Biru mengubah warna aksen yang dipakai tombol utama', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    const accent = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent-default')
          .trim()
          .toLowerCase(),
      );
    expect(await accent()).toBe('#b94f00');
    const drawer = await openDrawer(page);
    await drawer
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Biru' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-pos-theme', 'biru');
    expect(await accent()).toBe('#1d4ed8');
  });

  test('pilihan Mode Gelap bertahan setelah muat ulang dan mengalahkan perangkat terang', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    const drawer = await openDrawer(page);
    await drawer
      .getByRole('radiogroup', { name: 'Mode Tampilan' })
      .getByRole('radio', { name: 'Gelap' })
      .click();
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await page.reload();
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('tema gelap lama pada penyimpanan menjadi Oranye mode Gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(page, { [THEME_KEY]: 'gelap', [MODE_KEY]: null });
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-theme', 'oranye');
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('layar jual lolos axe pada mode gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(page, { [THEME_KEY]: 'oranye', [MODE_KEY]: 'gelap' });
    await loginPos(page);
    await expect(page.locator('html')).toHaveAttribute('data-pos-scheme', 'gelap');
    const pageBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-bg-page')
        .trim()
        .toLowerCase(),
    );
    expect(pageBackground).toBe('#16181b');
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
  });
});

test.describe('foto kartu barang', () => {
  async function search(page: Page, text: string): Promise<void> {
    await page.locator('#pos-search').fill(text);
    await page.locator('#pos-search').press('Enter');
  }

  test('barang bangkitan memakai foto kategori yang ada dan memuat gambarnya', async ({ page }) => {
    await loginPos(page);
    await search(page, 'Cat Tembok');
    const card = page.locator('.pos-card', { hasText: /CAT TEMBOK/i }).first();
    const photo = card.locator('img.pos-photo--img');
    await expect(photo).toHaveAttribute('src', /kategori\/cat\.webp$/);
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
  });

  test('barang bangkitan tanpa foto kategori tetap memakai kotak placeholder', async ({ page }) => {
    await loginPos(page);
    await search(page, 'Stop Kontak');
    const card = page.locator('.pos-card', { hasText: /STOP KONTAK/i }).first();
    await expect(card.locator('span.pos-photo')).toBeVisible();
    await expect(card.locator('img.pos-photo--img')).toHaveCount(0);
  });

  test('barang proposal tetap memakai fotonya sendiri, bukan foto kategori', async ({ page }) => {
    await loginPos(page);
    const semen = page.locator('.pos-card', { hasText: /SEMEN GRESIK/i }).first();
    await expect(semen.locator('img.pos-photo--img')).toHaveAttribute(
      'src',
      /produk\/semen-gresik-40kg\.webp$/,
    );
  });
});
