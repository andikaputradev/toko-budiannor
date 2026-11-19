import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran kedelapan (dokumen klien 16 November, malam): templat halaman data
// (gambar 31) dan halaman daftar (gambar 32), pencarian frasa, serta tampilan baku (gambar 30).

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
const rows = (page: Page) => panel(page).locator('.bo-trx-table tbody tr');

test.describe('Halaman data (gambar 31)', () => {
  test('bilah tombol halaman data: tanpa Nonaktifkan, Impor hanya Pemasok dan Pelanggan', async ({
    page,
  }) => {
    await loginBo(page);
    const base = ['Tambah', 'Ubah', 'Hapus', 'Info', 'Cetak', 'Keluar'];
    const withImport = ['Tambah', 'Ubah', 'Hapus', 'Info', 'Impor', 'Cetak', 'Keluar'];
    for (const [path, names] of [
      ['kategori', base],
      ['merk', base],
      ['pelanggan', withImport],
      ['pemasok', withImport],
      ['sales', base],
      ['ekspedisi', base],
    ] as const) {
      await page.goto(`/#/bo/master/${path}`);
      const bar = panel(page).locator('.bo-master__bar button');
      await expect(bar).toHaveText(names);
      await expect(panel(page).getByRole('button', { name: 'Nonaktifkan' })).toHaveCount(0);
      await expect(panel(page).getByRole('button', { name: 'Ekspor Excel' })).toHaveCount(0);
    }
  });

  test('Cetak membuka pilihan Print, Ekspor Excel, dan Ekspor PDF; Keluar menutup tab', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/master/kategori');
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await panel(page).getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Ekspor Excel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ekspor PDF' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page.locator('.bo-tab')).toHaveCount(1);
  });

  test('pencarian master mengenali potongan kata dalam urutan bebas', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/master/pelanggan');
    const search = panel(page).getByRole('searchbox');
    await search.fill('ga sau');
    const shown = panel(page).locator('.bo-master__table tbody tr');
    await expect(shown.first()).toContainText('Tiga Saudara');
    await search.fill('saudara tiga');
    await expect(shown.first()).toContainText('Tiga Saudara');
    await search.fill('zzzz tiga');
    await expect(shown).toHaveCount(0);
  });
});

test.describe('Halaman daftar (gambar 32)', () => {
  test('bilah Tambah, Ubah, Hapus, Cetak, Keluar; Ubah dan Hapus butuh baris terpilih', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/faktur-penjualan');
    const bar = panel(page).locator('.bo-trx-listbar__actions button');
    await expect(bar).toHaveText(['Tambah', 'Ubah', 'Hapus', 'Cetak', 'Keluar']);
    await panel(page).getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(page.getByText('Pilih data pada daftar terlebih dahulu.')).toBeVisible();

    const first = rows(page).first();
    await first.locator('td').nth(3).click();
    await expect(first).toHaveAttribute('aria-current', 'true');
    await expect(panel(page).locator('.bo-trx-table tr.is-selected')).toHaveCount(1);
    await rows(page).nth(1).locator('td').nth(3).click();
    await expect(first).not.toHaveAttribute('aria-current', 'true');

    await panel(page).getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(
      page.getByText('Faktur yang sudah tersimpan tidak dapat dihapus', { exact: false }),
    ).toBeVisible();

    await panel(page).getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan\?no=/);
  });

  test('klik dua kali membuka dokumen; Keluar menutup tab daftar', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/faktur-pembelian');
    await rows(page).first().dblclick();
    await expect(page).toHaveURL(/#\/bo\/pembelian\?no=/);
    await page.goto('/#/bo/transaksi/faktur-pembelian');
    await expect(page.locator('.bo-tab')).toHaveCount(3);
    await panel(page).getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await expect(page.locator('.bo-tab--active')).toContainText('Form Faktur Pembelian');
  });

  test('Stok Opname: perintah yang menunggu dapat dihapus, yang sudah selesai ditolak', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/opname');
    await expect(rows(page)).toHaveCount(4);
    await rows(page).filter({ hasText: 'PSO-0002' }).locator('td').first().click();
    await panel(page).getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(
      page.getByText('Hanya perintah opname yang masih menunggu eksekusi'),
    ).toBeVisible();
    await expect(rows(page)).toHaveCount(4);

    await rows(page).filter({ hasText: 'PSO-0004' }).locator('td').first().click();
    await panel(page).getByRole('button', { name: 'Hapus', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Hapus PSO-0004?');
    await dialog.getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(page.getByText('PSO-0004 dihapus.')).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
  });

  test('Cetak membuka kotak Print, Ekspor Excel, dan Ekspor PDF atas daftar yang tampil', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/po-pembelian');
    await panel(page).getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Ekspor Excel' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Ekspor PDF' }).click();
    await expect(page.getByRole('dialog').last()).toContainText('PO26101234');
  });

  test('pencarian daftar mengenali potongan kata dalam urutan bebas', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/faktur-penjualan');
    const search = panel(page).getByRole('searchbox');
    await search.fill('ga sau');
    await expect(rows(page).first()).toContainText('UD Tiga Saudara');
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(rows(page).nth(index)).toContainText('Tiga Saudara');
    }
    await search.fill('saudara ga');
    await expect(rows(page).first()).toContainText('Tiga Saudara');
  });
});

test.describe('Pencarian barang mengenali frasa', () => {
  test('Data Barang: "men gre" dan "esi eme" menemukan Semen Gresik', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const search = panel(page).getByRole('searchbox');
    for (const phrase of ['men gre', 'esi eme', 'se sik', 'resik']) {
      await search.fill(phrase);
      await expect(panel(page).locator('.vtable__row:not(.vtable__head)').first()).toContainText(
        /Semen Gresik/i,
      );
    }
  });

  test('kotak cari barang pada Form Faktur Penjualan memakai frasa yang sama', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/penjualan');
    const search = panel(page).getByPlaceholder('Cari/Pilih Barang & Jasa...');
    await search.fill('men gre');
    await expect(page.locator('[role="listbox"] [role="option"]').first()).toContainText(
      /Semen Gresik/i,
    );
  });
});

test.describe('Tampilan baku (gambar 30)', () => {
  test('Data Barang: tinggi daftar, panel Harga, dan blok Satuan sama untuk satu sampai tiga satuan', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const geometry = async (): Promise<string> =>
      page.evaluate(() => {
        const root = document.querySelector('.bo-tabpanel:not([hidden])');
        const box = (selector: string): string => {
          const node = root?.querySelector(selector);
          return node === null || node === undefined
            ? 'x'
            : String(Math.round(node.getBoundingClientRect().height));
        };
        return [box('.bo-pd-list'), box('.bo-pd-prices'), box('.bo-pd-units')].join('/');
      });
    const seen = new Set<string>();
    const unitCounts = new Set<number>();
    const items = panel(page).locator('.vtable__row');
    for (let index = 0; index < 16; index += 1) {
      await items.nth(index).click();
      unitCounts.add(await panel(page).locator('.bo-pd-prices tbody tr').count());
      seen.add(await geometry());
    }
    expect(unitCounts.size).toBeGreaterThan(1);
    expect([...seen]).toHaveLength(1);
  });

  test('kotak Info Piutang tidak berubah ukuran dan labelnya tidak melipat saat pelanggan dipilih', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/penjualan');
    const box = panel(page).locator('.bo-trx-head__aside');
    const before = await box.boundingBox();
    await panel(page).getByLabel('Pelanggan').first().selectOption({ index: 7 });
    const after = await box.boundingBox();
    expect(Math.round(after?.width ?? 0)).toBe(Math.round(before?.width ?? 1));
    expect(Math.round(after?.height ?? 0)).toBe(Math.round(before?.height ?? 1));
    const stats = panel(page).locator('.bo-credit-stat');
    const count = await stats.count();
    for (let index = 0; index < count; index += 1) {
      const rect = await stats.nth(index).boundingBox();
      expect(rect?.height ?? 99).toBeLessThan(34);
    }
  });
});

test.describe('Menu (gambar 33)', () => {
  test('tanpa Dashboard dan Surat Jalan; rute Surat Jalan tetap punya judul dan breadcrumb', async ({
    page,
  }) => {
    await loginBo(page);
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const links = page.locator('.bo-menu__link');
    await expect(links.filter({ hasText: 'Dashboard' })).toHaveCount(0);
    await expect(links.filter({ hasText: 'Surat Jalan' })).toHaveCount(0);
    await expect(links.filter({ hasText: 'Price List' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.goto('/#/bo/penjualan');
    await expect(panel(page).getByRole('button', { name: 'Isi SJ Ekspedisi' })).toBeVisible();
    await page.goto('/#/bo/transaksi/surat-jalan?baru=1');
    await expect(page.locator('.bo-tab--active')).toContainText('Surat Jalan');
    await expect(page.locator('.bo-topbar__breadcrumb')).toContainText('Transaksi');
  });
});
