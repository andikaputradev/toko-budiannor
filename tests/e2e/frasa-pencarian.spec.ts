import { expect, test, type Page } from '@playwright/test';
import { loginFor } from './helpers/routes';

// Penyesuaian akhir, butir 1: kolom pencarian POS dan aplikasi mobile (Owner dan Sales) mengenali
// frasa seperti Data Barang BO: kata boleh berupa potongan dan urutannya bebas, selama masih ada di
// dalam nama yang dicari. Berjalan pada build produksi.

async function expectOnlyMatches(
  page: Page,
  cards: string,
  words: readonly string[],
): Promise<void> {
  // Daftar digambar ulang setelah mengetik; ditunggu sampai semua kartu cocok, bukan dibaca sekali.
  await expect
    .poll(
      async () => {
        const texts = await page.locator(cards).allTextContents();
        return (
          texts.length > 0 &&
          texts.every((text) => words.every((word) => text.toLowerCase().includes(word)))
        );
      },
      { message: `semua kartu memuat ${words.join(' dan ')}` },
    )
    .toBe(true);
}

test.describe('POS: pencarian frasa', () => {
  test.beforeEach(({ page }) => {
    const size = page.viewportSize();
    test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
  });

  test('kolom cari barang mengenali potongan kata dalam urutan bebas', async ({ page }) => {
    await loginFor(page, 'pos', 'Dewi');
    const search = page.getByRole('searchbox', { name: 'Cari' });
    for (const query of ['men pcc', 'pcc men', 'emen cc', 'ndiri men pcc', 'ya mand sem']) {
      await search.fill(query);
      const card = page.locator('.pos-card', { hasText: 'Semen PCC Karya Mandiri' }).first();
      await expect(card, query).toBeVisible();
    }
    await search.fill('men pcc');
    await expectOnlyMatches(page, '.pos-card__main', ['men', 'pcc']);
    // Satu kata yang tidak ada pada nama menolak barang walau kata lain cocok.
    await search.fill('men pcc zzzq');
    await expect(page.getByText('Barang tidak ditemukan.')).toBeVisible();
  });

  test('kolom cari pelanggan mengenali potongan dan urutan bebas', async ({ page }) => {
    await loginFor(page, 'pos', 'Dewi');
    await page.goto('/#/pos/pelanggan');
    const search = page.getByRole('searchbox', { name: 'Cari pelanggan' });
    await expect(page.locator('.pos-cust-row').first()).toBeVisible();
    await search.fill('ja maj');
    const rows = page.locator('.pos-cust-row');
    await expect(rows.first()).toContainText(/Maju Jaya/i);
    for (const text of await rows.allTextContents()) {
      expect(text.toLowerCase()).toContain('maju jaya');
    }
    await search.fill('ja maj zzzq');
    await expect(rows).toHaveCount(0);
  });

  test('kolom cari riwayat penjualan memakai frasa pada nomor transaksi', async ({ page }) => {
    await loginFor(page, 'pos', 'Dewi');
    await page.goto('/#/pos/riwayat');
    const numbers = page.locator('.pos-history__no');
    await expect(numbers.first()).toBeVisible();
    const first = ((await numbers.first().textContent()) ?? '').trim();
    const tail = first.slice(-3);
    await page.getByRole('searchbox', { name: /Cari/ }).first().fill(`${tail} t`);
    await expect(numbers.first()).toBeVisible();
    for (const text of await numbers.allTextContents()) {
      expect(text).toContain(tail);
    }
    await page.getByRole('searchbox', { name: /Cari/ }).first().fill(`${tail} zzzq`);
    await expect(numbers).toHaveCount(0);
  });
});

test.describe('Mobile: pencarian frasa pada Stok Owner dan Katalog Sales', () => {
  test.beforeEach(({ page }) => {
    const size = page.viewportSize();
    test.skip(size === null || size.width > 500, 'Aplikasi mobile dirancang untuk HP 360 x 800');
  });

  test('Cek Stok Owner mengenali potongan kata dalam urutan bebas', async ({ page }) => {
    await loginFor(page, 'owner');
    await page.goto('/#/owner/stok');
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await expect(page.locator('.stk-card').first()).toBeVisible();
    for (const query of ['men pcc', 'pcc men', 'ndiri men']) {
      await search.fill(query);
      await expect(
        page.locator('.stk-card', { hasText: 'Semen PCC Karya Mandiri' }).first(),
        query,
      ).toBeVisible();
    }
    await search.fill('men pcc');
    await expectOnlyMatches(page, '.stk-card', ['men', 'pcc']);
    await search.fill('men pcc zzzq');
    await expect(page.getByText('Barang tidak ditemukan.')).toBeVisible();
  });

  test('Katalog Sales mengenali potongan kata dalam urutan bebas', async ({ page }) => {
    await loginFor(page, 'sales');
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await expect(page.locator('.stk-card').first()).toBeVisible();
    for (const query of ['men pcc', 'pcc men', 'ndiri men']) {
      await search.fill(query);
      await expect(
        page.locator('.stk-card', { hasText: 'Semen PCC Karya Mandiri' }).first(),
        query,
      ).toBeVisible();
    }
    await search.fill('men pcc zzzq');
    await expect(page.getByText('Barang tidak ditemukan.')).toBeVisible();
  });
});
