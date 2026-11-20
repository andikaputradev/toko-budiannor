import { expect, test, type Page, type Locator } from '@playwright/test';
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

// Satuan diketik bebas (video klien), tanpa kotak cari atau daftar pilihan; Enter memindahkan kursor.
async function pickUnit(page: Page, name: string, code: string): Promise<void> {
  const field = page.getByLabel(name, { exact: true });
  await field.fill(code);
  await field.press('Enter');
}

const save = (page: Page) => page.getByRole('button', { name: 'Simpan Barang' });

// Mulai barang baru dengan nama dan satuan dasar Pcs; kode barang terisi otomatis (empat digit).
async function startNewProduct(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Tambah Barang' }).click();
  await expect(page.getByLabel('Kode barang')).toHaveValue(/^\d{4}$/);
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

  test('tanpa tombol Keluar di bilah; Alt+K dan tanda silang tab menutup Data Barang', async ({
    page,
  }) => {
    await openBarang(page);
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await expect(
      page.locator('.bo-pd-toolbar').getByRole('button', { name: 'Keluar' }),
    ).toHaveCount(0);
    await page.keyboard.press('Alt+k');
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

    // Mengosongkan satuan 2 menghapus baris itu beserta konversinya.
    await page.getByLabel('Satuan 2', { exact: true }).fill('');
    await expect(unitRows(page)).toHaveCount(2);
    await expect(page.getByLabel('Konversi satuan 2', { exact: true })).toHaveValue('');
  });

  test('barang tiga satuan tersimpan dan tampil di matriks harga dengan harga turunan', async ({
    page,
  }) => {
    await openBarang(page);
    await startNewProduct(page, 'Barang Tiga Satuan');
    await pickUnit(page, 'Satuan 2', 'LSN');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('12');
    await pickUnit(page, 'Satuan 3', 'DOS');
    await page.getByLabel('Konversi satuan 3', { exact: true }).fill('60');
    // Harga barang baru diisi lewat dialog Isi Harga Jual Barang (klik baris harga, hanya Owner).
    await page.locator('.bo-pd-prices__row').first().click();
    const dialog = page.getByRole('dialog', { name: 'Isi Harga Jual Barang' });
    await dialog.getByLabel('Eceran Satuan 1', { exact: true }).fill('1000');
    await dialog.getByLabel('Grosir Satuan 1', { exact: true }).fill('900');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();

    const rows = page.locator('.bo-pd-prices tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('1.000');
    await expect(rows.nth(1)).toContainText('LSN (12)');
    await expect(rows.nth(1)).toContainText('12.000');
    await expect(rows.nth(1)).toContainText('10.800');
    await expect(rows.nth(2)).toContainText('DOS (60)');
    await expect(rows.nth(2)).toContainText('60.000');
  });

  test('satuan ganda dan konversi tidak valid ditolak dengan pesan pada baris yang salah', async ({
    page,
  }) => {
    await openBarang(page);
    await startNewProduct(page, 'Barang Satuan Ganda');
    await pickUnit(page, 'Satuan 2', 'pcs');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('12');
    await save(page).click();
    await expect(
      page.getByText('Satuan tidak boleh sama dengan satuan lain pada barang ini.'),
    ).toBeVisible();

    await page.getByLabel('Satuan 2', { exact: true }).fill('');
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
    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await page.getByLabel('Komisi Sales', { exact: true }).fill('2,5');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();
    await expect(page.getByLabel('Komisi Sales', { exact: true })).toHaveValue('2,5');

    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await page.getByLabel('Komisi Sales', { exact: true }).fill('');
    await save(page).click();
    await expect(page.getByLabel('Komisi Sales', { exact: true })).toHaveValue('');
  });

  test('persen promo dan komisi di luar batas ditolak pada kolomnya', async ({ page }) => {
    await openBarang(page);
    await startNewProduct(page, 'Barang Persen Salah');
    await page.getByLabel('Promo', { exact: true }).fill('101');
    await save(page).click();
    await expect(page.getByText('Promo harus berupa persen 0 sampai 100.')).toBeVisible();
    await page.getByLabel('Promo', { exact: true }).fill('20%');
    await page.getByLabel('Komisi Sales', { exact: true }).fill('abc');
    await save(page).click();
    await expect(page.getByText('Komisi sales harus berupa persen 0 sampai 100.')).toBeVisible();
    await page.getByLabel('Komisi Sales', { exact: true }).fill('2,5');
    await save(page).click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();
  });

  test('promo yang diisi di Data Barang otomatis berdiskon dan bertanda PROMO di POS', async ({
    page,
  }) => {
    await openBarang(page);
    await searchFor(page, 'P001');
    await expect(page.getByLabel('Nama barang')).toHaveValue(/SEMEN GRESIK/i);
    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await page.getByLabel('Promo', { exact: true }).fill('15');
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
    const grid = page.locator('.bo-tabpanel:not([hidden]) .vtable__head');
    await expect(grid).not.toContainText('Harga Beli Akhir');
    await expect(grid).not.toContainText('Hpp Avg');
    await expect(page.locator('.bo-pd-form')).not.toContainText('HPP');
    await expect(page.locator('.bo-pd-form')).not.toContainText('Harga Beli Akhir');
    // Supervisor tidak melihat biaya satuan Saldo Stok Awal dan tidak dapat menambahnya.
    await expect(page.locator('.bo-pd-opening')).not.toContainText('Biaya Satuan');
    await expect(page.locator('.bo-pd-opening').getByRole('button')).toHaveCount(0);
  });

  // B0004 punya satu dokumen koreksi contoh (KS-0001), jadi tab Koreksi berisi baris untuk kedua peran.
  async function openInfoB0004(page: Page, user: readonly [string, string]): Promise<Locator> {
    await openBarang(page, user);
    await searchFor(page, 'B0004');
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Dari').fill('2026-01-01');
    await dialog.getByRole('button', { name: 'Tampilkan' }).click();
    await dialog.getByRole('tab', { name: 'Koreksi' }).click();
    await expect(dialog.locator('[role="tabpanel"]:not([hidden]) tbody tr')).not.toHaveCount(0);
    return dialog;
  }

  test('Info barang: Supervisor tidak melihat nilai satuan saldo awal dan kolom HARGA pembelian', async ({
    page,
  }) => {
    const dialog = await openInfoB0004(page, SUPERVISOR);
    await expect(dialog).not.toContainText('nilai satuan');
    await dialog.getByRole('tab', { name: 'Pembelian' }).click();
    await expect(
      dialog.locator('[role="tabpanel"]:not([hidden]) th', { hasText: 'Harga' }),
    ).toHaveCount(0);
    await expect(dialog.locator('[role="tabpanel"]:not([hidden])')).not.toContainText('Rp');
    await dialog.getByRole('tab', { name: 'Penjualan' }).click();
    await expect(
      dialog.locator('[role="tabpanel"]:not([hidden]) th', { hasText: 'Harga' }),
    ).toHaveCount(1);
    await dialog.getByRole('tab', { name: 'Mutasi' }).click();
    await expect(dialog.locator('[role="tabpanel"]:not([hidden])')).toBeVisible();
  });

  test('Info barang: Owner melihat kolom HARGA pada riwayat Pembelian', async ({ page }) => {
    const dialog = await openInfoB0004(page, OWNER);
    await dialog.getByRole('tab', { name: 'Pembelian' }).click();
    await expect(
      dialog.locator('[role="tabpanel"]:not([hidden]) th', { hasText: 'Harga' }),
    ).toHaveCount(1);
  });

  test('Owner melihat keduanya', async ({ page }) => {
    await openBarang(page, OWNER);
    const grid = page.locator('.bo-tabpanel:not([hidden]) .vtable__head');
    await expect(grid).toContainText('Harga Beli Akhir');
    await expect(grid).toContainText('Hpp Avg');
    await expect(page.locator('.bo-pd-opening')).toContainText('Biaya Satuan');
  });

  test('Owner lalu diganti Supervisor dari Panel Simulasi: kolom biaya hilang', async ({
    page,
  }) => {
    await openBarang(page, OWNER);
    const grid = page.locator('.bo-tabpanel:not([hidden]) .vtable__head');
    await expect(grid).toContainText('Hpp Avg');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('supervisor');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
    await expect(page.locator('.bo-tabpanel:not([hidden]) .vtable__head')).not.toContainText(
      'Hpp Avg',
    );
  });
});

test.describe('B6 foto membesar', () => {
  test('klik ikon perbesar membuka foto di tengah layar seluas setengah halaman dan bisa ditutup', async ({
    page,
  }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Perbesar foto' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('img')).toBeVisible();
    const box = await dialog.boundingBox();
    const view = page.viewportSize();
    expect(box).not.toBeNull();
    expect(view).not.toBeNull();
    // Kotak di tengah layar dan lebarnya tidak melebihi sekitar setengah halaman.
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - (view?.width ?? 0) / 2)).toBeLessThan(
      4,
    );
    expect(box?.width ?? 9999).toBeLessThanOrEqual((view?.width ?? 0) * 0.55);
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('I1 Info Data Histori Barang (gambar 4 sampai 7)', () => {
  async function openInfo(page: Page, code: string): Promise<Locator> {
    await openBarang(page);
    await searchFor(page, code);
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    return page.getByRole('dialog');
  }

  const panel = (dialog: Locator) => dialog.locator('[role="tabpanel"]:not([hidden])');
  const headers = (dialog: Locator) => panel(dialog).locator('th').allTextContents();

  test('judul, empat tab, dan nama barang dengan kode di tengah', async ({ page }) => {
    const dialog = await openInfo(page, 'B1183');
    await expect(dialog.getByRole('heading', { name: 'Data Histori Barang' })).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveText([
      'Pembelian',
      'Penjualan',
      'Koreksi',
      'Mutasi',
    ]);
    await expect(dialog.getByRole('tab', { name: 'Pembelian' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(dialog.locator('.bo-info__product')).toContainText('(B1183)');
  });

  test('kolom setiap tab mengikuti gambar klien', async ({ page }) => {
    const dialog = await openInfo(page, 'B1183');
    await expect
      .poll(() => headers(dialog))
      .toEqual(['Tgl Pembelian', 'No Faktur', 'Qty', 'Satuan', 'Harga', 'Pemasok']);
    await dialog.getByRole('tab', { name: 'Penjualan' }).click();
    await expect
      .poll(() => headers(dialog))
      .toEqual(['Tgl Penjualan', 'No Faktur', 'Qty', 'Satuan', 'Harga', 'Pelanggan']);
    await dialog.getByRole('tab', { name: 'Koreksi' }).click();
    await expect
      .poll(() => headers(dialog))
      .toEqual(['Tgl Koreksi', 'No Koreksi', 'Qty Awal', 'Aksi', 'Qty', 'Qty Akhir']);
    await dialog.getByRole('tab', { name: 'Mutasi' }).click();
    await expect
      .poll(() => headers(dialog))
      .toEqual(['Tanggal', 'Nomor', 'Transaksi', 'Nama', 'Masuk', 'Keluar', 'Saldo']);
  });

  test('rentang bawaan tiga bulan dan filter tanggal termasuk rentang terbalik', async ({
    page,
  }) => {
    const dialog = await openInfo(page, 'B1183');
    await expect(dialog.getByLabel('Dari')).toHaveValue('2026-07-01');
    await expect(dialog.getByLabel('Sampai')).toHaveValue('2026-10-19');

    await dialog.getByRole('tab', { name: 'Penjualan' }).click();
    await expect(panel(dialog).locator('tbody tr')).not.toHaveCount(0);

    await dialog.getByLabel('Dari').fill('2026-10-19');
    await dialog.getByLabel('Sampai').fill('2026-10-19');
    await dialog.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(panel(dialog).locator('tbody tr')).toHaveCount(1);

    await dialog.getByLabel('Dari').fill('2026-10-19');
    await dialog.getByLabel('Sampai').fill('2026-01-01');
    await dialog.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(dialog.getByLabel('Dari')).toHaveValue('2026-01-01');
    await expect(dialog.getByLabel('Sampai')).toHaveValue('2026-10-19');
  });

  test('tab tanpa riwayat menampilkan pesan kosong, bukan tabel rusak', async ({ page }) => {
    const dialog = await openInfo(page, 'B1183');
    await dialog.getByRole('tab', { name: 'Koreksi' }).click();
    await expect(panel(dialog).locator('.bo-info__empty')).toHaveText(
      'Tidak ada riwayat pada rentang tanggal ini.',
    );
    await expect(panel(dialog).locator('tbody tr')).toHaveCount(0);
  });

  test('filter Pelanggan menyaring baris dan bisa dikosongkan', async ({ page }) => {
    const dialog = await openInfo(page, 'B1183');
    await dialog.getByRole('tab', { name: 'Penjualan' }).click();
    const rows = panel(dialog).locator('tbody tr');
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);
    const filter = dialog.getByLabel('Pelanggan', { exact: true });
    await filter.fill('zzzz-tidak-ada');
    await expect(rows).toHaveCount(0);
    await expect(panel(dialog).locator('.bo-info__empty')).toBeVisible();
    await filter.fill('');
    await expect(rows).toHaveCount(before);
  });

  test('Mutasi: baris Saldo Awal di depan dan filter Gudang mengubah saldo akhir', async ({
    page,
  }) => {
    const dialog = await openInfo(page, 'B0004');
    await dialog.getByRole('tab', { name: 'Mutasi' }).click();
    const rows = panel(dialog).locator('tbody tr');
    await expect(rows.first()).toContainText('Saldo Awal');
    const gudang = dialog.getByLabel('Gudang', { exact: true });
    await expect(gudang.locator('option')).toHaveText(['Semua Gudang', 'Toko', 'Gudang']);
    const lastBalance = async (): Promise<string> =>
      (await rows.last().locator('td').last().textContent()) ?? '';
    const semua = await lastBalance();
    await gudang.selectOption({ label: 'Toko' });
    const toko = await lastBalance();
    await gudang.selectOption({ label: 'Gudang' });
    const besar = await lastBalance();
    expect(new Set([semua, toko, besar]).size).toBeGreaterThan(1);
  });
});

test.describe('B8 Cetak', () => {
  test('Owner memilih kolom HPP, Supervisor tidak', async ({ page }) => {
    await openBarang(page, OWNER);
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('HPP', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Harga Beli Akhir')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();

    await page.keyboard.press('Alt+k');
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
