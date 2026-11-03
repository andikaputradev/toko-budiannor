import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

async function login(page: Page, name: string, pin: string): Promise<void> {
  await page.goto('/#/pos');
  await page.getByRole('radio', { name: new RegExp(name) }).click();
  for (const digit of pin) {
    await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
  }
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/pos\/jual$/);
}

async function simulate(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await page.locator('.sim__action', { hasText: action }).click();
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await expect(page.locator('#sim-body')).toBeHidden();
}

async function lineLengths(page: Page): Promise<number[]> {
  return page
    .locator('.pos-receipt')
    .evaluate((node) => node.textContent.split('\n').map((line) => line.length));
}

test.describe('POS-05 sampai POS-10', () => {
  test('F-04: tahan bill, cetak struk draf 58 dan 80 mm, lalu panggil bill', async ({ page }) => {
    await login(page, 'Dewi', '2468');
    await page.locator('.pos-card').first().click();
    await page.locator('.pos-card').nth(1).click();
    await page.getByRole('button', { name: /^Tahan Bill/ }).click();
    await expect(page.getByText('Bill B-0004 ditahan.')).toBeVisible();
    await expect(
      page.getByText('Belum ada barang. Pindai barcode atau ketuk barang.'),
    ).toBeVisible();

    await page.locator('.pos-card').nth(2).click();
    await page.getByRole('button', { name: 'Panggil Bill' }).click();
    await expect(
      page.getByText('Bill saat ini belum selesai. Tahan dahulu agar tidak hilang.'),
    ).toBeVisible();
    await page.locator('.pos-bill__name').first().click();
    await page.getByRole('button', { name: 'Hapus Item' }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Hapus', exact: true })
      .click();

    await page.getByRole('button', { name: 'Panggil Bill' }).click();
    await expect(page).toHaveURL(/#\/pos\/bill$/);
    const rows = page.locator('.pos-bills__list tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('B-0004');
    await expect(page.getByRole('button', { name: 'Hapus Bill' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cetak Struk Draf' }).click();
    const sheet = page.locator('.pos-receipt');
    await expect(sheet).toContainText('STRUK DRAF, BUKAN BUKTI BAYAR');
    await expect(sheet).not.toContainText('Rp');
    await page.getByRole('button', { name: '58 mm' }).click();
    await expect(sheet).toHaveAttribute('data-width', '58');
    expect(Math.max(...(await lineLengths(page)))).toBeLessThanOrEqual(32);
    await page.getByRole('button', { name: '80 mm' }).click();
    await expect(sheet).toHaveAttribute('data-width', '80');
    expect(Math.max(...(await lineLengths(page)))).toBeLessThanOrEqual(48);

    await simulate(page, 'Printer');
    await page.getByRole('dialog').getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(
      page.getByText('Struk draf belum tercetak. Periksa printer lalu coba lagi.'),
    ).toBeVisible();
    await simulate(page, 'Printer');
    await page.getByRole('dialog').getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByText('Struk draf tercetak.')).toBeVisible();
    await expect(rows).toHaveCount(4);

    await page.getByRole('button', { name: 'Panggil Bill' }).click();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(page.locator('.pos-bill tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Panggil Bill' }).click();
    await expect(page.getByText('Bill saat ini belum selesai.')).toBeVisible();
  });

  test('F-04: Supervisor menghapus bill gantung setelah konfirmasi', async ({ page }) => {
    await login(page, 'Ibu Sinta', '3571');
    await page.goto('/#/pos/bill');
    await page.getByRole('button', { name: 'Hapus Bill' }).click();
    await expect(
      page.getByText('Hapus bill B-0001? Bill yang dihapus tidak dapat dikembalikan.'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(page.locator('.pos-bills__list tbody tr')).toHaveCount(2);
  });

  test('F-05: offline dari Panel Simulasi, stok negatif, antrean, lalu sinkronisasi', async ({
    page,
  }) => {
    await login(page, 'Dewi', '2468');
    await simulate(page, 'Online');
    await expect(
      page.getByText(
        'Mode offline: transaksi tetap berjalan dan akan dikirim otomatis saat internet pulih. Antrean: 3 transaksi.',
      ),
    ).toBeVisible();

    await page.locator('.pos-card').first().click();
    await page.locator('.pos-bill__name').first().click();
    await page.getByRole('textbox', { name: 'Jumlah' }).fill('9999');
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await expect(page.getByText('Stok kurang')).toBeVisible();
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Selesaikan dan Cetak Struk' }).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
    await expect(page.getByText('Antrean: 4 transaksi.')).toBeVisible();

    await page.getByRole('link', { name: /Offline/ }).click();
    await expect(page).toHaveURL(/#\/pos\/status$/);
    await expect(page.locator('.pos-status__queue tbody tr')).toHaveCount(4);
    await expect(page.locator('.pos-sync--menunggu')).toHaveCount(4);
    await expect(page.locator('.pos-status-card__count')).toHaveText('4');
    await expect(page.locator('.pos-status__negative')).toContainText('Semen PCC Karya Mandiri');
    await expect(page.locator('.pos-status__negative')).toContainText('Ditinjau (negatif)');
    await expect(page.locator('.pos-status-card--connection')).toHaveClass(/is-offline/);

    await page.getByRole('button', { name: 'Sinkronkan Sekarang' }).click();
    await expect(
      page.getByText(
        'Tidak ada koneksi internet. Sinkronisasi akan berjalan otomatis saat koneksi pulih.',
      ),
    ).toBeVisible();

    await simulate(page, 'Offline');
    await expect(page.locator('.pos-sync--terkirim')).toHaveCount(4, { timeout: 8000 });
    await expect(page.locator('.pos-status-card__count')).toHaveText('0');
    await expect(page.getByText('Semua transaksi sudah terkirim.').first()).toBeVisible();
    await expect(page.locator('.pos-status-card--connection')).not.toHaveClass(/is-offline/);
  });

  test('POS-06: filter Pending, cetak ulang SALINAN, ajukan koreksi, dan retur', async ({
    page,
  }) => {
    await login(page, 'Ibu Sinta', '3571');
    await page.getByRole('link', { name: 'Riwayat' }).click();
    await page.locator('.pos-history__date').first().fill('2026-10-01');
    await page.locator('.pos-history__chips').getByRole('button', { name: 'Pending' }).click();
    const rows = page.locator('.pos-history__list tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const text of await rows.allTextContents()) {
      expect(text).toContain('Pending');
    }
    await page.locator('.pos-history__chips').getByRole('button', { name: 'Semua' }).click();

    await page.getByRole('button', { name: 'Cetak Ulang Struk' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('SALINAN');
    await page.getByRole('dialog').getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByText('Salinan struk tercetak.')).toBeVisible();

    await page.getByRole('button', { name: 'Ajukan Koreksi' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Alasan').fill('Salah harga barang');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(
      page.getByText('Pengajuan koreksi disetujui. Ubah transaksi di Back-Office.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Retur Penjualan' }).click();
    const retur = page.getByRole('dialog');
    await retur.getByRole('button', { name: 'Simpan Retur' }).click();
    await expect(retur.getByText('Pilih minimal satu barang untuk diretur.')).toBeVisible();
    await retur.locator('input[type=checkbox]').first().check();
    await retur.locator('.pos-return__qty').first().fill('999');
    await retur.getByRole('button', { name: 'Simpan Retur' }).click();
    await expect(retur.getByText(/Jumlah retur melebihi jumlah yang dibeli \(/)).toBeVisible();
    await retur.locator('.pos-return__qty').first().fill('1');
    await retur.getByRole('button', { name: 'Simpan Retur' }).click();
    await expect(retur.getByText('Alasan retur wajib diisi.')).toBeVisible();
    await retur.locator('.pos-return__reason').fill('Barang rusak');
    await retur.getByRole('button', { name: 'Simpan Retur' }).click();
    await expect(page.getByText(/Retur R-0001 tersimpan\. Nilai retur Rp /)).toBeVisible();
  });

  test('POS-06: Kasir tidak melihat Ajukan Koreksi dan Retur Penjualan', async ({ page }) => {
    await login(page, 'Dewi', '2468');
    await page.getByRole('link', { name: 'Riwayat' }).click();
    await expect(page.getByRole('button', { name: 'Cetak Ulang Struk' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajukan Koreksi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retur Penjualan' })).toHaveCount(0);
  });

  test('POS-07: biaya kasir dengan validasi persis dan saldo kas', async ({ page }) => {
    await login(page, 'Dewi', '2468');
    await page.getByRole('link', { name: 'Biaya' }).click();
    const save = page.getByRole('button', { name: 'Simpan Biaya' });
    await save.click();
    await expect(page.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await page.getByRole('button', { name: 'Lainnya' }).click();
    await page.getByLabel('Jumlah', { exact: true }).fill('5000');
    await save.click();
    await expect(page.getByText('Keterangan wajib diisi untuk jenis Lainnya.')).toBeVisible();
    await page.getByRole('button', { name: 'Parkir' }).click();
    await page.getByLabel('Jumlah', { exact: true }).fill('9999999');
    await save.click();
    await expect(page.getByText('Jumlah melebihi saldo kas Rp 1.337.000.')).toBeVisible();
    await page.getByLabel('Jumlah', { exact: true }).fill('5000');
    await expect(page.locator('.pos-expense__balance')).toContainText('Rp 1.332.000');
    await save.click();
    await expect(page.getByText('Biaya tersimpan.')).toBeVisible();
    await expect(page.locator('.pos-expense__side tbody tr')).toHaveCount(1);
  });

  test('POS-08: pelanggan baru, validasi, dan limit hanya Supervisor atau Owner', async ({
    page,
  }) => {
    await login(page, 'Dewi', '2468');
    await page.getByRole('button', { name: 'Pelanggan', exact: true }).click();
    await page.getByRole('button', { name: 'Pelanggan Baru' }).click();
    const save = page.getByRole('button', { name: 'Simpan Pelanggan' });
    await save.click();
    await expect(page.getByText('Nama pelanggan wajib diisi.')).toBeVisible();
    await page.getByLabel('Nama pelanggan').fill('Toko Baru Sentosa');
    await page.getByLabel('Nomor telepon').fill('12345');
    await save.click();
    await expect(
      page.getByText('Nomor telepon tidak valid. Gunakan 9 sampai 14 angka.'),
    ).toBeVisible();
    await page.getByLabel('Nomor telepon').fill('081234567890');
    await page.getByLabel('Limit piutang dasar').fill('500000');
    await save.click();
    await expect(
      page.getByText('Limit piutang hanya dapat diatur oleh Supervisor atau Owner.'),
    ).toBeVisible();
    await page.getByLabel('Limit piutang dasar').fill('');
    await save.click();
    await expect(page.getByText('Pelanggan tersimpan.')).toBeVisible();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(page.getByText('Pelanggan: Toko Baru Sentosa (Eceran)')).toBeVisible();
  });

  test('printer terputus: struk transaksi tertahan sampai Cetak Ulang berhasil', async ({
    page,
  }) => {
    await login(page, 'Dewi', '2468');
    await simulate(page, 'Printer');
    await page.locator('.pos-card').first().click();
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Selesaikan dan Cetak Struk' }).click();
    await expect(
      page.getByText('Struk belum tercetak. Periksa printer lalu tekan Cetak Ulang.'),
    ).toBeVisible();
    await simulate(page, 'Printer');
    await page.getByRole('button', { name: 'Cetak Ulang' }).click();
    await expect(page.getByText('Struk tercetak.')).toBeVisible();
  });

  test('Frontliner: Panggil Bill dan Cetak Struk Draf tersedia, riwayat tidak', async ({
    page,
  }) => {
    await login(page, 'Agus', '9024');
    await expect(page.getByRole('link', { name: 'Riwayat' })).toHaveCount(0);
    await page.goto('/#/pos/riwayat');
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await page.locator('.pos-card').first().click();
    await page.getByRole('button', { name: 'Cetak Struk Draf' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('STRUK DRAF, BUKAN BUKTI BAYAR');
  });

  test('aksesibilitas: POS-05 sampai POS-09 tanpa pelanggaran axe', async ({ page }) => {
    await login(page, 'Ibu Sinta', '3571');
    for (const path of ['bill', 'riwayat', 'biaya', 'pelanggan-baru', 'status']) {
      await page.goto(`/#/pos/${path}`);
      await expect(page).toHaveURL(new RegExp(`#/pos/${path}$`));
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, path).toEqual([]);
    }
  });
});
