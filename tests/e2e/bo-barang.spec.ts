import { expect, test, type Page } from '@playwright/test';
import { loginPos } from './helpers/routes';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const OWNER = ['haris.owner', 'Kunci2026A'] as const;
const SUPERVISOR = ['sinta.spv', 'Kunci2026B'] as const;

async function loginBo(page: Page, [username, password]: readonly [string, string]): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function openBarang(page: Page, user: readonly [string, string] = OWNER): Promise<void> {
  await loginBo(page, user);
  await page.goto('/#/bo/barang');
  await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
}

async function searchFor(page: Page, text: string): Promise<void> {
  await page.getByLabel('Cari', { exact: true }).fill(text);
}

const unitRows = (page: Page) => page.locator('.bo-pd-units__row:not([hidden])');

async function pickUnit(page: Page, name: string, code: string): Promise<void> {
  const search = page.getByLabel(name, { exact: true });
  await search.click();
  await search.fill(code);
  await search.press('Enter');
}

const save = (page: Page) => page.getByRole('button', { name: 'Simpan Barang' });

// Mulai barang baru dengan kode, nama, dan satuan dasar Pcs.
async function startNewProduct(page: Page, code: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Tambah Barang' }).click();
  await page.getByLabel('Kode barang').fill(code);
  await page.getByLabel('Nama barang').fill(name);
  await pickUnit(page, 'Satuan dasar', 'Pcs');
}

const overflow = (page: Page, selector: string): Promise<number> =>
  page.locator(selector).evaluate((node) => node.scrollHeight - node.clientHeight);

test.describe('B1 satu halaman penuh tanpa scroll', () => {
  const sizes = [
    { width: 1366, height: 640 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];

  for (const size of sizes) {
    test(`halaman dan formulir tidak scroll, hanya daftar barang, pada ${String(size.width)}x${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openBarang(page);
      await expect.poll(() => overflow(page, '.bo-content')).toBeLessThanOrEqual(1);
      await expect.poll(() => overflow(page, '.bo-pd-form')).toBeLessThanOrEqual(1);
      expect(await overflow(page, '.vtable__viewport')).toBeGreaterThan(0);
    });
  }

  test('Keluar menutup tab Data Barang dan kembali ke tab sebelumnya', async ({ page }) => {
    await openBarang(page);
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
    await expect(page.locator('.bo-tab')).toHaveCount(1);
  });

  test('pencarian memilih baris teratas sehingga formulir mengikuti barang yang tersorot', async ({
    page,
  }) => {
    await openBarang(page);
    await searchFor(page, 'B1183');
    await expect(page.getByLabel('Kode barang')).toHaveValue('B1183');
    await expect(page.locator('.bo-pd-count')).toHaveText('1 barang');
  });
});

test.describe('B2 satuan bertahap', () => {
  test('satu satuan menyembunyikan dua baris di bawahnya; baris muncul bertahap', async ({
    page,
  }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    await expect(unitRows(page)).toHaveCount(1);

    await pickUnit(page, 'Satuan dasar', 'Pcs');
    await expect(unitRows(page)).toHaveCount(2);

    await pickUnit(page, 'Satuan 2', 'LSN');
    await expect(unitRows(page)).toHaveCount(2);
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('12');
    await expect(unitRows(page)).toHaveCount(3);

    await page.getByRole('button', { name: /Hapus satuan 2/ }).click();
    await expect(unitRows(page)).toHaveCount(2);
  });

  test('barang tiga satuan tersimpan dan tampil di matriks harga dengan harga turunan', async ({
    page,
  }) => {
    await openBarang(page);
    await startNewProduct(page, 'B9100', 'Barang Tiga Satuan');
    await pickUnit(page, 'Satuan 2', 'LSN');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('12');
    await pickUnit(page, 'Satuan 3', 'DOS');
    await page.getByLabel('Konversi satuan 3', { exact: true }).fill('60');
    const inputs = page.locator('.bo-pd-prices__input');
    await inputs.nth(0).fill('1000');
    await inputs.nth(1).fill('900');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();

    const rows = page.locator('.bo-pd-prices tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('1.000');
    await expect(rows.nth(1)).toContainText('LSN = 12 Pcs');
    await expect(rows.nth(1)).toContainText('12.000');
    await expect(rows.nth(1)).toContainText('10.800');
    await expect(rows.nth(2)).toContainText('DOS = 60 Pcs');
    await expect(rows.nth(2)).toContainText('60.000');
  });

  test('satuan ganda dan konversi tidak valid ditolak dengan pesan pada baris yang salah', async ({
    page,
  }) => {
    await openBarang(page);
    await startNewProduct(page, 'B9101', 'Barang Satuan Ganda');
    await pickUnit(page, 'Satuan 2', 'pcs');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('12');
    await save(page).click();
    await expect(
      page.getByText('Satuan tidak boleh sama dengan satuan lain pada barang ini.'),
    ).toBeVisible();

    await page.getByRole('button', { name: /Hapus satuan 2/ }).click();
    await pickUnit(page, 'Satuan 2', 'LSN');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('0');
    await save(page).click();
    await expect(page.getByText('Isi angka konversi satuan lebih dari 0.')).toBeVisible();
    await expect(page.getByLabel('Konversi satuan 2', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});

test.describe('B3 dan B4 komisi dan promo', () => {
  test('komisi terisi tersimpan sebagai persen dan kosong menghapusnya', async ({ page }) => {
    await openBarang(page);
    await save(page).click();
    await page.getByLabel('KOMISI SALES', { exact: true }).fill('2,5');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();
    await expect(page.getByLabel('KOMISI SALES', { exact: true })).toHaveValue('2,5');

    await save(page).click();
    await page.getByLabel('KOMISI SALES', { exact: true }).fill('');
    await save(page).click();
    await expect(page.getByLabel('KOMISI SALES', { exact: true })).toHaveValue('');
  });

  test('persen promo dan komisi di luar batas ditolak pada kolomnya', async ({ page }) => {
    await openBarang(page);
    await startNewProduct(page, 'B9102', 'Barang Persen Salah');
    await page.getByLabel('PROMO', { exact: true }).fill('101');
    await save(page).click();
    await expect(page.getByText('Promo harus berupa persen 0 sampai 100.')).toBeVisible();
    await page.getByLabel('PROMO', { exact: true }).fill('20%');
    await page.getByLabel('KOMISI SALES', { exact: true }).fill('abc');
    await save(page).click();
    await expect(page.getByText('Komisi sales harus berupa persen 0 sampai 100.')).toBeVisible();
    await page.getByLabel('KOMISI SALES', { exact: true }).fill('2,5');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();
  });

  test('promo yang diisi di Data Barang otomatis berdiskon dan bertanda PROMO di POS', async ({
    page,
  }) => {
    await openBarang(page);
    await searchFor(page, 'P001');
    await expect(page.getByLabel('Nama barang')).toHaveValue(/SEMEN GRESIK/i);
    await save(page).click();
    await page.getByLabel('PROMO', { exact: true }).fill('15');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();

    await loginPos(page);
    await page
      .locator('.pos-card', { hasText: 'SEMEN GRESIK' })
      .locator('.pos-card__price[data-unit="SAK"]')
      .click();
    await expect(page.locator('.pos-order__item .pos-order__promo')).toHaveText('PROMO');
    // 70.000 dikurangi promo 15 persen
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 59.500');
  });
});

test.describe('B5 informasi biaya hanya untuk Owner', () => {
  test('Supervisor tidak melihat label dan kolom Harga Beli Akhir dan HPP', async ({ page }) => {
    await openBarang(page, SUPERVISOR);
    await expect(page.getByLabel('HARGA BELI AKHIR', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('HPP AVG', { exact: true })).toHaveCount(0);
    await expect(page.locator('.bo-pd-form')).not.toContainText('HPP');
    await expect(page.locator('.bo-pd-form')).not.toContainText('HARGA BELI AKHIR');
  });

  test('Owner melihat keduanya', async ({ page }) => {
    await openBarang(page, OWNER);
    await expect(page.getByLabel('HARGA BELI AKHIR', { exact: true })).toBeVisible();
    await expect(page.getByLabel('HPP AVG', { exact: true })).toBeVisible();
  });

  test('Owner lalu diganti Supervisor dari Panel Simulasi: kolom biaya hilang', async ({
    page,
  }) => {
    await openBarang(page, OWNER);
    await expect(page.getByLabel('HPP AVG', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('supervisor');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
    await expect(page.getByLabel('HPP AVG', { exact: true })).toHaveCount(0);
  });
});

test.describe('B6 foto membesar', () => {
  test('klik ikon perbesar membuka foto besar dan bisa ditutup', async ({ page }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Perbesar foto' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('img')).toBeVisible();
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('B7 Info riwayat', () => {
  test('tiga tab, riwayat 30 hari terakhir, dan filter tanggal termasuk rentang terbalik', async ({
    page,
  }) => {
    await openBarang(page);
    await searchFor(page, 'B1183');
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab')).toHaveText(['Pembelian', 'Penjualan', 'Koreksi']);

    await dialog.getByRole('tab', { name: 'Penjualan' }).click();
    await expect(dialog.locator('[role="tabpanel"]:not([hidden]) tbody tr')).toHaveCount(2);

    await dialog.getByLabel('Dari').fill('2026-10-19');
    await dialog.getByLabel('Sampai').fill('2026-10-19');
    await dialog.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(dialog.locator('[role="tabpanel"]:not([hidden]) tbody tr')).toHaveCount(1);

    await dialog.getByLabel('Dari').fill('2026-10-19');
    await dialog.getByLabel('Sampai').fill('2026-01-01');
    await dialog.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(dialog.getByLabel('Dari')).toHaveValue('2026-01-01');
    await expect(dialog.getByLabel('Sampai')).toHaveValue('2026-10-19');

    await dialog.getByRole('tab', { name: 'Koreksi' }).click();
    await expect(dialog.locator('[role="tabpanel"]:not([hidden]) .bo-info__empty')).toHaveText(
      'Tidak ada riwayat pada rentang tanggal ini.',
    );
  });
});

test.describe('B8 Cetak', () => {
  test('Owner memilih kolom HPP, Supervisor tidak', async ({ page }) => {
    await openBarang(page, OWNER);
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('HPP', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Harga Beli Akhir')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();

    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.locator('.bo-sidebar button').last().click();
    await openBarang(page, SUPERVISOR);
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Kode', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('HPP', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByLabel('Harga Beli Akhir')).toHaveCount(0);
  });

  test('hasil kosong ditolak tanpa menutup dialog; Excel mengunduh berkas; PDF membuka pratinjau', async ({
    page,
  }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Cari nama atau kode').fill('tidak-ada-barang-ini');
    await expect(dialog.getByText('0 barang akan dicetak')).toBeVisible();
    await dialog.getByRole('button', { name: 'Export Excel' }).click();
    await expect(page.getByText('Tidak ada data untuk diekspor.')).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Cari nama atau kode').fill('semen');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^info-barang-\d{4}-\d{2}-\d{2}\.csv$/);

    await dialog.getByRole('button', { name: 'Export PDF' }).click();
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Pratinjau ekspor PDF' }),
    ).toBeVisible();
  });

  test('Print menyusun area cetak sementara dan membersihkannya sesudahnya', async ({ page }) => {
    await openBarang(page);
    await page.evaluate(() => {
      Object.assign(window, {
        printed: 0,
        print: () => {
          Object.assign(window, {
            printed: document.querySelectorAll('.bo-print-area tbody tr').length,
          });
        },
      });
    });
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Cari nama atau kode').fill('B1183');
    await dialog.getByRole('button', { name: 'Print' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await expect(page.locator('.bo-print-area')).toHaveCount(0);
  });
});
