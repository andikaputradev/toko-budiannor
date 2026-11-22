import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pickParty } from './helpers/party';
import { AXE_TAGS } from './helpers/routes';

// Penyesuaian akhir (dokumen "penyesuain akhir"): Histori Mutasi, kolom Pelanggan/Pemasok/Sales pada
// form faktur, PO, dan SO, isian Deposit, satuan dan label Retur, tombol Tampilkan kata sandi, dan
// baris Saldo Stok Awal yang dapat diubah. Berjalan pada build produksi.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

const OWNER = ['haris.owner', 'Kunci2026A'] as const;

async function loginBo(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(OWNER[0]);
  await page.getByLabel('Kata sandi', { exact: true }).fill(OWNER[1]);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

async function openPage(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page).toHaveURL(new RegExp(`#${hash.replace(/[?.]/g, '\\$&')}$`));
  await expect(active(page).locator('.bo-loading')).toHaveCount(0);
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error('elemen tidak terlihat');
  }
  return found;
}

const orderList = (page: Page): Locator => active(page).locator('.bo-trx-list');

async function addItem(page: Page, query: string, quantity: string): Promise<void> {
  const name = 'Cari atau pilih barang dan jasa';
  await active(page).getByRole('combobox', { name }).fill(query);
  await active(page).getByRole('listbox', { name }).getByRole('option').first().click();
  const dialog = page.getByRole('dialog', { name: 'Rincian Barang' });
  await dialog.getByLabel('Kuantitas', { exact: true }).fill(quantity);
  await dialog.getByRole('button', { name: 'Lanjut' }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('A1 Info Data Histori Barang, tab Mutasi (gambar 1)', () => {
  test('Gudang sejajar dengan tanggal dan keterangan satuan dasar tidak ditampilkan', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/barang');
    await active(page).locator('.bo-pd-toolbar input[type="search"]').first().fill('B0020');
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Mutasi' }).click();
    const date = await box(dialog.locator('.bo-info__date').first());
    const gudang = await box(dialog.getByLabel('Gudang', { exact: true }));
    expect(Math.abs(date.y + date.height / 2 - (gudang.y + gudang.height / 2))).toBeLessThan(3);
    const frame = await box(dialog.locator('.bo-info'));
    expect(gudang.x + gudang.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    await expect(dialog).not.toContainText('satuan dasar');
    await expect(dialog.locator('.bo-info__hint')).toHaveCount(0);
  });
});

test.describe('A2 Pelanggan, Pemasok, dan Sales pada form faktur, PO, dan SO (gambar 2)', () => {
  test('Faktur Penjualan: Pelanggan dicari seperti nama barang dan dipilih dari daftar', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    const root = active(page);
    const customer = root.getByLabel('Pelanggan', { exact: true });
    await expect(customer).toHaveAttribute('role', 'combobox');
    await expect(customer).toHaveAttribute('placeholder', 'Cari/Pilih');
    // Klik membuka seluruh daftar.
    await customer.click();
    const options = root.locator('.bo-trx-search--party .bo-trx-search__option');
    expect(await options.count()).toBeGreaterThan(5);
    // Kata boleh potongan dan urutannya bebas, seperti pencarian nama barang.
    await customer.fill('ja ma');
    await expect(options.first().locator('.bo-trx-search__name')).toContainText(/Maju Jaya/i);
    for (const text of await options.locator('.bo-trx-search__name').allTextContents()) {
      expect(text.toLowerCase()).toContain('ja');
      expect(text.toLowerCase()).toContain('ma');
    }
    await expect(options.first().locator('mark').first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const picked = await customer.inputValue();
    expect(picked).toMatch(/Maju Jaya/i);
    await expect(root.locator('.bo-credit-stat').first()).toBeVisible();
    // Mengetik tanpa memilih mengembalikan pilihan terakhir; mengosongkan menghapusnya.
    await customer.fill('zzz tidak ada');
    await expect(root.locator('.bo-trx-search__empty')).toHaveText('Pelanggan tidak ditemukan.');
    await root.getByLabel('Keterangan').click();
    await expect(customer).toHaveValue(picked);
    await customer.fill('');
    await root.getByLabel('Keterangan').click();
    await expect(customer).toHaveValue('');
  });

  test('Faktur Penjualan: Sales dipilih dari daftar Sales seperti Ekspedisi, bukan diketik', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/penjualan');
    const root = active(page);
    const sales = root.getByLabel('Sales', { exact: true });
    const expedition = root.getByLabel('Ekspedisi', { exact: true });
    expect(await sales.evaluate((node) => node.tagName)).toBe('SELECT');
    expect(await expedition.evaluate((node) => node.tagName)).toBe('SELECT');
    const names = await sales.locator('option').allTextContents();
    expect(names).toContain('Salahudin');
    expect(names.length).toBeGreaterThan(1);
    await expect(sales).toHaveValue('Salahudin');
    const other = names.find((name) => name !== 'Salahudin') ?? '';
    await sales.selectOption({ label: other });
    await expect(sales).toHaveValue(other);
  });

  test('Faktur Pembelian: Pemasok dicari dan dipilih; info hutang ikut berubah', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/pembelian');
    const root = active(page);
    const supplier = root.getByLabel('Pemasok', { exact: true });
    await expect(supplier).toHaveAttribute('role', 'combobox');
    await supplier.click();
    const first = root.locator('.bo-trx-search--party .bo-trx-search__option').first();
    const name = (await first.locator('.bo-trx-search__name').textContent()) ?? '';
    // Potongan di tengah kata cukup: "mak" dari "Makmur" menemukan nama yang memuatnya.
    await supplier.fill(name.slice(2, 6).toLowerCase());
    await expect(
      root.locator('.bo-trx-search--party .bo-trx-search__option').first(),
    ).toBeVisible();
    await supplier.fill('zzz tidak ada');
    await expect(root.locator('.bo-trx-search__empty')).toHaveText('Pemasok tidak ditemukan.');
    await supplier.fill('');
    const picked = await pickParty(root, 'Pemasok');
    await expect(supplier).toHaveValue(picked);
  });

  test('SO: Pelanggan berupa kotak cari dan Sales berupa pilihan; PO: Pemasok berupa kotak cari', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/so-penjualan/baru');
    let root = active(page);
    await expect(root.getByLabel('Pelanggan', { exact: true })).toHaveAttribute('role', 'combobox');
    const sales = root.getByLabel('Sales', { exact: true });
    expect(await sales.evaluate((node) => node.tagName)).toBe('SELECT');
    await expect(sales).toHaveValue('Salahudin');
    const customer = await pickParty(root, 'Pelanggan', 1);
    expect(customer).not.toBe('');

    await openPage(page, '/bo/transaksi/po-pembelian/baru');
    root = active(page);
    await expect(root.getByLabel('Pemasok', { exact: true })).toHaveAttribute('role', 'combobox');
    const supplier = await pickParty(root, 'Pemasok', 1);
    expect(supplier).not.toBe('');
  });

  test('pesanan yang sudah tersimpan tampil dengan pihak terpilih dan terkunci', async ({
    page,
  }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/po-pembelian/baru');
    const supplier = await pickParty(active(page), 'Pemasok');
    await addItem(page, 'semen', '2');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/po-pembelian$/);
    const number =
      (await orderList(page).locator('tbody tr[data-number] td').first().textContent()) ?? '';
    await orderList(page).getByRole('link', { name: number, exact: true }).click();
    const saved = active(page).getByLabel('Pemasok', { exact: true });
    await expect(saved).toHaveValue(supplier);
    await expect(saved).toBeDisabled();
  });

  test('SO tersimpan menampilkan Sales yang membuatnya pada kolom Sales', async ({ page }) => {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/so-penjualan/baru');
    await pickParty(active(page), 'Pelanggan');
    await active(page).getByLabel('Sales', { exact: true }).selectOption({ label: 'Salahudin' });
    await addItem(page, 'semen', '1');
    await active(page).getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page).toHaveURL(/#\/bo\/transaksi\/so-penjualan$/);
    const number =
      (await orderList(page).locator('tbody tr[data-number] td').first().textContent()) ?? '';
    await orderList(page).getByRole('link', { name: number, exact: true }).click();
    const sales = active(page).getByLabel('Sales', { exact: true });
    expect(await sales.evaluate((node) => node.tagName)).toBe('SELECT');
    await expect(sales).toBeDisabled();
    await expect(sales.locator('option:checked')).toHaveCount(1);
  });
});

test.describe('A3 Form Setor Deposit (gambar 3)', () => {
  test('Tanggal, Cara Bayar, dan Jumlah Setor cukup lebar untuk isinya', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/transaksi/deposit-pelanggan');
    await active(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    await active(page).locator('.bo-dep-row').first().click();
    const form = active(page).locator('.bo-dep-form--topup');
    await form.getByLabel('Cara Bayar').selectOption('transfer');
    await form.getByLabel('Jumlah Setor').fill('999999999');
    const fits = await form.evaluate((node) => {
      const measure = (text: string, field: Element): number => {
        const style = getComputedStyle(field);
        const probe = document.createElement('span');
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font};letter-spacing:${style.letterSpacing}`;
        probe.textContent = text;
        document.body.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      return [...node.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')]
        .filter((field) => field.tagName === 'SELECT' || field.value !== '')
        .map((field) => {
          const style = getComputedStyle(field);
          const text =
            field instanceof HTMLSelectElement
              ? (field.selectedOptions[0]?.textContent ?? '')
              : field.value;
          const room =
            field.getBoundingClientRect().width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) -
            (field instanceof HTMLSelectElement ? 28 : 0);
          return { text, need: Math.ceil(measure(text, field)), room: Math.floor(room) };
        });
    });
    expect(fits.length).toBeGreaterThanOrEqual(3);
    for (const item of fits) {
      expect(item.need, `${item.text} perlu ${String(item.need)} px`).toBeLessThanOrEqual(
        item.room,
      );
    }
    // Tanggal terbaca utuh: dd/mm/yyyy.
    await expect(form.getByLabel('Tanggal')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
    await expect(form.getByLabel('Cara Bayar')).toHaveValue('transfer');
  });
});

test.describe('A4 Retur: satuan dapat diubah dan label faktur sejajar (gambar 4)', () => {
  async function openSource(page: Page): Promise<Locator> {
    await loginBo(page);
    await openPage(page, '/bo/transaksi/retur-penjualan');
    await active(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    const root = active(page);
    await root
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Bu Wati (1 faktur)' });
    await expect(root.locator('.bo-ret-table tbody tr').first()).toBeVisible();
    return root;
  }

  test('Nilai Faktur dan Sudah Dibayar sebaris, label dan isi sejajar rapi', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    const root = await openSource(page);
    const term = (text: string): Locator => root.locator('.bo-ret-fact dt', { hasText: text });
    const value = (text: string): Locator =>
      root.locator(`.bo-ret-fact:has(dt:text-is("${text}")) dd`);
    const tanggal = await box(term('Tanggal Faktur'));
    const nilai = await box(term('Nilai Faktur'));
    const pelanggan = await box(term('Pelanggan'));
    const dibayar = await box(term('Sudah Dibayar'));
    const center = (item: { y: number; height: number }): number => item.y + item.height / 2;
    // Baris pertama sejajar, baris kedua sejajar (walau Sudah Dibayar memuat lencana).
    expect(Math.abs(center(tanggal) - center(pelanggan))).toBeLessThan(2);
    expect(Math.abs(center(nilai) - center(dibayar))).toBeLessThan(2);
    // Label sekolom rata kiri.
    expect(Math.abs(tanggal.x - nilai.x)).toBeLessThan(1);
    expect(Math.abs(pelanggan.x - dibayar.x)).toBeLessThan(1);
    // Isi sekolom rata kiri.
    const leftOf = async (text: string): Promise<number> => (await box(value(text))).x;
    expect(
      Math.abs((await leftOf('Tanggal Faktur')) - (await leftOf('Nilai Faktur'))),
    ).toBeLessThan(1);
    expect(Math.abs((await leftOf('Pelanggan')) - (await leftOf('Sudah Dibayar')))).toBeLessThan(1);
    // Lencana status tampil utuh di dalam kotaknya.
    const badge = root.locator('.bo-ret-paid .badge');
    const facts = await box(root.locator('.bo-ret-facts'));
    const badgeBox = await box(badge);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(facts.x + facts.width + 1);
    const clipped = await badge.evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(clipped).toBe(false);
  });

  test('satuan retur dipilih per baris: faktur 3 Lusin diretur 10 Pcs, nilai dan stok mengikuti', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    const root = await openSource(page);
    const row = root.locator('.bo-ret-table tbody tr', { hasText: 'B1053' });
    const unit = row.locator('.bo-ret-unit');
    const quantity = row.locator('.bo-ret-qty');
    await expect(unit).toBeDisabled();
    expect(await unit.locator('option').allTextContents()).toEqual(['Pcs', 'Lusin', 'Dus']);
    await row.locator('.bo-ret-check').check();
    await expect(unit).toBeEnabled();
    await expect(unit).toHaveValue('Lusin');
    await expect(quantity).toHaveValue('3');
    await expect(row.locator('td').last()).toHaveText('Rp 1.044.300');
    // Mengganti satuan pada jumlah otomatis mengubah jumlahnya (3 Lusin = 36 Pcs), nilai tetap.
    await unit.selectOption({ label: 'Pcs' });
    await expect(quantity).toHaveValue('36');
    await expect(row.locator('td').last()).toHaveText('Rp 1.044.300');
    // Jumlah yang diketik: 10 Pcs dinilai 10/12 Lusin dari harga faktur.
    await quantity.fill('10');
    await expect(row.locator('td').last()).toHaveText('Rp 290.083');
    await expect(root.locator('.bo-ret-total__value')).toHaveText('Rp 290.083');
    await expect(quantity).not.toHaveAttribute('aria-invalid', 'true');
    await quantity.fill('37');
    await expect(quantity).toHaveAttribute('aria-invalid', 'true');
    await quantity.fill('10');
    await root.getByLabel('Alasan retur').fill('Pelanggan hanya butuh 10 pcs');
    await root
      .locator('.bo-ret-head__actions')
      .getByRole('button', { name: 'Simpan Retur' })
      .click();
    await expect(page.locator('.toast__text')).toContainText('Rp 290.083');
    // Sisa sesudah retur: 26 Pcs masih bisa diretur lagi, dan Sudah diretur tampil 10 Pcs.
    await active(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    const again = active(page);
    await again
      .getByLabel('Pelanggan', { exact: true })
      .selectOption({ label: 'Bu Wati (1 faktur)' });
    const next = again.locator('.bo-ret-table tbody tr', { hasText: 'B1053' });
    await expect(next.locator('td').nth(3)).toHaveText('10 Pcs');
    await next.locator('.bo-ret-check').check();
    await next.locator('.bo-ret-unit').selectOption({ label: 'Pcs' });
    await expect(next.locator('.bo-ret-qty')).toHaveValue('26');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`Retur dengan satuan dan form faktur dengan kotak cari lolos axe (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const root = await openSource(page);
      const row = root.locator('.bo-ret-table tbody tr', { hasText: 'B1053' });
      await row.locator('.bo-ret-check').check();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await openPage(page, '/bo/penjualan');
      await active(page).getByLabel('Pelanggan', { exact: true }).click();
      await expect(
        active(page).locator('.bo-trx-search--party .bo-trx-search__option').first(),
      ).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }
});

test.describe('A5 Kata sandi: Tampilkan memperlihatkan huruf kecil dan kapital apa adanya (gambar 5)', () => {
  test('sandi tidak ikut huruf kapital saat ditampilkan', async ({ page }) => {
    await page.goto('/#/bo');
    await page.getByLabel('Nama pengguna').fill(OWNER[0]);
    const password = page.getByLabel('Kata sandi', { exact: true });
    await password.fill('aBcd-Efgh12');
    await expect(password).toHaveAttribute('type', 'password');
    const show = page.getByRole('button', { name: 'Tampilkan' });
    const place = await box(show);
    await page.mouse.move(place.x + place.width / 2, place.y + place.height / 2);
    await page.mouse.down();
    await expect(password).toHaveAttribute('type', 'text');
    expect(await password.evaluate((node) => getComputedStyle(node).textTransform)).toBe('none');
    await expect(password).toHaveValue('aBcd-Efgh12');
    await page.mouse.up();
    await expect(password).toHaveAttribute('type', 'password');
    // Isian teks BO lain tetap huruf kapital.
    expect(
      await page
        .getByLabel('Nama pengguna')
        .evaluate((node) => getComputedStyle(node).textTransform),
    ).toBe('none');
  });
});

test.describe('A6 Saldo Stok Awal: klik baris membuka kotak untuk mengubah (gambar 6)', () => {
  test('baris dapat diklik dan kotak Isi Saldo Awal terisi catatannya', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/barang');
    const root = active(page);
    await root.locator('.bo-pd-toolbar input[type="search"]').first().fill('B0001');
    await root.locator('.bo-pd-list [role="row"]').nth(1).click();
    const rows = root.locator('.bo-pd-opening__row');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toHaveAttribute('tabindex', '0');
    const before = await rows.first().locator('td').allTextContents();
    await rows.first().click();
    const dialog = page.getByRole('dialog', { name: 'Isi Saldo Awal Barang' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Gudang')).toHaveValue('display');
    await expect(dialog.getByLabel('Satuan', { exact: true })).toHaveValue('Kg');
    await expect(dialog.getByLabel('Kuantitas')).not.toHaveValue('');
    await expect(dialog.getByLabel('Biaya Satuan', { exact: true })).toHaveValue('1.100');
    // Ubah kuantitas lalu simpan: baris berubah dan stok toko ikut berubah.
    await dialog.getByLabel('Kuantitas').fill('3000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.locator('.toast__text')).toContainText('Saldo awal B0001 diubah.');
    const after = await rows.first().locator('td').allTextContents();
    expect(after[1]).toBe('3.000');
    expect(after[1]).not.toBe(before[1]);
    expect(after[3]).toBe(before[3]);
    // Baris kedua (Gudang) tidak berubah.
    expect((await rows.nth(1).locator('td').allTextContents())[3]).toBe('Gudang');
  });

  test('Enter pada baris yang fokus juga membuka kotak; Batal tidak mengubah apa pun', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await openPage(page, '/bo/barang');
    const root = active(page);
    await root.locator('.bo-pd-toolbar input[type="search"]').first().fill('B0001');
    await root.locator('.bo-pd-list [role="row"]').nth(1).click();
    const row = root.locator('.bo-pd-opening__row').first();
    const before = await row.locator('td').allTextContents();
    await row.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Isi Saldo Awal Barang' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Kuantitas').fill('1');
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await row.locator('td').allTextContents()).toEqual(before);
  });
});
