import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran kelima: menu Mutasi Stok sesuai gambar klien 14 sampai 18 dan judul
// Daftar Perintah Stok Opname (tanpa gambar). Daftar dan formulir berbagi satu tab.

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

async function pick(page: Page, code: string): Promise<void> {
  const picker = page.getByLabel('Cari atau pindai barang');
  await picker.fill(code);
  await picker.press('Enter');
}

test.describe('Transfer Stok (gambar 14 dan 15)', () => {
  test('daftar berkolom lengkap, formulir sama tab, Cetak butuh barang, Batal kembali ke daftar', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/mutasi');
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table thead th')).toHaveText([
      'No. Mutasi',
      'Waktu',
      'Gudang asal',
      'Gudang tujuan',
      'Jumlah Barang',
      'Jumlah Item',
      'User',
      'Keterangan',
    ]);
    const firstMove = page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr').first();
    await expect(firstMove).toContainText('Isi stok toko');
    // Ubah membuka bukti transfer dokumen terpilih; tanpa pilihan muncul petunjuk.
    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(page.getByText('Pilih data pada daftar terlebih dahulu.')).toBeVisible();
    await firstMove.click();
    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('M-0001');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    // Mutasi stok tidak dapat dihapus karena sudah memindahkan stok.
    await page.getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(
      page.getByText('Mutasi stok yang sudah tersimpan tidak dapat dihapus'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/mutasi\?baru=1$/);
    await expect(page.locator('.bo-tab')).toHaveCount(2);

    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByText('Isi barang yang akan dimutasi lebih dulu.')).toBeVisible();

    await pick(page, 'B0001');
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Draf Bukti Transfer Stok');
    await expect(dialog).toContainText('M-0002');
    await expect(dialog).toContainText('B0001');
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();

    await page.getByRole('button', { name: 'Batal' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kosongkan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/mutasi$/);
    await expect(page.getByRole('button', { name: 'Tambah', exact: true })).toBeVisible();
  });
});

test.describe('Koreksi Stok (gambar 16 dan 17)', () => {
  test('daftar riwayat, alasan per baris wajib, simpan, dan Berita Acara draf', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/mutasi/koreksi');
    await expect(page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr')).toHaveCount(2);
    // Ubah membuka Berita Acara koreksi terpilih.
    await page
      .locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr', { hasText: 'KS-0002' })
      .click();
    await page.getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('KS-0002');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();

    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/mutasi\/koreksi\?baru=1$/);
    await expect(page.getByRole('button', { name: 'Hapus', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await pick(page, 'B0006');
    await pick(page, 'B0007');
    await expect(page.locator('[data-korek-actual="0"]')).toHaveClass(/is-required/);
    await expect(page.locator('[data-korek-reason="0"]')).toBeVisible();

    await page.locator('[data-korek-actual="0"]').fill('5');
    await page.locator('[data-korek-actual="1"]').fill('3');
    await expect(page.locator('[data-korek-actual="0"]')).not.toHaveClass(/is-required/);
    await page.getByRole('button', { name: 'Simpan Koreksi' }).click();
    await expect(page.getByText('Alasan koreksi wajib diisi minimal 5 karakter.')).toBeVisible();
    await expect(page.locator('[data-korek-reason="0"]')).toBeFocused();

    await page.locator('[data-korek-reason="0"]').fill('Barang rusak');
    await page.locator('[data-korek-reason="1"]').fill('Barang ditemukan');
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Draf Cetak Berita Acara');
    await expect(dialog).toContainText('BARANG RUSAK');
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();

    await page.getByRole('button', { name: 'Simpan Koreksi' }).click();
    await expect(page.getByText('Koreksi stok KS-0003 tersimpan.')).toBeVisible();
    await expect(page).toHaveURL(/#\/bo\/mutasi\/koreksi$/);
    const first = page.locator('.bo-tabpanel:not([hidden]) .bo-trx-table tbody tr').first();
    await expect(first).toContainText('KS-0003');
    await expect(first).toContainText('BARANG RUSAK; BARANG DITEMUKAN');
  });

  test('Hapus mengosongkan seluruh draf setelah konfirmasi', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/mutasi/koreksi?baru=1');
    await pick(page, 'B0006');
    await expect(page.locator('.bo-mut-table--korek tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Hapus', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hapus draf' }).click();
    await expect(page.locator('.bo-mut-table--korek')).toHaveCount(0);
    await expect(
      page.getByText(/Belum ada barang\. Cari atau pindai barang yang stoknya/),
    ).toBeVisible();
  });
});

test.describe('Daftar Stok Minim (gambar 18)', () => {
  test('tombol Mutasi Stok membuka Transfer Stok dan jumlah barang ada di baris filter', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/stok?filter=minimum');
    await expect(page.locator('.bo-mut-filters .bo-count')).toContainText('barang');
    await page.getByRole('button', { name: 'Mutasi Stok', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/mutasi$/);
  });
});

test.describe('Stok Opname PSO dan HSO (gambar 19 dan 20)', () => {
  test('daftar riwayat berkolom lengkap, empat contoh, filter status dan pencarian bekerja', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/opname');
    await expect(page.getByRole('heading', { name: 'Riwayat Stok Opname' })).toBeVisible();
    await expect(page.locator('.bo-trx-table thead th')).toHaveText([
      'Tanggal',
      'Nomor PSO',
      'Nomor HSO',
      'Gudang',
      'Status',
      'Petugas',
      'Keterangan',
    ]);
    await expect(page.locator('.bo-trx-table tbody tr')).toHaveCount(4);
    await expect(page.locator('.bo-trx-table tbody tr').first()).toContainText('Menunggu Eksekusi');
    await page.getByLabel('Status', { exact: true }).selectOption('selesai');
    await expect(page.locator('.bo-trx-table tbody tr')).toHaveCount(2);
    await page.getByLabel('Status', { exact: true }).selectOption('semua');
    await page
      .getByRole('searchbox', { name: 'Cari nomor, petugas, atau keterangan' })
      .fill('PSO-0003');
    await expect(page.locator('.bo-trx-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.bo-trx-table tbody tr')).toContainText('Dalam Perhitungan');
  });

  test('perintah baru: tolak tanpa barang, tambah lewat rak, simpan, lalu proses menjadi hasil lengkap', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/opname');
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/opname\?baru=1$/);
    await expect(page.getByLabel('No PSO')).toHaveValue('Otomatis');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Tambahkan barang yang akan dihitung lebih dulu.')).toBeVisible();
    await page.getByLabel('Nama Barang').fill('B0001');
    await page.getByLabel('Nama Barang').press('Enter');
    await expect(page.locator('.bo-mut-table--lines tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Proses Opname' }).click();
    await expect(page.getByLabel('No HSO')).toHaveValue('HSO-0004');
    await expect(page.getByLabel('No PSO')).toHaveValue('PSO-0005');
    await expect(page.getByText('Terisi 0 dari 1')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Isi stok fisik atau hapus baris ini.')).toBeVisible();
    const physical = page.locator('[data-physical="P-0001"]');
    await physical.fill('-1');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Stok fisik tidak boleh negatif.')).toBeVisible();
    await physical.fill('0');
    await expect(page.getByText('Terisi 1 dari 1')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terapkan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/opname$/);
    const first = page.locator('.bo-trx-table tbody tr').first();
    await expect(first).toContainText('PSO-0005');
    await expect(first).toContainText('HSO-0004');
    await expect(first).toContainText('Selesai');
  });

  test('hasil sebagian disimpan sebagai Dalam Perhitungan dan hasil selesai terkunci', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/opname?baru=1&no=PSO-0003&mode=hasil');
    await expect(page.getByText('Terisi 2 dari 4')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/opname$/);
    await expect(page.locator('.bo-trx-table tbody tr[data-pso="PSO-0003"]')).toContainText(
      'Dalam Perhitungan',
    );
    await page.goto('/#/bo/opname?baru=1&no=PSO-0001&mode=hasil');
    await expect(page.getByRole('button', { name: 'Simpan', exact: true })).toBeDisabled();
    await expect(page.locator('[data-physical]')).toHaveCount(0);
  });
});
