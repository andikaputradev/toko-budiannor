import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  chooseCustomer,
  clickPay,
  loginPos,
  loginPosRaw,
  sellFirstProduct,
  settle,
} from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

// Kontrol POS yang bersinggungan dengan peluncur Panel Simulasi tidak dapat diketuk pengguna.
async function controlsUnderLauncher(page: Page, scope = '.pos main'): Promise<string[]> {
  return page.evaluate((root) => {
    const launcher = document.querySelector('.sim__launcher');
    if (launcher === null) {
      return [];
    }
    const box = launcher.getBoundingClientRect();
    const selector = ['button', 'input', 'a'].map((tag) => `${root} ${tag}`).join(', ');
    return [...document.querySelectorAll(selector)]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        const overlaps =
          rect.right > box.left &&
          rect.left < box.right &&
          rect.bottom > box.top &&
          rect.top < box.bottom;
        return visible && overlaps;
      })
      .map((node) => (node.textContent.trim() || node.className).slice(0, 30));
  }, scope);
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

  test('Panel Simulasi tidak menutupi kontrol di layar jual dan riwayat pada 768 px', async ({
    page,
  }) => {
    await loginPos(page);
    expect(await controlsUnderLauncher(page), 'jual').toEqual([]);
    await openHistory(page);
    await page.getByRole('button', { name: 'Filter' }).click();
    expect(await controlsUnderLauncher(page), 'riwayat').toEqual([]);
  });

  test('login tidak punya scroll horizontal pada 768 px', async ({ page }) => {
    await page.goto('/#/pos');
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('tablet lanskap 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('riwayat pada 360 px dengan transaksi Bu Sherly Tjoandra tidak meluap atau terpotong', async ({
    page,
  }) => {
    await loginPos(page);
    await chooseCustomer(page, 'Bu Sherly');
    await sellFirstProduct(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await openHistory(page);
    await page.getByRole('searchbox', { name: 'Cari Penjualan' }).fill('Sherly');
    const row = page.locator('.pos-history__item').first();
    await expect(row).toContainText('Bu Sherly Tjoandra');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const clipped = await page
      .locator('.pos-history__item')
      .evaluateAll((rows) => rows.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
    expect(clipped).toBe(0);
    await row.click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const wrapped = await page
      .locator('.pos-history__figure output')
      .evaluateAll(
        (nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 30).length,
      );
    expect(wrapped, 'angka kartu penerimaan satu baris').toBe(0);
    const detailClipped = await page
      .locator('.pos-history__detail')
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(detailClipped).toBeLessThanOrEqual(1);
  });

  test('modal Retur layar penuh pada 360 px dengan tombol Retur menempel di bawah', async ({
    page,
  }) => {
    await loginPos(page);
    await sellFirstProduct(page);
    await openHistory(page);
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    await page.setViewportSize({ width: 360, height: 800 });
    const dialog = page.getByRole('dialog', { name: /Retur Penjualan/ });
    const box = await dialog.boundingBox();
    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(360, 0);
    const retur = dialog.getByRole('button', { name: 'Retur', exact: true });
    await expect(retur).toBeInViewport({ ratio: 1 });
    const returBox = await retur.boundingBox();
    expect((returBox?.x ?? -1) + (returBox?.width ?? 0)).toBeLessThanOrEqual(360);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const name = await dialog.locator('.pos-return__name').first().boundingBox();
    expect(name?.width ?? 0).toBeGreaterThanOrEqual(150);
  });

  test('Panel Simulasi tidak menutupi kontrol di jual, riwayat, dan modal Retur pada 360 px', async ({
    page,
  }) => {
    await loginPos(page);
    await sellFirstProduct(page);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await controlsUnderLauncher(page), 'jual').toEqual([]);
    await openHistory(page);
    expect(await controlsUnderLauncher(page), 'daftar riwayat').toEqual([]);
    await page.locator('.pos-history__item').first().click();
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    expect(await controlsUnderLauncher(page, '.modal'), 'modal Retur').toEqual([]);
  });

  test('Panel Simulasi tidak menutupi kontrol di layar jual dan riwayat', async ({ page }) => {
    await loginPos(page);
    expect(await controlsUnderLauncher(page), 'jual').toEqual([]);
    await openHistory(page);
    await page.getByRole('button', { name: 'Filter' }).click();
    expect(await controlsUnderLauncher(page), 'riwayat').toEqual([]);
    await page.getByRole('button', { name: 'Menu' }).click();
    expect(await controlsUnderLauncher(page, '.modal--drawer'), 'menu samping').toEqual([]);
  });

  test('riwayat: daftar dan detail berdampingan tanpa tombol Kembali', async ({ page }) => {
    await loginPos(page);
    await openHistory(page);
    await expect(page.locator('.pos-history__list')).toBeVisible();
    await expect(page.locator('.pos-history__detail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembali', exact: true })).toBeHidden();
  });
});

async function addFirstProduct(page: Page): Promise<void> {
  await page.locator('.pos-card__main').first().click();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(result.violations).toEqual([]);
}

test.describe('jual pada tablet potret 768 x 1024', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('katalog penuh dan bilah Pesanan membuka lembar pesanan', async ({ page }) => {
    await loginPos(page);
    const bar = page.locator('.pos-order-bar');
    const panel = page.locator('.pos-bill-panel');
    await expect(bar).toBeVisible();
    await expect(panel).toBeHidden();
    const catalog = await page.locator('.pos-catalog').boundingBox();
    expect(catalog?.width ?? 0).toBeGreaterThan(700);
    await addFirstProduct(page);
    await expect(bar).toContainText('Pesanan (1)');
    await bar.click();
    await expect(bar).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Bayar Rp/ })).toBeVisible();
    await panel.getByRole('button', { name: 'Tutup Pesanan' }).click();
    await expect(panel).toBeHidden();
    await expect(bar).toBeFocused();
  });

  test('Escape menutup lembar pesanan', async ({ page }) => {
    await loginPos(page);
    await addFirstProduct(page);
    await page.locator('.pos-order-bar').click();
    await expect(page.locator('.pos-bill-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pos-bill-panel')).toBeHidden();
  });

  test('jual lolos axe pada 768 px dengan lembar tertutup dan terbuka, terang dan gelap', async ({
    page,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      if (scheme === 'light') {
        await loginPos(page);
        await addFirstProduct(page);
      }
      await expectNoAxeViolations(page);
      await page.locator('.pos-order-bar').click();
      await expectNoAxeViolations(page);
      await page.getByRole('button', { name: 'Tutup Pesanan' }).click();
    }
  });
});

test.describe('jual pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('kartu satu kolom, tanpa scroll horizontal, dan tombol Bayar terjangkau di lembar', async ({
    page,
  }) => {
    await loginPos(page);
    await addFirstProduct(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const first = await page.locator('.pos-card').nth(0).boundingBox();
    const second = await page.locator('.pos-card').nth(1).boundingBox();
    expect(second?.x).toBeCloseTo(first?.x ?? -1, 0);
    await page.locator('.pos-order-bar').click();
    const pay = page.locator('.pos-bill-panel').getByRole('button', { name: /^Bayar Rp/ });
    const box = await pay.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
    await pay.click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
  });

  test('pelanggan CV Laut Mas dan barang bernama panjang tidak meluap atau terpotong', async ({
    page,
  }) => {
    await loginPos(page);
    await chooseCustomer(page, 'CV Laut Mas');
    await addFirstProduct(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const customer = await page.locator('.pos-customer-btn').boundingBox();
    expect((customer?.x ?? 0) + (customer?.width ?? 0)).toBeLessThanOrEqual(360);
    const clipped = await page
      .locator('.pos-card')
      .evaluateAll(
        (cards) => cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length,
      );
    expect(clipped).toBe(0);
  });

  test('jual lolos axe pada 360 px dengan lembar tertutup dan terbuka, terang dan gelap', async ({
    page,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      if (scheme === 'light') {
        await loginPos(page);
        await addFirstProduct(page);
      }
      await expectNoAxeViolations(page);
      await page.locator('.pos-order-bar').click();
      await expectNoAxeViolations(page);
      await page.getByRole('button', { name: 'Tutup Pesanan' }).click();
    }
  });
});

test.describe('jual pada tablet lanskap 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('teks harga pada baris satuan tidak keluar dari tombolnya pada empat lebar layar', async ({
    page,
  }) => {
    await loginPos(page);
    for (const [width, height] of [
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('.pos-card__price').first()).toBeVisible();
      const outside = await page.locator('.pos-card__price').evaluateAll(
        (buttons) =>
          buttons.filter((button) => {
            const amount = button.querySelector('.pos-card__amount');
            if (amount === null) {
              return false;
            }
            const inner = amount.getBoundingClientRect();
            const outer = button.getBoundingClientRect();
            return inner.right > outer.right + 0.5 || inner.left < outer.left - 0.5;
          }).length,
      );
      expect(outside, `lebar ${String(width)}`).toBe(0);
    }
  });

  test('panel pesanan tetap di samping dan tanpa bilah', async ({ page }) => {
    await loginPos(page);
    await expect(page.locator('.pos-order-bar')).toBeHidden();
    await expect(page.locator('.pos-bill-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tutup Pesanan' })).toBeHidden();
  });
});

async function openPayScreen(page: Page): Promise<void> {
  await loginPos(page);
  await page.locator('.pos-card__main').first().click();
  await clickPay(page);
  await expect(page).toHaveURL(/#\/pos\/bayar$/);
}

test.describe('bayar pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('HP 360: ringkasan terlipat dan tombol Bayar menempel di bawah', async ({ page }) => {
    await openPayScreen(page);
    const toggle = page.getByRole('button', { name: /^Subtotal/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.pos-pay__items')).toBeHidden();
    const bayar = page.getByRole('button', { name: 'Bayar', exact: true });
    const box = await bayar.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(730);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    for (const tab of await page.getByRole('tab').all()) {
      const tabBox = await tab.boundingBox();
      expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(47.5);
      expect((tabBox?.x ?? 0) + (tabBox?.width ?? 0)).toBeLessThanOrEqual(360);
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.pos-pay__items')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('HP 360: papan angka Tunai terjangkau dan tidak tertutup peluncur', async ({ page }) => {
    await openPayScreen(page);
    await page.getByRole('button', { name: 'Uang Pas' }).scrollIntoViewIfNeeded();
    expect(await controlsUnderLauncher(page)).toEqual([]);
    await expect(page.getByRole('button', { name: 'Uang Pas' })).toBeVisible();
    await expect(page.locator('.pos-amount__value')).toBeVisible();
  });
});

test.describe('bayar pada tablet lanskap 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('pada 1280 px ringkasan dan pembayaran berdampingan', async ({ page }) => {
    await openPayScreen(page);
    const summary = await page.locator('.pos-pay__summary').boundingBox();
    const panel = await page.locator('.pos-pay__panel').boundingBox();
    expect(summary).not.toBeNull();
    expect(panel).not.toBeNull();
    expect((summary?.x ?? 0) + (summary?.width ?? 0)).toBeLessThanOrEqual((panel?.x ?? 0) + 1);
    expect(Math.abs((summary?.y ?? 0) - (panel?.y ?? 0))).toBeLessThanOrEqual(4);
    await expect(page.locator('.pos-pay__items')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Subtotal/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('Non-Tunai pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('modal Scan QR Code layar penuh, tanpa meluap, dengan tombol terjangkau', async ({
    page,
  }) => {
    await openPayScreen(page);
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
    await page
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'Gopay', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Scan QR Code' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeCloseTo(360, 0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(dialog.getByRole('button', { name: 'Cek Status Pembayaran' })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Ubah Metode Pembayaran' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Ubah Metode Pembayaran' })).toBeInViewport();
    expect(await controlsUnderLauncher(page, '.modal')).toEqual([]);
  });

  test('kartu kanal Non-Tunai muat di 360 px tanpa meluap', async ({ page }) => {
    await openPayScreen(page);
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(
      page.getByRole('group', { name: 'Kanal pembayaran' }).getByRole('button'),
    ).toHaveCount(8);
    for (const cardButton of await page
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button')
      .all()) {
      const cardBox = await cardButton.boundingBox();
      expect(cardBox?.height ?? 0).toBeGreaterThanOrEqual(47.5);
      expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(360);
    }
  });
});

test.describe('Split pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('HP 360: modal Pembayaran layar penuh dengan papan angka dan Simpan terjangkau', async ({
    page,
  }) => {
    await openPayScreen(page);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /^Pembayaran 1/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Pembayaran 1' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(360, 0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(dialog.locator('.pos-amount__value')).toBeVisible();
    for (const key of ['1', '5', '0', '000', 'C']) {
      const keyBox = await dialog
        .locator('.pos-amount')
        .getByRole('button', { name: key, exact: true })
        .boundingBox();
      expect(keyBox?.height ?? 0).toBeGreaterThanOrEqual(47.5);
      expect(keyBox?.width ?? 0).toBeGreaterThanOrEqual(47.5);
    }
    const save = dialog.getByRole('button', { name: 'Simpan' });
    await expect(save).toBeInViewport();
    const saveBox = await save.boundingBox();
    expect((saveBox?.y ?? 0) + (saveBox?.height ?? 0)).toBeGreaterThan(700);
    expect(await controlsUnderLauncher(page, '.modal')).toEqual([]);
  });

  test('HP 360: tab Split dan baris Pembayaran tidak meluap', async ({ page }) => {
    await openPayScreen(page);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Pembayaran \d/ })).toHaveCount(2);
    for (const part of await page.getByRole('button', { name: /^Pembayaran \d/ }).all()) {
      const partBox = await part.boundingBox();
      expect(partBox?.height ?? 0).toBeGreaterThanOrEqual(47.5);
      expect((partBox?.x ?? 0) + (partBox?.width ?? 0)).toBeLessThanOrEqual(360);
    }
    expect(await controlsUnderLauncher(page)).toEqual([]);
  });
});

test.describe('Detail Barang pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('HP 360: modal layar penuh, tanpa meluap, dengan Simpan terjangkau dan lolos axe', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.locator('.pos-card__main').first().click();
    await page.locator('.pos-order-bar').click();
    await page.locator('.pos-bill__name').first().click();
    const dialog = page.getByRole('dialog', { name: 'Detail Barang' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(360, 0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const save = dialog.getByRole('button', { name: 'Simpan', exact: true });
    await expect(save).toBeInViewport();
    const saveBox = await save.boundingBox();
    expect((saveBox?.y ?? 0) + (saveBox?.height ?? 0)).toBeGreaterThan(700);
    await dialog.getByRole('button', { name: 'Ubah Harga' }).click();
    await dialog.getByRole('button', { name: 'Ubah Harga' }).scrollIntoViewIfNeeded();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await controlsUnderLauncher(page, '.modal')).toEqual([]);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page);
      await expectNoAxeViolations(page);
    }
  });
});

test.describe('Open Bill pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('HP 360: kartu bill satu kolom tanpa scroll horizontal dan menu terjangkau', async ({
    page,
  }) => {
    await loginPos(page);
    await page.evaluate(() => {
      window.location.hash = '/pos/bill';
    });
    await expect(page.locator('.pos-bill-card').first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const cards = await page.locator('.pos-bill-card').all();
    expect(cards).toHaveLength(3);
    const lefts = new Set<number>();
    for (const item of cards) {
      const box = await item.boundingBox();
      lefts.add(Math.round(box?.x ?? -1));
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
    }
    expect(lefts.size).toBe(1);
    const menuBox = await page.getByRole('button', { name: 'Opsi bill B-0001' }).boundingBox();
    expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(47.5);
    expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(47.5);
    expect(await controlsUnderLauncher(page)).toEqual([]);
    await page.getByRole('button', { name: 'Opsi bill B-0001' }).click();
    await page.getByRole('menuitem', { name: 'Split Bill' }).click();
    const dialog = page.getByRole('dialog', { name: 'Split Bill B-0001' });
    const box = await dialog.boundingBox();
    expect(box?.width).toBeCloseTo(360, 0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(dialog.getByRole('button', { name: 'Pindahkan' })).toBeInViewport();
  });
});

test.describe('Karyawan pada ponsel 360 x 800', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('HP 360: daftar karyawan lalu detail dengan tombol Kembali', async ({ page }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.evaluate(() => {
      window.location.hash = '/pos/karyawan';
    });
    await expect(page.locator('.pos-employee').first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Judul Karyawan muat utuh pada bilah atas 360 px, tidak berakhir dengan elipsis.
    const title = page.locator('.pos-topbar__title');
    await expect(title).toHaveText('Karyawan');
    expect(await title.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      0,
    );
    await expect(page.locator('.pos-split__detail')).toBeHidden();
    expect(await controlsUnderLauncher(page)).toEqual([]);
    await page.locator('.pos-employee', { hasText: 'Ibu Sinta' }).first().click();
    await expect(page.locator('.pos-split__detail')).toBeVisible();
    await expect(page.locator('.pos-split__list')).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Kembali', exact: true }).click();
    await expect(page.locator('.pos-split__list')).toBeVisible();
    await expect(page.locator('.pos-split__detail')).toBeHidden();
  });

  test('HP 360: modal laporan shift layar penuh tanpa meluap dan tombol terjangkau', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.evaluate(() => {
      window.location.hash = '/pos/karyawan';
    });
    await page.locator('.pos-employee', { hasText: 'Ibu Sinta' }).first().click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await expect(report).toBeVisible();
    const box = await report.boundingBox();
    expect(box?.width).toBeCloseTo(360, 0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(report.getByRole('button', { name: 'Tutup' })).toBeInViewport();
  });
});
