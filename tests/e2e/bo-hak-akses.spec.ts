import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Pengguna dan Hak Akses (dokumen klien: menu Hak Akses dapat diedit Owner, PIN kasir 6 angka, grup
// Pengaturan digabung tanpa "Lainnya", gambar acuan 54). Berjalan pada build produksi.

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MATRIX = '/bo/pengaturan/pengguna?bagian=matriks';

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

const panel = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');
const cellOf = (page: Page, role: string, action: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${role}, ${action}:`) });

async function openMatrix(page: Page): Promise<void> {
  await page.goto(`/#${MATRIX}`);
  await expect(
    panel(page).getByRole('tab', { name: 'Matriks Hak Akses', selected: true }),
  ).toBeVisible();
  await expect(panel(page).locator('.bo-rbac-matrix-table')).toBeVisible();
}

async function openPos(page: Page, cashier: RegExp, pin: string): Promise<void> {
  await page.goto('/#/pos');
  await page.getByRole('radio', { name: cashier }).click();
  for (const digit of pin) {
    await page.keyboard.press(digit);
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/pos\/jual/);
}

async function billMenuItems(page: Page): Promise<string[]> {
  await page.goto('/#/pos/bill');
  await page.locator('.pos-bills__grid button[aria-haspopup="menu"]').first().click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  const items = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return items;
}

test.describe('Menu Pengaturan digabung (gambar 54)', () => {
  test('grup Pengaturan berisi lima entri persis, tanpa Lainnya dan Hak Akses terpisah', async ({
    page,
  }) => {
    await loginBo(page);
    await page.getByRole('button', { name: /menu/i }).first().click();
    await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
    const entries = await page.evaluate(() => {
      const group = [...document.querySelectorAll('.bo-menu__group')].find((node) =>
        node.textContent.includes('Pengaturan'),
      );
      return [...(group?.querySelectorAll('a') ?? [])].map((link) => link.textContent.trim());
    });
    expect(entries).toEqual([
      'Profil Toko',
      'Pengguna dan Hak Akses',
      'Log Aktivitas',
      'Cetak Barcode',
      'Tampilan dan Tema',
    ]);
  });

  test('rute lama Hak Akses dan Lainnya tetap membuka halaman yang sah', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/hak-akses');
    await expect(page).toHaveURL(/#\/bo\/pengaturan\/pengguna\?bagian=matriks$/);
    await expect(page.locator('.bo-tab--active')).toContainText('Pengguna dan Hak Akses');
    await expect(page.locator('.bo-topbar__titles')).toContainText('Pengguna dan Hak Akses');
    await expect(
      panel(page).getByRole('tab', { name: 'Matriks Hak Akses', selected: true }),
    ).toBeVisible();

    await page.goto('/#/bo/pengaturan/lainnya');
    await expect(page).toHaveURL(/#\/bo\/pengaturan\/profil$/);
    await expect(page.locator('.bo-tab--active')).toContainText('Profil Toko');
  });

  test('halaman memuat Daftar Pengguna dan Matriks Hak Akses sebagai dua bagian', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/pengguna');
    await expect(
      panel(page).getByRole('tab', { name: 'Daftar Pengguna', selected: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole('heading', { name: 'Pengguna dan Hak Akses' }),
    ).toBeVisible();
    await panel(page).getByRole('tab', { name: 'Matriks Hak Akses' }).click();
    await expect(panel(page).locator('.bo-rbac-matrix-table')).toBeVisible();
  });
});

test.describe('Owner mengedit hak akses', () => {
  test('klik sel mengubah status, tersimpan setelah muat ulang, dan dapat dikembalikan', async ({
    page,
  }) => {
    await loginBo(page);
    await openMatrix(page);
    const cell = cellOf(page, 'Supervisor', 'Hapus Bill');
    await expect(cell).toHaveText('YA');
    await cell.click();
    await expect(cell).toHaveText('-');
    await expect(cell).toHaveAttribute('aria-label', /diubah dari bawaan/);
    await expect(panel(page).locator('.bo-rbac-count')).toHaveText('1 sel berbeda dari bawaan');

    // Aksi yang mengenal otorisasi Owner mengulang YA, OTORISASI, lalu "-"; aksi lain hanya YA dan "-".
    const discount = cellOf(page, 'Kasir', 'Diskon');
    await expect(discount).toHaveText('OTORISASI');
    await discount.click();
    await expect(discount).toHaveText('-');
    await discount.click();
    await expect(discount).toHaveText('YA');
    await discount.click();
    await expect(discount).toHaveText('OTORISASI');

    await page.reload();
    await loginBo(page);
    await openMatrix(page);
    await expect(cellOf(page, 'Supervisor', 'Hapus Bill')).toHaveText('-');
    await expect(panel(page).locator('.bo-rbac-count')).toHaveText('1 sel berbeda dari bawaan');

    await page.getByRole('button', { name: 'Kembalikan Bawaan' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan Bawaan' }).click();
    await expect(page.locator('.toast')).toContainText('Hak akses dikembalikan ke matriks bawaan.');
    await expect(page.getByRole('button', { name: 'Kembalikan Bawaan' })).toBeFocused();
    await expect(cellOf(page, 'Supervisor', 'Hapus Bill')).toHaveText('YA');
    await expect(panel(page).locator('.bo-rbac-count')).toHaveText('Sesuai bawaan');
  });

  test('sel dapat dioperasikan dengan papan ketik dan kolom Owner terkunci', async ({ page }) => {
    await loginBo(page);
    await openMatrix(page);
    const cell = cellOf(page, 'Frontliner', 'Hapus Bill');
    await cell.focus();
    await expect(cell).toHaveText('-');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('YA');
    await page.keyboard.press('Space');
    await expect(cell).toHaveText('-');
    // Owner, layar yang tidak dapat dibuka perannya, dan Bayar Frontliner tidak berupa tombol.
    await expect(cellOf(page, 'Owner', 'Hapus Bill')).toHaveCount(0);
    await expect(cellOf(page, 'Kasir', 'Tambah Barang')).toHaveCount(0);
    await expect(cellOf(page, 'Frontliner', 'Bayar')).toHaveCount(0);
    await expect(cellOf(page, 'Supervisor', 'Hapus Bill')).toHaveCount(1);
  });

  test('perubahan berlaku nyata di POS: Supervisor kehilangan Batalkan bill, Kasir mendapatkannya', async ({
    page,
  }) => {
    await loginBo(page);
    await openPos(page, /Sinta/, '654321');
    expect(await billMenuItems(page)).toContain('Batalkan');

    await page.goto('/#/bo');
    await loginBo(page);
    await openMatrix(page);
    await cellOf(page, 'Supervisor', 'Hapus Bill').click();
    await cellOf(page, 'Kasir', 'Hapus Bill').click();

    await openPos(page, /Sinta/, '654321');
    expect(await billMenuItems(page)).not.toContain('Batalkan');
    await openPos(page, /Dewi/, '123456');
    expect(await billMenuItems(page)).toContain('Batalkan');

    await page.goto('/#/bo');
    await loginBo(page);
    await openMatrix(page);
    await page.getByRole('button', { name: 'Kembalikan Bawaan' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan Bawaan' }).click();
    await openPos(page, /Dewi/, '123456');
    expect(await billMenuItems(page)).not.toContain('Batalkan');
  });

  test('Supervisor tidak dapat membuka halaman Pengguna dan Hak Akses', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/pengaturan/pengguna');
    await expect(panel(page)).toContainText('Anda tidak memiliki hak akses ke halaman ini.');
    await expect(panel(page).locator('.bo-rbac-panel')).toHaveCount(0);
  });
});

test.describe('Pengguna: PIN 6 angka, ubah, dan reset', () => {
  test('PIN pengguna baru wajib tepat 6 angka dan hanya menerima angka', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/pengguna');
    await page.getByRole('button', { name: 'Tambah Pengguna Baru' }).click();
    const dialog = page.getByRole('dialog');
    const pin = dialog.getByLabel('PIN Kasir (6 Digit) *');
    await expect(pin).toHaveAttribute('maxlength', '6');
    await expect(pin).toHaveAttribute('inputmode', 'numeric');
    await expect(pin).toHaveAttribute('placeholder', '6 digit angka');
    await dialog.getByPlaceholder('Nama lengkap...').fill('budi santoso');
    await dialog.getByPlaceholder('Username login...').fill('budi.santoso');
    await pin.fill('12ab34');
    await expect(pin).toHaveValue('1234');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('PIN harus tepat 6 digit angka.');
    await pin.fill('246810');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel(page).getByRole('row', { name: /budi\.santoso/ })).toContainText('Kasir');
    // Fokus kembali ke tombol pemicu setelah halaman dibangun ulang.
    await expect(page.getByRole('button', { name: 'Tambah Pengguna Baru' })).toBeFocused();
  });

  test('daftar pengguna tidak hilang saat pindah halaman; Ubah mengganti nama, peran, dan status', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/pengguna');
    await page.getByRole('button', { name: 'Ubah kasir_ahmad' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ubah Pengguna: kasir_ahmad' });
    await dialog.getByLabel('Peran (Role) *').selectOption('supervisor');
    await dialog.getByLabel('Status').selectOption('nonaktif');
    await dialog.getByLabel('PIN Baru (6 Digit)').fill('1234');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('PIN harus tepat 6 digit angka.');
    await dialog.getByLabel('PIN Baru (6 Digit)').fill('777888');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();

    await page.goto('/#/bo/dashboard');
    await page.goto('/#/bo/pengaturan/pengguna');
    const row = panel(page).getByRole('row', { name: /kasir_ahmad/ });
    await expect(row).toContainText('Supervisor');
    await expect(row).toContainText('Nonaktif');
  });

  test('Reset PIN memberi PIN sementara 6 angka', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/pengguna');
    await page.getByRole('button', { name: 'Reset PIN kasir_siti' }).click();
    await expect(page.locator('.toast').last()).toContainText(
      /PIN sementara untuk kasir_siti: \d{6}\./,
    );
  });

  test('Owner aktif terakhir tidak dapat dinonaktifkan atau diturunkan', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/pengaturan/pengguna');
    await page.getByRole('button', { name: 'Ubah owner', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Status').selectOption('nonaktif');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Owner aktif terakhir');
    await dialog.getByLabel('Status').selectOption('aktif');
    await dialog.getByLabel('Peran (Role) *').selectOption('kasir');
    await dialog.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Owner aktif terakhir');
  });
});

test.describe('Tampilan: muat layar dan aksesibilitas', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`kedua sub-tab dan dialog bebas pelanggaran axe (${mode})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await loginBo(page);
      await page.goto('/#/bo/pengaturan/pengguna');
      await expect(panel(page).locator('.bo-rbac-table')).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await openMatrix(page);
      await cellOf(page, 'Supervisor', 'Hapus Bill').click();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: 'Kembalikan Bawaan' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }

  test('tidak ada gulir halaman; matriks panjang menggulir di dalam kartunya dengan kepala beku', async ({
    page,
  }) => {
    await loginBo(page);
    for (const size of [
      { width: 1280, height: 640 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      for (const path of ['/bo/pengaturan/pengguna', MATRIX]) {
        await page.goto(`/#${path}`);
        await expect(panel(page).locator('.bo-rbac-table')).toBeVisible();
        const gap = await page.evaluate(() => {
          const main = document.querySelector('.bo-content');
          return {
            page: document.documentElement.scrollHeight - window.innerHeight,
            content: main === null ? 0 : main.scrollHeight - main.clientHeight,
          };
        });
        expect(gap.page, `${path} ${String(size.width)}`).toBeLessThanOrEqual(1);
        expect(gap.content, `${path} ${String(size.width)}`).toBeLessThanOrEqual(1);
      }
      const head = panel(page).locator('.bo-rbac-table thead th').first();
      expect(await head.evaluate((node) => getComputedStyle(node).position)).toBe('sticky');
      const scroller = panel(page).locator('.bo-rbac-scroll');
      expect(await scroller.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    }
  });
});
