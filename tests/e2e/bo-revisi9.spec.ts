import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Revisi Back-Office putaran kesembilan (dokumen klien 18 November): header rendah, penyesuaian
// Dashboard, Akuntansi seragam, dan halaman Data Barang baru (tombol Tambah yang menjadi Batal, Ubah,
// dialog harga jual, Saldo Stok Awal, perbesar gambar).

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(
  page: Page,
  user: readonly [string, string] = ['haris.owner', 'Kunci2026A'],
): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(user[0]);
  await page.getByLabel('Kata sandi', { exact: true }).fill(user[1]);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const SUPERVISOR = ['sinta.spv', 'Kunci2026B'] as const;
const panel = (page: Page) => page.locator('.bo-tabpanel:not([hidden])');

test.describe('Header rendah (gambar 36)', () => {
  test('tinggi header 44 px dan rincian halaman sebaris dengan judul di semua halaman', async ({
    page,
  }) => {
    await loginBo(page);
    for (const path of [
      '/bo/dashboard',
      '/bo/barang',
      '/bo/akuntansi',
      '/bo/transaksi/faktur-penjualan',
    ]) {
      await page.goto(`/#${path}`);
      const header = await page.locator('.bo-topbar').boundingBox();
      expect(Math.round(header?.height ?? 0)).toBe(44);
      const crumb = await page.locator('.bo-topbar__breadcrumb').boundingBox();
      const title = await page.locator('.bo-topbar__title').boundingBox();
      expect(Math.abs((crumb?.y ?? 0) - (title?.y ?? 999))).toBeLessThan(8);
    }
  });
});

test.describe('Dashboard (gambar 34 dan 35)', () => {
  test('Omset: transaksi lunas dan piutang menggantikan rata-rata', async ({ page }) => {
    await loginBo(page);
    const omset = page.locator('[data-widget="omset"]');
    await expect(omset).toContainText('Total Transaksi');
    await expect(omset).toContainText('Transaksi Lunas');
    await expect(omset).toContainText('Transaksi Piutang');
    await expect(omset).not.toContainText('Rata-rata');
    // Lunas dan piutang berjumlah sama dengan omset hari ini.
    const amount = (text: string): number => Number(text.replace(/\D/g, ''));
    const big = amount((await omset.locator('.bo-dx-big').textContent()) ?? '');
    const stats = omset.locator('.bo-dx-stat__value');
    const lunas = amount((await stats.nth(1).textContent()) ?? '');
    const piutang = amount((await stats.nth(2).textContent()) ?? '');
    expect(lunas + piutang).toBe(big);
  });

  test('Grafik: angka skala di sisi grafik dan nilai omset muncul saat penunjuk di titik', async ({
    page,
  }) => {
    await loginBo(page);
    const chart = page.locator('[data-widget="grafik"]');
    await expect(chart.locator('.bo-chart-line-axis')).toHaveText(['75 Jt', '50 Jt', '25 Jt', '0']);
    const tip = chart.locator('.bo-chart-tip');
    await expect(tip).toBeHidden();
    await chart.locator('.bo-chart-line-hit').nth(3).hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Rp 68.975.000');
    await page.mouse.move(5, 300);
    await expect(tip).toBeHidden();
  });

  test('Penjualan Barang: pilihan Nilai, Frekuensi, atau Laba mengubah urutan dan angkanya', async ({
    page,
  }) => {
    await loginBo(page);
    const widget = page.locator('[data-widget="barang"]');
    const first = widget.locator('.bo-dx-rank__item').first();
    await expect(first).toContainText('THINNER CEMERLANG A 5LT');
    await expect(first).toContainText('Rp 8.780.000');
    await widget.getByRole('button', { name: 'Frekuensi', exact: true }).click();
    await expect(first).toContainText('LEM QBOND XTRA');
    await expect(first).toContainText('305 kali');
    await widget.getByRole('button', { name: 'Laba', exact: true }).click();
    await expect(first).toContainText('Rp 1.230.000');
    await expect(widget.getByRole('button', { name: 'Laba', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('semua widget punya tombol segarkan, diagram aset sejajar, dan warna diagram cerah', async ({
    page,
  }) => {
    await loginBo(page);
    const cards = page.locator('section[data-widget]');
    const total = await cards.count();
    expect(total).toBe(9);
    await expect(
      page.locator('section[data-widget] .bo-dx-icon-btn[aria-label="Segarkan"]'),
    ).toHaveCount(total);
    const lefts = await page
      .locator('[data-widget="aset"] .bo-hbars__track')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
    expect(lefts).toHaveLength(3);
    expect(new Set(lefts).size).toBe(1);
    const palette = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map((name) =>
        style.getPropertyValue(name).trim().toLowerCase(),
      );
    });
    expect(palette.slice(0, 4)).toEqual(['#2563eb', '#facc15', '#da020e', '#16ff00']);
    expect(palette[4]).toMatch(/^#(ff6600|f60)$/);
  });
});

test.describe('Akuntansi seragam (gambar 41)', () => {
  test('kepala kelima bagian setinggi sama dan tombolnya tidak bergeser; kategori jadi Sewa Toko', async ({
    page,
  }) => {
    await loginBo(page);
    const heights = new Set<number>();
    const lefts = new Set<number>();
    for (const bagian of ['jurnal', 'beban', 'arus-kas', 'laba-rugi', 'neraca']) {
      await page.goto(`/#/bo/akuntansi?bagian=${bagian}`);
      const head = await panel(page).locator('.bo-acc-head').boundingBox();
      heights.add(Math.round(head?.height ?? 0));
      const button = await panel(page).locator('.bo-acc-switch__btn').first().boundingBox();
      lefts.add(Math.round(button?.x ?? 0));
      const subtitle = await panel(page).locator('.bo-acc-sub').boundingBox();
      expect(subtitle?.height ?? 99).toBeLessThan(22);
    }
    expect([...heights]).toHaveLength(1);
    expect([...lefts]).toHaveLength(1);

    await page.goto('/#/bo/akuntansi?bagian=beban');
    const tiles = panel(page).locator('.bo-acc-stats--beban .bo-stat-card');
    await expect(tiles).toHaveCount(7);
    await expect(tiles.nth(5)).toContainText('Sewa Toko');
    const tileHeights = await tiles.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
    );
    expect(new Set(tileHeights).size).toBe(1);
  });
});

test.describe('Data Barang (gambar 37 sampai 40)', () => {
  const tambah = (page: Page) => panel(page).getByRole('button', { name: 'Tambah Barang' });
  const batal = (page: Page) => panel(page).getByRole('button', { name: 'Batal', exact: true });

  test('urutan tombol sesuai gambar dan Tambah berubah menjadi Batal saat mengisi', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const bar = panel(page).locator('.bo-pd-toolbar button');
    await expect(bar.filter({ hasNotText: /^$/ }).first()).toBeVisible();
    await expect(panel(page).locator('.bo-pd-toolbar .bo-pd-btn span')).toHaveText([
      'Tambah',
      'Ubah',
      'Simpan',
      'Nonaktifkan',
      'Info',
      'Cetak',
      'Keluar',
    ]);
    const simpan = panel(page).getByRole('button', { name: 'Simpan Barang' });
    await expect(simpan).toBeDisabled();

    await tambah(page).click();
    await expect(batal(page)).toBeVisible();
    await expect(tambah(page)).toHaveCount(0);
    await expect(simpan).toBeEnabled();
    await expect(panel(page).getByLabel('Nama barang')).toBeEnabled();
    await batal(page).click();
    await expect(tambah(page)).toBeVisible();
    await expect(simpan).toBeDisabled();
    await expect(panel(page).getByLabel('Nama barang')).toBeDisabled();
    await expect(panel(page).getByLabel('Nama barang')).not.toHaveValue('');
  });

  test('Ubah membuka isian, Batal mengembalikan nilai semula', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const nama = panel(page).getByLabel('Nama barang');
    const semula = await nama.inputValue();
    await panel(page).getByRole('button', { name: 'Ubah', exact: true }).click();
    await expect(nama).toBeEnabled();
    await nama.fill('NAMA SEMENTARA');
    await batal(page).click();
    await expect(nama).toHaveValue(semula);
    await expect(nama).toBeDisabled();
  });

  test('Owner mengklik baris harga: dialog Isi Harga Jual Barang menyimpan harga baru', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const rows = panel(page).locator('.bo-pd-prices tbody tr');
    await expect(rows.first()).toContainText('1.400');
    await rows.first().click();
    const dialog = page.getByRole('dialog', { name: 'Isi Harga Jual Barang' });
    await expect(dialog).toContainText('B0001');
    await expect(dialog.getByLabel('Eceran Satuan 3', { exact: true })).toBeDisabled();
    await expect(dialog).toContainText('Harga Beli Akhir S1');
    await expect(dialog).toContainText('Hpp Avg Satuan 1');
    await dialog.getByLabel('Eceran Satuan 1', { exact: true }).fill('1500');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rows.first()).toContainText('1.500');
  });

  test('Supervisor tidak dapat membuka dialog harga dan saldo awal', async ({ page }) => {
    await loginBo(page, SUPERVISOR);
    await page.goto('/#/bo/barang');
    await expect(panel(page).locator('.bo-pd-prices__row')).toHaveCount(0);
    await panel(page).locator('.bo-pd-prices tbody tr').first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel(page).locator('.bo-pd-opening')).toContainText('Saldo Stok Awal');
    await expect(panel(page).locator('.bo-pd-opening').getByRole('button')).toHaveCount(0);
  });

  test('Owner menambah saldo awal: stok gudang bertambah dan baris baru tampil', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const opening = panel(page).locator('.bo-pd-opening');
    await expect(opening.locator('thead')).toContainText('Biaya Satuan');
    const before = await opening.locator('tbody tr').count();
    await opening.getByRole('button', { name: 'Tambah', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Isi Saldo Awal Barang' });
    await expect(dialog).toContainText('B0001');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(dialog).toContainText('Isi kuantitas lebih dari 0.');
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('10');
    await dialog.getByLabel('Biaya Satuan', { exact: true }).fill('1000');
    await expect(dialog.locator('output').last()).toHaveText('Rp 10.000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opening.locator('tbody tr')).toHaveCount(before + 1);
    await expect(opening.locator('tbody tr').last()).toContainText('Rp 1.000');
  });

  test('tabel barang memuat Pemasok dan Tgl Beli, serta tinggi daftar tetap terlihat', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const head = panel(page).locator('.vtable__head');
    for (const name of [
      'Nama Barang',
      'Kode',
      'Pemasok',
      'Tgl Beli',
      'Harga Beli Akhir',
      'Hpp Avg',
    ]) {
      await expect(head).toContainText(name);
    }
    const list = await panel(page).locator('.bo-pd-list').boundingBox();
    expect(list?.height ?? 0).toBeGreaterThanOrEqual(150);
  });
});

test.describe('Aksesibilitas dialog Data Barang dan Dashboard', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe bersih pada dialog harga, saldo awal, gambar, dan Dashboard, mode ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await loginBo(page);
      const scan = async (name: string): Promise<string[]> => {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        return result.violations.map(
          (item) => `${name}: ${item.id} (${String(item.nodes.length)})`,
        );
      };
      const found: string[] = [...(await scan('dashboard'))];

      await page.goto('/#/bo/barang');
      await panel(page).locator('.bo-pd-prices tbody tr').first().click();
      await expect(page.getByRole('dialog', { name: 'Isi Harga Jual Barang' })).toBeVisible();
      found.push(...(await scan('harga')));
      await page.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click();

      await panel(page).locator('.bo-pd-opening').getByRole('button', { name: 'Tambah' }).click();
      await expect(page.getByRole('dialog', { name: 'Isi Saldo Awal Barang' })).toBeVisible();
      found.push(...(await scan('saldo awal')));
      await page.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click();

      await page.getByRole('button', { name: 'Perbesar foto' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      found.push(...(await scan('gambar')));
      expect(found, `pelanggaran axe: ${found.join(', ')}`).toEqual([]);
    });
  }
});
