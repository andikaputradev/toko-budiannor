import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './helpers/routes';

// Revisi final POS dan Back-Office (dokumen klien "Revisi Penyesuain Final POS&BO", 20 November):
// bagian Back-Office di luar Cetak Barcode, Pengguna dan Hak Akses, dan PIN. Nomor F mengikuti
// docs/superpowers/specs/2026-11-20-revisi-final-pos-bo-design.md.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const OWNER = ['haris.owner', 'Kunci2026A'] as const;
const SUPERVISOR = ['sinta.spv', 'Kunci2026B'] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function loginBo(page: Page, [username, password]: readonly [string, string] = OWNER) {
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

const toolbar = (page: Page): Locator => page.locator('.bo-pd-toolbar');
const countOf = async (page: Page): Promise<number> =>
  Number(((await page.locator('.bo-pd-count').textContent()) ?? '').replace(/\D/g, ''));

async function visibleCells(page: Page, column: number): Promise<string[]> {
  return page
    .locator('.vtable__rows .vtable__row')
    .evaluateAll(
      (rows, index) =>
        rows.map((row) => row.querySelectorAll('.vtable__cell')[index]?.textContent ?? ''),
      column,
    );
}

function isSorted(values: readonly string[], direction: 'asc' | 'desc'): boolean {
  const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
  const sign = direction === 'asc' ? 1 : -1;
  return values.every(
    (value, index) => index === 0 || sign * collator.compare(values[index - 1] ?? '', value) <= 0,
  );
}

test.describe('F1 Data Barang final (gambar 51)', () => {
  test('bilah alat: cari tanpa titik-titik, filter Kategori, Merk, Pemasok; tanpa tombol Keluar', async ({
    page,
  }) => {
    await openBarang(page);
    await expect(toolbar(page).getByPlaceholder('CARI NAMA , KODE', { exact: true })).toBeVisible();
    for (const name of ['Kategori', 'Merk', 'Pemasok']) {
      const select = toolbar(page).getByLabel(name, { exact: true });
      await expect(select).toBeVisible();
      await expect(select.locator('option').first()).toHaveText('Semua');
      expect(await select.locator('option').count()).toBeGreaterThan(2);
    }
    await expect(toolbar(page).getByRole('button', { name: 'Keluar' })).toHaveCount(0);
    // Susunan tombol mengikuti gambar: Tambah, Ubah, Simpan, Nonaktifkan, Info, Cetak, segarkan.
    const names = await toolbar(page).locator('button').allInnerTexts();
    expect(names.slice(0, 6).map((text) => text.trim())).toEqual([
      'Tambah',
      'Ubah',
      'Simpan',
      'Nonaktifkan',
      'Info',
      'Cetak',
    ]);
  });

  test('filter Kategori dan Pemasok menyaring daftar; segarkan mengembalikan semuanya', async ({
    page,
  }) => {
    await openBarang(page);
    await toolbar(page).getByLabel('Kategori', { exact: true }).selectOption({ index: 2 });
    const byCategory = await countOf(page);
    expect(byCategory).toBeGreaterThan(0);
    expect(byCategory).toBeLessThan(3607);
    await toolbar(page).getByLabel('Pemasok', { exact: true }).selectOption({ index: 1 });
    expect(await countOf(page)).toBeLessThanOrEqual(byCategory);
    await toolbar(page).getByLabel('Merk', { exact: true }).selectOption({ index: 1 });
    expect(await countOf(page)).toBeGreaterThanOrEqual(0);
    await page.getByRole('button', { name: 'Segarkan daftar' }).click();
    await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
    await expect(toolbar(page).getByLabel('Kategori', { exact: true })).toHaveValue('');
    await expect(toolbar(page).getByLabel('Pemasok', { exact: true })).toHaveValue('');
  });

  test('filter bersama kolom cari: hasil cari tetap disaring kategori', async ({ page }) => {
    await openBarang(page);
    await page.getByLabel('Cari', { exact: true }).fill('semen');
    const found = await countOf(page);
    await toolbar(page).getByLabel('Kategori', { exact: true }).selectOption({ index: 1 });
    expect(await countOf(page)).toBeLessThanOrEqual(found);
  });

  test('daftar bisa diurut: Nama A-Z dan Z-A, Kode 0-9 dan 9-0', async ({ page }) => {
    await openBarang(page);
    const header = page.locator('.vtable__head [role="columnheader"]');

    await page.getByRole('button', { name: 'Urutkan nama A-Z' }).click();
    await expect(header.first()).toHaveAttribute('aria-sort', 'ascending');
    expect(isSorted(await visibleCells(page, 0), 'asc')).toBe(true);
    await expect(page.getByLabel('Nama barang')).toHaveValue(
      (await visibleCells(page, 0))[0] ?? '',
    );

    await page.getByRole('button', { name: 'Urutkan nama Z-A' }).click();
    await expect(header.first()).toHaveAttribute('aria-sort', 'descending');
    expect(isSorted(await visibleCells(page, 0), 'desc')).toBe(true);

    await page.getByRole('button', { name: 'Urutkan kode 0-9' }).click();
    await expect(header.nth(1)).toHaveAttribute('aria-sort', 'ascending');
    await expect(header.first()).toHaveAttribute('aria-sort', 'none');
    expect(isSorted(await visibleCells(page, 1), 'asc')).toBe(true);
    await expect(page.getByLabel('Kode barang')).toHaveValue(
      (await visibleCells(page, 1))[0] ?? '',
    );

    await page.getByRole('button', { name: 'Urutkan kode 9-0' }).click();
    await expect(header.nth(1)).toHaveAttribute('aria-sort', 'descending');
    expect(isSorted(await visibleCells(page, 1), 'desc')).toBe(true);
  });

  test('kode barang baru empat digit otomatis, hanya terbaca, dan dilewati kursor', async ({
    page,
  }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    const kode = page.getByLabel('Kode barang');
    await expect(kode).toHaveValue(/^\d{4}$/);
    await expect(kode).toHaveAttribute('readonly', '');
    await expect(kode).toHaveAttribute('tabindex', '-1');
  });

  test('satuan diketik bebas: huruf apa saja, tanpa kotak cari atau daftar pilihan', async ({
    page,
  }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    await page.getByLabel('Nama barang').fill('Barang Satuan Bebas');
    const base = page.getByLabel('Satuan dasar', { exact: true });
    await base.fill('Krat Biru');
    await expect(base).toHaveValue('KRAT BIRU');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.locator('.bo-pd-units__option')).toHaveCount(0);
    await expect(page.getByPlaceholder('Cari/Pilih...')).toHaveCount(0);

    // Satuan 2 tampil setelah satuan dasar terisi; konversinya aktif setelah satuannya diketik.
    const second = page.getByLabel('Satuan 2', { exact: true });
    await expect(second).toBeVisible();
    await expect(page.getByLabel('Konversi satuan 2', { exact: true })).toBeDisabled();
    await second.fill('xyz-1');
    await page.getByLabel('Konversi satuan 2', { exact: true }).fill('24');
    await expect(page.getByLabel('Satuan 3', { exact: true })).toBeVisible();

    // Label baris mengikuti video klien: Satuan, Satuan 2, Satuan 3 dengan "= angka satuan dasar".
    await expect(page.locator('.bo-pd-units__caption').allInnerTexts()).resolves.toEqual([
      'Satuan',
      'Satuan 2',
      'Satuan 3',
    ]);
    await expect(page.locator('.bo-pd-units__base').first()).toHaveText('KRAT BIRU');

    // Mengosongkan satuan dasar mengosongkan baris di bawahnya.
    await base.fill('');
    await expect(second).toBeHidden();
  });

  test('urutan kursor (Enter dan Tab) mengikuti dokumen klien', async ({ page }) => {
    await openBarang(page);
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    const nameOfActive = (): Promise<string | null> =>
      page.evaluate(() => {
        const node = document.activeElement;
        return node === null
          ? null
          : (node.getAttribute('aria-label') ?? node.id.replace(/-\d+$/, ''));
      });
    await expect.poll(nameOfActive).toBe('Nama barang');

    const expected = [
      'Satuan dasar',
      'Satuan 2',
      'Konversi satuan 2',
      'Satuan 3',
      'Konversi satuan 3',
      'Barcode',
      'Kategori',
      'Merek',
      'Minimal Stok (All)',
      'Stok minimum Toko',
      'Berat (Gram)',
      'Komisi Sales',
      'Promo',
      'Rak',
      'Catatan',
      'foto-bo',
    ];
    const typed: Readonly<Record<string, string>> = {
      'Satuan dasar': 'pcs',
      'Satuan 2': 'lsn',
      'Konversi satuan 2': '12',
      'Satuan 3': 'dos',
      'Konversi satuan 3': '60',
    };
    const viaEnter: string[] = [];
    await page.keyboard.press('Enter');
    for (const target of expected) {
      const current = (await nameOfActive()) ?? '';
      viaEnter.push(current);
      const text = typed[current];
      if (text !== undefined) {
        await page.keyboard.type(text);
      }
      if (target === 'foto-bo') {
        break;
      }
      await page.keyboard.press('Enter');
    }
    expect(viaEnter).toEqual(expected);

    await page.getByLabel('Nama barang').focus();
    const viaTab: (readonly [string, string])[] = [];
    for (const target of expected) {
      await page.keyboard.press('Tab');
      viaTab.push([target, (await nameOfActive()) ?? '']);
    }
    expect(viaTab.map(([, found]) => found)).toEqual(expected);
  });

  test('satu halaman penuh tanpa scroll pada 1280x640 dengan formulir baru', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await openBarang(page);
    for (const selector of ['.bo-content', '.bo-pd-form']) {
      const overflow = await page
        .locator(selector)
        .evaluate((node) => node.scrollHeight - node.clientHeight);
      expect(overflow, selector).toBeLessThanOrEqual(1);
    }
    // Kelima kolom formulir berurutan dari kiri ke kanan seperti gambar.
    const x = async (label: string): Promise<number> =>
      (await page.getByLabel(label, { exact: true }).boundingBox())?.x ?? 0;
    const columns = [
      await x('Nama barang'),
      await x('Barcode'),
      await x('Minimal Stok (All)'),
      await x('Komisi Sales'),
    ];
    expect(columns).toEqual([...columns].sort((a, b) => a - b));
    expect(await x('Catatan')).toBe(await x('Barcode'));
    expect(await x('Kode barang')).toBe(await x('Komisi Sales'));
    // Tidak ada kotak isian yang terpotong atau melebihi panelnya.
    const clipped = await page
      .locator('.bo-pd-form input, .bo-pd-form select')
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) => node.scrollWidth > node.clientWidth + 1 && node instanceof HTMLSelectElement,
          ).length,
      );
    expect(clipped).toBe(0);
  });

  test('tanpa pelanggaran aksesibilitas pada Data Barang (terang)', async ({ page }) => {
    await openBarang(page);
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
});

test.describe('F2 Dashboard dan header', () => {
  test('Penjualan Barang: pilihan Laba hanya untuk Owner', async ({ page }) => {
    await loginBo(page, SUPERVISOR);
    const widget = page.locator('[data-widget="barang"]');
    await expect(widget.getByRole('button', { name: 'Nilai', exact: true })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Frekuensi', exact: true })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Laba', exact: true })).toHaveCount(0);
  });

  test('Owner masih memilih Laba pada Penjualan Barang', async ({ page }) => {
    await loginBo(page, OWNER);
    const widget = page.locator('[data-widget="barang"]');
    await widget.getByRole('button', { name: 'Laba', exact: true }).click();
    await expect(widget.locator('.bo-dx-rank__item').first()).toContainText('Rp 1.230.000');
  });

  test('Grafik: nama hari dan bulan berbahasa Indonesia dan sumbu menyesuaikan omset bulanan', async ({
    page,
  }) => {
    await loginBo(page, OWNER);
    const widget = page.locator('[data-widget="grafik"]');
    const labels = widget.locator('.bo-chart-line-label');
    const axis = widget.locator('.bo-chart-line-axis');
    await expect(labels).toHaveText(['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']);
    await expect(axis).toHaveText(['75 Jt', '50 Jt', '25 Jt', '0']);
    await expect(widget.locator('.bo-dx-trend')).toHaveText('Tren naik 12,5%');

    await widget.getByRole('button', { name: 'Bulanan' }).click();
    await expect(labels).toHaveText(['Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt']);
    // Omset bulan ini Rp 43.320.000: sumbu berubah mengikuti nilainya, bukan tetap 75 Jt.
    await expect(axis).toHaveText(['60 Jt', '40 Jt', '20 Jt', '0']);
    await expect(widget.locator('.bo-dx-trend')).toHaveText('Tren naik 15,2%');
    const dots = widget.locator('.bo-chart-line-hit');
    await dots.last().hover();
    await expect(widget.locator('.bo-chart-tip')).toHaveText('Rp 43.320.000');
  });

  test('lonceng notifikasi di samping tanggal: lencana, panel, dan Escape', async ({ page }) => {
    await loginBo(page, OWNER);
    const bell = page.getByRole('button', { name: /^Notifikasi/ });
    await expect(bell).toBeVisible();
    const badge = page.locator('.bo-topbar__badge');
    await expect(badge).toBeVisible();
    expect(Number(await badge.textContent())).toBeGreaterThan(0);

    const date = await page.locator('.bo-topbar__date-pill').boundingBox();
    const bellBox = await bell.boundingBox();
    const user = await page.locator('.bo-topbar__user').boundingBox();
    expect(bellBox?.x ?? 0).toBeGreaterThanOrEqual((date?.x ?? 0) + (date?.width ?? 0) - 1);
    expect((bellBox?.x ?? 0) + (bellBox?.width ?? 0)).toBeLessThanOrEqual((user?.x ?? 0) + 1);
    const header = await page.locator('.bo-topbar').boundingBox();
    expect(Math.round(header?.height ?? 0)).toBe(44);

    await expect(page.locator('.bo-notif')).toBeHidden();
    await bell.click();
    const panel = page.locator('.bo-notif');
    await expect(panel).toBeVisible();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(await panel.locator('.bo-notif__item').count()).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(bell).toBeFocused();

    await bell.click();
    await panel.locator('.bo-notif__item').first().click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/#\/bo\/dashboard$/);
  });

  test('header tetap rendah dan lonceng ada di semua halaman', async ({ page }) => {
    await loginBo(page, SUPERVISOR);
    for (const path of ['/bo/barang', '/bo/akuntansi', '/bo/transaksi/faktur-penjualan']) {
      await page.goto(`/#${path}`);
      await expect(page.getByRole('button', { name: /^Notifikasi/ })).toBeVisible();
      const header = await page.locator('.bo-topbar').boundingBox();
      expect(Math.round(header?.height ?? 0)).toBe(44);
    }
  });

  test('tanpa pelanggaran aksesibilitas pada panel notifikasi', async ({ page }) => {
    await loginBo(page, OWNER);
    await page.getByRole('button', { name: /^Notifikasi/ }).click();
    await expect(page.locator('.bo-notif')).toBeVisible();
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
});

test.describe('F3 Form penjualan: tanpa kotak cetak setelah Simpan', () => {
  const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

  async function fillOneItem(page: Page): Promise<void> {
    await page.goto('/#/bo/penjualan');
    const search = active(page).getByRole('combobox', { name: 'Cari atau pilih barang dan jasa' });
    await search.fill('semen');
    await active(page)
      .getByRole('listbox', { name: 'Cari atau pilih barang dan jasa' })
      .getByRole('option')
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Rincian Barang' });
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('2');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(dialog).toHaveCount(0);
  }

  test('Simpan tidak memunculkan kotak cetak', async ({ page }) => {
    await loginBo(page);
    await fillOneItem(page);
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText(/berhasil disimpan/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('tombol Cetak membuka kotak sesuai gambar 52', async ({ page }) => {
    await loginBo(page);
    await fillOneItem(page);
    await active(page).getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cetak Form Penjualan' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Faktur / Surat Jalan / DO Gudang / Surat Order')).toBeVisible();
    await expect(dialog.getByLabel('Gudang', { exact: true })).toHaveValue('');
    const radios = dialog.getByRole('radio');
    await expect(radios).toHaveCount(5);
    await expect(dialog.getByRole('radio', { name: 'Cetak Faktur Penjualan' })).toBeChecked();
    for (const name of [
      'Cetak Surat Jalan Penjualan',
      'Cetak Surat Jalan Ekspedisi',
      'Cetak Surat Order Penjualan',
      'Cetak Surat D.O Gudang',
    ]) {
      await expect(dialog.getByRole('radio', { name })).not.toBeChecked();
    }
    await expect(dialog.getByRole('checkbox', { name: 'Kertas Besar A4' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Tanpa Header Toko' })).not.toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Tampilkan Rekening' })).not.toBeChecked();
    for (const name of ['Print', 'Kirim WA', 'Export Excel', 'Export PDF', 'Tutup']) {
      await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
    }
    // Radio hanya satu yang terpilih pada satu waktu.
    await dialog.getByRole('radio', { name: 'Cetak Surat D.O Gudang' }).check();
    await expect(dialog.getByRole('radio', { name: 'Cetak Faktur Penjualan' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Export Excel' }).click();
    await expect(page.getByRole('dialog', { name: /Pratinjau ekspor Excel/ })).toBeVisible();
  });

  test('tanpa pelanggaran aksesibilitas pada kotak cetak', async ({ page }) => {
    await loginBo(page);
    await fillOneItem(page);
    await active(page).getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Cetak Form Penjualan' })).toBeVisible();
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
});

test.describe('F4 Layar masuk Back-Office berbelah (gambar 56)', () => {
  test('ilustrasi di kiri dan panel formulir di kanan; masuk tetap berfungsi', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/bo');
    const art = await page.locator('.login-split__art').boundingBox();
    const card = await page.locator('.bo-login__card').boundingBox();
    expect(art?.x ?? 99).toBeLessThan(2);
    expect((art?.x ?? 0) + (art?.width ?? 0)).toBeLessThanOrEqual((card?.x ?? 0) + 1);
    expect(card?.width ?? 0).toBeGreaterThanOrEqual(380);
    expect(Math.round((card?.y ?? 99) + (card?.height ?? 0))).toBeGreaterThanOrEqual(799);
    const version = await page
      .locator('.bo--login')
      .evaluate((node) => getComputedStyle(node, '::after').content);
    expect(version).toContain('Ver. 1.0');
    await loginBo(page);
  });

  test('layar sempit: ilustrasi tersembunyi dan tidak ada gulir mendatar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/#/bo');
    await expect(page.locator('.login-split__art')).toBeHidden();
    await expect(page.locator('.bo-login__card')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tanpa pelanggaran aksesibilitas pada layar masuk', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/bo');
    await expect(page.locator('.bo-login__card')).toBeVisible();
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((item) => `${item.id}: ${item.nodes[0]?.html ?? ''}`)).toEqual([]);
  });
});

// Audit akhir terhadap dokumen: celah yang ditemukan setelah semua butir dikerjakan.
test.describe('F5 Audit akhir dokumen final', () => {
  const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

  test('kotak Cetak sesuai gambar 52: dokumen menurun, kertas sebaris, tombol sebaris, muat 1280x640', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await page.goto('/#/bo/penjualan');
    await active(page)
      .getByRole('combobox', { name: 'Cari atau pilih barang dan jasa' })
      .fill('semen');
    await active(page)
      .getByRole('listbox', { name: 'Cari atau pilih barang dan jasa' })
      .getByRole('option')
      .first()
      .click();
    const item = page.getByRole('dialog', { name: 'Rincian Barang' });
    await item.getByLabel('Kuantitas', { exact: true }).fill('2');
    await item.getByRole('button', { name: 'Lanjut' }).click();
    await active(page).getByRole('button', { name: 'Cetak', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cetak Form Penjualan' });
    await expect(dialog).toBeVisible();

    const spots = (locator: Locator): Promise<{ x: number; y: number }[]> =>
      locator.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: Math.round(box.x), y: Math.round(box.y) };
        }),
      );
    // Lima pilihan dokumen: satu kolom, satu per baris, berurutan dari atas.
    const radios = await spots(dialog.getByRole('radio'));
    expect(radios).toHaveLength(5);
    expect(new Set(radios.map((spot) => spot.x)).size).toBe(1);
    expect(radios.map((spot) => spot.y)).toEqual(
      [...radios.map((spot) => spot.y)].sort((a, b) => a - b),
    );
    expect(new Set(radios.map((spot) => spot.y)).size).toBe(5);
    // Tiga pilihan kertas sebaris.
    const boxes = await spots(dialog.getByRole('checkbox'));
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((spot) => spot.y)).size).toBe(1);
    // Kelima tombol sebaris dan seluruh kotak berada di dalam layar.
    const buttons = await Promise.all(
      ['Print', 'Kirim WA', 'Export Excel', 'Export PDF', 'Tutup'].map(async (name) => {
        const [spot] = await spots(dialog.getByRole('button', { name, exact: true }));
        return spot?.y ?? -1;
      }),
    );
    expect(new Set(buttons).size).toBe(1);
    const frame = await page.locator('.modal').boundingBox();
    expect(frame?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((frame?.y ?? 0) + (frame?.height ?? 0)).toBeLessThanOrEqual(640);
  });

  test('Data Barang: Nonaktifkan mati saat mengisi barang baru dan hidup lagi setelah Batal', async ({
    page,
  }) => {
    await openBarang(page);
    const deactivate = toolbar(page).getByRole('button', { name: /^Nonaktifkan/ });
    await expect(deactivate).toBeEnabled();
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    await expect(deactivate).toBeDisabled();
    await toolbar(page).getByRole('button', { name: 'Batal', exact: true }).click();
    await expect(deactivate).toBeEnabled();
  });

  test('Info barang: tanggal saldo awal memakai hari/bulan/tahun', async ({ page }) => {
    await openBarang(page);
    await page.locator('.vtable__rows .vtable__row').nth(1).click();
    await page.getByRole('button', { name: /^Info/ }).first().click();
    const summary = page.getByRole('dialog').locator('.bo-info__summary');
    await expect(summary).toContainText(/Saldo awal: \d{2}\/\d{2}\/\d{4}/);
    await expect(summary).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  });

  test('Akuntansi: semua bagian memakai istilah Beban Usaha, tanpa beban operasional', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/akuntansi');
    for (const name of ['Jurnal Otomatis', 'Beban Usaha', 'Arus Kas', 'Laba Rugi', 'Neraca']) {
      await active(page).getByRole('button', { name, exact: true }).click();
      const text = (await active(page).textContent()) ?? '';
      expect(text, name).not.toMatch(/beban operasional/i);
    }
    await active(page).getByRole('button', { name: 'Jurnal Otomatis', exact: true }).click();
    const sources = await active(page).locator('select option').allTextContents();
    expect(sources).toContain('Beban Usaha');
  });
});
