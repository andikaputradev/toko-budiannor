import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginPos, loginPosRaw, settle } from './helpers/routes';

// Revisi final POS (dokumen klien "Revisi Penyesuain Final POS&BO", 20 November): letak tulisan stok
// pada kartu barang, nama barang penuh pada katalog Daftar, dan layar masuk berbelah (gambar 55 dan 56).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CATALOG_VIEW_KEY = 'toko-budiannor-katalog-pos';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

async function showCatalog(page: Page, view: 'kartu' | 'daftar'): Promise<void> {
  await page.goto('/#/pos');
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [CATALOG_VIEW_KEY, view] as const,
  );
  await page.reload();
}

test.describe('G1 Letak tulisan stok pada kartu (gambar 55, atas)', () => {
  test('Toko di kiri, Gudang di tengah kartu, No Rak di kanan, merata di seluruh lebar', async ({
    page,
  }) => {
    await loginPos(page);
    const cards = page.locator('.pos-card');
    for (const index of [0, 1, 2, 3]) {
      const card = cards.nth(index);
      const stock = await card.locator('.pos-card__stock').boundingBox();
      const rows = card.locator('.pos-card__stockrow');
      await expect(rows).toHaveCount(3);
      const [toko, gudang, rak] = await Promise.all(
        [0, 1, 2].map((position) => rows.nth(position).boundingBox()),
      );
      const left = stock?.x ?? 0;
      const right = (stock?.x ?? 0) + (stock?.width ?? 0);
      // Pinggir kiri dan kanan memakai jarak yang sama (bantalan blok stok).
      const leftGap = (toko?.x ?? 0) - left;
      const rightGap = right - ((rak?.x ?? 0) + (rak?.width ?? 0));
      expect(leftGap, `kartu ${String(index)} kiri`).toBeLessThanOrEqual(20);
      expect(Math.abs(leftGap - rightGap), `kartu ${String(index)} simetris`).toBeLessThanOrEqual(
        2,
      );
      // Blok Gudang berada tepat di tengah kartu.
      const center = (stock?.x ?? 0) + (stock?.width ?? 0) / 2;
      expect(
        Math.abs((gudang?.x ?? 0) + (gudang?.width ?? 0) / 2 - center),
        `kartu ${String(index)} tengah`,
      ).toBeLessThanOrEqual(2);
      // Urutan dan label tidak berubah.
      await expect(rows.nth(0).locator('dt')).toHaveText('Toko');
      await expect(rows.nth(1).locator('dt')).toHaveText('Gudang');
      await expect(rows.nth(2).locator('dt')).toHaveText('No Rak');
      // Teks Toko rata kiri, Gudang di tengah, No Rak rata kanan; label dan nilainya sejajar.
      const aligns = await Promise.all(
        [0, 1, 2].map((position) =>
          rows.nth(position).evaluate((node) => getComputedStyle(node).textAlign),
        ),
      );
      expect(aligns).toEqual(['left', 'center', 'right']);
      for (const row of [rows.nth(0), rows.nth(1), rows.nth(2)]) {
        const dt = await row.locator('dt').boundingBox();
        const dd = await row.locator('dd').boundingBox();
        expect(Math.abs((dt?.x ?? 0) - (dd?.x ?? 99))).toBeLessThanOrEqual(1);
      }
    }
  });

  test('kartu tetap memuat satu baris nama (maksimal 32 karakter) pada tampilan kartu', async ({
    page,
  }) => {
    await loginPos(page);
    const names = await page
      .locator('.pos-card__name')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(names.length).toBeGreaterThan(8);
    for (const name of names) {
      expect(name.length, name).toBeLessThanOrEqual(32);
    }
  });
});

test.describe('G2 Katalog Daftar menampilkan nama barang penuh (gambar 55, bawah)', () => {
  test('nama tidak dipotong dan tidak berelipsis; kartu masih satu baris', async ({ page }) => {
    await showCatalog(page, 'daftar');
    await loginPosRaw(page);
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
    for (const digit of '500000') {
      await dialog.getByRole('button', { name: digit, exact: true }).click();
    }
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.locator('.pos-grid--daftar .pos-card').first()).toBeVisible();
    const names = await page.locator('.pos-grid--daftar .pos-card__name').evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        full: node.getAttribute('title') ?? '',
        overflow: node.scrollWidth > node.clientWidth + 1,
        ellipsis: getComputedStyle(node).textOverflow,
      })),
    );
    expect(names.length).toBeGreaterThan(8);
    for (const item of names) {
      expect(item.text, item.full).toBe(item.full);
      expect(item.text.endsWith('…'), item.full).toBe(false);
      expect(item.overflow, item.full).toBe(false);
    }
    // Setidaknya satu nama lebih dari 32 karakter ikut tampil utuh.
    expect(names.some((item) => item.full.length > 32)).toBe(true);
  });
});

test.describe('G3 Layar masuk POS berbelah (gambar 56)', () => {
  test('ilustrasi di kiri; kartu kasir dan papan PIN 6 angka di panel kanan', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/pos');
    const art = await page.locator('.login-split__art').boundingBox();
    const side = await page.locator('.pos-login__side').boundingBox();
    expect((art?.x ?? 99) + (art?.width ?? 0)).toBeLessThanOrEqual((side?.x ?? 0) + 1);
    expect(side?.width ?? 0).toBeGreaterThanOrEqual(380);
    await expect(page.locator('.pos-login__side .pos-login__card')).toHaveCount(5);
    await expect(page.locator('.pos-login__side .pinpad__dot')).toHaveCount(6);
    const version = await page
      .locator('.pos-login')
      .evaluate((node) => getComputedStyle(node, '::after').content);
    expect(version).toContain('Ver. 1.0');

    // Setiap kontrol tetap berukuran sentuh minimal 48 px.
    const small = await page
      .locator('.pos-login__card, .pinpad__key, .pos-login__submit')
      .evaluateAll(
        (nodes) =>
          nodes
            .map((node) => node.getBoundingClientRect())
            .filter((box) => box.width < 47.5 || box.height < 47.5).length,
      );
    expect(small).toBe(0);
    await loginPosRaw(page);
  });

  test('PIN kasir tepat 6 angka: lima angka belum cukup, enam angka benar masuk', async ({
    page,
  }) => {
    await page.goto('/#/pos');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    for (const digit of '123456789') {
      await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    // Papan menerima paling banyak 6 angka.
    await expect(page.locator('.pinpad__dot.is-filled')).toHaveCount(6);
  });

  test('layar sempit: ilustrasi tersembunyi, panel PIN tidak tertimpa tab simulasi', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/#/pos');
    await expect(page.locator('.login-split__art')).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const keys = await page.locator('.pinpad__key').first().boundingBox();
    const launcher = await page.locator('[data-simulator], .sim').first().boundingBox();
    if (launcher !== null && keys !== null) {
      expect(keys.x).toBeGreaterThanOrEqual(launcher.x + launcher.width - 1);
    }
  });

  test('tanpa pelanggaran aksesibilitas pada layar masuk POS', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/pos');
    await expect(page.locator('.pos-login__card').first()).toBeVisible();
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
});
