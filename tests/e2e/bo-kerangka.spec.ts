import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(
  page: Page,
  username = 'haris.owner',
  password = 'Kunci2026A',
): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function openPage(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page).toHaveURL(new RegExp(`#${hash.replace(/[?.]/g, '\\$&')}$`));
}

const tabs = (page: Page) => page.locator('.bo-tab');

test.describe('K1 menu kiri tersembunyi, dibuka lewat titik tiga', () => {
  test('laci tersembunyi, terbuka lewat titik tiga, Esc dan klik latar menutupnya', async ({
    page,
  }) => {
    await loginBo(page);
    const toggle = page.getByRole('button', { name: 'Buka menu' });
    await expect(page.locator('.bo-sidebar')).toBeHidden();

    await toggle.click();
    await expect(page.locator('.bo-sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tutup menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(page.locator('.bo-sidebar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Buka menu' })).toBeFocused();

    await toggle.click();
    await expect(page.locator('.bo-sidebar')).toBeVisible();
    await page.mouse.click(900, 400);
    await expect(page.locator('.bo-sidebar')).toBeHidden();
  });

  test('memilih menu membuka halaman dan menutup laci', async ({ page }) => {
    await loginBo(page);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.getByRole('button', { name: 'Master Data' }).click();
    await page.getByRole('link', { name: 'Data Barang' }).click();
    await expect(page).toHaveURL(/#\/bo\/barang$/);
    await expect(page.locator('.bo-sidebar')).toBeHidden();
    await expect(page.locator('.bo-topbar__title')).toHaveText('Data Barang');
  });

  test('laci terbuka dan bilah tab lolos axe', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/stok');
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const open = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(open.violations, 'laci terbuka').toEqual([]);
    await page.keyboard.press('Escape');
    const closed = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(closed.violations, 'laci tertutup').toEqual([]);
  });
});

test.describe('K3 dan K4 header dan Keluar', () => {
  test('K3 header memuat hari tanggal jam dan nama pengguna, tanpa palet dan Keluar', async ({
    page,
  }) => {
    await loginBo(page);
    await expect(page.locator('.bo-topbar__date')).toHaveText(
      /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu), \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} WIB$/,
    );
    const user = page.locator('.bo-topbar__user');
    await expect(user).toContainText('Bapak Haris');
    await expect(user).toContainText('Owner');
    await expect(page.locator('.bo-topbar__breadcrumb')).toHaveText('Dashboard /');
    await expect(page.locator('.bo-topbar [data-theme-toggle]')).toHaveCount(0);
    await expect(page.locator('.bo-topbar').getByRole('button', { name: 'Keluar' })).toHaveCount(0);
  });

  test('K4 Keluar di baris terbawah laci kembali ke login', async ({ page }) => {
    await loginBo(page);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const last = page.locator('.bo-sidebar button').last();
    await expect(last).toHaveText('Keluar');
    await last.click();
    await expect(page).toHaveURL(/#\/bo$/);
    await expect(page.getByLabel('Nama pengguna')).toBeVisible();
  });
});

test.describe('K5 tab halaman', () => {
  test('tab menyimpan isi formulir saat berpindah tab', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    const address = page.getByPlaceholder('Alamat Pengiriman');
    await address.fill('Jl. Uji Tab 1');
    await openPage(page, '/bo/barang');
    await expect(tabs(page)).toHaveCount(3);
    await expect(address).toBeHidden();

    await page.locator('.bo-tab__link', { hasText: 'Faktur Penjualan' }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);
    await expect(address).toHaveValue('Jl. Uji Tab 1');
    await expect(tabs(page)).toHaveCount(3);
  });

  test('Dashboard tidak punya tombol tutup', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await expect(tabs(page).first()).toContainText('Dashboard');
    await expect(tabs(page).first().locator('.bo-tab__close')).toHaveCount(0);
    await expect(tabs(page).nth(1).locator('.bo-tab__close')).toHaveCount(1);
  });

  test('menutup tab aktif mengaktifkan tetangga kanan, lalu kiri bila paling kanan', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await openPage(page, '/bo/stok');
    await openPage(page, '/bo/opname');
    await expect(tabs(page)).toHaveCount(4);

    await page.locator('.bo-tab__link', { hasText: 'Daftar Stok Minim' }).click();
    await expect(page).toHaveURL(/#\/bo\/stok$/);
    await page.getByRole('button', { name: 'Tutup tab Daftar Stok Minim' }).click();
    await expect(page).toHaveURL(/#\/bo\/opname$/);
    await expect(tabs(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Tutup tab Stok Opname' }).click();
    await expect(page).toHaveURL(/#\/bo\/barang$/);
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.locator('.bo-tab--active')).toContainText('Data Barang');
  });

  test('Lihat Semua dengan tab stok berquery merender ulang isi tab yang sama', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/stok?filter=minimum');
    const panel = page.locator('.bo-tabpanel:not([hidden])');
    await expect(panel.getByText('256 barang')).toBeVisible();

    await page.locator('.bo-tab__link', { hasText: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
    await page.getByRole('button', { name: 'Lihat Semua' }).first().click();
    await expect(page).toHaveURL(/#\/bo\/stok$/);
    await expect(tabs(page)).toHaveCount(2);
    await expect(panel.getByText('256 barang')).toHaveCount(0);
  });

  test('tab ke-11 mengeluarkan tab nonaktif terlama dan Dashboard tetap ada', async ({ page }) => {
    await loginBo(page);
    const paths = [
      '/bo/barang',
      '/bo/harga',
      '/bo/stok',
      '/bo/mutasi',
      '/bo/mutasi/koreksi',
      '/bo/opname',
      '/bo/master/kategori',
      '/bo/master/merk',
      '/bo/master/pemasok',
      '/bo/master/pelanggan',
    ];
    for (const path of paths) {
      await openPage(page, path);
    }
    await expect(tabs(page)).toHaveCount(10);
    await expect(tabs(page).first()).toContainText('Dashboard');
    await expect(page.locator('.bo-tab', { hasText: 'Data Barang' })).toHaveCount(0);
    await expect(page.locator('.bo-tab--active')).toContainText('Pelanggan');
  });

  test('penunjuk jumlah membuka daftar semua tab', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await openPage(page, '/bo/opname');
    const more = page.getByRole('button', { name: 'Semua tab' });
    await expect(more).toHaveText('3');
    await more.click();
    await page.locator('.bo-tabs__menu').getByRole('link', { name: 'Data Barang' }).click();
    await expect(page).toHaveURL(/#\/bo\/barang$/);
    await expect(page.locator('.bo-tabs__menu')).toBeHidden();
  });

  test('Keluar lalu masuk lagi hanya memuat tab Dashboard', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await openPage(page, '/bo/stok');
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.locator('.bo-sidebar button').last().click();
    await expect(page).toHaveURL(/#\/bo$/);

    await loginBo(page);
    await expect(tabs(page)).toHaveCount(1);
    await expect(tabs(page).first()).toContainText('Dashboard');
  });

  test('ganti peran dari Panel Simulasi membuang seluruh tab', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await openPage(page, '/bo/barang');
    await openPage(page, '/bo/stok');
    await expect(tabs(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('owner');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.locator('.bo-tab--active')).toContainText('Daftar Stok Minim');
  });
});
