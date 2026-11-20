import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './helpers/routes';

// Cetak Barcode (revisi final, gambar klien 53): empat model label, kertas Tom & Jerry No 125, 108,
// dan 121, isian barang dengan jumlah cetakan, daftar cetak, Simpan, Preview, dan Cetak.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openBarcode(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
  await page.goto('/#/bo/pengaturan/barcode');
  await expect(page.getByRole('heading', { name: 'Opsi Pilihan Cetak' })).toBeVisible();
}

const rows = (page: Page): Locator => page.locator('.bo-bc-list tbody tr');
const search = (page: Page): Locator => page.getByLabel('Kode / Nama Barang', { exact: true });

async function addProduct(page: Page, query: string, copies: string): Promise<void> {
  await search(page).fill(query);
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByLabel('Jumlah Cetakan', { exact: true }).fill(copies);
  await page.getByRole('button', { name: 'Tambah', exact: true }).click();
}

test.describe('H1 Halaman Cetak Barcode', () => {
  test('tiga zona: empat model, tiga kertas label, dan isian barang; tabel berisi baris contoh', async ({
    page,
  }) => {
    await openBarcode(page);
    await expect(page.getByRole('heading', { name: 'Pilihan Kertas Label' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Isi Data Barang' })).toBeVisible();
    for (const name of ['Model 1', 'Model 2', 'Model 3', 'Model 4']) {
      await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('radio', { name: 'Model 1', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'TJ Label No 125 (54)' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'TJ Label No 108 (40)' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'TJ Label No 121 (10)' })).not.toBeChecked();
    await expect(page.getByLabel('Jumlah Cetakan', { exact: true })).toHaveValue('6');
    await expect(page.locator('.bo-bc-copies__unit')).toHaveText('Kolom');
    for (const name of ['Tambah', 'Simpan', 'Preview', 'Cetak']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const headers = await page.locator('.bo-bc-list thead th').allInnerTexts();
    expect(headers.slice(0, 6).map((text) => text.trim())).toEqual([
      'Kode',
      'Barcode',
      'Nama Barang',
      'Satuan',
      'Harga Jual',
      'Jumlah Cetak',
    ]);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('B0016');
    await expect(rows(page).first()).toContainText('Lem Kayu 70 g Karya Mandiri');
    await expect(rows(page).first()).toContainText('Rp 2.800');
  });

  test('hanya satu model dan satu kertas terpilih pada satu waktu', async ({ page }) => {
    await openBarcode(page);
    await page.getByRole('radio', { name: 'Model 3', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Model 1', exact: true })).not.toBeChecked();
    await page.getByRole('radio', { name: 'TJ Label No 108 (40)' }).check();
    await expect(page.getByRole('radio', { name: 'TJ Label No 125 (54)' })).not.toBeChecked();
  });

  test('Tambah memasukkan barang; barang dan satuan yang sama diganti jumlahnya', async ({
    page,
  }) => {
    await openBarcode(page);
    await addProduct(page, 'semen', '4');
    await expect(rows(page)).toHaveCount(2);
    const added = rows(page).last();
    await expect(added).toContainText('4');
    // Menambah barang dan satuan yang sama mengganti jumlahnya, bukan menambah baris.
    const code = ((await added.locator('.bo-bc-code').textContent()) ?? '').trim();
    await search(page).fill(code);
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByLabel('Jumlah Cetakan', { exact: true }).fill('9');
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).last()).toContainText('9');
    await expect(page.getByText(/Jumlah cetak .* diganti menjadi 9/)).toBeVisible();
  });

  test('jumlah cetakan harus bilangan bulat 1 sampai 999', async ({ page }) => {
    await openBarcode(page);
    await search(page).fill('semen');
    await page.getByRole('listbox').getByRole('option').first().click();
    const copies = page.getByLabel('Jumlah Cetakan', { exact: true });
    for (const bad of ['0', '1.5', '1000', '']) {
      await copies.fill(bad);
      await page.getByRole('button', { name: 'Tambah', exact: true }).click();
      await expect(copies, `nilai "${bad}"`).toHaveAttribute('aria-invalid', 'true');
      await expect(rows(page)).toHaveCount(1);
    }
  });

  test('tombol hapus pada baris mengeluarkan barang dari daftar cetak', async ({ page }) => {
    await openBarcode(page);
    await addProduct(page, 'semen', '2');
    await expect(rows(page)).toHaveCount(2);
    await rows(page)
      .last()
      .getByRole('button', { name: /^Hapus / })
      .click();
    await expect(rows(page)).toHaveCount(1);
  });

  test('Preview: kertas 54 label per lembar; lembar bertambah dan berpindah dengan tombolnya', async ({
    page,
  }) => {
    await openBarcode(page);
    await addProduct(page, 'semen', '60');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pratinjau Cetak Barcode' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('TJ Label No 125 (54)');
    await expect(dialog).toContainText('Lembar 1 dari 2');
    await expect(dialog.locator('.bo-bc-cell')).toHaveCount(54);
    await expect(dialog.locator('.bo-bc-cell:not(.is-empty)')).toHaveCount(54);
    await dialog.getByRole('button', { name: 'Berikutnya' }).click();
    await expect(dialog).toContainText('Lembar 2 dari 2');
    await expect(dialog.locator('.bo-bc-cell:not(.is-empty)')).toHaveCount(12);
    await expect(dialog.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await expect(dialog).toHaveCount(0);

    // Kertas No 121 hanya memuat 10 label per lembar: 66 label menjadi 7 lembar.
    await page.getByRole('radio', { name: 'TJ Label No 121 (10)' }).check();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Lembar 1 dari 7');
    await expect(page.getByRole('dialog').locator('.bo-bc-cell')).toHaveCount(10);
  });

  test('Cetak memanggil pencetak sekali dan membersihkan area cetak sementara', async ({
    page,
  }) => {
    await openBarcode(page);
    await page.evaluate(() => {
      (window as unknown as { __print: number }).__print = 0;
      window.print = () => {
        (window as unknown as { __print: number }).__print += 1;
      };
    });
    await page.getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pratinjau Cetak Barcode' });
    await dialog.getByRole('button', { name: 'Cetak', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __print: number }).__print)).toBe(1);
    await expect(page.locator('.bo-bc-print')).toHaveCount(0);
    await expect(page.getByText('6 label dikirim ke printer.')).toBeVisible();
  });

  test('Simpan menyimpan daftar: tab ditutup lalu dibuka lagi, daftar pulih', async ({ page }) => {
    await openBarcode(page);
    await addProduct(page, 'semen', '3');
    await page.getByRole('radio', { name: 'TJ Label No 108 (40)' }).check();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText(/Daftar cetak tersimpan/)).toBeVisible();
    await page.getByRole('button', { name: /^Tutup tab Cetak Barcode/ }).click();
    await page.goto('/#/bo/pengaturan/barcode');
    await expect(page.getByRole('heading', { name: 'Opsi Pilihan Cetak' })).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole('radio', { name: 'TJ Label No 108 (40)' })).toBeChecked();
  });

  test('muat satu layar pada 1280x640: hanya tabel yang menggulir', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await openBarcode(page);
    const overflow = await page
      .locator('.bo-content')
      .evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('.bo-bc-scroll')).toBeVisible();
  });

  test('tanpa pelanggaran aksesibilitas pada halaman dan pratinjau', async ({ page }) => {
    await openBarcode(page);
    await settle(page);
    const page1 = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(page1.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Pratinjau Cetak Barcode' })).toBeVisible();
    await settle(page);
    const preview = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(preview.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual(
      [],
    );
  });
});
