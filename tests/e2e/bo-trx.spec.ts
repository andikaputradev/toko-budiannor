import { expect, test, type Locator, type Page } from '@playwright/test';

// Layar Transaksi Back-Office sesuai gambar klien 8 sampai 13 (revisi putaran ketiga).
// Berjalan pada build produksi: server dev membuang CSP.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const OWNER = ['haris.owner', 'Kunci2026A'] as const;
const SUPERVISOR = ['sinta.spv', 'Kunci2026B'] as const;

async function loginBo(
  page: Page,
  [username, password]: readonly [string, string] = OWNER,
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
  await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute('href', `#${hash}`);
  await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-loading')).toHaveCount(0);
}

const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('.bo-content');
    return main === null ? 0 : main.scrollHeight - main.clientHeight;
  });
}

test.describe('T2 Daftar Nota (gambar 8)', () => {
  const list = (page: Page): Locator => active(page).locator('.bo-trx-list');
  const headers = (page: Page): Promise<string[]> =>
    list(page).locator('thead th').allTextContents();

  test('kartu judul, empat kotak angka, tombol, filter, dan pencarian', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const root = list(page);
    await expect(root.getByRole('heading', { name: 'Daftar Nota Penjualan' })).toBeVisible();
    for (const text of [
      'Jumlah Transaksi Hari Ini',
      'Total Transaksi Hari Ini',
      'Total Belum Lunas',
      'Total Jatuh Tempo',
    ]) {
      await expect(root.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(root.locator('.bo-trx-kpi__value').first()).toHaveText(/^\d+$/);
    await expect(root.locator('.bo-trx-kpi__value').nth(1)).toHaveText(/^Rp /);
    await expect(root.getByRole('button', { name: 'Buat Faktur Baru' })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Segarkan' })).toBeVisible();
    for (const name of ['Tanggal', 'Pelanggan', 'Status']) {
      await expect(root.getByLabel(name, { exact: true })).toBeVisible();
    }
    await expect(root.getByRole('searchbox', { name: /Cari No/ })).toBeVisible();
  });

  test('kolom Penjualan lalu Pembelian, tanpa kolom Aksi', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    expect(await headers(page)).toEqual([
      'No. Invoice',
      'No. SO',
      'Tanggal',
      'Pelanggan',
      'Pembayaran',
      'Status',
      'Umur Nota',
      'Total',
      'User',
      'Keterangan',
    ]);
    await list(page).getByRole('button', { name: 'Faktur Pembelian' }).click();
    await expect(list(page).getByRole('heading', { name: 'Daftar Nota Pembelian' })).toBeVisible();
    expect(await headers(page)).toEqual([
      'No. Invoice',
      'No. PO',
      'Tanggal',
      'Pemasok',
      'Pembayaran',
      'Status',
      'Umur Nota',
      'Total',
      'User',
      'Keterangan',
    ]);
    await expect(list(page).getByLabel('Pemasok', { exact: true })).toBeVisible();
  });

  test('nomor invoice adalah tautan ke faktur, Buat Faktur Baru membuka formulir', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const link = list(page).getByRole('link', { name: 'FJ26101234', exact: true });
    await expect(link).toHaveAttribute('href', '#/bo/penjualan?no=FJ26101234');
    await expect(link.locator('xpath=ancestor::tr')).toContainText('26101234');
    await expect(link.locator('xpath=ancestor::tr')).toContainText('Barang Besok Diambil');
    await list(page).getByRole('button', { name: 'Buat Faktur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);

    await openPage(page, '/bo/transaksi/daftar-nota?tab=pembelian');
    await list(page).getByRole('button', { name: 'Buat Faktur Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/pembelian$/);
  });

  test('filter Status, Pelanggan, dan pencarian menyaring baris; hasil kosong ada pesannya', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    const rows = list(page).locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    await list(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Status: Lunas' });
    const statuses = await list(page).locator('tbody tr td:nth-child(6)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses.map((text) => text.trim()))).toEqual(new Set(['Lunas']));
    await list(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Status: Semua' });

    await list(page)
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Pelanggan: Toko Arif' });
    const parties = await list(page).locator('tbody tr td:nth-child(4)').allTextContents();
    expect(parties.length).toBeGreaterThan(0);
    expect(new Set(parties.map((text) => text.trim()))).toEqual(new Set(['Toko Arif']));
    await list(page)
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Pelanggan: Semua' });

    await list(page)
      .getByRole('searchbox', { name: /Cari No/ })
      .fill('zzzz-tidak-ada');
    await expect(list(page).locator('.bo-trx-table__empty')).toHaveText(
      'Tidak ada nota transaksi yang sesuai filter.',
    );
    await list(page)
      .getByRole('searchbox', { name: /Cari No/ })
      .fill('FJ26101234');
    await expect(rows).toHaveCount(1);
  });

  test('muat satu layar di 1280x640: halaman tidak menggulir, tabel punya ruang', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/daftar-nota');
    await expect(list(page).locator('tbody tr').first()).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    const height = await list(page)
      .locator('.bo-trx__lines')
      .evaluate((node) => node.clientHeight);
    expect(height).toBeGreaterThanOrEqual(170);
  });
});

// ---------------------------------------------------------------------------
// Dokumen: Faktur Penjualan (gambar 9) dan dialog Rincian Barang (gambar 12)
// ---------------------------------------------------------------------------

const searchBox = (page: Page): Locator =>
  active(page).getByRole('combobox', { name: 'Cari atau pilih barang dan jasa' });
const optionsOf = (page: Page): Locator =>
  active(page)
    .getByRole('listbox', { name: 'Cari atau pilih barang dan jasa' })
    .getByRole('option');
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Rincian Barang' });
const rowsOf = (page: Page): Locator =>
  active(page).locator('.bo-trx-table--lines tbody tr[data-id]');
const countText = (page: Page): Locator => active(page).locator('.bo-trx__count');

async function addItem(page: Page, query: string, quantity: string, pick = 0): Promise<void> {
  await searchBox(page).fill(query);
  await optionsOf(page).nth(pick).click();
  const dialog = dialogOf(page);
  await dialog.getByLabel('Kuantitas', { exact: true }).fill(quantity);
  await dialog.getByRole('button', { name: 'Lanjut' }).click();
  await expect(dialog).toHaveCount(0);
}

function rupiah(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9]/g, ''));
}

const idr = (value: number): string => new Intl.NumberFormat('id-ID').format(value);

test.describe('T3 Faktur Penjualan (gambar 9)', () => {
  test('kepala berlabel sebaris dan kartu Info Piutang Pelanggan', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    const root = active(page);
    for (const name of [
      'Tanggal',
      'No. Invoice',
      'No. SO',
      'Keterangan',
      'Pelanggan',
      'Alamat',
      'Telepon',
      'Syarat Bayar',
      'Tempo',
      'Metode Pembayaran',
      'Sales',
      'Ekspedisi',
    ]) {
      await expect(root.getByLabel(name)).toHaveCount(1);
    }
    const card = root.locator('.bo-trx-head__aside');
    await expect(card).toContainText('Info Piutang Pelanggan');
    for (const text of ['Total Piutang', 'Piutang Jatuh Tempo', 'Plafon Kredit', 'Sisa Plafon']) {
      await expect(card.getByText(text)).toBeVisible();
    }
    await expect(root.getByPlaceholder('Alamat Pengiriman')).toBeVisible();
    await expect(root.getByRole('button', { name: 'Simpan', exact: true })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Cetak', exact: true })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Isi SJ Ekspedisi' })).toBeVisible();
    await expect(countText(page)).toHaveText('0 Barang (0)');
    expect(await root.locator('.bo-trx-table--lines thead th').allTextContents()).toEqual([
      'Urut',
      'Koli',
      'Nama Barang',
      'Kode #',
      'Gudang',
      'Kuantitas',
      'Satuan',
      '@Harga',
      'Diskon',
      'Total Harga',
    ]);
    await root.getByLabel('Pelanggan', { exact: true }).selectOption({ index: 1 });
    await expect(root.getByLabel('Telepon')).not.toHaveValue('');
  });

  test('cari barang menyorot teks cocok, memilih membuka Rincian Barang, Lanjut menambah baris', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await searchBox(page).fill('semen');
    const first = optionsOf(page).first();
    await expect(first.locator('mark').first()).toHaveText(/semen/i);
    await expect(first.locator('.bo-trx-search__code')).toHaveText(/\S+/);
    await first.click();
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    for (const text of ['Kode #', 'Nama Barang', 'Kuantitas', '@Harga', 'Diskon', 'Total Harga']) {
      await expect(dialog.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(dialog.getByLabel('Gudang')).toBeVisible();
    await expect(dialog.getByText(/^Stok : /)).toBeVisible();
    await expect(dialog.getByText('Harga Histori Jual')).toBeVisible();
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('3');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(countText(page)).toHaveText('1 Barang (3)');
    await expect(rowsOf(page)).toHaveCount(1);
  });

  test('kuantitas nol atau bukan angka ditolak dan dialog tetap terbuka', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    for (const bad of ['0', 'abc', '-2']) {
      await dialog.getByLabel('Kuantitas', { exact: true }).fill(bad);
      await dialog.getByRole('button', { name: 'Lanjut' }).click();
      await expect(dialog.getByRole('alert')).toHaveText('Isi kuantitas lebih dari 0.');
      await expect(dialog).toBeVisible();
    }
    await expect(rowsOf(page)).toHaveCount(0);
  });

  test('diskon persen dan rupiah saling melengkapi dan mengubah Total Harga', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('2');
    await dialog.getByLabel('Diskon persen').fill('');
    await dialog.getByLabel('Diskon rupiah').fill('');
    const price = rupiah(await dialog.getByLabel('@Harga').inputValue());
    const total = dialog.locator('.bo-trx-dlg__total');
    await expect(total).toHaveText(`Rp ${idr(price * 2)}`);
    await dialog.getByLabel('Diskon persen').fill('10');
    await expect(dialog.getByLabel('Diskon rupiah')).not.toHaveValue('');
    expect(rupiah(await total.textContent())).toBe(Math.round(price * 0.9) * 2);
    await dialog.getByLabel('Diskon rupiah').fill('1000');
    expect(rupiah(await total.textContent())).toBe((price - 1000) * 2);
  });

  test('klik baris membuka Rincian Barang terisi; Hapus membuang baris', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await addItem(page, 'semen', '4');
    await rowsOf(page).first().locator('.bo-trx-table__name').click();
    const dialog = dialogOf(page);
    await expect(dialog.getByLabel('Kuantitas', { exact: true })).toHaveValue('4');
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('6');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(countText(page)).toHaveText('1 Barang (6)');
    await rowsOf(page).first().locator('td').nth(3).click();
    await dialogOf(page).getByRole('button', { name: 'Hapus' }).click();
    await expect(rowsOf(page)).toHaveCount(0);
    await expect(countText(page)).toHaveText('0 Barang (0)');
  });

  test('mengurut baris dengan Alt+panah pada pegangan', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await addItem(page, 'semen', '1');
    await addItem(page, 'paku', '1');
    const names = (): Promise<string[]> =>
      rowsOf(page).locator('.bo-trx-table__name').allTextContents();
    const before = await names();
    expect(before).toHaveLength(2);
    await rowsOf(page).first().locator('.bo-trx-handle').focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await names()).toEqual([before[1], before[0]]);
  });

  test('kotak total: Sub Total, Diskon, Total Biaya, dan Total', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await addItem(page, 'semen', '2');
    const totals = active(page).locator('.bo-trx-totals');
    const sub = rupiah(await totals.locator('.bo-trx-totals__value').first().textContent());
    expect(sub).toBeGreaterThan(2000);
    await totals.getByLabel('Diskon', { exact: true }).fill('1000');
    await totals.getByLabel('Total Biaya').fill('500');
    await expect(totals.locator('.bo-trx-totals__value.is-total')).toHaveText(
      `Rp ${idr(sub - 1000 + 500)}`,
    );
  });

  test('Isi SJ Ekspedisi: tanpa barang Koli ada pesan, dengan Koli membuka Surat Jalan', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await addItem(page, 'semen', '2');
    await active(page).getByRole('button', { name: 'Isi SJ Ekspedisi' }).click();
    await expect(page.getByText('Tandai barang pada kolom Koli dahulu.')).toBeVisible();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);
    await rowsOf(page).first().getByRole('checkbox').check();
    await active(page).getByRole('button', { name: 'Isi SJ Ekspedisi' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan\?inv=FJ/);
  });

  test('Simpan tanpa barang ditolak; dengan barang membuka dialog cetak', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Faktur belum memiliki item barang.')).toBeVisible();
    await addItem(page, 'semen', '1');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('muat satu layar di 1280x640 dengan banyak baris: tabel menggulir, halaman tidak', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    const lines = active(page).locator('.bo-trx__lines');
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(150);
    const total = 9;
    for (let index = 0; index < total; index += 1) {
      await addItem(page, 'semen', '1', index % 8);
    }
    await expect(rowsOf(page)).toHaveCount(total);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    expect(await lines.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(
      0,
    );
  });

  test('Supervisor memakai Faktur Penjualan dan melihat Harga Histori Jual', async ({ page }) => {
    await loginBo(page, SUPERVISOR);
    await openPage(page, '/bo/penjualan');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    await expect(dialogOf(page).getByText('Harga Histori Jual')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Faktur Pembelian (gambar 9, varian pembelian)
// ---------------------------------------------------------------------------

test.describe('T4 Faktur Pembelian (gambar 9, varian pembelian)', () => {
  test('kepala berlabel sebaris, kartu Info Hutang Pemasok, tanpa Koli dan Isi SJ', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    const root = active(page);
    for (const name of [
      'Tanggal',
      'Tgl Terima',
      'No. Invoice',
      'No. PO',
      'No. Faktur Pemasok',
      'Pemasok',
      'Alamat',
      'Telepon',
      'Syarat Bayar',
      'Tempo',
      'Metode Pembayaran',
      'Keterangan',
    ]) {
      await expect(root.getByLabel(name).first()).toBeVisible();
    }
    const card = root.locator('.bo-trx-head__aside');
    await expect(card).toContainText('Info Hutang Pemasok');
    await expect(card.getByText('Total Hutang')).toBeVisible();
    await expect(card.getByText('Hutang Jatuh Tempo')).toBeVisible();
    await expect(root.getByRole('button', { name: 'Isi SJ Ekspedisi' })).toHaveCount(0);
    expect(await root.locator('.bo-trx-table--lines thead th').allTextContents()).toEqual([
      'Urut',
      'Nama Barang',
      'Kode #',
      'Gudang',
      'Kuantitas',
      'Satuan',
      '@Harga',
      'Diskon',
      'Total Harga',
    ]);
    await expect(countText(page)).toHaveText('0 Barang (0)');
    await root.getByLabel('Pemasok', { exact: true }).selectOption({ index: 1 });
    await expect(root.getByLabel('Telepon')).not.toHaveValue('');
  });

  test('Rincian Barang pembelian memuat Ongkos Kirim dan Harga Histori Beli untuk Owner', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    await expect(dialog.getByLabel('Ongkos Kirim')).toBeVisible();
    await expect(dialog.getByText('Harga Histori Beli')).toBeVisible();
    await expect(dialog.getByText('Harga Histori Jual')).toHaveCount(0);
  });

  test('Supervisor mengisi harga sendiri tetapi tidak melihat riwayat harga beli', async ({
    page,
  }) => {
    await loginBo(page, SUPERVISOR);
    await openPage(page, '/bo/pembelian');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    await expect(dialog.getByLabel('@Harga')).toBeVisible();
    await expect(dialog.getByLabel('Ongkos Kirim')).toBeVisible();
    await expect(dialog.getByText('Harga Histori Beli')).toHaveCount(0);
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('2');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(countText(page)).toHaveText('1 Barang (2)');
    await expect(rowsOf(page).first().locator('td').nth(6)).toHaveText(/\d/);
  });

  test('Ongkos Kirim per baris otomatis masuk Total Biaya sampai pengguna mengubahnya', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('1');
    await dialog.getByLabel('Ongkos Kirim').fill('5000');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    const totals = active(page).locator('.bo-trx-totals');
    await expect(totals.getByLabel('Total Biaya')).toHaveValue('5.000');
    const sub = rupiah(await totals.locator('.bo-trx-totals__value').first().textContent());
    await expect(totals.locator('.bo-trx-totals__value.is-total')).toHaveText(
      `Rp ${idr(sub + 5000)}`,
    );
    await totals.getByLabel('Total Biaya').fill('7000');
    await addItem(page, 'semen', '1', 1);
    await expect(totals.getByLabel('Total Biaya')).toHaveValue(/^7\.?000$/);
  });

  test('Simpan tanpa barang ditolak; dengan barang berhasil', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Faktur pembelian belum memiliki item barang.')).toBeVisible();
    await addItem(page, 'semen', '1');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText(/Faktur Pembelian FB\d+ berhasil disimpan\./)).toBeVisible();
  });

  test('muat satu layar di 1280x640: tabel punya ruang, halaman tidak menggulir', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    const lines = active(page).locator('.bo-trx__lines');
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(150);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    for (let index = 0; index < 8; index += 1) {
      await addItem(page, 'semen', '1', index % 8);
    }
    await expect(rowsOf(page)).toHaveCount(8);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Daftar dan formulir PO dan SO (gambar 10 dan 11)
// ---------------------------------------------------------------------------

const orderList = (page: Page): Locator => active(page).locator('.bo-trx-list');
const orderHeaders = (page: Page): Promise<string[]> =>
  orderList(page).locator('thead th').allTextContents();
const toast = (page: Page, text: string | RegExp): Locator => page.getByText(text);

const ORDER_LINE_HEADERS = [
  'Urut',
  'Nama Barang',
  'Kode #',
  'Gudang',
  'Kuantitas',
  'Satuan',
  '@Harga',
  'Diskon',
  'Total Harga',
];

test.describe('T5 dan T6 Daftar PO dan Input PO (gambar 10 dan 11)', () => {
  test('menu PO Pembelian membuka daftar dengan kolom gambar 10', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian');
    const root = orderList(page);
    await expect(
      root.getByRole('heading', { name: 'Daftar Pesanan Pembelian ( PO )' }),
    ).toBeVisible();
    await expect(root.getByRole('button', { name: 'Buat PO Baru' })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Segarkan' })).toBeVisible();
    for (const name of ['Tanggal', 'Pemasok', 'Status']) {
      await expect(root.getByLabel(name, { exact: true })).toBeVisible();
    }
    await expect(root.getByRole('searchbox', { name: /Cari No PO/ })).toBeVisible();
    expect(await orderHeaders(page)).toEqual([
      'No. PO',
      'Tanggal',
      'Pemasok',
      'Keterangan',
      'Status',
      'Total',
    ]);
    await expect(root.locator('.bo-trx-table__empty')).toHaveText('Belum ada pesanan.');
  });

  test('Buat PO Baru membuka formulir berlabel gambar 11 dengan tombol Simpan dan Cetak', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian');
    await orderList(page).getByRole('button', { name: 'Buat PO Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/po-pembelian\?baru=1$/);
    const root = active(page);
    for (const name of [
      'Tanggal',
      'No PO',
      'Pemasok',
      'Pemesan',
      'Syarat Bayar',
      'Tempo',
      'Ekspedisi',
      'Keterangan',
    ]) {
      await expect(root.getByLabel(name, { exact: false }).first()).toBeVisible();
    }
    await expect(root.getByLabel('No PO')).toHaveValue(/^PO\d{8}$/);
    await expect(root.getByLabel('Pemesan')).not.toHaveValue('');
    await expect(root.getByRole('button', { name: 'Simpan', exact: true })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Cetak', exact: true })).toBeVisible();
    await expect(root.getByRole('button', { name: 'Isi SJ Ekspedisi' })).toHaveCount(0);
    expect(await root.locator('.bo-trx-table--lines thead th').allTextContents()).toEqual(
      ORDER_LINE_HEADERS,
    );
  });

  test('Simpan ditolak tanpa pemasok lalu tanpa barang; berhasil tampil di daftar On Proses', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian?baru=1');
    const root = active(page);
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page, 'Pilih pemasok dahulu.')).toBeVisible();
    await root.getByLabel('Pemasok', { exact: true }).selectOption({ index: 1 });
    const supplier = await root
      .getByLabel('Pemasok', { exact: true })
      .evaluate((node) => (node as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page, 'PO belum memiliki item barang.')).toBeVisible();

    // Penolakan tidak menambah PO.
    await openPage(page, '/bo/transaksi/po-pembelian');
    await expect(orderList(page).locator('.bo-trx-table__empty')).toBeVisible();

    await orderList(page).getByRole('button', { name: 'Buat PO Baru' }).click();
    await active(page).getByLabel('Pemasok', { exact: true }).selectOption({ index: 1 });
    await addItem(page, 'semen', '2');
    await active(page).getByLabel('Keterangan').fill('Urgen Developer');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/po-pembelian$/);
    const row = orderList(page).locator('tbody tr').first();
    await expect(row.locator('td').nth(0)).toHaveText(/^PO\d{8}$/);
    await expect(row.locator('td').nth(2)).toHaveText(supplier.replace(/\s*\(.*\)$/, ''));
    await expect(row.locator('td').nth(3)).toHaveText('URGEN DEVELOPER');
    await expect(row.locator('td').nth(4)).toHaveText('On Proses');
    await expect(row.locator('td').nth(5)).toHaveText(/^Rp /);
  });

  test('filter Status menyisihkan baris dan pencarian tanpa hasil memberi pesan kosong', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian?baru=1');
    await active(page).getByLabel('Pemasok', { exact: true }).selectOption({ index: 1 });
    await addItem(page, 'semen', '1');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/po-pembelian$/);
    await expect(orderList(page).locator('tbody tr[data-number]')).toHaveCount(1);
    await orderList(page)
      .getByLabel('Status', { exact: true })
      .selectOption({ label: 'Status: Selesai' });
    await expect(orderList(page).locator('.bo-trx-table__empty')).toBeVisible();
    await orderList(page)
      .getByLabel('Status', { exact: true })
      .selectOption({ label: 'Status: On Proses' });
    await expect(orderList(page).locator('tbody tr[data-number]')).toHaveCount(1);
    await orderList(page)
      .getByRole('searchbox', { name: /Cari No PO/ })
      .fill('zzzz-tidak-ada');
    await expect(orderList(page).locator('.bo-trx-table__empty')).toBeVisible();
  });

  test('muat satu layar di 1280x640: daftar dan formulir PO', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian');
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await openPage(page, '/bo/transaksi/po-pembelian?baru=1');
    const lines = active(page).locator('.bo-trx__lines');
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(150);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe('T7 dan T8 Daftar SO dan Input SO (padanan gambar 10 dan 11)', () => {
  test('menu SO Penjualan membuka daftar; Buat SO Baru membuka formulir SO', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/so-penjualan');
    const root = orderList(page);
    await expect(
      root.getByRole('heading', { name: 'Daftar Pesanan Penjualan ( SO )' }),
    ).toBeVisible();
    expect(await orderHeaders(page)).toEqual([
      'No. SO',
      'Tanggal',
      'Pelanggan',
      'Keterangan',
      'Status',
      'Total',
    ]);
    await root.getByRole('button', { name: 'Buat SO Baru' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/so-penjualan\?baru=1$/);
    for (const name of [
      'Tanggal',
      'No SO',
      'Pelanggan',
      'Sales',
      'Syarat Bayar',
      'Tempo',
      'Ekspedisi',
      'Keterangan',
    ]) {
      await expect(active(page).getByLabel(name, { exact: false }).first()).toBeVisible();
    }
    await expect(active(page).getByLabel('No SO')).toHaveValue(/^SO\d{8}$/);
  });

  test('SO tersimpan muncul di Daftar SO, di pilihan SO Faktur Penjualan, dan Selesai setelah diimpor', async ({
    page,
  }) => {
    await loginBo(page);
    // Faktur Penjualan dibuka lebih dulu: tab-nya tetap hidup saat SO dibuat.
    await openPage(page, '/bo/penjualan');
    await openPage(page, '/bo/transaksi/so-penjualan?baru=1');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page, 'Pilih pelanggan dahulu.')).toBeVisible();
    await active(page).getByLabel('Pelanggan', { exact: true }).selectOption({ index: 1 });
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page, 'SO belum memiliki item barang.')).toBeVisible();
    await addItem(page, 'semen', '3');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/so-penjualan$/);
    const row = orderList(page).locator('tbody tr').first();
    const number = (await row.locator('td').nth(0).textContent()) ?? '';
    expect(number).toMatch(/^SO\d{8}$/);
    await expect(row.locator('td').nth(4)).toHaveText('On Proses');

    await openPage(page, '/bo/penjualan');
    const select = active(page).getByLabel('No. SO');
    await select.focus();
    await expect(select.locator('option', { hasText: number })).toHaveCount(1);
    await select.selectOption({
      label: (await select.locator('option', { hasText: number }).textContent()) ?? '',
    });
    await expect(countText(page)).toHaveText('1 Barang (3)');

    await openPage(page, '/bo/transaksi/so-penjualan');
    await expect(
      orderList(page).locator('tbody tr', { hasText: number }).locator('td').nth(4),
    ).toHaveText('Selesai');
  });

  test('muat satu layar di 1280x640: daftar dan formulir SO', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/so-penjualan');
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await openPage(page, '/bo/transaksi/so-penjualan?baru=1');
    const lines = active(page).locator('.bo-trx__lines');
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(150);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('Supervisor membuka daftar PO dan SO', async ({ page }) => {
    await loginBo(page, SUPERVISOR);
    await openPage(page, '/bo/transaksi/po-pembelian');
    await expect(orderList(page).getByRole('button', { name: 'Buat PO Baru' })).toBeVisible();
    await openPage(page, '/bo/transaksi/so-penjualan');
    await expect(orderList(page).getByRole('button', { name: 'Buat SO Baru' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Surat Jalan Ekspedisi dan Packing Koli (gambar 13)
// ---------------------------------------------------------------------------

test.describe('T10 Surat Jalan Ekspedisi dan Packing Koli (gambar 13)', () => {
  const sjRows = (page: Page): Locator =>
    active(page).locator('.bo-trx-table--lines tbody tr[data-id]');

  async function openFromFaktur(page: Page): Promise<void> {
    await openPage(page, '/bo/penjualan');
    await addItem(page, 'semen', '10');
    await addItem(page, 'semen', '15', 1);
    await rowsOf(page).nth(0).getByRole('checkbox').check();
    await rowsOf(page).nth(1).getByRole('checkbox').check();
    await active(page).getByRole('button', { name: 'Isi SJ Ekspedisi' }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/surat-jalan\?inv=FJ\d+$/);
    await expect(sjRows(page)).toHaveCount(2);
  }

  test('baris awal berasal dari barang Koli faktur dan kepala memuat data faktur', async ({
    page,
  }) => {
    await loginBo(page);
    await openFromFaktur(page);
    const root = active(page);
    await expect(
      root.getByRole('heading', { name: 'Surat Jalan Ekspedisi & Packing Koli' }),
    ).toBeVisible();
    await expect(root.getByLabel('No. Surat Jalan')).toHaveValue(/^SJ26/);
    await expect(root.getByLabel('Faktur Penjualan')).toHaveValue(/^FJ\d+$/);
    await expect(root.getByLabel('Nama Ekspedisi')).toHaveValue('JNE Cargo');
    for (const name of ['Tanggal', 'No. Polisi / Driver', 'Penerima & Alamat Kirim']) {
      await expect(root.getByLabel(name)).toBeVisible();
    }
    expect(await root.locator('.bo-trx-table--lines thead th').allTextContents()).toEqual([
      'Jumlah',
      'Satuan',
      'Nama Barang',
    ]);
    await expect(sjRows(page).first().locator('td').nth(0)).toHaveText('10');
    for (const name of ['Simpan', 'Batal', 'Hapus']) {
      await expect(root.getByRole('button', { name, exact: true })).toBeVisible();
    }
    for (const name of ['Jumlah', 'Satuan', 'Nama Koli Barang']) {
      await expect(root.getByLabel(name, { exact: true })).toBeVisible();
    }
  });

  test('Simpan menambah baris; klik baris memuatnya untuk diubah; Hapus dan Batal bekerja', async ({
    page,
  }) => {
    await loginBo(page);
    await openFromFaktur(page);
    const root = active(page);
    await root.getByLabel('Jumlah', { exact: true }).fill('20');
    await root.getByLabel('Satuan', { exact: true }).fill('krg');
    await root.getByLabel('Nama Koli Barang').fill('baut unc 3/8 x 7 @50kg');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(sjRows(page)).toHaveCount(3);
    await expect(sjRows(page).nth(2).locator('td').nth(1)).toHaveText('KRG');
    await expect(sjRows(page).nth(2).locator('td').nth(2)).toContainText('BAUT UNC');
    await expect(root.getByLabel('Jumlah', { exact: true })).toHaveValue('');

    await sjRows(page).nth(2).click();
    await expect(root.getByLabel('Jumlah', { exact: true })).toHaveValue('20');
    await expect(root.getByLabel('Satuan', { exact: true })).toHaveValue('KRG');
    await root.getByLabel('Jumlah', { exact: true }).fill('25');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(sjRows(page)).toHaveCount(3);
    await expect(sjRows(page).nth(2).locator('td').nth(0)).toHaveText('25');

    await sjRows(page).nth(2).click();
    await root.getByRole('button', { name: 'Batal', exact: true }).click();
    await expect(root.getByLabel('Jumlah', { exact: true })).toHaveValue('');
    await expect(sjRows(page)).toHaveCount(3);

    await root.getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(page.getByText('Pilih baris koli yang akan dihapus.')).toBeVisible();
    await sjRows(page).nth(2).click();
    await root.getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(sjRows(page)).toHaveCount(2);
  });

  test('jumlah nol, satuan kosong, atau nama kosong ditolak dengan pesan', async ({ page }) => {
    await loginBo(page);
    await openFromFaktur(page);
    const root = active(page);
    await root.getByLabel('Jumlah', { exact: true }).fill('0');
    await root.getByLabel('Satuan', { exact: true }).fill('KRG');
    await root.getByLabel('Nama Koli Barang').fill('BAUT');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Isi jumlah lebih dari 0.')).toBeVisible();
    await root.getByLabel('Jumlah', { exact: true }).fill('2');
    await root.getByLabel('Satuan', { exact: true }).fill('');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Isi satuan.')).toBeVisible();
    await root.getByLabel('Satuan', { exact: true }).fill('KRG');
    await root.getByLabel('Nama Koli Barang').fill('');
    await root.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Isi nama koli barang.')).toBeVisible();
    await expect(sjRows(page)).toHaveCount(2);
  });

  test('tombol Isi Data Faktur Penjualan kembali ke faktur', async ({ page }) => {
    await loginBo(page);
    await openFromFaktur(page);
    await active(page).getByRole('button', { name: 'Isi Data Faktur Penjualan' }).click();
    await expect(page).toHaveURL(/#\/bo\/penjualan$/);
  });

  test('dibuka langsung tanpa faktur menampilkan contoh gambar 13', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/surat-jalan');
    await expect(sjRows(page)).toHaveCount(3);
    await expect(active(page).getByLabel('Penerima & Alamat Kirim')).not.toHaveValue('');
  });

  test('muat satu layar di 1280x640 dengan banyak baris', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/surat-jalan');
    const lines = active(page).locator('.bo-trx__lines');
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThanOrEqual(150);
    for (let index = 0; index < 12; index += 1) {
      await active(page)
        .getByLabel('Jumlah', { exact: true })
        .fill(String(index + 1));
      await active(page).getByLabel('Satuan', { exact: true }).fill('KRG');
      await active(page)
        .getByLabel('Nama Koli Barang')
        .fill(`BARANG ${String(index + 1)}`);
      await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    }
    await expect(sjRows(page)).toHaveCount(15);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    expect(await lines.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(
      0,
    );
  });
});
