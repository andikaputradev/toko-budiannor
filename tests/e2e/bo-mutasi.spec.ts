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
    await expect(page.locator('.bo-mut-table thead th')).toHaveText([
      'No. Mutasi',
      'Waktu',
      'Gudang asal',
      'Gudang tujuan',
      'Item',
      'User',
      'Keterangan',
    ]);
    await expect(page.locator('.bo-mut-table tbody tr').first()).toContainText('Isi stok toko');
    await page.getByRole('button', { name: 'Buat Do Transfer' }).click();
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
    await expect(page.getByRole('button', { name: 'Buat Do Transfer' })).toBeVisible();
  });
});

test.describe('Koreksi Stok (gambar 16 dan 17)', () => {
  test('daftar riwayat, alasan per baris wajib, simpan, dan Berita Acara draf', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/mutasi/koreksi');
    await expect(page.getByRole('button', { name: 'Riwayat koreksi' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('.bo-mut-table tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Cetak Berita Acara KS-0002/ })).toBeVisible();

    await page.locator('.bo-mut-create').click();
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
    const first = page.locator('.bo-mut-table tbody tr').first();
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

test.describe('Daftar Perintah Stok Opname', () => {
  test('daftar memuat dua perintah contoh, Lihat membuka pratinjau, dan draf berjalan bisa dilanjutkan', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/opname');
    await expect(page.locator('.bo-mut-table thead th')).toHaveText([
      'No. Opname',
      'Tanggal',
      'Gudang',
      'Petugas',
      'Barang',
      'Status',
      'Nilai selisih',
      'Aksi',
    ]);
    await page.getByRole('button', { name: 'Lihat OP-0002' }).click();
    await expect(page.getByRole('dialog')).toContainText('OP-0002');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();

    await page.getByRole('button', { name: 'Perintah Opname' }).click();
    await pick(page, 'B0001');
    await page.getByRole('button', { name: 'Kembali ke daftar' }).click();
    const draft = page.locator('.bo-mut-table tbody tr').first();
    await expect(draft).toContainText('OP-0003');
    await expect(draft).toContainText('Draf');
    await page.getByRole('button', { name: 'Lanjutkan draf OP-0003' }).click();
    await expect(page).toHaveURL(/#\/bo\/opname\?baru=1$/);
    await expect(page.getByText('Terisi 0 dari 1')).toBeVisible();
  });
});
