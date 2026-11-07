import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginPos as loginPosShared } from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

async function login(page: Page, name: string): Promise<void> {
  await loginPosShared(page, name);
}

async function addLargeQuantity(page: Page): Promise<void> {
  await page.locator('.pos-card').first().click();
  await page.locator('.pos-bill__name').first().click();
  await page.getByRole('textbox', { name: 'Jumlah' }).fill('100');
  await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
}

async function chooseCustomer(page: Page, name: string): Promise<void> {
  await page.locator('.pos-actions').getByRole('button', { name: 'Pelanggan' }).click();
  await page.locator('.pos-customers__row', { hasText: name }).click();
}

test.describe('POS-01 sampai POS-04', () => {
  test('login: PIN salah menampilkan sisa percobaan, PIN benar membuka POS-02', async ({
    page,
  }) => {
    await page.goto('/#/pos');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('alert')).toHaveText('Pilih nama kasir terlebih dahulu.');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    for (const digit of '1111') {
      await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.locator('.pos-login__error')).toHaveText('PIN salah. Sisa percobaan: 2.');
    for (const digit of '2468') {
      await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('F-01: penjualan tunai selesai dalam 3 ketukan setelah barang terakhir', async ({
    page,
  }) => {
    await login(page, 'Dewi');
    await page.locator('.pos-card').first().click();
    await page.locator('.pos-card').nth(3).click();
    await page.evaluate(() => {
      Object.assign(window, { taps: 0 });
      document.addEventListener(
        'click',
        (event) => {
          if (event.isTrusted) {
            Object.assign(window, { taps: (window as unknown as { taps: number }).taps + 1 });
          }
        },
        true,
      );
    });
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Selesaikan dan Cetak Struk' }).click();
    const taps = await page.evaluate(() => (window as unknown as { taps: number }).taps);
    expect(taps).toBe(3);
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
    await expect(
      page.getByText('Belum ada barang. Pindai barcode atau ketuk barang.'),
    ).toBeVisible();
  });

  test('P-06: tombol Bayar 72 px selalu terlihat walau bill panjang', async ({ page }) => {
    await login(page, 'Dewi');
    for (let index = 0; index < 12; index += 1) {
      await page.locator('.pos-card').nth(index).click();
    }
    const pay = page.getByRole('button', { name: /^Bayar/ });
    await expect(pay).toBeInViewport();
    const box = await pay.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBe(72);
  });

  test('F-02: piutang melebihi sisa limit ditolak dan tombol Selesaikan tetap nonaktif', async ({
    page,
  }) => {
    await login(page, 'Dewi');
    await addLargeQuantity(page);
    await chooseCustomer(page, 'UD Maju Jaya');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Piutang' }).click();
    await expect(page.locator('.pos-pay__message')).toContainText(
      /Transaksi piutang ditolak: jumlah piutang Rp [\d.]+ melebihi sisa limit Rp [\d.]+\./,
    );
    await expect(page.getByRole('button', { name: 'Selesaikan dan Cetak Struk' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('F-02: tagihan lewat jatuh tempo menolak piutang', async ({ page }) => {
    await login(page, 'Dewi');
    await page.locator('.pos-card').first().click();
    await chooseCustomer(page, 'PT Maju Jaya');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Piutang' }).click();
    await expect(page.locator('.pos-pay__message')).toContainText(
      'Transaksi piutang ditolak: pelanggan memiliki tagihan melewati jatuh tempo.',
    );
  });

  test('F-03: otorisasi Owner dengan PIN salah lalu benar melanjutkan piutang', async ({
    page,
  }) => {
    await login(page, 'Dewi');
    await addLargeQuantity(page);
    await chooseCustomer(page, 'UD Maju Jaya');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Piutang' }).click();
    await page.getByRole('button', { name: 'Minta Otorisasi Owner' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Alasan').fill('Pelanggan lama, disetujui Owner');
    await dialog.getByLabel('PIN Owner').fill('1234');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('PIN Owner salah. Sisa percobaan: 2.');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog).toBeHidden();
    const finish = page.getByRole('button', { name: 'Selesaikan dan Cetak Struk' });
    await expect(finish).toHaveAttribute('aria-disabled', 'false');
    await finish.click();
    await expect(page.getByText(/Transaksi T-000141 tersimpan\./)).toBeVisible();
  });

  test('POS-03: jumlah desimal berkoma dan pesan validasi persis', async ({ page }) => {
    await login(page, 'Dewi');
    await page.locator('.pos-card').first().click();
    await page.locator('.pos-bill__name').first().click();
    const quantity = page.getByRole('textbox', { name: 'Jumlah' });
    await quantity.fill('0');
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await expect(page.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await quantity.fill('1,2345');
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await expect(page.getByText('Maksimal 3 angka di belakang koma.')).toBeVisible();
    await quantity.fill('2,5');
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await expect(page.locator('.pos-bill tbody td.is-end').first()).toHaveText('2,5');
  });

  test('pemindai: kode yang sama dua kali menambah jumlah tanpa baris baru', async ({ page }) => {
    await login(page, 'Dewi');
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('8990000000001');
    await search.press('Enter');
    await search.fill('8990000000001');
    await search.press('Enter');
    await expect(page.locator('.pos-bill tbody tr')).toHaveCount(1);
    await expect(page.locator('.pos-bill tbody td.is-end').first()).toHaveText('2');
    await search.fill('8990000009999');
    await search.press('Enter');
    await expect(page.getByText('Barcode 8990000009999 tidak ditemukan.')).toBeVisible();
    await expect(search).toBeFocused();
  });

  test('Frontliner: tanpa Bayar, dengan Tahan Bill dan Cetak Struk Draf', async ({ page }) => {
    await login(page, 'Agus');
    await expect(page.getByRole('button', { name: /^Bayar/ })).toHaveCount(0);
    await page.locator('.pos-card').first().click();
    await page.getByRole('button', { name: 'Cetak Struk Draf' }).click();
    await expect(page.getByText('STRUK DRAF, BUKAN BUKTI BAYAR')).toBeVisible();
  });

  test('aksesibilitas: POS-01, POS-02, dan POS-04 tanpa pelanggaran axe', async ({ page }) => {
    await page.goto('/#/pos');
    const login01 = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(login01.violations).toEqual([]);
    await login(page, 'Dewi');
    await page.locator('.pos-card').first().click();
    const sell = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(sell.violations).toEqual([]);
    await page.getByRole('button', { name: /^Bayar/ }).click();
    const pay = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(pay.violations).toEqual([]);
  });
});
