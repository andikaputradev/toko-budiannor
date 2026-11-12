import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  loginPosRaw,
  openDrawerItem,
  openOrderMenu,
  savePart,
  settle,
  typeAmount,
} from './helpers/routes';

// Revisi POS putaran ketiga (dokumen klien "Revisi Penyesuaian Pos"). Nomor A, B, C, D mengikuti
// docs/superpowers/specs/2026-11-11-revisi-pos-3-design.md.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SIZES = [
  { width: 1366, height: 640 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
] as const;

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

function card(page: Page, name: string): Locator {
  return page.locator('.pos-card', { hasText: name });
}

async function noScroll(target: Locator): Promise<{ scrollHeight: number; clientHeight: number }> {
  return target.evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
}

async function expectNoScroll(target: Locator, message: string): Promise<void> {
  const { scrollHeight, clientHeight } = await noScroll(target);
  expect(scrollHeight, message).toBeLessThanOrEqual(clientHeight);
}

async function addByPrice(page: Page, product: string, unit: string): Promise<void> {
  await card(page, product).locator(`.pos-card__price[data-unit="${unit}"]`).click();
}

async function openDetail(page: Page): Promise<Locator> {
  await page.locator('.pos-order__item .pos-bill__name').first().click();
  const dialog = page.getByRole('dialog', { name: 'Detail Barang' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('A. Pesanan Baru', () => {
  test('A1: Enter mengirim PIN tanpa mouse, juga saat fokus di tombol angka', async ({ page }) => {
    await page.goto('/#/pos');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    // Fokus ada di kartu kasir, bukan dipindah ke tombol "1"; angka datang dari papan ketik.
    await page.keyboard.type('123456');
    await expect(page.locator('.pinpad__dot.is-filled')).toHaveCount(6);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('A1: Enter setelah mengetik di papan angka layar tetap masuk (fokus di tombol)', async ({
    page,
  }) => {
    await page.goto('/#/pos');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    const key = page.locator('.pinpad__key', { hasText: /^1$/ });
    await key.click();
    await expect(key).toBeFocused();
    await page.keyboard.type('23456');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('A1: Enter dengan PIN salah menampilkan galat dan mengosongkan isian', async ({ page }) => {
    await page.goto('/#/pos');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    await page.keyboard.type('111111');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'PIN salah' })).toBeVisible();
    await expect(page.locator('.pinpad__dot.is-filled')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/pos$/);
  });

  test('A2: Akhiri Shift langsung keluar ke layar PIN', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Selesai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Selesai Shift' });
    await dialog.getByRole('button', { name: 'Akhiri Shift' }).click();
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    // Masuk lagi: shift baru harus dimulai lagi.
    await page.getByRole('radio', { name: /Dewi/ }).click();
    await page.keyboard.type('123456');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
  });

  test('A3: kartu menampilkan Toko, Gudang, dan No Rak; stok PO tidak tampil', async ({ page }) => {
    await loginPos(page);
    const semen = card(page, 'SEMEN GRESIK 40KG');
    const stock = semen.locator('.pos-card__stock');
    await expect(stock.locator('dt')).toHaveText(['Toko', 'Gudang', 'No Rak']);
    await expect(stock.locator('dd')).toHaveText(['28 SAK', '800 SAK', '257B']);
    await expect(page.locator('.pos-card__stock dt', { hasText: /^PO$/ })).toHaveCount(0);
    // Modal satuan juga memuat No Rak dan tidak lagi memuat PO.
    await semen.locator('.pos-card__main').focus();
    await page.keyboard.press('Shift+Enter');
    const dialog = page.getByRole('dialog', { name: 'SEMEN GRESIK 40KG' });
    await expect(dialog).toContainText('Toko: 28 SAK');
    await expect(dialog).toContainText('Gudang: 800 SAK');
    await expect(dialog).toContainText('No Rak: 257B');
    await expect(dialog).not.toContainText(/\bPO\b/);
  });

  test('A4: stok toko kosong tidak masuk keranjang dan memberi peringatan', async ({ page }) => {
    await loginPos(page);
    const gembok = card(page, 'GEMBOK KODAI 30MM');
    await expect(gembok.locator('.pos-card__main')).toHaveAttribute('aria-disabled', 'true');
    await expect(gembok.locator('.pos-card__soldout')).toHaveText('Stok kosong');
    // Kartu bertanda aria-disabled tetap bisa diklik kasir (hanya peringatan), jadi klik dipaksa.
    await gembok.locator('.pos-card__main').click({ force: true });
    await expect(page.locator('.toast__text')).toContainText(
      'Stok GEMBOK KODAI 30MM kosong. Barang tidak bisa dimasukkan ke keranjang.',
    );
    await expect(page.locator('.pos-order__item')).toHaveCount(0);
    // Tahan lama dan Shift+Enter juga memberi peringatan, bukan membuka modal satuan.
    await gembok.locator('.pos-card__main').focus();
    await page.keyboard.press('Shift+Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('A4: jumlah melebihi stok toko ditolak dengan sisa stok', async ({ page }) => {
    await loginPos(page);
    // Cat Spray Pylox: stok toko 7 KLG; satu dus berisi 12.
    await addByPrice(page, 'CAT SPRAY PYLOX', 'DOS');
    await expect(page.locator('.toast__text')).toContainText(
      'Stok toko CAT SPRAY PYLOX 109 BLACK hanya tersisa 7 KLG.',
    );
    await expect(page.locator('.pos-order__item')).toHaveCount(0);
    await addByPrice(page, 'CAT SPRAY PYLOX', 'KLG');
    await expect(page.locator('.pos-order__item')).toHaveCount(1);
  });

  test('A4: modal satuan menolak jumlah di atas stok dan tetap terbuka', async ({ page }) => {
    await loginPos(page);
    await card(page, 'CAT SPRAY PYLOX').locator('.pos-card__main').focus();
    await page.keyboard.press('Shift+Enter');
    const dialog = page.getByRole('dialog', { name: 'CAT SPRAY PYLOX 109 BLACK' });
    // Isian jumlah bernilai 1 saat dibuka dan papan angka menambah di belakangnya: kosongkan dulu.
    await dialog.getByRole('button', { name: 'Hapus', exact: true }).click();
    await dialog.getByRole('button', { name: '8', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tambahkan ke Bill' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.field__error')).toContainText('hanya tersisa 7 KLG');
    await dialog.getByRole('button', { name: 'Hapus', exact: true }).click();
    await dialog.getByRole('button', { name: '7', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tambahkan ke Bill' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pos-order__item')).toHaveCount(1);
  });

  test('A5: nama pelanggan tampil di atas daftar keranjang', async ({ page }) => {
    await loginPos(page);
    const customer = page.locator('.pos-bill-panel > .pos-customer-btn .pos-customer-btn__text');
    await expect(customer).toHaveText('UMUM (ECERAN)');
    const above = await page.evaluate(() => {
      const panel = document.querySelector('.pos-bill-panel');
      const button = panel?.querySelector('.pos-customer-btn');
      const title = panel?.querySelector('.pos-order__title');
      if (!button || !title) {
        return false;
      }
      return Boolean(button.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(above).toBe(true);
    // Tidak ada lagi tombol pelanggan di bilah alat katalog.
    await expect(page.locator('.pos-toolbar .pos-customer-btn')).toHaveCount(0);
    await chooseCustomer(page, 'Kevin Wahyudi');
    await expect(customer).toHaveText('PL387 - KEVIN WAHYUDI (ECERAN)');
  });

  test('A6: header memuat hari dan tanggal, bukan "Shift Dimulai"', async ({ page }) => {
    await loginPos(page);
    const header = page.locator('.pos-topbar');
    await expect(header.locator('.pos-topbar__clock')).toHaveText(
      /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu), \d{1,2} (Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4} - \d{2}:\d{2}$/,
    );
    await expect(header).not.toContainText('Shift Dimulai');
    await expect(page.locator('.pos-shiftchip')).toHaveCount(0);
  });

  test('A7: barang tanpa foto menampilkan huruf awal nama (SG untuk Semen Gresik)', async ({
    page,
  }) => {
    await loginPos(page);
    const tiles = page.locator('.pos-card .pos-photo--initials');
    await expect(tiles.first()).toBeVisible();
    const pairs = await page.locator('.pos-card:has(.pos-photo--initials)').evaluateAll((nodes) =>
      nodes.slice(0, 12).map((node) => ({
        name: node.querySelector('.pos-card__name')?.getAttribute('title') ?? '',
        text: node.querySelector('.pos-photo--initials')?.textContent ?? '',
      })),
    );
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      const expected = pair.name
        .split(/\s+/)
        .filter((word) => word !== '')
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join('');
      expect(pair.text, pair.name).toBe(expected);
    }
    // Barang proposal memakai fotonya sendiri.
    await expect(card(page, 'SEMEN GRESIK 40KG').locator('img.pos-photo')).toBeVisible();
  });

  test('A8: harga kartu dan keranjang mengikuti kategori pelanggan Ecer atau Grosir', async ({
    page,
  }) => {
    await loginPos(page);
    const engsel = card(page, 'ENGSEL BELLUCCI');
    await expect(engsel.locator('.pos-card__price[data-unit="PSG"] .pos-card__amount')).toHaveText(
      'Rp 65.000',
    );
    await addByPrice(page, 'ENGSEL BELLUCCI', 'PSG');
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 65.000');
    await chooseCustomer(page, 'Toko Maju Jaya');
    await expect(page.locator('.pos-bill-panel > .pos-customer-btn')).toContainText('(GROSIR)');
    await expect(engsel.locator('.pos-card__price[data-unit="PSG"] .pos-card__amount')).toHaveText(
      'Rp 55.000',
    );
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 55.000');
  });

  test('A9: menu titik tiga berisi Open Bill, Diskon Transaksi, dan Mulai Pesanan Baru', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Open Bill',
      'Diskon Transaksi',
      'Mulai Pesanan Baru',
    ]);
    await page.keyboard.press('Escape');
  });

  test('A9: Open Bill menahan pesanan seperti Tahan Bill', async ({ page }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await openOrderMenu(page, 'Open Bill');
    await expect(page.locator('.toast__text')).toContainText('ditahan');
    await expect(page.locator('.pos-order__item')).toHaveCount(0);
    await expect(page.locator('.pos-badge')).toHaveText('4');
  });

  test('A9: Mulai Pesanan Baru meminta konfirmasi lalu mengosongkan keranjang', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await chooseCustomer(page, 'Kevin Wahyudi');
    await openOrderMenu(page, 'Mulai Pesanan Baru');
    const dialog = page.getByRole('dialog', { name: 'Konfirmasi Pesanan Baru' });
    await expect(dialog).toContainText('Barang yang ada di keranjang tidak akan tersimpan.');
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(page.locator('.pos-order__item')).toHaveCount(1);
    await openOrderMenu(page, 'Mulai Pesanan Baru');
    await page
      .getByRole('dialog', { name: 'Konfirmasi Pesanan Baru' })
      .getByRole('button', { name: 'Mulai Baru' })
      .click();
    await expect(page.locator('.pos-order__item')).toHaveCount(0);
    await expect(
      page.locator('.pos-bill-panel > .pos-customer-btn .pos-customer-btn__text'),
    ).toHaveText('UMUM (ECERAN)');
  });

  test('A9: Diskon Transaksi (Supervisor) mengurangi total dan tampil di panel dan layar bayar', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await openOrderMenu(page, 'Diskon Transaksi');
    const dialog = page.getByRole('dialog', { name: 'Diskon Transaksi' });
    await dialog.getByRole('radio', { name: 'Nominal' }).click();
    await dialog.locator('.pos-amount').getByRole('button', { name: '1', exact: true }).click();
    await dialog.locator('.pos-amount').getByRole('button', { name: '000', exact: true }).click();
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 1.000');
    await dialog.getByRole('button', { name: 'Terapkan' }).click();
    await expect(dialog).toBeHidden();
    const panel = page.locator('.pos-bill-panel');
    await expect(panel.locator('.pos-order__line--discount')).toContainText('-Rp 1.000');
    await expect(panel.getByRole('button', { name: /^Bayar/ })).toContainText('Rp 139.000');
    await panel.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: /Subtotal/ }).click();
    await expect(page.locator('.pos-pay__breakdown')).toContainText('Diskon Transaksi');
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 139.000');
  });

  test('A9: Kasir butuh PIN Supervisor atau Owner untuk Diskon Transaksi', async ({ page }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await openOrderMenu(page, 'Diskon Transaksi');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('PIN Supervisor atau Owner')).toBeVisible();
  });

  test('A9: Frontliner tidak melihat Diskon Transaksi', async ({ page }) => {
    await loginPosRaw(page, 'Agus');
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    await expect(page.getByRole('menuitem', { name: 'Diskon Transaksi' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Open Bill' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Mulai Pesanan Baru' })).toBeVisible();
  });

  test('A10: barang promo bertanda PROMO di kartu', async ({ page }) => {
    await loginPos(page);
    await expect(card(page, 'CAT SPRAY PYLOX').locator('.pos-card__promo')).toHaveText('PROMO');
    await expect(card(page, 'SEMEN GRESIK').locator('.pos-card__promo')).toHaveCount(0);
  });

  test('B4 promo: barang promo masuk keranjang berdiskon otomatis dan bertanda PROMO', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'CAT SPRAY PYLOX', 'KLG');
    await expect(page.locator('.pos-order__item .pos-order__promo')).toHaveText('PROMO');
    await expect(page.locator('.pos-order__qty')).toContainText('10%');
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 27.000');

    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await expect(page.locator('.pos-order__promo')).toHaveCount(1);
  });

  test('A11: nama barang satu baris (maksimal 32 karakter) dan kode barang ikut tampil', async ({
    page,
  }) => {
    await loginPos(page);
    const names = await page.locator('.pos-card__name').evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        full: node.getAttribute('title'),
        oneLine: node.scrollHeight <= node.clientHeight + 1,
      })),
    );
    expect(names.length).toBeGreaterThan(8);
    for (const item of names) {
      expect(item.text.length, item.full ?? '').toBeLessThanOrEqual(32);
      expect(item.oneLine, item.full ?? '').toBe(true);
    }
    await expect(card(page, 'SEMEN GRESIK').locator('.pos-card__code')).toHaveText('P001');
    await addByPrice(page, 'LEM FOX', 'KLG');
    await expect(page.locator('.pos-order__item .pos-bill__code')).toHaveText('P002');
    await expect(page.locator('.pos-order__item .pos-bill__text')).toHaveText('LEM FOX 70 GRAM');
  });

  test('A12: kartu barang ringkas: tidak memanjang ke bawah', async ({ page }) => {
    await loginPos(page);
    const heights = await page
      .locator('.pos-card')
      .evaluateAll((nodes) => nodes.slice(0, 8).map((node) => node.getBoundingClientRect().height));
    for (const height of heights) {
      expect(height).toBeLessThanOrEqual(330);
    }
    const lem = await card(page, 'LEM FOX').boundingBox();
    expect(lem?.height ?? 999).toBeLessThanOrEqual(330);
  });
});

test.describe('B. Modal barang tanpa scroll bar', () => {
  for (const size of SIZES) {
    test(`modal satuan dan Detail Barang muat satu layar di ${String(size.width)} x ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await loginPos(page, 'Ibu Sinta');
      await card(page, 'LEM FOX').locator('.pos-card__main').focus();
      await page.keyboard.press('Shift+Enter');
      const units = page.getByRole('dialog', { name: 'LEM FOX 70 GRAM' });
      await expect(units).toBeVisible();
      await expectNoScroll(units, 'modal satuan');
      await expect(units.getByRole('radio')).toHaveText([/KLG/, /LSN/, /DOS/]);
      await units.getByRole('button', { name: 'Batal' }).click();

      await addByPrice(page, 'LEM FOX', 'LSN');
      const detail = await openDetail(page);
      await expectNoScroll(detail, 'Detail Barang awal');
      await expectNoScroll(detail.locator('.modal__body'), 'isi Detail Barang awal');
      await detail.getByRole('button', { name: /^Berikan Diskon/ }).click();
      await detail.getByRole('radio', { name: 'Nominal' }).click();
      await detail.locator('.pos-amount').getByRole('button', { name: '5', exact: true }).click();
      await expectNoScroll(detail, 'Detail Barang diskon');
      await expectNoScroll(detail.locator('.modal__body'), 'isi Detail Barang diskon');
      await detail.getByRole('button', { name: /^Ubah Harga/ }).click();
      await expectNoScroll(detail, 'Detail Barang ubah harga');
      await expectNoScroll(detail.locator('.modal__body'), 'isi Detail Barang ubah harga');
    });
  }

  test('B2: Detail Barang hanya memuat diskon dan ubah harga (tanpa Tenaga Penjual, Cek Stok, Catatan)', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    const dialog = await openDetail(page);
    await expect(dialog.getByRole('button', { name: /^Berikan Diskon/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Ubah Harga/ })).toBeVisible();
    await expect(dialog).not.toContainText('Tenaga Penjual');
    await expect(dialog).not.toContainText('Cek Stok');
    await expect(dialog).not.toContainText('Catatan');
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.locator('textarea')).toHaveCount(0);
  });

  test('B2: Detail Barang untuk Kasir tetap menawarkan diskon dan ubah harga dengan PIN', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: /^Berikan Diskon/ }).click();
    await expect(page.getByLabel('PIN Supervisor atau Owner')).toBeVisible();
  });

  test('Detail Barang: kolom diskon bertuliskan per satuan dan menyimpan nilai per satuan', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: /^Berikan Diskon/ }).click();
    await dialog.getByRole('radio', { name: 'Nominal' }).click();
    await expect(dialog.locator('.pos-line__panel:not([hidden]) .pos-amount > p')).toHaveText(
      'Nilai diskon per satuan (dikali jumlah)',
    );
    for (const digit of '5000') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    // 3 sak x Rp 70.000 = 210.000, dikurangi 3 x Rp 5.000 = 195.000.
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 195.000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.locator('.pos-order__item .pos-order__qty')).toContainText('-Rp 5.000/SAK');
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 195.000');
  });

  test('D2: ubah harga tidak menampilkan harga asli maupun harga dicoret', async ({ page }) => {
    await loginPos(page, 'Ibu Sinta');
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: /^Ubah Harga/ }).click();
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    for (const digit of '65000') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(dialog).not.toContainText('Harga asli');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.locator('.pos-order__amount')).toHaveText('Rp 65.000');
    await expect(page.locator('.pos-order s')).toHaveCount(0);
    await expect(page.locator('.pos-order__qty')).toHaveText('QTY : 1 X 65.000');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await expect(page.locator('.pos-pay__summary s')).toHaveCount(0);
    await expect(page.locator('.pos-pay__summary')).not.toContainText('70.000');
  });
});

test.describe('C. Pembayaran', () => {
  async function toPay(page: Page, user = 'Dewi'): Promise<void> {
    await loginPos(page, user);
    await addByPrice(page, 'CAT SPRAY PYLOX', 'KLG');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    // 30.000 dikurangi promo bawaan 10 persen.
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 27.000');
  }

  test('C1: Tunai memberi Uang Pas dan dua pecahan di atas total', async ({ page }) => {
    await toPay(page);
    const quick = page.getByRole('group', { name: 'Nominal Penerimaan' });
    await expect(quick.getByRole('button')).toHaveText(['Uang Pas', '50.000', '100.000']);
    await quick.getByRole('button', { name: '50.000', exact: true }).click();
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 23.000');
    await quick.getByRole('button', { name: 'Uang Pas' }).click();
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 0');
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
  });

  test('C1: pecahan mengikuti total pesanan (70.000 memberi 100.000 dan 150.000)', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await expect(
      page.getByRole('group', { name: 'Nominal Penerimaan' }).getByRole('button'),
    ).toHaveText(['Uang Pas', '100.000', '150.000']);
  });

  test('D7: papan nominal memuat 0, 00, dan 000 dan menambah nol sesuai tombol', async ({
    page,
  }) => {
    await toPay(page);
    const pad = page.locator('.pos-pay__cash .pos-moneypad');
    await expect(pad.getByRole('button')).toHaveText([
      '1',
      '2',
      '3',
      'C',
      '4',
      '5',
      '6',
      'Hapus',
      '7',
      '8',
      '9',
      'OK',
      '0',
      '00',
      '000',
    ]);
    await pad.getByRole('button', { name: '1', exact: true }).click();
    await pad.getByRole('button', { name: '00', exact: true }).click();
    await expect(page.locator('.pos-pay__cash .pos-amount__value')).toHaveText('Rp 100');
    await pad.getByRole('button', { name: '000', exact: true }).click();
    await expect(page.locator('.pos-pay__cash .pos-amount__value')).toHaveText('Rp 100.000');
    await pad.getByRole('button', { name: '0', exact: true }).click();
    await expect(page.locator('.pos-pay__cash .pos-amount__value')).toHaveText('Rp 1.000.000');
  });

  test('C2: Non-Tunai hanya QRIS, Transfer, dan EDC; QRIS tanpa barcode', async ({ page }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
    const methods = page.getByRole('group', { name: 'Kanal pembayaran' });
    await expect(methods.getByRole('button')).toHaveText(['QRIS', 'Transfer', 'EDC']);
    await expect(
      page.getByRole('button', { name: /Gopay|OVO|Shopee|BCA|BRI|Mandiri/ }),
    ).toHaveCount(0);
    await methods.getByRole('button', { name: 'QRIS', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.pos-qr')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bayar', exact: true })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
  });

  test('C3: Split maksimal tiga pembayaran dan modal Pembayaran N tanpa scroll bar', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await expect(page.locator('.pos-pay__part')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Tambah Pembayaran' })).toHaveCount(0);
    await page.getByRole('button', { name: /^Pembayaran 1/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Pembayaran 1' });
    await expectNoScroll(dialog, 'Pembayaran 1 Tunai');
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await expect(
      dialog.getByRole('group', { name: 'Kanal pembayaran' }).getByRole('button'),
    ).toHaveText(['QRIS', 'Transfer', 'EDC']);
    await expectNoScroll(dialog, 'Pembayaran 1 Non-Tunai');
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await savePart(page, 1, { digits: '10000' });
    await savePart(page, 2, { channel: 'QRIS', digits: '10000' });
    await savePart(page, 3, { channel: 'EDC', digits: '10000' });
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
  });

  test('C4: Piutang menawarkan 7, 14, dan 30 hari', async ({ page }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    const terms = page.getByRole('group', { name: 'Tempo' });
    await expect(terms.getByRole('button')).toHaveText(['7 hari', '14 hari', '30 hari']);
    await expect(page.getByRole('button', { name: '45 hari' })).toHaveCount(0);
    await terms.getByRole('button', { name: '14 hari' }).click();
    await expect(terms.getByRole('button', { name: '14 hari' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('C5: kolom catatan ada di semua tab, bertahan antar tab, dan tersimpan pada penjualan', async ({
    page,
  }) => {
    await toPay(page);
    const note = page.getByLabel('Masukkan Catatan (Opsional)');
    for (const tab of ['Tunai', 'Non-Tunai', 'Split', 'Piutang']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(note, tab).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
    await note.fill('Titip di pos satpam');
    await page.getByRole('tab', { name: 'Tunai', exact: true }).click();
    await expect(note).toHaveValue('Titip di pos satpam');
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await expect(page.locator('.pos-history__note')).toContainText('Titip di pos satpam');
  });

  for (const size of SIZES) {
    test(`semua tab pembayaran muat satu layar tanpa scroll bar di ${String(size.width)} x ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await toPay(page);
      const panel = page.locator('.pos-pay__panel');
      for (const tab of ['Tunai', 'Non-Tunai', 'Split', 'Piutang']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        if (tab === 'Tunai') {
          await typeAmount(page, '5');
        }
        await expectNoScroll(panel, `tab ${tab}`);
      }
      // Keadaan piutang ditolak (pelanggan Umum) dengan tombol aksi tetap satu layar.
      await expect(page.locator('.pos-pay__message')).toContainText('Piutang');
      await expectNoScroll(panel, 'piutang ditolak');
      // Kurang bayar pada tab Tunai.
      await page.getByRole('tab', { name: 'Tunai', exact: true }).click();
      await typeAmount(page, '5');
      await expect(page.locator('.pos-pay__message')).toContainText('kurang');
      await expectNoScroll(panel, 'tunai kurang bayar');
    });
  }
});

test.describe('D. Tambahan fitur POS', () => {
  test('D3: Open Bill: satu barang tampak, "+N Barang Lainnya" membuka semuanya', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Open Bill');
    await expect(page.getByRole('heading', { name: 'Open Bill', level: 1 })).toBeVisible();
    const cardB2 = page.locator('.pos-bill-card', { hasText: 'B-0002' });
    await expect(cardB2.locator('.pos-bill-card__line')).toHaveCount(1);
    const more = cardB2.getByRole('button', { name: /^\+ 2 Barang Lainnya/ });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(cardB2.locator('.pos-bill-card__line')).toHaveCount(3);
    const close = cardB2.getByRole('button', { name: 'Tutup' });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    await close.click();
    await expect(cardB2.locator('.pos-bill-card__line')).toHaveCount(1);
    // Bill satu barang tidak punya tombol "Barang Lainnya".
    await expect(
      page.locator('.pos-bill-card', { has: page.locator('.pos-bill-card__line') }).first(),
    ).toBeVisible();
  });

  test('D3: kartu Open Bill memuat nomor, pelanggan, pembuat, waktu, subtotal, dan Bayar', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Open Bill');
    const first = page.locator('.pos-bill-card').first();
    await expect(first.locator('.pos-bill-card__info .t-label')).toHaveText([
      'Nomor Open Bill',
      'Nama pelanggan',
      'Dibuat Oleh',
      'Waktu Open Bill',
    ]);
    await expect(first.locator('.pos-bill-card__sum').first()).toContainText('Subtotal');
    await expect(first.getByRole('button', { name: /^Bayar Rp/ })).toBeVisible();
    await expect(first.getByRole('button', { name: 'Cetak Struk Draf' })).toBeVisible();
  });

  test('D3: Bayar dari Open Bill memanggil bill lalu membuka layar bayar', async ({ page }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Open Bill');
    await page
      .locator('.pos-bill-card', { hasText: 'B-0001' })
      .getByRole('button', { name: /^Bayar Rp/ })
      .click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 340.000');
  });

  test('D4: pilihan Biaya sesuai dokumen klien', async ({ page }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Biaya');
    await page
      .getByRole('button', { name: /Catat Biaya|Tambah/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.dropdown__button').click();
    await expect(dialog.getByRole('option')).toHaveText([
      'Bensin Armada',
      'Bayar Ekspedisi',
      'Uang Makan Karyawan',
      'Upah Bongkar Muat',
      'Biaya Lainnya',
    ]);
  });

  test('D5: retur ikut terposting di Riwayat dengan nomor, lencana, dan detail', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const saleNumber =
      (await page.locator('.pos-history__item .pos-history__no').first().textContent()) ?? '';
    await page.getByRole('button', { name: 'Retur', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`^Retur Penjualan ${saleNumber}`) });
    await dialog.locator('.pos-return__all input').check();
    await dialog.locator('input.pos-return__amount').fill('70000');
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Retur Berhasil' })
      .getByRole('button', { name: 'Selesai' })
      .click();
    const row = page.locator('.pos-history__item--retur').first();
    await expect(row.locator('.pos-history__no')).toHaveText(`${saleNumber}.1`);
    await expect(row.locator('.pos-status--retur')).toHaveText('Retur');
    await row.click();
    const detail = page.locator('.pos-history__detail');
    await expect(detail.getByRole('heading', { name: 'Informasi Retur' })).toBeVisible();
    await expect(detail).toContainText('Alasan retur');
    await expect(detail).toContainText('Pengembalian Barang');
    await expect(
      detail.getByRole('heading', { name: 'Foto Bukti Retur Barang dan Jasa' }),
    ).toBeVisible();
    await expect(detail.locator('[data-row="foto-retur"]')).toContainText('Tanpa foto');
    await expect(detail.locator('[data-row="total-dikembalikan"]')).toHaveText('Rp 70.000');
    await expect(detail).toContainText('Total Uang Dikembalikan');
    // Dari penjualan asal ada tautan Riwayat Retur.
    await detail.locator('[data-row="penjualan-asal"]').click();
    await expect(detail.getByRole('heading', { name: 'Riwayat Retur' })).toBeVisible();
    await detail.getByRole('button', { name: new RegExp(`^${saleNumber}\\.1`) }).click();
    await expect(detail.getByRole('heading', { name: 'Informasi Retur' })).toBeVisible();
  });

  test('D6: katalog Daftar menampilkan foto, nama dan kode, chip harga, dan stok di kanan', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    await page.getByRole('radio', { name: /Daftar/ }).click();
    await openDrawerItem(page, 'Pesanan Baru');
    await expect(page.locator('.pos-grid--daftar')).toBeVisible();
    const lem = card(page, 'LEM FOX');
    const boxes = await lem.evaluate((node) => {
      const main = node.querySelector('.pos-card__main')?.getBoundingClientRect();
      const stock = node.querySelector('.pos-card__stock')?.getBoundingClientRect();
      const prices = [...node.querySelectorAll('.pos-card__price')].map((price) => {
        const box = price.getBoundingClientRect();
        return { top: box.top, left: box.left };
      });
      return { main, stock, prices };
    });
    // Stok di kanan baris, harga per satuan berderet sejajar (chip), tidak menumpuk ke bawah.
    expect((boxes.stock?.left ?? 0) > (boxes.main?.left ?? 0) + 300).toBe(true);
    expect(new Set(boxes.prices.map((price) => Math.round(price.top))).size).toBe(1);
    await expect(lem.locator('.pos-card__stock dt')).toHaveText(['Toko', 'Gudang', 'No Rak']);
    await expect(lem.locator('.pos-card__code')).toHaveText('P002');
    const height = (await lem.boundingBox())?.height ?? 999;
    expect(height).toBeLessThanOrEqual(140);
  });

  test('D8: tema Merah dan Kuning tersedia sebagai pilihan warna dan berlaku langsung', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    const themes = page.getByRole('radiogroup', { name: 'Tema' });
    await expect(themes.getByRole('radio')).toHaveText([
      'Oranye',
      'Terakota',
      'Teal',
      'Biru',
      'Hijau',
      'Ungu',
      'Merah',
      'Kuning',
    ]);
    for (const name of ['Merah', 'Kuning']) {
      await themes.getByRole('radio', { name }).click();
      await expect(themes.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate(() => document.documentElement.dataset['posTheme'])).toBe(
        name.toLowerCase(),
      );
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent-default')
          .trim(),
      );
      expect(accent, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

test.describe('axe pada layar dan modal revisi', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`layar jual, menu, modal satuan, Detail Barang, bayar, dan Open Bill (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await loginPos(page, 'Ibu Sinta');
      await addByPrice(page, 'LEM FOX', 'LSN');
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: 'Opsi pesanan' }).click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      const detail = await openDetail(page);
      await detail.getByRole('button', { name: /^Berikan Diskon/ }).click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Bayar/ }).click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      for (const tab of ['Non-Tunai', 'Split', 'Piutang']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await settle(page);
        expect(
          (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
          tab,
        ).toEqual([]);
      }
      await openDrawerItem(page, 'Open Bill');
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.locator('.pos-bill-card__more').first().click();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }
});
