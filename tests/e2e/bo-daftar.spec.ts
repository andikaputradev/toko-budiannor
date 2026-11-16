import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran ketujuh (CATATAN klien): menu Transaksi dan Mutasi berupa halaman daftar
// dengan tombol "+ Buat"; Faktur Penjualan, Faktur Pembelian, Retur, dan Deposit masing-masing satu
// halaman daftar. Rute Daftar Nota gabungan dialihkan.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const panel = (page: Page) => page.locator('.bo-tabpanel:not([hidden])');

test.describe('Daftar per halaman pada menu Transaksi', () => {
  test('menu Transaksi memuat Faktur Penjualan dan Pembelian sendiri tanpa Daftar Nota gabungan', async ({
    page,
  }) => {
    await loginBo(page);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.locator('.bo-menu__group-header', { hasText: 'Transaksi' }).click();
    const entries = page.locator('#bo-menu-transaksi .bo-menu__link');
    await expect(entries).toHaveText([
      'PO Pembelian',
      'Faktur Pembelian',
      'Retur Pembelian',
      'SO Penjualan',
      'Faktur Penjualan',
      'Retur Penjualan',
      'Deposit Pelanggan',
      'Surat Jalan Ekspedisi & Packing Koli',
    ]);
    await expect(entries.filter({ hasText: 'Daftar Nota' })).toHaveCount(0);
  });

  test('Daftar Nota lama dialihkan ke Faktur Penjualan; Faktur Penjualan membuka daftar lalu formulir', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/daftar-nota');
    await expect(page).toHaveURL(/#\/bo\/transaksi\/faktur-penjualan$/);
    await expect(
      panel(page).getByRole('heading', { name: 'Daftar Faktur Penjualan' }),
    ).toBeVisible();
    await panel(page).getByRole('button', { name: 'Buat Faktur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);
    await expect(page.locator('.bo-tab--active')).toContainText('Form Faktur Penjualan');
  });

  test('Retur Penjualan: daftar kosong, Buat Retur Baru membuka formulir pada tab yang sama, Batal kembali', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/retur-penjualan');
    await expect(
      panel(page).getByRole('heading', { name: 'Daftar Retur Penjualan' }),
    ).toBeVisible();
    await expect(panel(page).locator('.bo-trx-table__empty')).toContainText('Belum ada retur');
    await panel(page).getByRole('button', { name: 'Buat Retur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/retur-penjualan\?baru=1$/);
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await expect(panel(page).getByRole('button', { name: 'Retur Pembelian' })).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Batal', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/retur-penjualan$/);
  });

  test('Retur Pembelian memakai daftar sendiri dengan kolom Pemasok', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/retur-pembelian');
    await expect(panel(page).locator('.bo-trx-table thead th')).toHaveText([
      'No. Retur',
      'Tanggal',
      'Faktur Asal',
      'Pemasok',
      'Barang',
      'Penyelesaian',
      'Nilai Retur',
      'Status',
      'Alasan',
      'Aksi',
    ]);
  });

  test('Deposit Pelanggan: daftar mutasi dengan saldo awal, Buat Setoran Deposit membuka formulir', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/deposit-pelanggan');
    await expect(
      panel(page).getByRole('heading', { name: 'Daftar Deposit Pelanggan' }),
    ).toBeVisible();
    await expect(panel(page).locator('.bo-trx-kpi')).toHaveCount(4);
    await expect(panel(page).locator('.bo-trx-table tbody tr').first()).toContainText('Saldo awal');
    await panel(page).getByRole('button', { name: 'Buat Setoran Deposit' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/deposit-pelanggan\?baru=1$/);
    await expect(panel(page).getByRole('button', { name: 'Kembali ke Daftar' })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Kembali ke Daftar' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/deposit-pelanggan$/);
  });
});
