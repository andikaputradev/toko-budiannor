import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  AXE_TAGS,
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  openDrawerItem,
  openOrderMenu,
  settle,
} from './helpers/routes';

// Revisi tambahan POS (dokumen "Tambahan Revisi Penyesuaian"): harga kartu barang mengikuti kategori
// pelanggan, dan Biaya Kirim di menu titik tiga pojok kanan bawah.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

function priceOf(page: Page, product: string, unit: string): ReturnType<Page['locator']> {
  return page
    .locator('.pos-card', { hasText: product })
    .first()
    .locator(`.pos-card__price[data-unit="${unit}"] .pos-card__amount`);
}

async function addSemen(page: Page, count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page
      .locator('.pos-card', { hasText: 'SEMEN GRESIK' })
      .first()
      .locator('.pos-card__price[data-unit="SAK"]')
      .click();
  }
}

async function setShipping(page: Page, digits: string): Promise<void> {
  await openOrderMenu(page, 'Biaya Kirim');
  const dialog = page.getByRole('dialog', { name: 'Biaya Kirim' });
  for (const digit of digits) {
    await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Terapkan' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('H1 Harga kartu mengikuti kategori pelanggan', () => {
  test('pelanggan Grosir memakai harga Grosir, kembali ke Umum memakai harga Eceran', async ({
    page,
  }) => {
    await loginPos(page);
    // Kartu pertama (barang proposal) dulu memiliki harga Grosir sama dengan Eceran sehingga tampak tidak berubah.
    await expect(priceOf(page, 'SEMEN GRESIK', 'SAK')).toHaveText('Rp 70.000');
    await expect(priceOf(page, 'LEM FOX', 'LSN')).toHaveText('Rp 105.000');
    await expect(priceOf(page, 'GEMBOK KODAI', 'DOS')).toHaveText('Rp 2.150.000');
    await chooseCustomer(page, 'Toko Maju Jaya');
    await expect(page.locator('.pos-bill-panel > .pos-customer-btn')).toContainText('(GROSIR)');
    await expect(priceOf(page, 'SEMEN GRESIK', 'SAK')).toHaveText('Rp 66.000');
    await expect(priceOf(page, 'LEM FOX', 'LSN')).toHaveText('Rp 100.000');
    await expect(priceOf(page, 'GEMBOK KODAI', 'DOS')).toHaveText('Rp 2.000.000');
    // Kembali ke pelanggan Umum (Eceran): harga kartu kembali Eceran.
    await page.locator('.pos-customer-btn:visible').first().click();
    await page.locator('.pos-customers__row').first().click();
    await expect(page.locator('.pos-bill-panel > .pos-customer-btn')).toContainText('(ECERAN)');
    await expect(priceOf(page, 'SEMEN GRESIK', 'SAK')).toHaveText('Rp 70.000');
    await expect(priceOf(page, 'LEM FOX', 'LSN')).toHaveText('Rp 105.000');
  });

  test('harga di keranjang ikut berganti dan kartu setiap satuan lebih rendah di Grosir', async ({
    page,
  }) => {
    await loginPos(page);
    await addSemen(page);
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 70.000');
    await chooseCustomer(page, 'Toko Maju Jaya');
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 66.000');
    // Semua harga kartu yang tampil di Grosir tidak lebih tinggi dari Eceran.
    const grosir = await page
      .locator('.pos-card__amount')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    await page.locator('.pos-customer-btn:visible').first().click();
    await page.locator('.pos-customers__row').first().click();
    const eceran = await page
      .locator('.pos-card__amount')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    const number = (text: string): number => Number(text.replace(/\D/g, ''));
    expect(grosir.length).toBeGreaterThan(10);
    expect(grosir.length).toBe(eceran.length);
    grosir.forEach((text, index) => {
      expect(number(text), `${text} / ${eceran[index] ?? ''}`).toBeLessThanOrEqual(
        number(eceran[index] ?? ''),
      );
    });
    expect(grosir.slice(0, 6)).not.toEqual(eceran.slice(0, 6));
  });
});

test.describe('H2 Biaya Kirim di menu titik tiga', () => {
  test('menu memuat Biaya Kirim setelah Diskon Transaksi dengan ikon truk', async ({ page }) => {
    await loginPos(page);
    await addSemen(page);
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText([
      'Open Bill',
      'Diskon Transaksi',
      'Biaya Kirim',
      'Mulai Pesanan Baru',
    ]);
    await expect(items.nth(2).locator('svg, .icon').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('biaya kirim menambah total di panel pesanan dan tombol Bayar', async ({ page }) => {
    await loginPos(page);
    await addSemen(page, 2);
    await setShipping(page, '25000');
    const panel = page.locator('.pos-bill-panel');
    await expect(panel).toContainText('Subtotal');
    await expect(panel.locator('.pos-order__line', { hasText: 'Biaya Kirim' })).toContainText(
      '+Rp 25.000',
    );
    await expect(panel.locator('.pos-order__subtotal')).toContainText('Rp 165.000');
    await expect(page.getByRole('button', { name: /^Bayar Rp 165\.000/ })).toBeVisible();
  });

  test('modal menampilkan subtotal, biaya kirim, total, dan bisa dihapus', async ({ page }) => {
    await loginPos(page);
    await addSemen(page);
    await openOrderMenu(page, 'Biaya Kirim');
    const dialog = page.getByRole('dialog', { name: 'Biaya Kirim' });
    for (const digit of '15000') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(dialog).toContainText('Rp 70.000');
    await expect(dialog).toContainText('+Rp 15.000');
    await expect(dialog).toContainText('Rp 85.000');
    await dialog.getByRole('button', { name: 'Terapkan' }).click();
    await expect(page.locator('.pos-bill-panel .pos-order__subtotal')).toContainText('Rp 85.000');
    await openOrderMenu(page, 'Biaya Kirim');
    const again = page.getByRole('dialog', { name: 'Biaya Kirim' });
    await again.getByRole('button', { name: 'Hapus Biaya Kirim' }).click();
    await expect(again).toBeHidden();
    await expect(
      page.locator('.pos-bill-panel .pos-order__line', { hasText: 'Biaya Kirim' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Bayar Rp 70\.000/ })).toBeVisible();
  });

  test('keranjang kosong ditolak dengan pesan bill kosong', async ({ page }) => {
    await loginPos(page);
    await openOrderMenu(page, 'Biaya Kirim');
    await expect(page.locator('.toast__text')).toContainText('Bill masih kosong');
    await expect(page.getByRole('dialog', { name: 'Biaya Kirim' })).toHaveCount(0);
  });

  test('layar bayar memuat Biaya Kirim dan pembayaran tunai pas sama dengan total', async ({
    page,
  }) => {
    await loginPos(page);
    await addSemen(page);
    await setShipping(page, '10000');
    await page.getByRole('button', { name: /^Bayar Rp 80\.000/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    const toggle = page.locator('.pos-pay__subtotal-bar');
    await toggle.click();
    await expect(page.locator('.pos-pay__breakdown')).toContainText('Biaya Kirim');
    await expect(page.locator('.pos-pay__shipping')).toHaveText('+Rp 10.000');
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    // Penjualan terbaru langsung terpilih di Riwayat.
    const detail = page.locator('.pos-history__detail .pos-history__totals').first();
    await expect(detail).toContainText('Biaya Kirim');
    await expect(detail).toContainText('+Rp 10.000');
    await expect(detail).toContainText('Rp 80.000');
  });

  test('Open Bill menahan biaya kirim dan mengembalikannya saat dipanggil', async ({ page }) => {
    await loginPos(page);
    await addSemen(page, 2);
    await setShipping(page, '20000');
    await openOrderMenu(page, 'Open Bill');
    await expect(page.locator('.pos-order__item')).toHaveCount(0);
    await openDrawerItem(page, 'Open Bill');
    const card = page.locator('.pos-bill-card', { hasText: 'Biaya Kirim' });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('+Rp 20.000');
    await expect(card).toContainText('Rp 160.000');
    await card.getByRole('button', { name: /^Opsi bill/ }).click();
    await page.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(
      page.locator('.pos-bill-panel .pos-order__line', { hasText: 'Biaya Kirim' }),
    ).toContainText('+Rp 20.000');
    await expect(page.getByRole('button', { name: /^Bayar Rp 160\.000/ })).toBeVisible();
  });

  test('Mulai Pesanan Baru menghapus biaya kirim bersama keranjang', async ({ page }) => {
    await loginPos(page);
    await addSemen(page);
    await setShipping(page, '5000');
    await openOrderMenu(page, 'Mulai Pesanan Baru');
    await page
      .getByRole('dialog', { name: 'Konfirmasi Pesanan Baru' })
      .getByRole('button', { name: 'Mulai Baru' })
      .click();
    await addSemen(page);
    await expect(
      page.locator('.pos-bill-panel .pos-order__line', { hasText: 'Biaya Kirim' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Bayar Rp 70\.000/ })).toBeVisible();
  });
});

test.describe('H3 axe pada layar dan modal Biaya Kirim', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`panel dengan biaya kirim, modal, dan layar bayar lolos axe (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await loginPos(page);
      await addSemen(page);
      await openOrderMenu(page, 'Biaya Kirim');
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      const dialog = page.getByRole('dialog', { name: 'Biaya Kirim' });
      for (const digit of '25000') {
        await dialog
          .locator('.pos-amount')
          .getByRole('button', { name: digit, exact: true })
          .click();
      }
      await dialog.getByRole('button', { name: 'Terapkan' }).click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: /^Bayar Rp 95\.000/ }).click();
      await page.locator('.pos-pay__subtotal-bar').click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }
});
