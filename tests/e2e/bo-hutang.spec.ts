import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran ketujuh: menu Hutang Piutang sesuai gambar klien 21 sampai 23. Saldo,
// Daftar Pembayaran, dan formulir pembayaran berdiri sendiri; hutang memakai model yang sama.

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

test.describe('Saldo Piutang dan Saldo Hutang (gambar 21)', () => {
  test('tiga kartu angka, centang faktur menambah total yang dicetak, Simpan dan Cetak bekerja', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/hutang-piutang/saldo-piutang');
    await expect(
      page.getByRole('heading', {
        name: 'Daftar Saldo Piutang dan Pembuatan Laporan Penagihan Piutang',
      }),
    ).toBeVisible();
    const kpis = page.locator('.bo-tabpanel:not([hidden]) .bo-debt-kpi');
    await expect(kpis).toHaveCount(3);
    await expect(kpis.nth(0)).toContainText('Total Saldo Piutang');
    await expect(kpis.nth(2)).toContainText('Rp 0');
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(
      page.getByText('Beri tanda centang pada faktur yang akan dicetak lebih dulu.'),
    ).toBeVisible();
    const first = page
      .locator('.bo-tabpanel:not([hidden]) .bo-debt-table tbody input[type="checkbox"]')
      .first();
    await first.check();
    await expect(kpis.nth(2)).not.toContainText('Rp 0');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Daftar faktur yang dicetak tersimpan.')).toBeVisible();
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Laporan Penagihan');
    // Catatan klien: tanggal di semua halaman berbentuk hari/bulan/tahun dengan garis miring.
    await expect(page.getByRole('dialog')).toContainText(/Tanggal cetak: \d{2}\/\d{2}\/\d{4}/);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    // Centang bertahan setelah pindah halaman karena Simpan menyimpannya di sesi.
    await page.goto('/#/bo/hutang-piutang/saldo-hutang');
    await page.goto('/#/bo/hutang-piutang/saldo-piutang');
    await expect(
      page
        .locator('.bo-tabpanel:not([hidden]) .bo-debt-table tbody input[type="checkbox"]')
        .first(),
    ).toBeChecked();
  });

  test('Saldo Hutang berjudul sendiri dan tidak digabung dengan piutang', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/hutang-piutang/saldo-hutang');
    await expect(
      page.getByRole('heading', {
        name: 'Daftar Saldo Hutang dan Pembuatan Laporan Pembayaran Hutang',
      }),
    ).toBeVisible();
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-debt-kpi').first()).toContainText(
      'Total Saldo Hutang',
    );
    await expect(page.getByRole('button', { name: 'Saldo Piutang Pelanggan' })).toHaveCount(0);
  });
});

test.describe('Daftar dan formulir pembayaran (gambar 22 dan 23)', () => {
  test('daftar berkolom lengkap dengan total hari ini sesuai gambar', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/hutang-piutang/bayar-piutang');
    await expect(
      page.getByRole('heading', { name: 'Daftar Pembayaran Piutang Penjualan' }),
    ).toBeVisible();
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table thead th')).toHaveText([
      'Nomor Pembayaran',
      'Tanggal',
      'Pelanggan',
      'Metode Bayar',
      'Kas / Bank',
      'User',
      'Keterangan',
      'Total Bayar',
    ]);
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-kpi')).toContainText(
      'Total Pembayaran Piutang Hari Ini',
    );
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-kpi')).toContainText(
      'Rp 17.850.000',
    );
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr')).toHaveCount(6);
  });

  test('bayar piutang: pilih pelanggan, bagi otomatis, simpan, daftar dan saldo ikut berubah', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/hutang-piutang/saldo-piutang');
    const before = await page
      .locator('.bo-tabpanel:not([hidden]) .bo-debt-kpi')
      .first()
      .textContent();
    await page.goto('/#/bo/hutang-piutang/bayar-piutang');
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/hutang-piutang\/bayar-piutang\?baru=1$/);
    await expect(page.getByRole('heading', { name: 'Isi Data Pembayaran Piutang' })).toBeVisible();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Pilih pihak yang dibayar.')).toBeVisible();
    await page.getByLabel('Pelanggan', { exact: true }).selectOption({ label: 'UD Karya Bangun' });
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-debt-table tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Isi pembayaran minimal pada satu faktur.')).toBeVisible();
    // Ada dua isian Nominal (bagian kedua untuk Split): yang pertama adalah total pembayaran.
    await page.getByLabel('Nominal', { exact: true }).first().fill('1000000');
    await page.getByLabel('Nominal', { exact: true }).first().press('Enter');
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-debt-total__value')).toHaveText(
      'Rp 1.000.000',
    );
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/hutang-piutang\/bayar-piutang$/);
    const top = page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr').first();
    await expect(top).toContainText('PP-0007');
    await expect(top).toContainText('UD Karya Bangun');
    await expect(top).toContainText('Rp 1.000.000');
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-kpi')).toContainText(
      'Rp 18.850.000',
    );
    await page.goto('/#/bo/hutang-piutang/saldo-piutang');
    const after = await page
      .locator('.bo-tabpanel:not([hidden]) .bo-debt-kpi')
      .first()
      .textContent();
    expect(after).not.toBe(before);
    await page.goto('/#/bo/hutang-piutang/bayar-piutang');
    await page.getByRole('link', { name: 'PP-0007' }).click();
    await expect(page.getByRole('button', { name: 'Simpan', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Pelanggan', { exact: true })).toBeDisabled();
  });

  test('bayar hutang memakai formulir yang sama untuk pemasok', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/hutang-piutang/bayar-hutang');
    await expect(
      page.getByRole('heading', { name: 'Daftar Pembayaran Hutang Pembelian' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Isi Data Pembayaran Hutang' })).toBeVisible();
    await expect(page.getByLabel('Pemasok', { exact: true })).toBeVisible();
  });
});
