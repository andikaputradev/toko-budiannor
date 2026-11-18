import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran ketujuh: Akuntansi satu halaman (gambar klien 24 sampai 28). Lima
// bagian berganti di dalam satu tab lewat lima tombol; Cetak memberi pilihan Print, Excel, PDF.

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

const panel = (page: Page) => page.locator('.bo-tabpanel:not([hidden])');

test.describe('Akuntansi satu halaman', () => {
  test('lima tombol bagian berganti di tempat tanpa membuka tab baru', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/akuntansi');
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    const switcher = panel(page).getByRole('group', { name: 'Akuntansi' });
    await expect(switcher.getByRole('button')).toHaveText([
      'Jurnal Otomatis',
      'Beban Usaha',
      'Arus Kas',
      'Laba Rugi',
      'Neraca',
    ]);
    await expect(panel(page).getByRole('heading', { name: 'Jurnal Otomatis' })).toBeVisible();
    await switcher.getByRole('button', { name: 'Neraca' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Neraca' })).toBeVisible();
    await expect(panel(page).getByText('Neraca seimbang')).toBeVisible();
    await switcher.getByRole('button', { name: 'Arus Kas' }).click();
    await expect(panel(page).getByText('Posisi Kas dan Bank')).toBeVisible();
    await expect(page.locator('.bo-tab')).toHaveCount(2);
    await expect(page).toHaveURL(/#\/bo\/akuntansi$/);
  });

  test('rute bagian lama dialihkan ke halaman Akuntansi yang sama', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/akuntansi/beban');
    await expect(page).toHaveURL(/#\/bo\/akuntansi\?bagian=beban$/);
    await expect(panel(page).getByRole('heading', { name: 'Beban Usaha' })).toBeVisible();
    await expect(page.locator('.bo-tab')).toHaveCount(2);
  });

  test('Beban Usaha: tujuh kartu angka dengan enam kategori dan beban baru ikut tercatat', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/akuntansi?bagian=beban');
    const cards = panel(page).locator('.bo-acc-stats--beban .bo-stat-card__lbl');
    await expect(cards).toHaveText([
      'Total Beban Okt 2026',
      'Gaji dan Komisi',
      'Transportasi Angkutan',
      'Katering Makan',
      'Listrik dan Internet',
      'Sewa Toko',
      'Beban Lain Lain',
    ]);
    await expect(panel(page).getByRole('button', { name: 'Cetak' })).toHaveCount(0);
    await panel(page).getByLabel('Kategori').selectOption('Katering Makan');
    await panel(page).getByLabel('Nominal (Rp)').fill('250000');
    await panel(page).getByLabel('Keterangan').fill('Katering rapat toko');
    await panel(page).getByRole('button', { name: 'Simpan dan Jurnalkan' }).click();
    await expect(panel(page).locator('.bo-acc-stats--beban')).toContainText('Rp 52.850.000');
    await expect(panel(page)).toContainText('KATERING RAPAT TOKO');
  });

  test('Cetak: di baris filter Jurnal dan di kepala Neraca; tombol memberi tiga pilihan', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/akuntansi');
    await panel(page).getByRole('button', { name: 'Cetak' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ekspor Excel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ekspor PDF' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Ekspor PDF' }).click();
    await expect(page.getByText('Jurnal Otomatis').last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await panel(page)
      .getByRole('group', { name: 'Akuntansi' })
      .getByRole('button', { name: 'Neraca' })
      .click();
    await expect(panel(page).getByRole('button', { name: 'Cetak' })).toBeVisible();
  });

  test('Supervisor tidak melihat Laba Rugi (hak akses BO-17 hanya Owner)', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/akuntansi');
    const buttons = panel(page).getByRole('group', { name: 'Akuntansi' }).getByRole('button');
    await expect(buttons).toHaveText(['Jurnal Otomatis', 'Beban Usaha', 'Arus Kas', 'Neraca']);
  });
});
