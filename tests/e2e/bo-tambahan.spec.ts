import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { AXE_TAGS, settle } from './helpers/routes';

// Revisi tambahan BO (dokumen "Tambahan Revisi Penyesuaian" dan gambar Data Barang): tooltip nama
// barang, kolom formulir Data Barang, tombol impor di samping pencarian dihapus, bayar hutang atau
// piutang dengan Split, dan tata letak Retur yang membuat daftar barang lega.

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

function active(page: Page): Locator {
  return page.locator('.bo-tabpanel:not([hidden])');
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await expect(locator).toBeVisible();
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error('kotak tidak terukur');
  }
  return found;
}

test.describe('I. Data Barang (gambar catatan klien)', () => {
  test('I1: tombol impor di samping pencarian dihapus; Import tetap ada di Saldo Stok Awal', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    await expect(panel.locator('.bo-pd-toolbar')).toBeVisible();
    await expect(
      panel.locator('.bo-pd-toolbar').getByRole('button', { name: /impor|import/i }),
    ).toHaveCount(0);
    await expect(panel.locator('.bo-pd-toolbar').locator('.icon, svg')).not.toHaveCount(0);
    await expect(
      panel.locator('.bo-pd-opening').getByRole('button', { name: 'Import' }),
    ).toBeVisible();
    // Tombol bilah aksi lain tetap lengkap.
    for (const name of ['Tambah Barang', 'Ubah', 'Nonaktifkan Barang', 'Info', 'Cetak']) {
      await expect(panel.locator('.bo-pd-toolbar').getByRole('button', { name })).toBeVisible();
    }
  });

  test('I2: kolom pencarian memanjang dan tidak menimpa filter', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    const search = await box(panel.locator('.bo-pd-search'));
    const filter = await box(panel.locator('.bo-pd-filter--kategori'));
    const refresh = await box(panel.getByRole('button', { name: 'Segarkan daftar' }));
    // Pencarian berada di antara tombol segarkan dan filter, dan jauh lebih lebar daripada sebelumnya (196 px).
    expect(search.x).toBeGreaterThanOrEqual(refresh.x + refresh.width);
    expect(search.x + search.width).toBeLessThanOrEqual(filter.x + 1);
    expect(search.width).toBeGreaterThanOrEqual(230);
  });

  test('I3: kolom Nama dipanjangkan, Barcode Kategori Merk dipendekkan, Catatan memanjang', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    const nama = await box(panel.locator('.bo-pd-f--nama'));
    const barcode = await box(panel.locator('.bo-pd-f--barcode'));
    const kategori = await box(panel.locator('.bo-pd-f--kategori'));
    const merk = await box(panel.locator('.bo-pd-f--merk'));
    const catatan = await box(panel.locator('.bo-pd-f--catatan'));
    const minToko = await box(panel.locator('.bo-pd-f--mintoko'));
    const kode = await box(panel.locator('.bo-pd-f--kode'));
    expect(nama.width).toBeGreaterThanOrEqual(barcode.width * 1.5);
    expect(Math.abs(barcode.width - kategori.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(barcode.width - merk.width)).toBeLessThanOrEqual(1);
    // Catatan mulai di kolom Barcode dan berakhir di tepi kolom Min Stok di sebelahnya, sebelum kolom Kode.
    expect(Math.abs(catatan.x - barcode.x)).toBeLessThanOrEqual(1);
    expect(catatan.width).toBeGreaterThanOrEqual(barcode.width * 1.8);
    expect(Math.abs(catatan.x + catatan.width - (minToko.x + minToko.width))).toBeLessThanOrEqual(
      1,
    );
    expect(catatan.x + catatan.width).toBeLessThanOrEqual(kode.x);
  });

  test('I3: urutan kursor formulir tetap sama dan Catatan bisa diisi', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    await panel.getByRole('button', { name: 'Ubah', exact: true }).click();
    const catatan = panel.getByLabel('Catatan', { exact: true });
    await catatan.fill('stok banyak');
    await expect(catatan).toHaveValue('STOK BANYAK');
  });

  test('I4: nama barang yang terpotong tampil selengkapnya saat kursor di atasnya', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    await panel.getByRole('searchbox').fill('LEM SILIKON');
    const cells = panel.locator('.vtable__row:not(.vtable__head) .vtable__cell:first-child');
    await expect(cells.first()).toBeVisible();
    const index = await cells.evaluateAll((nodes) =>
      nodes.findIndex((node) => node.scrollWidth > node.clientWidth),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const cell = cells.nth(index);
    await expect(cell).not.toHaveAttribute('title', /.+/);
    await cell.hover();
    const full = (await cell.textContent()) ?? '';
    await expect(cell).toHaveAttribute('title', full.trim());
    expect(full.trim().length).toBeGreaterThan(20);
  });

  test('I4: teks yang muat penuh tidak diberi title', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/barang');
    const panel = active(page);
    await panel.getByRole('searchbox').fill('LEM SILIKON');
    const codeCell = panel
      .locator('.vtable__row:not(.vtable__head) .vtable__cell:nth-child(2)')
      .first();
    await expect(codeCell).toBeVisible();
    await codeCell.hover();
    await expect(codeCell).not.toHaveAttribute('title', /.+/);
  });
});

async function pickCustomerAndType(page: Page, route: string, party: string): Promise<Locator> {
  await page.goto(route);
  const panel = active(page);
  await panel.getByLabel(party, { exact: true }).selectOption({ index: 1 });
  await expect(panel.locator('.bo-debt-table tbody tr').first()).toBeVisible();
  return panel;
}

test.describe('J. Bayar hutang atau piutang dengan Split (gambar 2 dokumen)', () => {
  test('J1: bagian kedua terkunci sampai Split dicentang; contoh tunai 75.000 + transfer 25.000', async ({
    page,
  }) => {
    await loginBo(page);
    const panel = await pickCustomerAndType(
      page,
      '/#/bo/hutang-piutang/bayar-piutang?baru=1',
      'Pelanggan',
    );
    const group = panel.getByRole('group', { name: 'Pembayaran Split' });
    const split = panel.getByLabel('Split', { exact: true });
    await expect(split).not.toBeChecked();
    await expect(group.locator('select').first()).toBeDisabled();
    await expect(group.locator('input')).toBeDisabled();
    // Total 100.000 dulu, lalu Split: bagian pertama tunai 75.000, sisanya otomatis ke bagian kedua.
    const nominal = panel.getByLabel('Nominal', { exact: true });
    await nominal.first().fill('100000');
    await nominal.first().press('Enter');
    await expect(panel.locator('.bo-debt-total__value')).toHaveText('Rp 100.000');
    await split.check();
    await expect(group.locator('select').first()).toBeEnabled();
    await nominal.first().fill('75000');
    await nominal.first().press('Enter');
    await expect(nominal.first()).toHaveValue('75.000');
    await expect(nominal.nth(1)).toHaveValue('25.000');
    await expect(panel.locator('.bo-debt-total__value')).toHaveText('Rp 100.000');
    await group.getByLabel('Cara Bayar', { exact: true }).selectOption('transfer');
    await group.getByLabel('Kas / Bank', { exact: true }).selectOption('Bank');
    await panel.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/hutang-piutang\/bayar-piutang$/);
    const top = active(page).locator('.bo-trx-table tbody tr').first();
    await expect(top).toContainText('PP-0007');
    await expect(top).toContainText('Tunai + Transfer');
    await expect(top).toContainText('Kas + Bank');
    await expect(top).toContainText('Rp 100.000');
    // Pembayaran tersimpan terbuka hanya-baca dengan kedua bagian.
    await top.getByRole('link', { name: 'PP-0007' }).click();
    const form = active(page);
    await expect(form.getByLabel('Split', { exact: true })).toBeChecked();
    await expect(form.getByLabel('Split', { exact: true })).toBeDisabled();
    await expect(form.getByLabel('Nominal', { exact: true }).first()).toHaveValue('75.000');
    await expect(form.getByLabel('Nominal', { exact: true }).nth(1)).toHaveValue('25.000');
    await expect(
      form.getByRole('group', { name: 'Pembayaran Split' }).locator('input'),
    ).toBeDisabled();
  });

  test('J2: Split tanpa cara bayar kedua atau dengan nominal kedua kosong ditolak', async ({
    page,
  }) => {
    await loginBo(page);
    const panel = await pickCustomerAndType(
      page,
      '/#/bo/hutang-piutang/bayar-piutang?baru=1',
      'Pelanggan',
    );
    const nominal = panel.getByLabel('Nominal', { exact: true });
    await nominal.first().fill('100000');
    await nominal.first().press('Enter');
    await panel.getByLabel('Split', { exact: true }).check();
    const save = panel.getByRole('button', { name: 'Simpan', exact: true });
    await save.click();
    await expect(
      panel.getByRole('alert').filter({ hasText: 'pembayaran kedua yang berbeda' }),
    ).toBeVisible();
    const group = panel.getByRole('group', { name: 'Pembayaran Split' });
    // Cara yang sama persis dengan bagian pertama (Tunai dan Kas) tetap ditolak.
    await group.getByLabel('Cara Bayar', { exact: true }).selectOption('tunai');
    await group.getByLabel('Kas / Bank', { exact: true }).selectOption('Kas');
    await save.click();
    await expect(
      panel.getByRole('alert').filter({ hasText: 'pembayaran kedua yang berbeda' }),
    ).toBeVisible();
    // Cara berbeda tetapi seluruh nominal ada di bagian pertama: bagian kedua kosong ditolak.
    await group.getByLabel('Cara Bayar', { exact: true }).selectOption('transfer');
    await group.getByLabel('Kas / Bank', { exact: true }).selectOption('Bank');
    await save.click();
    await expect(
      panel.getByRole('alert').filter({ hasText: 'jumlahnya sama dengan Total Bayar' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/bayar-piutang\?baru=1$/);
    // Mengunci kembali: mencabut centang mengosongkan dan mengunci bagian kedua, lalu bayar biasa lolos.
    await panel.getByLabel('Split', { exact: true }).uncheck();
    await expect(group.locator('input')).toBeDisabled();
    await expect(nominal.first()).toHaveValue('100.000');
    await save.click();
    await expect(page).toHaveURL(/#\/bo\/hutang-piutang\/bayar-piutang$/);
  });

  test('J3: Split juga ada pada pembayaran hutang pemasok', async ({ page }) => {
    await loginBo(page);
    const panel = await pickCustomerAndType(
      page,
      '/#/bo/hutang-piutang/bayar-hutang?baru=1',
      'Pemasok',
    );
    const nominal = panel.getByLabel('Nominal', { exact: true });
    await nominal.first().fill('500000');
    await nominal.first().press('Enter');
    await panel.getByLabel('Split', { exact: true }).check();
    await nominal.nth(1).fill('200000');
    await nominal.nth(1).press('Enter');
    await expect(nominal.first()).toHaveValue('300.000');
    await expect(panel.locator('.bo-debt-total__value')).toHaveText('Rp 500.000');
    const group = panel.getByRole('group', { name: 'Pembayaran Split' });
    await group.getByLabel('Cara Bayar', { exact: true }).selectOption('qris');
    await group.getByLabel('Kas / Bank', { exact: true }).selectOption('Bank');
    await panel.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/hutang-piutang\/bayar-hutang$/);
    const top = active(page).locator('.bo-trx-table tbody tr').first();
    await expect(top).toContainText('PH-0004');
    await expect(top).toContainText('Tunai + QRIS');
    await expect(top).toContainText('Rp 500.000');
  });

  test('J4: filter Metode mengenali kedua cara bayar pada pembayaran Split', async ({ page }) => {
    await loginBo(page);
    const panel = await pickCustomerAndType(
      page,
      '/#/bo/hutang-piutang/bayar-piutang?baru=1',
      'Pelanggan',
    );
    const nominal = panel.getByLabel('Nominal', { exact: true });
    await nominal.first().fill('100000');
    await nominal.first().press('Enter');
    await panel.getByLabel('Split', { exact: true }).check();
    await nominal.first().fill('60000');
    await nominal.first().press('Enter');
    const group = panel.getByRole('group', { name: 'Pembayaran Split' });
    await group.getByLabel('Cara Bayar', { exact: true }).selectOption('qris');
    await group.getByLabel('Kas / Bank', { exact: true }).selectOption('Bank');
    await panel.getByRole('button', { name: 'Simpan', exact: true }).click();
    const list = active(page);
    await list.getByLabel('Metode Bayar', { exact: true }).selectOption('qris');
    await expect(list.locator('.bo-trx-table tbody tr')).toHaveCount(1);
    await expect(list.locator('.bo-trx-table tbody tr').first()).toContainText('Tunai + QRIS');
  });

  test('J5: formulir dengan Split tetap muat satu layar 1280 x 640 tanpa gulir', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    const panel = await pickCustomerAndType(
      page,
      '/#/bo/hutang-piutang/bayar-piutang?baru=1',
      'Pelanggan',
    );
    await panel.getByLabel('Split', { exact: true }).check();
    const card = panel.locator('.bo-debt-card--fields');
    const sizes = await card.evaluate((node) => ({
      scroll: node.scrollHeight,
      client: node.clientHeight,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      inner: window.innerHeight,
    }));
    expect(doc.scroll).toBeLessThanOrEqual(doc.inner);
  });
});

async function openReturn(
  page: Page,
  kind: 'penjualan' | 'pembelian',
  partyIndex = 1,
  invoiceIndex = 2,
): Promise<Locator> {
  await page.goto(`/#/bo/transaksi/retur-${kind}?baru=1`);
  const panel = active(page);
  const selects = panel.locator('.bo-ret-source select');
  await selects.nth(0).selectOption({ index: partyIndex });
  await selects.nth(1).selectOption({ index: invoiceIndex });
  await panel.getByRole('button', { name: 'Pilih Semua Sisa' }).click();
  await expect(panel.locator('.bo-ret-table tbody tr').first()).toBeVisible();
  return panel;
}

async function visibleRows(panel: Locator): Promise<number> {
  return panel.locator('.bo-ret-table-wrap').evaluate((wrap) => {
    const view = wrap.getBoundingClientRect();
    return [...wrap.querySelectorAll('tbody tr')].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1;
    }).length;
  });
}

test.describe('K. Tata letak Retur: daftar barang lega (gambar 3 dokumen)', () => {
  for (const kind of ['penjualan', 'pembelian'] as const) {
    test(`K1: Retur ${kind} menampilkan sedikitnya empat baris barang penuh di 1280 x 640`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await loginBo(page);
      const panel = await openReturn(page, kind, 1, kind === 'penjualan' ? 2 : 1);
      expect(await panel.locator('.bo-ret-table tbody tr').count()).toBeGreaterThanOrEqual(4);
      expect(await visibleRows(panel)).toBeGreaterThanOrEqual(3);
      const wrap = await box(panel.locator('.bo-ret-table-wrap'));
      expect(wrap.height).toBeGreaterThanOrEqual(220);
      // Tabel selebar kolom utama, bukan setengah layar.
      expect(wrap.width).toBeGreaterThanOrEqual(780);
      const name = await box(panel.locator('.bo-ret-table th').nth(1));
      expect(name.width).toBeGreaterThanOrEqual(200);
      const doc = await page.evaluate(() => ({
        scroll: document.documentElement.scrollHeight,
        inner: window.innerHeight,
      }));
      expect(doc.scroll).toBeLessThanOrEqual(doc.inner);
    });
  }

  test('K2: layar lebih tinggi menampilkan lebih banyak baris dan tabel tidak menggulir ke samping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginBo(page);
    const panel = await openReturn(page, 'penjualan');
    expect(await visibleRows(panel)).toBeGreaterThanOrEqual(4);
    const overflow = await panel
      .locator('.bo-ret-table-wrap')
      .evaluate((wrap) => wrap.scrollWidth - wrap.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('K3: panel Penyelesaian di kanan muat tanpa gulir dan sempit dibanding daftar barang', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    const panel = await openReturn(page, 'penjualan');
    const aside = panel.locator('.bo-ret-aside > .bo-ret-card');
    const sizes = await aside.evaluate((node) => ({
      scroll: node.scrollHeight,
      client: node.clientHeight,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
    const side = await box(aside);
    const wrap = await box(panel.locator('.bo-ret-table-wrap'));
    expect(side.width).toBeLessThan(wrap.width / 1.8);
    // Semua elemen penyelesaian tetap terlihat: cara, gudang, alasan, nilai, dampak, simpan.
    for (const text of [
      'Cara Pengembalian',
      'Kembalikan ke Gudang',
      'Alasan retur',
      'Nilai Retur',
      'Dampak Retur',
    ]) {
      await expect(aside.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(aside.getByRole('button', { name: 'Simpan Retur' })).toBeVisible();
  });

  test('K4: nama barang panjang dipotong satu baris dan terbaca penuh lewat title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    const panel = await openReturn(page, 'penjualan');
    const names = panel.locator('.bo-ret-name');
    const count = await names.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < count; index += 1) {
      const text = (await names.nth(index).textContent()) ?? '';
      await expect(names.nth(index)).toHaveAttribute('title', text);
    }
  });

  test('K5: retur tetap bisa disimpan setelah tata letak diubah', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    const panel = await openReturn(page, 'penjualan');
    await panel.locator('.bo-ret-chips button').first().click();
    await panel.getByRole('button', { name: 'Simpan Retur' }).first().click();
    await expect(page.locator('.toast__text')).toContainText(/Retur .* tersimpan/);
  });
});

test.describe('L. axe pada layar yang diubah', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Data Barang, bayar piutang dengan Split, dan Retur lolos axe (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await loginBo(page);
      await page.goto('/#/bo/barang');
      await expect(active(page).locator('.bo-pd-toolbar')).toBeVisible();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      const panel = await pickCustomerAndType(
        page,
        '/#/bo/hutang-piutang/bayar-piutang?baru=1',
        'Pelanggan',
      );
      await panel.getByLabel('Split', { exact: true }).check();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      await openReturn(page, 'penjualan');
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }
});
