import { expect, test, type Page } from '@playwright/test';
import { loginPos as loginPosShared, openOrderMenu } from './helpers/routes';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(
    size?.width !== 1280,
    'Alur lintas aplikasi dijalankan pada viewport tablet 1280 x 800',
  );
});

async function loginPos(page: Page, name: string): Promise<void> {
  await loginPosShared(page, name);
}

async function loginOwner(page: Page): Promise<void> {
  await page.goto('/#/owner');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/owner\/ringkasan$/);
}

async function loginBo(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function simulate(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await page.locator('.sim__action', { hasText: action }).click();
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await expect(page.locator('#sim-body')).toBeHidden();
}

async function recallBill(page: Page, number: string): Promise<void> {
  await openOrderMenu(page, 'Panggil Bill');
  await expect(page).toHaveURL(/#\/pos\/bill$/);
  await page.getByRole('button', { name: `Opsi bill ${number}` }).click();
  await page.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
  await expect(page).toHaveURL(/#\/pos\/jual$/);
}

test.describe('F-09 Owner menyetujui dari HP lalu transaksi POS lanjut', () => {
  test('tanpa persetujuan, piutang over-limit bill B-0002 ditolak di POS-04', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await recallBill(page, 'B-0002');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(
      page.getByText(
        'Transaksi piutang ditolak: jumlah piutang Rp 3.031.200 melebihi sisa limit Rp 435.000.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minta Otorisasi Owner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bayar', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText(/Disetujui Owner dari HP/)).toHaveCount(0);
  });

  test('Owner menyetujui piutang over-limit dan diskon dari HP, kasir melanjutkan tanpa PIN lagi', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    const cards = page.locator('.own-card--approval');
    await expect(cards).toHaveCount(3);

    const discount = cards.filter({ hasText: 'Diskon' });
    await discount.getByRole('button', { name: 'Setujui' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Alasan').fill('Pelanggan langganan');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Persetujuan B-0002 disetujui.')).toBeVisible();

    const overLimit = page.locator('.own-card--approval', { hasText: 'Piutang over-limit' });
    await expect(overLimit).toContainText('B-0002');
    await expect(overLimit).toContainText('Rp 3.031.200');
    await overLimit.getByRole('button', { name: 'Setujui' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Alasan').fill('Pelanggan lama, disetujui Owner');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByRole('heading', { name: 'Menunggu persetujuan (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Riwayat persetujuan' })).toBeVisible();

    await loginPos(page, 'Dewi');
    await recallBill(page, 'B-0002');
    await expect(page.locator('.pos-order__item')).toHaveCount(3);
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(
      page.getByText('Disetujui Owner dari HP: Pelanggan lama, disetujui Owner'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minta Otorisasi Owner' })).toHaveCount(0);
    const finish = page.getByRole('button', { name: 'Bayar', exact: true });
    await expect(finish).toHaveAttribute('aria-disabled', 'false');
    await finish.click();
    await expect(page.getByText(/Transaksi T-000141 tersimpan\./)).toBeVisible();

    await page.goto('/#/pos/riwayat');
    await expect(page.getByText('T-000141').first()).toBeVisible();
    await expect(page.locator('.pos-history__item', { hasText: 'T-000141' }).first()).toContainText(
      'Pending',
    );
  });
});

test.describe('F-10 Sales membuat SO offline lalu sinkron, Draf di BO-09, kirim PDF via WA', () => {
  test('alur penuh dari katalog Sales sampai salinan SO terkirim', async ({ page }) => {
    await page.goto('/#/sales');
    await page.getByLabel('Nama pengguna').fill('budi.sales');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/sales\/katalog$/);

    await page
      .locator('.own-card--stock')
      .first()
      .getByRole('button', { name: /^Tambah ke Order/ })
      .click();
    await expect(page.getByText(/ditambahkan ke order\./)).toBeVisible();
    await page.getByRole('button', { name: 'Lihat Order' }).click();
    await expect(page.locator('.own-card--line')).toHaveCount(1);
    await page.locator('[data-line="0"]').fill('3');

    await simulate(page, 'Online');
    await expect(page.getByText(/Mode offline: order tetap tersimpan di HP/)).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByText('Draf', { exact: false }).first()).toBeVisible();
    await expect(page.locator('.own-chip')).toContainText('Offline, 1 menunggu');

    await simulate(page, 'Offline');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron', { timeout: 8000 });

    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/penjualan');
    const row = page.locator('.bo-sales__table tbody tr', { hasText: 'SO-0001' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Draf');
    await row.getByRole('button', { name: 'SO-0001' }).click();
    const detail = page.locator('.bo-sales__detail');
    await expect(detail).toContainText('Sales Lapangan');
    await expect(detail).toContainText('Budi Lapangan');
    await expect(detail).toContainText('Total Sales Order');

    await page.goto('/#/sales/riwayat?so=SO-0001');
    await expect(page.getByRole('heading', { name: 'SO-0001' })).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await dialog.getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByText('Salinan SO (PDF) terkirim ke 081234567890 via WA (simulasi).'),
    ).toBeVisible();
    await expect(page.getByText('Salinan terkirim', { exact: false }).first()).toBeVisible();
  });
});
