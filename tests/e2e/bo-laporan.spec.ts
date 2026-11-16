import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran ketujuh: menu Laporan membuka kotak pilihan (gambar klien 29), bukan
// halaman. Print dan Export PDF membuka pratinjau, Export Excel mengunduh berkas, Tutup menutup.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page, user = 'haris.owner', password = 'Kunci2026A'): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(user);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function openReport(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Buka menu' }).click();
  const group = page.locator('.bo-menu__group-header', { hasText: 'Laporan' });
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  await page.locator('.bo-menu__link', { hasText: new RegExp(`^${name}$`) }).click();
}

test.describe('Laporan berupa kotak pilihan', () => {
  test('enam entri menu membuka kotak, bukan tab baru', async ({ page }) => {
    await loginBo(page);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const group = page.locator('.bo-menu__group-header', { hasText: 'Laporan' });
    await group.click();
    await expect(page.locator('#bo-menu-laporan .bo-menu__link')).toHaveText([
      'Laba Rugi Kotor',
      'Penjualan',
      'Pembelian',
      'Hutang Piutang',
      'Stok Barang',
      'Daftar Harga dan Katalog',
      'Price List',
    ]);
    await page.keyboard.press('Escape');
    await openReport(page, 'Penjualan');
    const dialog = page.getByRole('dialog', { name: 'Laporan Penjualan' });
    await expect(dialog).toBeVisible();
    for (const text of [
      'Tanggal Faktur',
      'Pelanggan',
      'Kategori Pelanggan',
      'Nama Barang',
      'Kategori Barang',
      'Merk Barang',
      'Tipe Penjualan',
      'Jenis Transaksi',
      'Status Pembayaran',
      'Sales',
      'Komisi Sales',
    ]) {
      await expect(dialog.getByLabel(text, { exact: true }).first()).toBeVisible();
    }
    await expect(dialog.getByRole('radio')).toHaveCount(3);
    await expect(dialog.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export PDF' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.bo-tab')).toHaveCount(1);
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
  });

  test('Print membuka pratinjau berisi baris dan total; Export Excel mengunduh berkas', async ({
    page,
  }) => {
    await loginBo(page);
    await openReport(page, 'Penjualan');
    const dialog = page.getByRole('dialog', { name: 'Laporan Penjualan' });
    await dialog.getByRole('button', { name: 'Print' }).click();
    const preview = page.getByRole('dialog', { name: 'Laporan Penjualan' }).last();
    await expect(preview.locator('.bo-rpt-table tbody tr').first()).toBeVisible();
    await expect(preview.locator('.bo-rpt-table tfoot')).toContainText('faktur');
    await expect(preview.getByRole('button', { name: 'Cetak' })).toBeVisible();
    await preview.getByRole('button', { name: 'Tutup' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export Excel' }).click();
    expect((await download).suggestedFilename()).toBe('Laporan-Penjualan-Summary.csv');
    await dialog.getByRole('button', { name: 'Tutup' }).click();
  });

  test('Stok Barang: Kartu Stok menolak tanpa nama barang, lalu menampilkan Saldo Awal', async ({
    page,
  }) => {
    await loginBo(page);
    await openReport(page, 'Stok Barang');
    const dialog = page.getByRole('dialog', { name: 'Laporan Stok Barang' });
    await dialog.getByRole('radio', { name: 'Kartu Stok Persediaan' }).check();
    await dialog.getByRole('button', { name: 'Print' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Isi Nama Barang');
    await dialog.getByLabel('Nama Barang', { exact: true }).fill('semen');
    await dialog.getByRole('button', { name: 'Print' }).click();
    const preview = page.getByRole('dialog', { name: 'Laporan Stok Barang' }).last();
    await expect(preview.locator('.bo-rpt-table tbody tr').first()).toContainText('Saldo Awal');
  });

  test('Hutang Piutang dan Daftar Harga memiliki parameter sesuai gambar', async ({ page }) => {
    await loginBo(page);
    await openReport(page, 'Hutang Piutang');
    let dialog = page.getByRole('dialog', { name: 'Laporan Hutang Piutang' });
    await expect(dialog.getByRole('radio')).toHaveCount(5);
    await expect(dialog.getByLabel('Pelanggan / Pemasok')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Piutang' }).check();
    await dialog.getByRole('radio', { name: 'Pembayaran' }).check();
    await dialog.getByRole('button', { name: 'Print' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Laporan Piutang' })
        .locator('.bo-rpt-table tbody tr')
        .first(),
    ).toContainText('PP-');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await openReport(page, 'Daftar Harga dan Katalog');
    dialog = page.getByRole('dialog', { name: 'Cetak Daftar Harga dan Katalog Barang' });
    for (const text of ['Harga Eceran', 'Harga Grosir', 'Tampilkan Hpp']) {
      await expect(dialog.getByRole('checkbox', { name: text })).toBeVisible();
    }
    await expect(dialog.getByRole('radio')).toHaveCount(6);
  });

  test('Supervisor ditolak membuka Laba Rugi Kotor dan tidak melihat kotak Tampilkan Hpp', async ({
    page,
  }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await openReport(page, 'Laba Rugi Kotor');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Anda tidak memiliki hak akses ke halaman ini.')).toBeVisible();
    await openReport(page, 'Daftar Harga dan Katalog');
    const dialog = page.getByRole('dialog', { name: 'Cetak Daftar Harga dan Katalog Barang' });
    await expect(dialog.getByRole('checkbox', { name: 'Tampilkan Hpp' })).toHaveCount(0);
  });
});
