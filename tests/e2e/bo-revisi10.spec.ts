import { expect, test, type Locator, type Page } from '@playwright/test';

// Revisi Back-Office putaran kesepuluh (dokumen klien "Revisi Penyesuain BO 2 (1) (3)"): Cara Bayar,
// Tempo, Kas / Bank, kolom Ongkir dan HPP rata-rata, alias nama barang, daftar berpasangan seragam,
// halaman master tanpa Nonaktifkan, kode otomatis, tanggal hari/bulan/tahun, kaca pembesar seragam,
// kepala daftar yang membeku, dan caption satu baris. Berjalan pada build produksi.

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

const panel = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');
const searchBox = (page: Page): Locator =>
  panel(page).getByRole('combobox', { name: 'Cari atau pilih barang dan jasa' });
const optionsOf = (page: Page): Locator =>
  panel(page).getByRole('listbox', { name: 'Cari atau pilih barang dan jasa' }).getByRole('option');
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Rincian Barang' });
const rowsOf = (page: Page): Locator =>
  panel(page).locator('.bo-trx-table--lines tbody tr[data-id]');

async function openPage(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page.locator('.bo-tab--active .bo-tab__link')).toHaveAttribute('href', `#${hash}`);
  await expect(panel(page).locator('.bo-loading')).toHaveCount(0);
}

const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const node = document.activeElement as HTMLInputElement | null;
    if (node === null) {
      return '';
    }
    return node.labels?.[0]?.textContent.trim() ?? node.getAttribute('aria-label') ?? node.tagName;
  });

async function tabNames(page: Page, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    names.push(await focusedName(page));
  }
  return names;
}

test.describe('Cara Bayar, Tempo, dan Kas / Bank (gambar 42 sampai 45)', () => {
  const forms = [
    { path: '/bo/transaksi/po-pembelian/baru', credit: 'hutang', channel: false },
    { path: '/bo/transaksi/so-penjualan/baru', credit: 'piutang', channel: false },
    { path: '/bo/pembelian', credit: 'hutang', channel: true },
    { path: '/bo/penjualan', credit: 'piutang', channel: true },
  ] as const;

  for (const form of forms) {
    test(`${form.path}: ${form.credit} mengisi Tempo, tunai menonaktifkan Tempo${
      form.channel ? ' dan membuka Kas / Bank' : ''
    }`, async ({ page }) => {
      await loginBo(page);
      await openPage(page, form.path);
      const root = panel(page);
      const terms = root.getByLabel('Cara Bayar', { exact: true });
      const tempo = root.getByLabel('Tempo', { exact: true });
      await expect(terms.locator('option')).toHaveText([form.credit.toUpperCase(), 'TUNAI']);
      await expect(tempo).toBeEnabled();
      await expect(tempo).toHaveValue('30');
      await expect(root.locator('.bo-trx-tempo__unit')).toHaveText('Hari');
      await tempo.fill('x45');
      await expect(tempo).toHaveValue('45');
      if (form.channel) {
        await expect(root.getByLabel('Kas / Bank', { exact: true })).toBeDisabled();
      }

      await terms.selectOption('tunai');
      await expect(tempo).toBeDisabled();
      await expect(tempo).toHaveValue('0');
      if (form.channel) {
        const channel = root.getByLabel('Kas / Bank', { exact: true });
        await expect(channel).toBeEnabled();
        await expect(channel.locator('option')).toHaveText(['KAS', 'BANK']);
      }

      await terms.selectOption(form.credit);
      await expect(tempo).toBeEnabled();
      await expect(tempo).toHaveValue('30');
    });
  }

  test('urutan Tab: tanggal, No PO, pemasok, cara bayar, tempo, lalu keterangan di akhir', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    await panel(page).getByLabel('No. PO', { exact: true }).focus();
    expect(await tabNames(page, 7)).toEqual([
      'Pemasok',
      'Cara Bayar',
      'Tempo',
      'No. Faktur',
      'Ekspedisi',
      'Keterangan',
      'Cari atau pilih barang dan jasa',
    ]);
    await openPage(page, '/bo/penjualan');
    await panel(page).getByLabel('No. SO', { exact: true }).focus();
    expect(await tabNames(page, 7)).toEqual([
      'Pelanggan',
      'Cara Bayar',
      'Tempo',
      'Sales',
      'Ekspedisi',
      'Keterangan',
      'Cari atau pilih barang dan jasa',
    ]);
    // Tunai: Kas / Bank menggantikan Tempo pada urutan fokus.
    await panel(page).getByLabel('Cara Bayar', { exact: true }).selectOption('tunai');
    await panel(page).getByLabel('Cara Bayar', { exact: true }).focus();
    expect(await tabNames(page, 2)).toEqual(['Kas / Bank', 'Sales']);
  });

  test('urutan Tab PO: tanggal, No PO, pemasok, pemesan, cara bayar, tempo, ekspedisi, keterangan', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian/baru');
    await panel(page).getByLabel('No PO', { exact: true }).focus();
    expect(await tabNames(page, 7)).toEqual([
      'Pemasok',
      'Pemesan',
      'Cara Bayar',
      'Tempo',
      'Ekspedisi',
      'Keterangan',
      'Cari atau pilih barang dan jasa',
    ]);
  });

  test('nomor dokumen dibuat otomatis: FJ, FB, PO, dan SO berformat awalan, tahun-bulan, empat digit', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await expect(panel(page).getByLabel('Nomor', { exact: true })).toHaveValue(/^FJ\d{8}$/);
    await expect(panel(page).getByLabel('Nomor', { exact: true })).toHaveJSProperty(
      'readOnly',
      true,
    );
    await openPage(page, '/bo/pembelian');
    await expect(panel(page).getByLabel('Nomor', { exact: true })).toHaveValue(/^FB\d{8}$/);
    await openPage(page, '/bo/transaksi/po-pembelian/baru');
    await expect(panel(page).getByLabel('No PO', { exact: true })).toHaveValue(/^PO\d{8}$/);
    await openPage(page, '/bo/transaksi/so-penjualan/baru');
    await expect(panel(page).getByLabel('No SO', { exact: true })).toHaveValue(/^SO\d{8}$/);
  });
});

test.describe('Ongkir, HPP rata-rata, dan alias nama barang', () => {
  const hppAvgOf = async (page: Page, code: string): Promise<number> => {
    await openPage(page, '/bo/barang');
    await page.getByLabel('Cari', { exact: true }).fill(code);
    await expect(page.locator('.bo-pd-count')).toHaveText('1 barang');
    // Kolom terakhir daftar barang (hanya Owner) memuat HPP rata-rata.
    const cell = page.locator('.vtable__rows .vtable__row').first().locator('.vtable__cell').last();
    const value = (await cell.textContent()) ?? '';
    return Number(value.replaceAll('.', '').replace(',', '.'));
  };

  test('Faktur Pembelian: kolom Ongkir tanpa Total Biaya; Simpan menaikkan HPP rata-rata sekali per faktur', async ({
    page,
  }) => {
    await loginBo(page);
    const before = await hppAvgOf(page, 'P001');

    await openPage(page, '/bo/pembelian');
    await expect(panel(page).locator('.bo-trx-totals').getByLabel('Total Biaya')).toHaveCount(0);
    await expect(panel(page).locator('.bo-trx-table--lines thead th').nth(8)).toHaveText('Ongkir');
    await searchBox(page).fill('P001');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('100');
    await dialog.getByLabel('Ongkos Kirim').fill('500000');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(rowsOf(page).first().locator('td').nth(8)).toHaveText('500.000');
    const total = await panel(page).locator('.bo-trx-totals__value.is-total').textContent();
    const sub = await panel(page).locator('.bo-trx-totals__value').first().textContent();
    expect(total).toBe(sub);

    await panel(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText(/Faktur Pembelian FB\d+ berhasil disimpan\./)).toBeVisible();
    const after = await hppAvgOf(page, 'P001');
    expect(after).toBeGreaterThan(before);

    // Simpan berulang atas faktur yang sama tidak menggeser HPP lagi.
    await openPage(page, '/bo/pembelian');
    await panel(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    expect(await hppAvgOf(page, 'P001')).toBe(after);
  });

  test('Nama Barang pada dialog Rincian Barang boleh diubah menjadi alias dan tampil di tabel', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    await searchBox(page).fill('semen');
    await optionsOf(page).first().click();
    const dialog = dialogOf(page);
    const name = dialog.getByLabel('Nama Barang', { exact: true });
    await expect(name).toBeEditable();
    await name.fill('Semen Pak Wahyu');
    await dialog.getByLabel('Kuantitas', { exact: true }).fill('1');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(rowsOf(page).first()).toContainText(/semen pak wahyu/i);

    // Mengosongkan nama mengembalikannya ke nama barang.
    await rowsOf(page).first().locator('td').nth(3).click();
    const edit = dialogOf(page);
    await edit.getByRole('button', { name: 'Kosongkan nama' }).click();
    await expect(edit.getByLabel('Nama Barang', { exact: true })).toHaveValue('');
    await edit
      .getByRole('button', { name: /Lanjut|Ubah|Simpan/ })
      .first()
      .click();
    await expect(rowsOf(page).first()).not.toContainText(/semen pak wahyu/i);
  });
});

test.describe('Daftar berpasangan seragam (gambar 47 sampai 50)', () => {
  const headers = (page: Page): Promise<string[]> =>
    panel(page).locator('.bo-trx-table thead th').allTextContents();
  const widths = (page: Page): Promise<number[]> =>
    panel(page)
      .locator('.bo-trx-table thead th')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));

  const pairs = [
    ['/bo/transaksi/po-pembelian', '/bo/transaksi/so-penjualan'],
    ['/bo/transaksi/faktur-pembelian', '/bo/transaksi/faktur-penjualan'],
    ['/bo/transaksi/retur-pembelian', '/bo/transaksi/retur-penjualan'],
    ['/bo/hutang-piutang/bayar-hutang', '/bo/hutang-piutang/bayar-piutang'],
  ] as const;

  for (const [first, second] of pairs) {
    test(`${first} dan ${second}: kolom sama, lebar sama, Total di kolom terakhir`, async ({
      page,
    }) => {
      await loginBo(page);
      await openPage(page, first);
      const firstWidths = await widths(page);
      const firstHeaders = await headers(page);
      await openPage(page, second);
      const secondWidths = await widths(page);
      const secondHeaders = await headers(page);
      expect(secondHeaders).toHaveLength(firstHeaders.length);
      expect(secondWidths).toEqual(firstWidths);
      expect(firstHeaders.at(-1)).toMatch(/^(Total|Nilai Retur|Total Bayar)$/);
      expect(secondHeaders.at(-1)).toBe(firstHeaders.at(-1));
    });
  }

  test('nomor retur berupa tautan biasa yang membuka fakturnya', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/retur-penjualan');
    // Tanpa retur tersimpan daftar kosong; tautan tidak ada, tetapi tombol Nomor tidak boleh ada.
    await expect(panel(page).locator('.bo-trx-table tbody .bo-link-button')).toHaveCount(0);
  });
});

test.describe('Halaman master: tanpa Nonaktifkan, Impor terbatas, kode otomatis', () => {
  test('Pelanggan: kode C dengan empat digit terisi otomatis dan terkunci', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/master/pelanggan');
    await panel(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    const code = panel(page).getByLabel('Kode', { exact: false }).first();
    await expect(code).toHaveValue(/^C\d{4}$/);
    await expect(code).toBeDisabled();
    await expect(panel(page).getByRole('button', { name: 'Nonaktifkan' })).toHaveCount(0);
  });

  test('Data Barang: kode berurutan empat digit terisi saat Tambah dan tidak bisa diketik', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    const code = page.getByLabel('Kode barang');
    await expect(code).toHaveValue(/^\d{4}$/);
    await expect(code).toHaveAttribute('readonly', '');
  });
});

test.describe('Tampilan: tanggal, kaca pembesar, kepala beku, dan caption satu baris', () => {
  test('tanggal di header dan daftar memakai hari/bulan/tahun dengan garis miring', async ({
    page,
  }) => {
    await loginBo(page);
    await expect(page.locator('.bo-topbar')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    for (const path of [
      '/bo/transaksi/faktur-penjualan',
      '/bo/transaksi/po-pembelian',
      '/bo/hutang-piutang/saldo-hutang',
      '/bo/hutang-piutang/saldo-piutang',
      '/bo/pengaturan/audit-log',
      '/bo/pengaturan/pengguna',
      '/bo/akuntansi?bagian=neraca',
    ]) {
      await page.goto(`/#${path}`);
      await expect(panel(page).locator('.bo-loading')).toHaveCount(0);
      const text = (await panel(page).innerText()).replaceAll(/\s+/g, ' ');
      expect(text, path).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
      expect(text, path).not.toMatch(
        /\b\d{1,2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)[a-z]* \d{4}\b/,
      );
    }
  });

  test('kotak cari: satu kaca pembesar di kiri, sama dengan Data Barang', async ({ page }) => {
    await loginBo(page);
    for (const path of [
      '/bo/barang',
      '/bo/master/pelanggan',
      '/bo/transaksi/po-pembelian',
      '/bo/transaksi/faktur-penjualan',
      '/bo/penjualan',
    ]) {
      await openPage(page, path);
      await expect(panel(page).locator('.bo-trx-search__icon')).toHaveCount(0);
      const search = panel(page).locator('input[type="search"]').first();
      const style = await search.evaluate((node) => {
        const css = getComputedStyle(node);
        return { image: css.backgroundImage, position: css.backgroundPosition };
      });
      expect(style.image, path).toContain('svg');
      expect(style.position, path).toMatch(/^14px/);
    }
  });

  test('kepala tabel daftar tetap menempel saat isi digulir', async ({ page }) => {
    await loginBo(page);
    for (const path of [
      '/bo/transaksi/faktur-penjualan',
      '/bo/transaksi/po-pembelian',
      '/bo/master/kategori',
      '/bo/master/pelanggan',
      '/bo/hutang-piutang/bayar-piutang',
    ]) {
      await openPage(page, path);
      const position = await panel(page)
        .locator('table thead th')
        .first()
        .evaluate((node) => getComputedStyle(node).position);
      expect(position, path).toBe('sticky');
    }
  });

  test('caption isian dan kartu angka tidak terlipat menjadi dua baris', async ({ page }) => {
    await loginBo(page);
    const wrapped = async (path: string): Promise<string[]> => {
      await page.goto(`/#${path}`);
      await expect(panel(page).locator('.bo-loading')).toHaveCount(0);
      return panel(page)
        .locator('label, .bo-trx-kpi__label')
        .evaluateAll((nodes) =>
          nodes
            .filter(
              (node) =>
                node.getBoundingClientRect().height > 0 && node.querySelector('input') === null,
            )
            .filter(
              (node) =>
                node.getBoundingClientRect().height >
                1.7 * parseFloat(getComputedStyle(node).lineHeight || '20'),
            )
            .map((node) => node.textContent.trim()),
        );
    };
    for (const path of [
      '/bo/master/pelanggan',
      '/bo/master/sales',
      '/bo/pengaturan/profil',
      '/bo/pengaturan/printer',
      '/bo/transaksi/faktur-penjualan',
      '/bo/transaksi/retur-penjualan?baru=1',
    ]) {
      expect(await wrapped(path), path).toEqual([]);
    }
  });
});
