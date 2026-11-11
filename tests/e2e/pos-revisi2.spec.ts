import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  loginPosRaw,
  openDrawerItem,
  openOrderMenu,
  sellFirstProduct,
  sellSplitThree,
  settle,
  typeAmount,
} from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEME_KEY = 'toko-budiannor-tema-pos';
const MODE_KEY = 'toko-budiannor-mode-pos';

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

async function seedStorage(page: Page, values: Record<string, string | null>): Promise<void> {
  await page.goto('/#/pos');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  }, values);
  await page.reload();
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  return page.getByRole('dialog', { name: 'Toko Budiannor' });
}

test.describe('tampilan', () => {
  test('mode Otomatis mengikuti emulateMedia gelap dan terang tanpa memuat ulang', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-mode', 'otomatis');
    await expect(root).toHaveAttribute('data-pos-scheme', 'terang');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-pos-scheme', 'terang');
  });

  test('memilih palet Biru mengubah warna aksen yang dipakai tombol utama', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    const accent = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent-default')
          .trim()
          .toLowerCase(),
      );
    expect(await accent()).toBe('#b94f00');
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    await page
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Biru' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-pos-theme', 'biru');
    expect(await accent()).toBe('#1d4ed8');
  });

  test('pilihan Mode Gelap bertahan setelah muat ulang dan mengalahkan perangkat terang', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    await page
      .getByRole('radiogroup', { name: 'Mode Tampilan' })
      .getByRole('radio', { name: 'Gelap' })
      .click();
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await page.reload();
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('tema gelap lama pada penyimpanan menjadi Oranye mode Gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(page, { [THEME_KEY]: 'gelap', [MODE_KEY]: null });
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-theme', 'oranye');
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('layar jual lolos axe pada mode gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStorage(page, { [THEME_KEY]: 'oranye', [MODE_KEY]: 'gelap' });
    await loginPos(page);
    await expect(page.locator('html')).toHaveAttribute('data-pos-scheme', 'gelap');
    const pageBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-bg-page')
        .trim()
        .toLowerCase(),
    );
    expect(pageBackground).toBe('#16181b');
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
  });
});

test.describe('foto kartu barang', () => {
  async function search(page: Page, text: string): Promise<void> {
    await page.locator('#pos-search').fill(text);
    await page.locator('#pos-search').press('Enter');
  }

  // Revisi ketiga: barang tanpa foto sendiri menampilkan huruf awal nama, bukan foto kategori.
  test('barang bangkitan tanpa foto sendiri menampilkan huruf awal nama', async ({ page }) => {
    await loginPos(page);
    await search(page, 'Cat Tembok');
    const card = page.locator('.pos-card', { hasText: /CAT TEMBOK/i }).first();
    await expect(card.locator('img.pos-photo--img')).toHaveCount(0);
    const tile = card.locator('.pos-photo--initials');
    await expect(tile).toHaveText('CT');
  });

  const BARU: readonly (readonly [string, RegExp, string])[] = [
    ['Pasir', /PASIR/i, 'P'],
    ['Stop Kontak', /STOP KONTAK/i, 'SK'],
    ['Seng Gelombang', /SENG GELOMBANG/i, 'SG'],
  ];

  for (const [kata, pola, inisial] of BARU) {
    test(`barang bangkitan ${kata} memakai huruf awal ${inisial}, bukan foto atau kotak kosong`, async ({
      page,
    }) => {
      await loginPos(page);
      await search(page, kata);
      const card = page.locator('.pos-card', { hasText: pola }).first();
      const tile = card.locator('.pos-photo--initials');
      await expect(tile).toHaveText(new RegExp(`^${inisial}`));
      await expect(card.locator('img.pos-photo--img')).toHaveCount(0);
      await expect(card.locator('span.pos-photo:not(.pos-photo--initials)')).toHaveCount(0);
    });
  }

  test('barang proposal tetap memakai fotonya sendiri, bukan huruf awal', async ({ page }) => {
    await loginPos(page);
    const semen = page.locator('.pos-card', { hasText: /SEMEN GRESIK/i }).first();
    await expect(semen.locator('img.pos-photo--img')).toHaveAttribute(
      'src',
      /produk\/semen-gresik-40kg\.webp$/,
    );
    await expect(semen.locator('.pos-photo--initials')).toHaveCount(0);
  });
});

test.describe('Retur untuk Kasir', () => {
  test('Kasir melakukan Retur dari riwayat sampai Retur Berhasil', async ({ page }) => {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: /Retur Penjualan/ });
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Retur Berhasil' })).toBeVisible();
  });
});

test.describe('Kirim Struk', () => {
  async function openShare(page: Page) {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Pembayaran Berhasil' });
    await done.getByRole('button', { name: 'Kirim WA' }).click();
    return page.getByRole('dialog', { name: 'Kirim Struk' });
  }

  test('memiliki baris WA dan baris email masing-masing dengan tombol Kirim', async ({ page }) => {
    const share = await openShare(page);
    await expect(share.getByLabel('Nomor WhatsApp')).toBeVisible();
    await expect(share.getByLabel('Alamat Email')).toBeVisible();
    await expect(share.getByRole('button', { name: 'Kirim lewat WhatsApp' })).toBeVisible();
    await expect(share.getByRole('button', { name: 'Kirim lewat email' })).toBeVisible();
  });

  test('email salah menampilkan galat tanpa menutup modal', async ({ page }) => {
    const share = await openShare(page);
    await share.getByLabel('Alamat Email').fill('budi@toko');
    await share.getByRole('button', { name: 'Kirim lewat email' }).click();
    await expect(share.getByText('Alamat email tidak sah.')).toBeVisible();
    await expect(share).toBeVisible();
  });

  test('email benar menampilkan toast terkirim tanpa permintaan jaringan', async ({ page }) => {
    const share = await openShare(page);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await share.getByLabel('Alamat Email').fill('budi@toko.co.id');
    await share.getByRole('button', { name: 'Kirim lewat email' }).click();
    await expect(page.getByText('Struk dikirim lewat email (simulasi).')).toBeVisible();
    await expect(share).toBeHidden();
    expect(requests).toEqual([]);
  });

  test('WA kosong tetap ditolak dan galatnya tidak memengaruhi baris email', async ({ page }) => {
    const share = await openShare(page);
    await share.getByRole('button', { name: 'Kirim lewat WhatsApp' }).click();
    await expect(
      share.getByText('Nomor telepon tidak valid. Gunakan 9 sampai 14 angka.'),
    ).toBeVisible();
    await expect(share.getByText('Alamat email tidak sah.')).toHaveCount(0);
  });
});

test.describe('riwayat', () => {
  async function openHistory(page: Page): Promise<void> {
    await openDrawerItem(page, 'Riwayat Penjualan');
    await expect(page.locator('.pos-split')).toBeVisible();
  }

  test('baris daftar memuat nomor, total, jam, metode, dan kasir', async ({ page }) => {
    await loginPos(page);
    await sellFirstProduct(page);
    await openHistory(page);
    const first = page.locator('.pos-history__item').first();
    await expect(first).toContainText('T-000141');
    await expect(first).toContainText('Rp 70.000');
    await expect(first).toContainText(/\d{2}[.:]\d{2}/);
    await expect(first.locator('.pos-history__meta')).toContainText('Tunai');
    await expect(first.locator('.pos-history__meta')).toContainText('Dewi');
    await expect(first.locator('.pos-history__icon svg')).toBeVisible();
  });

  test('tombol Filter membuka panel dan menyaring metode', async ({ page }) => {
    await loginPos(page);
    await sellFirstProduct(page, 'tunai');
    await sellFirstProduct(page, 'qris');
    await openHistory(page);
    const filter = page.getByRole('button', { name: 'Filter' });
    await expect(filter).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('group', { name: 'Metode' })).toBeHidden();
    await filter.click();
    await expect(filter).toHaveAttribute('aria-expanded', 'true');
    const before = await page.locator('.pos-history__item').count();
    await page.getByRole('group', { name: 'Metode' }).getByRole('button', { name: 'QRIS' }).click();
    const metas = page.locator('.pos-history__item .pos-history__meta');
    await expect(metas.first()).toContainText('QRIS');
    expect(await page.locator('.pos-history__item').count()).toBeLessThan(before);
    for (const text of await metas.allTextContents()) {
      expect(text).toContain('QRIS');
    }
  });

  test('pencarian menyaring nomor dan nama pelanggan', async ({ page }) => {
    await loginPos(page);
    await openHistory(page);
    await page.getByRole('searchbox', { name: 'Cari Penjualan' }).fill('Anton');
    const rows = page.locator('.pos-history__item');
    await expect(rows.first()).toContainText('Pak Anton');
    for (const text of await rows.allTextContents()) {
      expect(text).toContain('Pak Anton');
    }
  });

  test('detail memuat Informasi Penjualan, tiga kartu penerimaan, dan Barang & Jasa dengan foto kecil', async ({
    page,
  }) => {
    await loginPos(page);
    await sellFirstProduct(page);
    await openHistory(page);
    const detail = page.locator('.pos-history__detail');
    await expect(detail.getByText('Informasi Penjualan')).toBeVisible();
    await expect(detail.locator('.pos-history__figure')).toHaveCount(3);
    await expect(detail.getByText('Barang & Jasa')).toBeVisible();
    await expect(detail.locator('.pos-history__lines img.pos-photo--sm')).toHaveCount(1);
    await expect(detail.locator('.pos-history__lines')).toContainText('Diinput Oleh: Dewi - Kasir');
    await expect(detail).toContainText('Grand Total');
  });

  test('+ N Penerimaan Lainnya membuka sisa baris penerimaan', async ({ page }) => {
    await loginPos(page);
    await sellSplitThree(page);
    await openHistory(page);
    const detail = page.locator('.pos-history__detail');
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(2);
    const more = detail.getByRole('button', { name: '+ 1 Penerimaan Lainnya' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(3);
    await expect(detail.getByRole('button', { name: 'Sembunyikan' })).toBeVisible();
  });

  test('daftar barang pada detail tidak terhimpit dan kolom cari punya teks petunjuk', async ({
    page,
  }) => {
    await loginPos(page);
    await sellSplitThree(page);
    await openHistory(page);
    const search = page.getByRole('searchbox', { name: 'Cari Penjualan' });
    await expect(search).toHaveAttribute('placeholder', 'Cari Penjualan');
    const lines = page.locator('.pos-history__detail .pos-history__lines');
    const clipped = await lines.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(clipped).toBeLessThanOrEqual(1);
    expect(await lines.evaluate((node) => node.clientHeight)).toBeGreaterThan(40);
  });

  test('riwayat lolos axe pada mode terang dan gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page);
    await sellFirstProduct(page);
    await openHistory(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, scheme).toEqual([]);
    }
  });
});

test.describe('modal Retur', () => {
  async function openReturDialog(page: Page) {
    await loginPos(page);
    const card = page.locator('.pos-card__main').first();
    for (let index = 0; index < 3; index += 1) {
      await card.click();
    }
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    return page.getByRole('dialog', { name: /Retur Penjualan/ });
  }

  test('pengembalian pada penjualan DP tidak melebihi uang yang sudah dibayar', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page.locator('.pos-history__item', { hasText: 'T-000140' }).click();
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: /Retur Penjualan/ });
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    const amount = dialog.locator('.pos-return__amount');
    const prefilled = Number((await amount.inputValue()).replace(/\D/g, ''));
    expect(prefilled).toBeGreaterThan(0);
    expect(prefilled).toBeLessThan(460825);
    await dialog.getByRole('radio', { name: 'QRIS' }).click();
    await amount.fill('460825');
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(
      dialog.getByText('Jumlah dikembalikan melebihi uang yang sudah dibayar.'),
    ).toBeVisible();
    await amount.fill(String(prefilled));
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Retur Berhasil' })).toBeVisible();
  });

  test('baris barang menampilkan foto, Total, jumlah dengan satuan, dan Diinput Oleh', async ({
    page,
  }) => {
    const dialog = await openReturDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Retur Barang & Jasa' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Pesanan (1)' })).toBeVisible();
    const first = dialog.locator('.pos-return__item').first();
    await expect(first.locator('img.pos-photo--sm')).toBeVisible();
    await expect(first).toContainText('Total Rp 210.000');
    await expect(first).toContainText('Dibeli 3 SAK, sisa 3');
    await expect(first).toContainText('Diinput Oleh: Dewi - Kasir');
  });

  test('memilih Transfer menampilkan chip kanal dan kanal tersimpan di bukti retur', async ({
    page,
  }) => {
    const dialog = await openReturDialog(page);
    const channels = dialog.getByRole('radiogroup', { name: 'Kanal' });
    await expect(channels).toBeHidden();
    await dialog.getByRole('radio', { name: 'QRIS' }).click();
    await expect(channels.getByRole('radio', { name: 'Gopay' })).toBeVisible();
    await expect(channels.getByRole('radio', { name: 'Umum' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await dialog.getByRole('radio', { name: 'Transfer' }).click();
    for (const bank of ['BCA', 'BRI', 'Mandiri']) {
      await expect(channels.getByRole('radio', { name: bank })).toBeVisible();
    }
    await expect(channels.getByRole('radio', { name: 'Gopay' })).toHaveCount(0);
    await channels.getByRole('radio', { name: 'BCA' }).click();
    await expect(channels.getByRole('radio', { name: 'BCA' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await dialog.getByRole('radio', { name: 'Tunai' }).click();
    await expect(channels).toBeHidden();
    await dialog.getByRole('radio', { name: 'Transfer' }).click();
    await channels.getByRole('radio', { name: 'BCA' }).click();
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Retur Berhasil' });
    await done.getByRole('button', { name: 'Cetak Bukti Retur' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('Transfer BCA');
  });

  test('tile foto bukti menampilkan nama berkas yang dipilih', async ({ page }) => {
    const dialog = await openReturDialog(page);
    await expect(dialog.getByRole('button', { name: 'Tambah foto bukti' })).toBeVisible();
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'bukti-retur.png',
      mimeType: 'image/png',
      buffer: Buffer.from('gambar'),
    });
    await expect(dialog.getByText('bukti-retur.png')).toBeVisible();
  });

  test('modal Retur lolos axe dan target 48 px pada mode terang dan gelap', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const dialog = await openReturDialog(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByRole('radio', { name: 'Transfer' }).click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, scheme).toEqual([]);
      const heights = await dialog
        .locator('button, input:not([type=file]), textarea')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => node.getBoundingClientRect().height),
        );
      for (const height of heights) {
        expect(height).toBeGreaterThanOrEqual(47.5);
      }
    }
  });
});

test.describe('entri nominal', () => {
  test('modal awal menerima ketikan papan ketik fisik dan papan angka layar bergantian', async ({
    page,
  }) => {
    await loginPosRaw(page);
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
    const value = dialog.locator('.pos-amount__value');
    await expect(value).toHaveText('');
    await page.keyboard.type('250000');
    await expect(value).toHaveText('Rp 250.000');
    await page.keyboard.press('Backspace');
    await expect(value).toHaveText('Rp 25.000');
    await dialog.getByRole('button', { name: '000', exact: true }).click();
    await expect(value).toHaveText('Rp 25.000.000');
    await page.keyboard.type('1');
    await expect(value).toHaveText('Rp 250.000.001');
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    await page.keyboard.type('5');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.locator('.pos-card').first()).toBeVisible();
  });
});

test.describe('layar bayar', () => {
  async function toPay(page: Page, customer?: string): Promise<void> {
    await loginPos(page);
    if (customer !== undefined) {
      await chooseCustomer(page, customer);
    }
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
  }
  const pay = (page: Page) => page.getByRole('button', { name: 'Bayar', exact: true });
  const value = (page: Page) => page.locator('.pos-amount__value');
  async function pad(page: Page, digits: string): Promise<void> {
    for (const digit of digits) {
      await page.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
  }

  test('empat tab terlihat dengan role tab dan Tunai terpilih', async ({ page }) => {
    await toPay(page);
    const tabs = page.getByRole('tablist', { name: 'Cara bayar' }).getByRole('tab');
    await expect(tabs).toHaveText(['Tunai', 'Non-Tunai', 'Split', 'Piutang']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    for (const index of [1, 2, 3]) {
      await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'false');
    }
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByText('Total Pembayaran', { exact: true })).toBeVisible();
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 70.000');
    await expect(page.getByRole('radiogroup', { name: 'Syarat bayar' })).toHaveCount(0);
  });

  test('Tunai: papan angka mengisi Jumlah diterima, Uang Pas melunasi, dan Kembalian tampil', async ({
    page,
  }) => {
    await toPay(page);
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
    await pad(page, '100000');
    await expect(value(page)).toHaveText('Rp 100.000');
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 30.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await page.getByRole('button', { name: 'C', exact: true }).click();
    await expect(value(page)).toHaveText('Rp 0');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 70.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await expect(value(page)).toHaveText('Rp 70.000');
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
  });

  test('papan ketik fisik mengisi nominal Tunai, dan OK mengisi Uang Pas hanya bila masih kosong', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(value(page)).toHaveText('Rp 70.000');
    await page.getByRole('button', { name: 'C', exact: true }).click();
    await page.keyboard.type('100000');
    await expect(value(page)).toHaveText('Rp 100.000');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(value(page)).toHaveText('Rp 100.000');
    await page.keyboard.press('Backspace');
    await expect(value(page)).toHaveText('Rp 10.000');
  });

  test('Piutang: tempo 30 hari, DP, sisa tagihan, dan jatuh tempo tampil seperti sebelumnya', async ({
    page,
  }) => {
    await toPay(page, 'Bu Sherly');
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(page.getByRole('tab', { name: 'Piutang' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: '30 hari' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.pos-pay__due')).toContainText('18 Nov 2026');
    await page.getByLabel('DP', { exact: true }).fill('20000');
    await expect(page.locator('.pos-pay__due-amount')).toContainText('Rp 50.000');
    await expect(page.locator('.pos-pay__dp')).toContainText('Rp 20.000');
    await page.getByRole('button', { name: '14 hari' }).click();
    await expect(page.locator('.pos-pay__due')).toContainText('2 Nov 2026');
    await pay(page).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
  });

  test('berpindah dari Piutang ke Tunai membuang baris tersembunyi', async ({ page }) => {
    await toPay(page, 'Bu Sherly');
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await page.getByLabel('DP', { exact: true }).fill('20000');
    await expect(page.locator('.pos-pay__due-amount')).toContainText('Rp 50.000');
    await page.getByRole('tab', { name: 'Tunai', exact: true }).click();
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 70.000');
    await expect(value(page)).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('layar bayar lolos axe dan target 48 px pada mode terang dan gelap', async ({ page }) => {
    await toPay(page, 'Bu Sherly');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      for (const tab of ['Tunai', 'Piutang']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await settle(page);
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(result.violations, `${scheme} ${tab}`).toEqual([]);
        const heights = await page
          .locator('.pos-pay button, .pos-pay input')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.getClientRects().length > 0)
              .map(
                (node) =>
                  [node.getAttribute('class') ?? '', node.getBoundingClientRect().height] as const,
              ),
          );
        for (const [name, height] of heights) {
          expect(height, `${scheme} ${tab} ${name}`).toBeGreaterThanOrEqual(47.5);
        }
      }
    }
  });
});

test.describe('Non-Tunai tiga pilihan tanpa QR', () => {
  async function toNonCash(page: Page): Promise<void> {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
  }
  const pay = (page: Page) => page.getByRole('button', { name: 'Bayar', exact: true });
  const card = (page: Page, name: string) =>
    page
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name, exact: true });

  test('Non-Tunai hanya menampilkan QRIS, Transfer, dan EDC', async ({ page }) => {
    await toNonCash(page);
    await expect(
      page.getByRole('group', { name: 'Kanal pembayaran' }).getByRole('button'),
    ).toHaveText(['QRIS', 'Transfer', 'EDC']);
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('memilih QRIS tidak membuka kode QR dan langsung melunasi total', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'QRIS').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.pos-qr')).toHaveCount(0);
    await expect(card(page, 'QRIS')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('QRIS');
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(1);
  });

  test('Transfer dan EDC langsung memilih tanpa modal dan tanpa Nomor Referensi', async ({
    page,
  }) => {
    await toNonCash(page);
    await card(page, 'Transfer').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card(page, 'Transfer')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name: 'Nomor Referensi' })).toHaveCount(0);
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await card(page, 'EDC').click();
    await expect(card(page, 'EDC')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, 'Transfer')).toHaveAttribute('aria-pressed', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await expect(page.locator('.pos-history__detail')).toContainText('EDC');
  });

  test('Non-Tunai lolos axe dan target 48 px pada mode terang dan gelap', async ({ page }) => {
    await toNonCash(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const tab = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(tab.violations, `${scheme} tab`).toEqual([]);
      await card(page, 'QRIS').click();
      await settle(page);
      const chosen = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(chosen.violations, `${scheme} dipilih`).toEqual([]);
      const heights = await page
        .getByRole('group', { name: 'Kanal pembayaran' })
        .locator('button')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
    }
  });
});

test.describe('Split', () => {
  async function toSplit(page: Page): Promise<void> {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
  }
  const pay = (page: Page) => page.getByRole('button', { name: 'Bayar', exact: true });
  const slot = (page: Page, number: number) =>
    page.getByRole('button', { name: new RegExp(`^Pembayaran ${String(number)}`) });
  const partDialog = (page: Page, number: number) =>
    page.getByRole('dialog', { name: `Pembayaran ${String(number)}` });
  async function padIn(dialog: Locator, digits: string): Promise<void> {
    for (const digit of digits) {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
  }
  async function savePart(
    page: Page,
    number: number,
    options: { channel?: string; digits: string },
  ): Promise<void> {
    await slot(page, number).click();
    const dialog = partDialog(page, number);
    if (options.channel !== undefined) {
      await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
      await dialog
        .getByRole('group', { name: 'Kanal pembayaran' })
        .getByRole('button', { name: options.channel, exact: true })
        .click();
    }
    await padIn(dialog, options.digits);
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toBeHidden();
  }

  test('Split menampilkan tiga slot Pembayaran 1 sampai 3 tanpa tombol Tambah Pembayaran', async ({
    page,
  }) => {
    await toSplit(page);
    await expect(slot(page, 1)).toBeVisible();
    await expect(slot(page, 2)).toBeVisible();
    await expect(slot(page, 3)).toBeVisible();
    await expect(slot(page, 4)).toHaveCount(0);
    await expect(slot(page, 1)).toContainText('Pilih pembayaran');
    await expect(page.getByRole('button', { name: 'Tambah Pembayaran' })).toHaveCount(0);
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 70.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('dua pembayaran Tunai dan Transfer menjumlah sampai total lalu Bayar aktif', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { digits: '30000' });
    await expect(slot(page, 1)).toContainText('Tunai');
    await expect(slot(page, 1)).toContainText('Rp 30.000');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 40.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
    await savePart(page, 2, { channel: 'Transfer', digits: '40000' });
    await expect(slot(page, 2)).toContainText('Transfer');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('Transfer');
    await expect(detail).toContainText('Rp 40.000');
    await expect(detail).toContainText('Rp 30.000');
  });

  test('maksimal tiga pembayaran: slot ketiga ada dan tidak ada slot keempat', async ({ page }) => {
    await toSplit(page);
    await expect(slot(page, 3)).toContainText('Pilih pembayaran');
    await expect(slot(page, 4)).toHaveCount(0);
    await savePart(page, 1, { digits: '10000' });
    await savePart(page, 2, { channel: 'EDC', digits: '10000' });
    await savePart(page, 3, { channel: 'Transfer', digits: '10000' });
    await expect(slot(page, 4)).toHaveCount(0);
    await expect(page.locator('.pos-pay__part')).toHaveCount(3);
  });

  test('Simpan menolak nominal nol dan modal tetap terbuka', async ({ page }) => {
    await toSplit(page);
    await slot(page, 1).click();
    const dialog = partDialog(page, 1);
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Isi nominal pembayaran lebih dari nol.');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toBeHidden();
    await expect(slot(page, 1)).toContainText('Pilih pembayaran');
  });

  test('Non-Tunai tanpa memilih kanal ditolak dengan petunjuk', async ({ page }) => {
    await toSplit(page);
    await slot(page, 1).click();
    const dialog = partDialog(page, 1);
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await padIn(dialog, '1000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Pilih QRIS, Transfer, atau EDC terlebih dahulu.',
    );
  });

  test('Transfer dan EDC tersimpan terpisah dan tampil di riwayat', async ({ page }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer', digits: '30000' });
    await savePart(page, 2, { channel: 'EDC', digits: '40000' });
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(2);
    await expect(detail).toContainText('Transfer');
    await expect(detail).toContainText('EDC');
  });

  test('cara bayar yang sama ditolak pada pembayaran lain', async ({ page }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer', digits: '30000' });
    await slot(page, 2).click();
    const dialog = partDialog(page, 2);
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await dialog
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'Transfer', exact: true })
      .click();
    await padIn(dialog, '1000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Cara bayar ini sudah dipakai pada pembayaran lain.',
    );
  });

  test('tunai boleh melebihi sisa dan menghasilkan kembalian, non-tunai dibatasi sisa', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer', digits: '30000' });
    await slot(page, 2).click();
    const dialog = partDialog(page, 2);
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await dialog
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'EDC', exact: true })
      .click();
    await expect(dialog.locator('.pos-part__sisa')).toHaveText('Rp 40.000');
    await padIn(dialog, '99999');
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 40.000');
    await dialog.getByRole('tab', { name: 'Tunai', exact: true }).click();
    await padIn(dialog, '9');
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 400.009');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 360.009');
    await expect(slot(page, 2)).toContainText('Tunai');
  });

  test('mengubah Pembayaran 1 tidak menukar urutan dengan Pembayaran 2', async ({ page }) => {
    await toSplit(page);
    await savePart(page, 1, { digits: '30000' });
    await savePart(page, 2, { channel: 'EDC', digits: '20000' });
    await slot(page, 1).click();
    const dialog = partDialog(page, 1);
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    await padIn(dialog, '10000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(slot(page, 1)).toContainText('Tunai');
    await expect(slot(page, 1)).toContainText('Rp 10.000');
    await expect(slot(page, 2)).toContainText('EDC');
    await expect(slot(page, 2)).toContainText('Rp 20.000');
  });

  test('Split dan modal Pembayaran lolos axe dan target 48 px pada mode terang dan gelap', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { digits: '30000' });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const tab = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(tab.violations, `${scheme} tab`).toEqual([]);
      await slot(page, 2).click();
      const dialog = partDialog(page, 2);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
      await settle(page);
      const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(modal.violations, `${scheme} modal`).toEqual([]);
      const heights = await dialog
        .locator('button')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => node.getBoundingClientRect().height),
        );
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
      await dialog.getByRole('button', { name: 'Batal' }).click();
      await expect(dialog).toBeHidden();
    }
  });
});

test.describe('Detail Barang (diskon per satuan dan ubah harga)', () => {
  async function openDetail(page: Page, user = 'Ibu Sinta') {
    await loginPos(page, user);
    await page.locator('.pos-card__main').first().click();
    await page.locator('.pos-bill__name').first().click();
    const dialog = page.getByRole('dialog', { name: 'Detail Barang' });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  const padIn = async (dialog: Locator, digits: string): Promise<void> => {
    for (const digit of digits) {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
  };
  const save = (dialog: Locator) => dialog.getByRole('button', { name: 'Simpan', exact: true });

  test('ketuk baris pesanan membuka Detail Barang dengan Kode Barang, Subtotal, Diskon, dan Ubah Harga saja', async ({
    page,
  }) => {
    const dialog = await openDetail(page);
    await expect(dialog.getByText('Kode Barang', { exact: true })).toBeVisible();
    await expect(dialog.locator('.pos-line__code')).toHaveText('P001');
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 70.000');
    await expect(dialog.getByRole('button', { name: 'Berikan Diskon' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ubah Harga' })).toBeVisible();
    // Revisi ketiga: Tenaga Penjual, Catatan, dan Cek Stok dihilangkan.
    await expect(dialog.getByLabel('Tenaga Penjual')).toHaveCount(0);
    await expect(dialog.getByRole('textbox', { name: 'Catatan' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Cek Stok Barang' })).toHaveCount(0);
    await expect(save(dialog)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Hapus Item' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'SAK' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Supervisor memberi diskon 10 persen dan Subtotal berubah', async ({ page }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Berikan Diskon' }).click();
    await padIn(dialog, '10');
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 63.000');
    await save(dialog).click();
    await expect(dialog).toBeHidden();
    const row = page.locator('.pos-order__item').first();
    await expect(row.locator('.pos-order__amount')).toHaveText('Rp 63.000');
    await expect(row).toContainText('-10%');
  });

  test('Kasir diminta PIN Supervisor untuk diskon dan PIN benar membuka isian', async ({
    page,
  }) => {
    const dialog = await openDetail(page, 'Dewi');
    await dialog.getByRole('button', { name: 'Berikan Diskon' }).click();
    await expect(dialog.locator('.pos-amount:visible')).toHaveCount(0);
    const auth = page.getByRole('dialog', { name: 'Otorisasi Supervisor atau Owner' });
    await expect(auth).toBeVisible();
    await auth.getByLabel('Alasan').fill('Pelanggan langganan');
    await auth.getByLabel('PIN Supervisor atau Owner').fill('3571');
    await auth.getByRole('button', { name: 'Setujui' }).click();
    await expect(auth).toBeHidden();
    await expect(dialog.locator('.pos-amount:visible')).toHaveCount(1);
    await padIn(dialog, '5');
    await save(dialog).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pos-order__item').first()).toContainText('-5%');
  });

  test('PIN salah menolak dan isian tetap terkunci', async ({ page }) => {
    const dialog = await openDetail(page, 'Dewi');
    await dialog.getByRole('button', { name: 'Ubah Harga' }).click();
    const auth = page.getByRole('dialog', { name: 'Otorisasi Supervisor atau Owner' });
    await auth.getByLabel('Alasan').fill('Pelanggan langganan');
    await auth.getByLabel('PIN Supervisor atau Owner').fill('1111');
    await auth.getByRole('button', { name: 'Setujui' }).click();
    await expect(auth.getByRole('alert')).toContainText('PIN');
    await expect(auth).toBeVisible();
    await auth.getByRole('button', { name: 'Batal' }).click();
    await expect(auth).toBeHidden();
    await expect(dialog.locator('.pos-amount:visible')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Ubah Harga' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('Ubah Harga tidak menampilkan harga asli maupun harga dicoret', async ({ page }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Ubah Harga' }).click();
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    await padIn(dialog, '65000');
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 65.000');
    await expect(dialog).not.toContainText('Harga asli');
    await save(dialog).click();
    await expect(dialog).toBeHidden();
    const row = page.locator('.pos-order__item').first();
    await expect(row.locator('s')).toHaveCount(0);
    await expect(row.locator('.pos-order__qty')).toHaveText('QTY : 1 X 65.000');
    await expect(row.locator('.pos-order__amount')).toHaveText('Rp 65.000');
    await page.locator('.pos-bill__name').first().click();
    const again = page.getByRole('dialog', { name: 'Detail Barang' });
    await again.getByRole('button', { name: 'Ubah Harga' }).click();
    await expect(again).not.toContainText('Harga asli');
    await expect(again).not.toContainText('70.000');
    await again.getByRole('button', { name: 'Pulihkan harga asli' }).click();
    await save(again).click();
    await expect(page.locator('.pos-order__item s')).toHaveCount(0);
    await expect(page.locator('.pos-order__item .pos-order__amount').first()).toHaveText(
      'Rp 70.000',
    );
  });

  test('ikon hapus membuang baris setelah konfirmasi', async ({ page }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Hapus Item' }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Hapus', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Belum ada barang yang dipilih')).toBeVisible();
  });

  test('diskon nominal per satuan dijepit pada harga satu satuan', async ({ page }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Berikan Diskon' }).click();
    await dialog.getByRole('radio', { name: 'Nominal' }).click();
    await padIn(dialog, '999999');
    await expect(dialog.locator('.pos-line__panel:not([hidden]) .pos-amount__value')).toHaveText(
      'Rp 70.000',
    );
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 0');
    await expect(dialog).toBeVisible();
  });

  test('jumlah divalidasi dan stepper menambah serta mengurangi', async ({ page }) => {
    const dialog = await openDetail(page);
    const quantity = dialog.getByRole('textbox', { name: 'Jumlah' });
    await dialog.getByRole('button', { name: 'Tambah jumlah' }).click();
    await expect(quantity).toHaveValue('2');
    await expect(dialog.locator('.pos-line__subtotal')).toHaveText('Rp 140.000');
    await dialog.getByRole('button', { name: 'Kurangi jumlah' }).click();
    await dialog.getByRole('button', { name: 'Kurangi jumlah' }).click();
    await expect(quantity).toHaveValue('1');
    await quantity.fill('0');
    await save(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Jumlah harus lebih dari 0.');
  });

  test('Frontliner hanya mengatur jumlah dan satuan: tanpa diskon, ubah harga, catatan, atau stok', async ({
    page,
  }) => {
    const dialog = await openDetail(page, 'Agus');
    await expect(dialog.getByRole('textbox', { name: 'Catatan' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Cek Stok Barang' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Berikan Diskon' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Ubah Harga' })).toHaveCount(0);
    await expect(dialog.getByRole('textbox', { name: 'Jumlah' })).toBeVisible();
  });

  test('Detail Barang lolos axe dan target 48 px pada mode terang dan gelap', async ({ page }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Ubah Harga' }).click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, scheme).toEqual([]);
      const heights = await dialog
        .locator('button, input, select, textarea')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => [node.tagName, node.getBoundingClientRect().height] as const),
        );
      for (const [tag, height] of heights) {
        expect(height, `${scheme} ${tag}`).toBeGreaterThanOrEqual(47.5);
      }
    }
  });
});

test.describe('diskon dan perubahan harga sampai bayar, struk, dan riwayat', () => {
  async function openDetail(page: Page, taps = 1) {
    await loginPos(page, 'Ibu Sinta');
    for (let index = 0; index < taps; index += 1) {
      await page.locator('.pos-card__main').first().click();
    }
    await page.locator('.pos-bill__name').first().click();
    return page.getByRole('dialog', { name: 'Detail Barang' });
  }
  async function discount(dialog: Locator, digits: string): Promise<void> {
    await dialog.getByRole('button', { name: 'Berikan Diskon' }).click();
    for (const digit of digits) {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
  }
  const save = (dialog: Locator) => dialog.getByRole('button', { name: 'Simpan', exact: true });

  test('baris pesanan menampilkan harga berlaku (tanpa coretan) dan tanda diskon', async ({
    page,
  }) => {
    const dialog = await openDetail(page);
    await dialog.getByRole('button', { name: 'Ubah Harga' }).click();
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    for (const digit of '65000') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    await discount(dialog, '10');
    await save(dialog).click();
    await expect(dialog).toBeHidden();
    const row = page.locator('.pos-order__item').first();
    await expect(row.locator('s')).toHaveCount(0);
    await expect(row.locator('.pos-order__qty')).toContainText('65.000');
    await expect(row.locator('.pos-order__qty')).not.toContainText('70.000');
    await expect(row.locator('.pos-order__flag')).toHaveText('-10%');
    await expect(row.locator('.pos-order__amount')).toHaveText('Rp 58.500');
  });

  test('layar bayar menampilkan diskon pada daftar dan Subtotal', async ({ page }) => {
    const dialog = await openDetail(page);
    await discount(dialog, '10');
    await save(dialog).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    const item = page.locator('.pos-pay__item').first();
    await expect(item).toContainText('Rp 63.000');
    await expect(item.locator('.pos-order__flag')).toHaveText('-10%');
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 63.000');
    const bar = page.getByRole('button', { name: /^Subtotal/ });
    await expect(bar).toContainText('Rp 70.000');
    await bar.click();
    await expect(page.locator('.pos-pay__discount')).toHaveText('-Rp 7.000');
    await expect(page.locator('.pos-pay__breakdown-total')).toContainText('Rp 63.000');
  });

  test('transaksi tanpa diskon tidak menampilkan baris Diskon pada ringkasan bayar', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: /^Subtotal/ }).click();
    await expect(page.locator('.pos-pay__breakdown')).toBeVisible();
    await expect(page.locator('.pos-pay__discount')).toBeHidden();
    await expect(page.locator('.pos-pay__item .pos-order__flag')).toHaveCount(0);
  });

  test('struk memuat baris Diskon dan riwayat menampilkan Subtotal, Diskon, dan Grand Total yang konsisten', async ({
    page,
  }) => {
    const dialog = await openDetail(page);
    await discount(dialog, '10');
    await save(dialog).click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Pembayaran Berhasil' });
    await done.getByRole('button', { name: 'Cetak Struk' }).click();
    const receipt = page.locator('.pos-receipt');
    await expect(receipt).toContainText('Diskon');
    await expect(receipt).toContainText('-Rp 7.000');
    await expect(receipt).toContainText('Rp 63.000');
    await page
      .getByRole('dialog', { name: 'Pratinjau Struk' })
      .getByRole('button', { name: 'Tutup' })
      .click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    const totals = detail.locator('.pos-history__totals');
    await expect(totals).toContainText('Subtotal');
    await expect(totals).toContainText('Rp 70.000');
    await expect(totals).toContainText('Diskon');
    await expect(totals).toContainText('-Rp 7.000');
    await expect(totals).toContainText('Grand Total');
    await expect(totals).toContainText('Rp 63.000');
    const line = detail.locator('.pos-history__lines li').first();
    await expect(line.locator('.pos-order__flag')).toHaveText('-10%');
    await expect(line.locator('output')).toHaveText('Rp 70.000');
  });

  test('retur baris berdiskon mengembalikan nominal proporsional', async ({ page }) => {
    const dialog = await openDetail(page, 3);
    await discount(dialog, '10');
    await save(dialog).click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    const retur = page.getByRole('dialog', { name: /Retur Penjualan/ });
    await expect(retur.locator('.pos-return__item').first()).toContainText('Total Rp 189.000');
    await retur.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await expect(retur.locator('.pos-return__total')).toHaveText('Rp 189.000');
    const minus = retur.getByRole('button', { name: 'Kurangi jumlah' });
    await minus.click();
    await minus.click();
    await expect(retur.locator('.pos-return__total')).toHaveText('Rp 63.000');
  });
});

test.describe('Open Bill', () => {
  async function openBills(page: Page, user = 'Dewi'): Promise<void> {
    await loginPos(page, user);
    await openDrawerItem(page, 'Open Bill');
    await expect(page).toHaveURL(/#\/pos\/bill$/);
  }
  const card = (page: Page, number: string) => page.locator('.pos-bill-card', { hasText: number });
  const menu = (page: Page, number: string) =>
    page.getByRole('button', { name: `Opsi bill ${number}` });
  async function choose(page: Page, number: string, item: string): Promise<void> {
    await menu(page, number).click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  }
  // Menahan satu barang pertama berjumlah tiga sebagai bill B-0004, lalu membuka Open Bill.
  async function holdThree(page: Page, user = 'Dewi'): Promise<void> {
    await loginPos(page, user);
    const first = page.locator('.pos-card__main').first();
    for (let index = 0; index < 3; index += 1) {
      await first.click();
    }
    await openOrderMenu(page, 'Open Bill');
    await openDrawerItem(page, 'Open Bill');
    await expect(page).toHaveURL(/#\/pos\/bill$/);
    await expect(card(page, 'B-0004')).toBeVisible();
  }

  test('kartu bill menampilkan Nomor, Nama Pelanggan, Dibuat oleh, Waktu, dan satu barang dengan + N Barang Lainnya', async ({
    page,
  }) => {
    await openBills(page);
    await expect(page.locator('.pos-bill-card')).toHaveCount(3);
    const long = card(page, 'B-0003');
    const info = long.locator('.pos-bill-card__info');
    await expect(info.nth(0)).toContainText('Nomor Open Bill');
    await expect(info.nth(0)).toContainText('B-0003');
    await expect(info.nth(1)).toContainText('Umum');
    await expect(info.nth(2)).toContainText('Dibuat Oleh');
    await expect(info.nth(2)).toContainText('Agus');
    await expect(info.nth(3)).toContainText(/\d{2}[.:]\d{2}/);
    // Hanya satu barang yang tampak; sisanya lewat "+ N Barang Lainnya".
    await expect(long.locator('.pos-bill-card__line')).toHaveCount(1);
    await expect(long).toContainText('+ 3 Barang Lainnya');
    const middle = card(page, 'B-0002');
    await expect(middle.locator('.pos-bill-card__info').nth(1)).not.toContainText('Umum');
    await expect(middle).toContainText('+ 2 Barang Lainnya');
    const short = card(page, 'B-0001');
    await expect(short.locator('.pos-bill-card__line')).toHaveCount(1);
    await expect(short).toContainText('+ 1 Barang Lainnya');
    // Klik "+ N Barang Lainnya" memperlihatkan seluruh barang.
    await long.getByRole('button', { name: /Barang Lainnya/ }).click();
    await expect(long.locator('.pos-bill-card__line')).toHaveCount(4);
    await long.getByRole('button', { name: 'Tutup' }).click();
    await expect(long.locator('.pos-bill-card__line')).toHaveCount(1);
  });

  test('menu titik tiga berisi Ubah, Split Bill, Merge Bill, Batalkan', async ({ page }) => {
    await openBills(page, 'Ibu Sinta');
    await menu(page, 'B-0001').click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Ubah',
      'Split Bill',
      'Merge Bill',
      'Batalkan',
    ]);
  });

  test('Ubah memanggil bill ke pesanan, dan ditolak bila pesanan berjalan belum kosong', async ({
    page,
  }) => {
    await openBills(page);
    await choose(page, 'B-0001', 'Ubah');
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(page.locator('.pos-order__item')).toHaveCount(2);
    await page.evaluate(() => {
      window.location.hash = '/pos/bill';
    });
    await expect(page).toHaveURL(/#\/pos\/bill$/);
    await choose(page, 'B-0002', 'Ubah');
    await expect(page.getByText('Bill saat ini belum selesai.')).toBeVisible();
    await expect(page).toHaveURL(/#\/pos\/bill$/);
  });

  test('Split Bill memindahkan 1 dari 3 ke bill baru dan keduanya tampil', async ({ page }) => {
    await holdThree(page);
    await choose(page, 'B-0004', 'Split Bill');
    const dialog = page.getByRole('dialog', { name: 'Split Bill B-0004' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Tambah jumlah' }).click();
    await dialog.getByRole('button', { name: 'Pindahkan' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pos-bill-card')).toHaveCount(5);
    await expect(card(page, 'B-0004').locator('.pos-bill-card__lines')).toContainText('2 SAK');
    await expect(card(page, 'B-0005').locator('.pos-bill-card__lines')).toContainText('1 SAK');
  });

  test('Split Bill menolak memindahkan semua baris dan pilihan kosong', async ({ page }) => {
    await holdThree(page);
    await choose(page, 'B-0004', 'Split Bill');
    const dialog = page.getByRole('dialog', { name: 'Split Bill B-0004' });
    await dialog.getByRole('button', { name: 'Pindahkan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Pilih barang yang akan dipindahkan ke bill baru.',
    );
    await dialog.getByRole('textbox').first().fill('3');
    await dialog.getByRole('button', { name: 'Pindahkan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Tidak bisa memindahkan semua barang. Sisakan minimal satu barang pada bill ini.',
    );
    await expect(dialog).toBeVisible();
    await expect(page.locator('.pos-bill-card')).toHaveCount(4);
  });

  test('Merge Bill menggabungkan dua bill dan sumber hilang', async ({ page }) => {
    await holdThree(page);
    await choose(page, 'B-0004', 'Split Bill');
    const split = page.getByRole('dialog', { name: 'Split Bill B-0004' });
    await split.getByRole('button', { name: 'Tambah jumlah' }).click();
    await split.getByRole('button', { name: 'Pindahkan' }).click();
    await expect(card(page, 'B-0005')).toBeVisible();
    await choose(page, 'B-0004', 'Merge Bill');
    const dialog = page.getByRole('dialog', { name: 'Merge Bill B-0004' });
    await expect(dialog.getByRole('radio')).toHaveCount(4);
    await expect(dialog.getByRole('radio', { name: /B-0004/ })).toHaveCount(0);
    await dialog.getByRole('radio', { name: /B-0005/ }).check();
    await dialog.getByRole('button', { name: 'Gabungkan' }).click();
    await expect(dialog).toBeHidden();
    await expect(card(page, 'B-0005')).toHaveCount(0);
    await expect(page.locator('.pos-bill-card')).toHaveCount(4);
    await expect(card(page, 'B-0004').locator('.pos-bill-card__lines')).toContainText('3 SAK');
  });

  test('Merge Bill meminta memilih sumber lebih dulu', async ({ page }) => {
    await openBills(page);
    await choose(page, 'B-0001', 'Merge Bill');
    const dialog = page.getByRole('dialog', { name: 'Merge Bill B-0001' });
    await dialog.getByRole('button', { name: 'Gabungkan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pilih bill yang akan digabung.');
    await expect(dialog).toBeVisible();
  });

  test('Batalkan tidak tersedia untuk Kasir dan menghapus bill untuk Supervisor', async ({
    page,
  }) => {
    await openBills(page, 'Dewi');
    await menu(page, 'B-0001').click();
    await expect(page.getByRole('menuitem', { name: 'Batalkan' })).toHaveCount(0);
    await expect(page.getByRole('menuitem')).toHaveText(['Ubah', 'Split Bill', 'Merge Bill']);
  });

  test('Supervisor membatalkan bill setelah konfirmasi', async ({ page }) => {
    await openBills(page, 'Ibu Sinta');
    await choose(page, 'B-0001', 'Batalkan');
    await expect(
      page.getByText('Hapus bill B-0001? Bill yang dihapus tidak dapat dikembalikan.'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Hapus', exact: true }).click();
    await expect(page.locator('.pos-bill-card')).toHaveCount(2);
    await expect(card(page, 'B-0001')).toHaveCount(0);
  });

  test('Cetak Struk Draf pada kartu membuka pratinjau tanpa harga', async ({ page }) => {
    await openBills(page);
    await card(page, 'B-0001').getByRole('button', { name: 'Cetak Struk Draf' }).click();
    const sheet = page.locator('.pos-receipt');
    await expect(sheet).toContainText('STRUK DRAF, BUKAN BUKTI BAYAR');
    await expect(sheet).toContainText('B-0001');
    await expect(sheet).not.toContainText('Rp');
  });

  test('pencarian menyaring kartu menurut nomor atau pelanggan', async ({ page }) => {
    await openBills(page);
    const search = page.getByRole('searchbox', { name: 'Cari bill' });
    await search.fill('B-0002');
    await expect(page.locator('.pos-bill-card')).toHaveCount(1);
    await search.fill('zzz');
    await expect(page.locator('.pos-bill-card')).toHaveCount(0);
    await expect(page.getByText('Tidak ada bill gantung.')).toBeVisible();
  });

  test('Open Bill lolos axe dan target 48 px pada mode terang dan gelap', async ({ page }) => {
    await openBills(page, 'Ibu Sinta');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const list = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(list.violations, `${scheme} daftar`).toEqual([]);
      const heights = await page
        .locator('.pos-bills button, .pos-bills input')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => node.getBoundingClientRect().height),
        );
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
      await choose(page, 'B-0002', 'Split Bill');
      const dialog = page.getByRole('dialog', { name: 'Split Bill B-0002' });
      await expect(dialog).toBeVisible();
      await settle(page);
      const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(modal.violations, `${scheme} split`).toEqual([]);
      await dialog.getByRole('button', { name: 'Batal' }).click();
      await expect(dialog).toBeHidden();
    }
  });
});

test.describe('Selesai Shift, Karyawan, dan laporan shift', () => {
  async function endShift(page: Page, counted?: string): Promise<Locator> {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page
      .getByRole('dialog', { name: 'Toko Budiannor' })
      .getByRole('button', { name: 'Selesai Shift' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Selesai Shift' });
    await expect(dialog).toBeVisible();
    if (counted !== undefined) {
      for (const digit of counted) {
        await dialog
          .locator('.pos-amount')
          .getByRole('button', { name: digit, exact: true })
          .click();
      }
    }
    return dialog;
  }
  async function toEmployees(page: Page): Promise<void> {
    await openDrawerItem(page, 'Karyawan');
    await expect(page).toHaveURL(/#\/pos\/karyawan$/);
  }
  const employee = (page: Page, name: string) =>
    page.locator('.pos-employee', { hasText: name }).first();
  // Satu penjualan tunai dan satu QRIS, lalu shift ditutup dengan hitungan 565.000.
  async function closedShift(page: Page): Promise<void> {
    await loginPos(page, 'Ibu Sinta');
    await sellFirstProduct(page, 'tunai');
    await sellFirstProduct(page, 'qris');
    const dialog = await endShift(page, '565000');
    await dialog.getByRole('button', { name: 'Akhiri Shift' }).click();
    // Akhiri Shift langsung keluar; masuk lagi untuk membuka layar Karyawan.
    await expect(page).toHaveURL(/#\/pos$/);
    await loginPosRaw(page, 'Ibu Sinta');
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
  }

  test('Selesai Shift meminta Uang tunai di laci dan menampilkan selisih tunai', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await sellFirstProduct(page, 'tunai');
    const dialog = await endShift(page);
    await expect(dialog.locator('.pos-amount__value')).toHaveText('');
    await expect(dialog.getByText('Uang tunai di laci', { exact: true }).first()).toBeVisible();
    await expect(dialog.locator('.pos-shiftsum__row--total output')).toHaveText('Rp 570.000');
    await expect(dialog.locator('.pos-shiftsum__diff')).toHaveText('Rp 0');
    for (const digit of '565000') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 565.000');
    await expect(dialog.locator('.pos-shiftsum__diff')).toHaveText('-Rp 5.000');
    // Selisih dan tombol Akhiri Shift tetap terlihat tanpa menggulir modal.
    await expect(dialog.locator('.pos-shiftsum__diff')).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('button', { name: 'Akhiri Shift' })).toBeInViewport({ ratio: 1 });
    await dialog.getByRole('button', { name: 'Akhiri Shift' }).click();
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.getByRole('radio', { name: /Ibu Sinta/ })).toBeVisible();
  });

  test('shift yang ditutup tanpa hitungan menampilkan Belum dihitung pada Selisih Tunai', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    const dialog = await endShift(page);
    await dialog.getByRole('button', { name: 'Akhiri Shift' }).click();
    await expect(page).toHaveURL(/#\/pos$/);
    await loginPosRaw(page, 'Ibu Sinta');
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    const difference = report.locator('[data-row="selisih-tunai"]');
    await expect(difference).toContainText('Belum dihitung');
    await expect(difference).not.toContainText('Rp');
  });

  test('Karyawan tanpa shift menampilkan Tidak ada data dan Belum ada shift dimulai', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await toEmployees(page);
    await expect(page.locator('.pos-employee')).toHaveCount(5);
    await employee(page, 'Rizal').click();
    await expect(page.getByText('Tidak ada data', { exact: true })).toBeVisible();
    await expect(page.getByText('Belum ada shift dimulai', { exact: true })).toBeVisible();
  });

  test('shift yang ditutup muncul sebagai Belum Diperiksa dengan lencana 1 pada pengguna', async ({
    page,
  }) => {
    await closedShift(page);
    await toEmployees(page);
    await expect(employee(page, 'Ibu Sinta').locator('.pos-employee__badge')).toHaveText('1');
    await expect(employee(page, 'Rizal').locator('.pos-employee__badge')).toHaveCount(0);
    await employee(page, 'Ibu Sinta').click();
    const item = page.locator('.pos-employee-shift').first();
    await expect(item).toContainText('Belum Diperiksa');
    await expect(item).toContainText(/\d{2}[.:]\d{2}/);
    await expect(page.locator('.pos-employee-shift')).toHaveCount(1);
  });

  test('laporan memuat Informasi Tunai, Total Penerimaan Akhir, Total Retur, Total Biaya, dan baris per metode', async ({
    page,
  }) => {
    await closedShift(page);
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await expect(report).toBeVisible();
    await expect(report.getByRole('heading', { name: 'Informasi Tunai' })).toBeVisible();
    await expect(report.locator('[data-row="modal-awal"]')).toContainText('Rp 500.000');
    await expect(report.locator('[data-row="laporan-tunai"]')).toContainText('Rp 570.000');
    await expect(report.locator('[data-row="selisih-tunai"]')).toContainText('-Rp 5.000');
    await expect(
      report.getByRole('heading', { name: 'Riwayat Penerimaan Akhir & Pengeluaran' }),
    ).toBeVisible();
    await expect(report.locator('[data-row="penerimaan"]')).toContainText('Total Penerimaan Akhir');
    await expect(report.locator('[data-row="penerimaan"]')).toContainText('Rp 140.000');
    await expect(report.locator('[data-row="penerimaan"]')).toContainText('2 transaksi');
    await expect(report.locator('[data-row="retur"]')).toContainText('Total Retur');
    await expect(report.locator('[data-row="retur"]')).toContainText('Rp 0');
    await expect(report.locator('[data-row="biaya"]')).toContainText('Total Biaya');
    await expect(report.getByRole('button', { name: /^Tunai/ })).toBeVisible();
    await expect(report.getByRole('button', { name: /^QRIS/ })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Terima Laporan' })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Terima & Cetak Laporan' })).toBeVisible();
  });

  test('mengetuk metode membuka daftar transaksi dengan Total Diterima dan pencarian', async ({
    page,
  }) => {
    await closedShift(page);
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await report.getByRole('button', { name: /^QRIS/ }).click();
    const list = page.getByRole('dialog', { name: /^QRIS \|/ });
    await expect(list).toBeVisible();
    await expect(list.locator('[data-row="total-diterima"]')).toContainText('Rp 70.000');
    await expect(list.locator('.pos-method-tx__row')).toHaveCount(1);
    await expect(list.locator('.pos-method-tx__row')).toContainText('T-000142');
    await expect(list.locator('.pos-method-tx__amount')).toHaveText('+Rp 70.000');
    const search = list.getByRole('searchbox', { name: 'Cari transaksi' });
    await search.fill('zzz');
    await expect(list.locator('.pos-method-tx__row')).toHaveCount(0);
    await search.fill('142');
    await expect(list.locator('.pos-method-tx__row')).toHaveCount(1);
    await list.getByRole('button', { name: 'Tutup' }).click();
    await expect(list).toBeHidden();
    await expect(report).toBeVisible();
  });

  test('Terima Laporan mengubah status menjadi Sudah Diperiksa dan lencana hilang', async ({
    page,
  }) => {
    await closedShift(page);
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await report.getByRole('button', { name: 'Terima Laporan', exact: true }).click();
    await expect(report.locator('[data-row="status"]')).toContainText('Sudah Diperiksa');
    await expect(report.locator('[data-row="status"]')).toContainText('Ibu Sinta');
    await expect(report.getByRole('button', { name: /Terima/ })).toHaveCount(0);
    await report.getByRole('button', { name: 'Tutup' }).click();
    await expect(page.locator('.pos-employee-shift').first()).toContainText('Sudah Diperiksa');
    await expect(employee(page, 'Ibu Sinta').locator('.pos-employee__badge')).toHaveCount(0);
  });

  test('Terima & Cetak Laporan menerima laporan dan mencetaknya', async ({ page }) => {
    await closedShift(page);
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    await page.locator('.pos-employee-shift').first().click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await report.getByRole('button', { name: 'Terima & Cetak Laporan' }).click();
    await expect(report.locator('[data-row="status"]')).toContainText('Sudah Diperiksa');
    await expect(page.getByText('Laporan shift tercetak.')).toBeVisible();
  });

  test('shift berjalan terbuka tanpa tombol Terima', async ({ page }) => {
    await loginPos(page, 'Ibu Sinta');
    await sellFirstProduct(page, 'tunai');
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    const running = page.locator('.pos-employee-shift').first();
    await expect(running).toContainText('Shift Berjalan');
    await running.click();
    const report = page.getByRole('dialog', { name: 'Laporan Shift' });
    await expect(report.locator('[data-row="laporan-tunai"]')).toContainText('Rp 570.000');
    await expect(report.locator('[data-row="penerimaan"]')).toContainText('Rp 70.000');
    await expect(report.getByRole('button', { name: /Terima/ })).toHaveCount(0);
  });

  test('Kasir tidak melihat Karyawan di menu dan tidak bisa membuka rutenya', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer.getByRole('link', { name: 'Riwayat Penjualan' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Karyawan' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.location.hash = '/pos/karyawan';
    });
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('Karyawan dan laporan lolos axe pada mode terang dan gelap', async ({ page }) => {
    await closedShift(page);
    await toEmployees(page);
    await employee(page, 'Ibu Sinta').click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const screen = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(screen.violations, `${scheme} layar`).toEqual([]);
      await page.locator('.pos-employee-shift').first().click();
      const report = page.getByRole('dialog', { name: 'Laporan Shift' });
      await expect(report).toBeVisible();
      await settle(page);
      const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(modal.violations, `${scheme} laporan`).toEqual([]);
      const heights = await report
        .locator('button')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => node.getBoundingClientRect().height),
        );
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
      await report.getByRole('button', { name: 'Tutup' }).click();
      await expect(report).toBeHidden();
    }
  });
});

test.describe('Biaya sesuai PDF', () => {
  async function toExpenses(page: Page): Promise<void> {
    await openDrawerItem(page, 'Biaya');
    await expect(page).toHaveURL(/#\/pos\/biaya$/);
  }
  async function openForm(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Catat Biaya' }).click();
    const dialog = page.getByRole('dialog', { name: 'Catat Biaya' });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  async function pickKind(dialog: Locator, name: string): Promise<void> {
    await dialog.locator('.dropdown__button').click();
    await dialog.getByRole('option', { name, exact: true }).click();
  }
  // Mencatat satu biaya lewat modal dan menutup dialog Transaksi Berhasil.
  async function addExpense(
    page: Page,
    input: { kind: string; digits: string; note?: string },
  ): Promise<void> {
    const dialog = await openForm(page);
    await pickKind(dialog, input.kind);
    await typeAmount(page, input.digits);
    if (input.note !== undefined) {
      await dialog.getByLabel('Catatan (opsional)').fill(input.note);
    }
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Transaksi Berhasil' });
    await expect(done).toBeVisible();
    await done.getByRole('button', { name: 'Selesai' }).click();
    await expect(done).toBeHidden();
  }

  test('daftar biaya dan detail dua panel menampilkan Informasi Biaya', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    await expect(page.locator('.pos-expense-row')).toHaveCount(0);
    await expect(page.getByText('Belum ada biaya tercatat.')).toBeVisible();
    await addExpense(page, {
      kind: 'Uang Makan Karyawan',
      digits: '5000',
      note: 'Makan siang gudang',
    });
    await addExpense(page, { kind: 'Bensin Armada', digits: '120000' });
    const rows = page.locator('.pos-expense-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Bensin Armada');
    await expect(rows.first()).toContainText('Rp 120.000');
    await rows.nth(1).click();
    const detail = page.locator('.pos-split__detail');
    await expect(detail.getByRole('heading', { name: 'Informasi Biaya' })).toBeVisible();
    for (const text of [
      'Nomor Pembayaran',
      'Dibuat Oleh',
      'Jenis biaya',
      'Nominal Pembayaran',
      'Tanggal Pembayaran',
      'Catatan',
    ]) {
      await expect(detail.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(detail.locator('[data-row="nomor"]')).toContainText('BY-');
    await expect(detail.locator('[data-row="dibuat-oleh"]')).toContainText('Dewi');
    await expect(detail.locator('[data-row="jenis"]')).toContainText('Uang Makan Karyawan');
    await expect(detail.locator('[data-row="nominal"]')).toContainText('Rp 5.000');
    await expect(detail.locator('[data-row="catatan"]')).toContainText('Makan siang gudang');
    await expect(detail.getByRole('button', { name: 'Cetak Struk' })).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Cari transaksi' });
    await search.fill('zzz');
    await expect(rows).toHaveCount(0);
    await search.fill('bensin');
    await expect(rows).toHaveCount(1);
    await search.fill('gudang');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Uang Makan Karyawan');
  });

  test('Catat Biaya: lima jenis dari klien, nominal lewat papan angka, penghitung 0/144', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    const dialog = await openForm(page);
    await dialog.locator('.dropdown__button').click();
    await expect(dialog.getByRole('option')).toHaveText([
      'Bensin Armada',
      'Bayar Ekspedisi',
      'Uang Makan Karyawan',
      'Upah Bongkar Muat',
      'Biaya Lainnya',
    ]);
    await dialog.getByRole('option', { name: 'Uang Makan Karyawan', exact: true }).click();
    await expect(dialog.locator('.dropdown__button')).toContainText('Uang Makan Karyawan');
    await expect(dialog.locator('.pos-amount__value')).toHaveText('');
    await typeAmount(page, '25000');
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 25.000');
    // Pada layar lebar semua isian dan tombol Simpan terlihat tanpa menggulir modal.
    await expect(dialog.getByRole('button', { name: 'Pilih Berkas' })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('button', { name: 'Simpan', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const note = dialog.getByLabel('Catatan (opsional)');
    const counter = dialog.locator('.pos-expense-form__counter');
    await expect(counter).toHaveText('0/144');
    await note.fill('Parkir');
    await expect(counter).toHaveText('6/144');
    await note.fill('x'.repeat(200));
    await expect(counter).toHaveText('144/144');
    expect((await note.inputValue()).length).toBe(144);
  });

  test('lampiran PNG diterima dan PDF besar ditolak dengan galat', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    const dialog = await openForm(page);
    await expect(
      dialog.getByText('JPG, JPEG, PNG maksimal 3 MB. PDF maksimal 1 MB.'),
    ).toBeVisible();
    const file = dialog.getByLabel('Lampiran (opsional)');
    await file.setInputFiles({
      name: 'nota.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(2048),
    });
    await expect(dialog.locator('.pos-expense-form__file')).toContainText('nota.png');
    await expect(dialog.locator('.pos-expense-form__file-error')).toHaveText('');
    await file.setInputFiles({
      name: 'besar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(1024 * 1024 + 1),
    });
    await expect(dialog.locator('.pos-expense-form__file-error')).toHaveText(
      'Lampiran terlalu besar. JPG, JPEG, PNG maksimal 3 MB dan PDF maksimal 1 MB.',
    );
    await expect(dialog.locator('.pos-expense-form__file')).not.toContainText('besar.pdf');
    await file.setInputFiles({ name: 'nota.gif', mimeType: 'image/gif', buffer: Buffer.alloc(10) });
    await expect(dialog.locator('.pos-expense-form__file-error')).toHaveText(
      'Format lampiran harus JPG, JPEG, PNG, atau PDF.',
    );
    await file.setInputFiles({
      name: 'faktur.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(900_000),
    });
    await expect(dialog.locator('.pos-expense-form__file-error')).toHaveText('');
    await expect(dialog.locator('.pos-expense-form__file')).toContainText('faktur.pdf');
    await pickKind(dialog, 'Uang Makan Karyawan');
    await typeAmount(page, '5000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Transaksi Berhasil' })
      .getByRole('button', { name: 'Selesai' })
      .click();
    await page.locator('.pos-expense-row').first().click();
    await expect(page.locator('.pos-split__detail [data-row="lampiran"]')).toContainText(
      'faktur.pdf',
    );
  });

  test('Simpan menampilkan Transaksi Berhasil dengan Cetak Struk dan Selesai', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    const dialog = await openForm(page);
    await pickKind(dialog, 'Uang Makan Karyawan');
    await typeAmount(page, '5000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Transaksi Berhasil' });
    await expect(done).toBeVisible();
    await expect(done).toContainText('Uang Makan Karyawan');
    await expect(done).toContainText('Rp 5.000');
    await expect(dialog).toBeHidden();
    await done.getByRole('button', { name: 'Cetak Struk' }).click();
    await expect(page.getByText('Struk tercetak.')).toBeVisible();
    await done.getByRole('button', { name: 'Selesai' }).click();
    await expect(done).toBeHidden();
    await expect(page.locator('.pos-expense-row')).toHaveCount(1);
  });

  test('biaya mengurangi saldo laci pada ringkasan shift', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    await addExpense(page, { kind: 'Uang Makan Karyawan', digits: '5000' });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page
      .getByRole('dialog', { name: 'Toko Budiannor' })
      .getByRole('button', { name: 'Selesai Shift' })
      .click();
    const summary = page.getByRole('dialog', { name: 'Selesai Shift' });
    await expect(summary.locator('.pos-shiftsum__row--total output')).toHaveText('Rp 495.000');
    await expect(summary.getByText('Biaya', { exact: true })).toBeVisible();
    await expect(summary.locator('.pos-shiftsum__row', { hasText: 'Biaya' }).first()).toContainText(
      'Rp 5.000',
    );
  });

  test('Biaya lolos axe mode terang dan gelap', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toExpenses(page);
    await addExpense(page, {
      kind: 'Uang Makan Karyawan',
      digits: '5000',
      note: 'Makan siang gudang',
    });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const list = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(list.violations, `${scheme} daftar`).toEqual([]);
      const dialog = await openForm(page);
      await settle(page);
      const form = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(form.violations, `${scheme} formulir`).toEqual([]);
      const heights = await dialog
        .locator('button')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => node.getBoundingClientRect().height),
        );
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
      await dialog.getByRole('button', { name: 'Batal' }).click();
      await expect(dialog).toBeHidden();
    }
  });
});

test.describe('Pelanggan', () => {
  async function toCustomers(page: Page): Promise<void> {
    await openDrawerItem(page, 'Pelanggan');
    await expect(page).toHaveURL(/#\/pos\/pelanggan$/);
    await expect(page.locator('.pos-cust-row').first()).toBeVisible();
  }
  const customerRow = (page: Page, name: string) =>
    page.locator('.pos-cust-row', { hasText: name }).first();

  test('daftar pelanggan dikelompokkan per huruf dengan avatar inisial', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    const letters = await page.locator('.pos-cust-group__letter').allTextContents();
    expect(letters.length).toBeGreaterThan(3);
    const alphabet = letters.filter((letter) => letter !== '#');
    expect(alphabet).toEqual([...alphabet].sort());
    if (letters.includes('#')) {
      expect(letters.at(-1)).toBe('#');
    }
    const wahyudi = customerRow(page, 'Pak Wahyudi');
    await expect(wahyudi.locator('.pos-cust-row__avatar')).toHaveText('PW');
    await expect(
      page.locator('.pos-cust-group', { has: wahyudi }).locator('.pos-cust-group__letter'),
    ).toHaveText('P');
    await expect(customerRow(page, 'CV Laut Mas').locator('.pos-cust-row__avatar')).toHaveText(
      'CL',
    );
  });

  test('pencarian menyaring daftar', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    const search = page.getByRole('searchbox', { name: 'Cari pelanggan' });
    await search.fill('wahyudi');
    await expect(customerRow(page, 'Kevin Wahyudi')).toBeVisible();
    await expect(customerRow(page, 'Pak Wahyudi')).toBeVisible();
    for (const text of await page.locator('.pos-cust-row').allTextContents()) {
      expect(text.toLowerCase()).toContain('wahyudi');
    }
    await search.fill('PL387');
    await expect(page.locator('.pos-cust-row')).toHaveCount(1);
    await expect(page.locator('.pos-cust-row')).toContainText('Kevin Wahyudi');
    await search.fill('zzzzzz');
    await expect(page.locator('.pos-cust-row')).toHaveCount(0);
    await expect(page.locator('.pos-cust-list').getByText('Tidak ada data').first()).toBeVisible();
  });

  test('detail menampilkan telepon, alamat, kategori harga, limit, sisa limit, total piutang, dan tempo', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    await customerRow(page, 'Bu Sherly Tjoandra').click();
    const detail = page.locator('.pos-split__detail');
    await expect(detail.getByRole('heading', { name: 'Informasi Pelanggan' })).toBeVisible();
    await expect(detail.locator('[data-row="nama"]')).toContainText('Bu Sherly Tjoandra');
    await expect(detail.locator('[data-row="telepon"]')).toContainText('0811230988');
    await expect(detail.locator('[data-row="alamat"]')).toContainText('Jl. Rajawali No 17');
    await expect(detail.locator('[data-row="kategori"]')).toContainText('Eceran');
    await expect(detail.locator('[data-row="limit"]')).toContainText('Rp 50.000.000');
    await expect(detail.locator('[data-row="sisa-limit"]')).toContainText('Rp 41.500.000');
    await expect(detail.locator('[data-row="total-piutang"]')).toContainText('Rp 8.500.000');
    await expect(detail.locator('[data-row="tempo"]')).toContainText('30 hari');
  });

  test('pelanggan proposal Pak Wahyudi menampilkan faktur belum lunas dari data', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    await customerRow(page, 'Pak Wahyudi').click();
    const detail = page.locator('.pos-split__detail');
    await expect(detail.locator('[data-row="total-piutang"]')).toContainText('Rp 10.000.000');
    await expect(detail.locator('[data-row="sisa-limit"]')).toContainText('Rp 40.000.000');
    await expect(detail.getByRole('heading', { name: 'Faktur belum lunas' })).toBeVisible();
    const invoices = detail.locator('.pos-cust-invoice');
    await expect(invoices).toHaveCount(4);
    await expect(invoices.first()).toContainText('FJ26091234');
    await expect(invoices.first()).toContainText('Rp 1.000.000');
    await expect(invoices.first()).toContainText('Terlambat');
    await expect(invoices.nth(1)).toContainText('FJ26108899');
    await expect(invoices.nth(1)).toContainText('Rp 5.000.000');
    await expect(invoices.nth(1)).not.toContainText('Terlambat');
    await expect(invoices.last()).toContainText('FJ26105678');
    await customerRow(page, 'Kevin Wahyudi').click();
    await expect(detail.locator('.pos-cust-invoice')).toHaveCount(0);
    await expect(detail.getByText('Tidak ada faktur belum lunas.')).toBeVisible();
  });

  test('tombol tambah membuka formulir pelanggan baru dan kembali ke daftar setelah simpan', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    await page.getByRole('button', { name: 'Tambah Pelanggan' }).click();
    await expect(page).toHaveURL(/#\/pos\/pelanggan-baru$/);
    await page.getByRole('button', { name: 'Batal' }).click();
    await expect(page).toHaveURL(/#\/pos\/pelanggan$/);
    await page.getByRole('button', { name: 'Tambah Pelanggan' }).click();
    await page.getByLabel('Nama pelanggan').fill('Toko Baru Sentosa');
    await page.getByLabel('Nomor telepon').fill('081234567890');
    await page.getByRole('button', { name: 'Simpan Pelanggan' }).click();
    await expect(page).toHaveURL(/#\/pos\/pelanggan$/);
    const added = customerRow(page, 'Toko Baru Sentosa');
    await expect(added).toBeVisible();
    await expect(
      page.locator('.pos-cust-group', { has: added }).locator('.pos-cust-group__letter'),
    ).toHaveText('T');
  });

  test('menu Pelanggan menuju daftar', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await page.getByRole('button', { name: 'Menu' }).click();
    const link = page
      .getByRole('dialog', { name: 'Toko Budiannor' })
      .getByRole('link', { name: 'Pelanggan', exact: true });
    await expect(link).toHaveAttribute('href', '#/pos/pelanggan');
    await link.click();
    await expect(page).toHaveURL(/#\/pos\/pelanggan$/);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Toko Budiannor' })
        .getByRole('link', { name: 'Pelanggan', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('Pelanggan lolos axe mode terang dan gelap', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toCustomers(page);
    await customerRow(page, 'Pak Wahyudi').click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, scheme).toEqual([]);
    }
  });
});

test.describe('Pengaturan', () => {
  const MENU = [
    'Profil Pengguna',
    'Printer',
    'Mesin EDC',
    'Perangkat',
    'Backup Data',
    'Pengaturan Lainnya',
  ];
  async function toSettings(page: Page): Promise<void> {
    await openDrawerItem(page, 'Pengaturan');
    await expect(page).toHaveURL(/#\/pos\/pengaturan$/);
    await expect(page.locator('.pos-settings-item').first()).toBeVisible();
  }
  async function openPanel(page: Page, name: string): Promise<Locator> {
    await page.getByRole('button', { name, exact: true }).click();
    const detail = page.locator('.pos-split__detail');
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
    return detail;
  }
  async function typePinDigits(page: Page, pin: string): Promise<void> {
    for (const digit of pin) {
      await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
  }
  async function simulate(page: Page, action: string): Promise<void> {
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('.sim__action', { hasText: action }).click();
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.locator('#sim-body')).toBeHidden();
  }

  test('Pengaturan menampilkan enam menu dan Profil Pengguna', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    await expect(page.locator('.pos-settings-item')).toHaveText(MENU);
    const detail = page.locator('.pos-split__detail');
    await expect(detail.getByRole('heading', { name: 'Profil Pengguna' })).toBeVisible();
    await expect(detail.locator('[data-row="nama"]')).toContainText('Dewi');
    await expect(detail.locator('[data-row="peran"]')).toContainText('Kasir');
    await expect(detail.getByRole('heading', { name: 'Ubah PIN' })).toBeVisible();
    await expect(detail.getByLabel('PIN lama', { exact: true })).toBeVisible();
    await expect(detail.getByLabel('PIN baru', { exact: true })).toBeVisible();
    await expect(detail.getByLabel('Ulangi PIN baru', { exact: true })).toBeVisible();
  });

  test('Ubah PIN menampilkan galat untuk isian yang salah', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const detail = page.locator('.pos-split__detail');
    const fill = async (oldPin: string, next: string, again: string): Promise<void> => {
      await detail.getByLabel('PIN lama', { exact: true }).fill(oldPin);
      await detail.getByLabel('PIN baru', { exact: true }).fill(next);
      await detail.getByLabel('Ulangi PIN baru', { exact: true }).fill(again);
      await detail.getByRole('button', { name: 'Ubah PIN', exact: true }).click();
    };
    await fill('2468', '1357', '1358');
    await expect(detail.getByText('Ulangi PIN baru tidak sama dengan PIN baru.')).toBeVisible();
    await fill('2468', '12', '12');
    await expect(detail.getByText('PIN baru harus 4 sampai 6 digit angka.')).toBeVisible();
    await fill('2468', '2468', '2468');
    await expect(detail.getByText('PIN baru tidak boleh sama dengan PIN lama.')).toBeVisible();
    await fill('0000', '1357', '1357');
    await expect(detail.getByText('PIN salah. Sisa percobaan: 2.')).toBeVisible();
  });

  test('Ubah PIN berhasil lalu login ulang memakai PIN baru', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const detail = page.locator('.pos-split__detail');
    await detail.getByLabel('PIN lama', { exact: true }).fill('2468');
    await detail.getByLabel('PIN baru', { exact: true }).fill('1357');
    await detail.getByLabel('Ulangi PIN baru', { exact: true }).fill('1357');
    await detail.getByRole('button', { name: 'Ubah PIN', exact: true }).click();
    await expect(page.getByText(/PIN berhasil diubah/)).toBeVisible();
    await expect(detail.getByLabel('PIN lama', { exact: true })).toHaveValue('');
    await expect(detail.getByLabel('PIN baru', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page
      .getByRole('dialog', { name: 'Toko Budiannor' })
      .getByRole('button', { name: 'Keluar' })
      .click();
    await expect(page).toHaveURL(/#\/pos$/);
    await page.getByRole('radio', { name: /Dewi/ }).click();
    await typePinDigits(page, '2468');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByText('PIN salah. Sisa percobaan: 2.')).toBeVisible();
    await typePinDigits(page, '1357');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('Uji Cetak membuka pratinjau struk contoh', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const detail = await openPanel(page, 'Printer');
    await expect(detail.locator('[data-row="status"]')).toContainText('Terhubung');
    await detail.getByRole('button', { name: 'Uji Cetak' }).click();
    const preview = page.getByRole('dialog', { name: 'Pratinjau struk' });
    await expect(preview).toBeVisible();
    await expect(preview.locator('.pos-receipt')).toContainText(/barang contoh/i);
    await preview.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(page.getByText('Struk tercetak.')).toBeVisible();
  });

  test('Printer menampilkan Terputus saat disimulasikan terputus', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const detail = await openPanel(page, 'Printer');
    await expect(detail.locator('[data-row="status"]')).toContainText('Terhubung');
    await simulate(page, 'Printer');
    await expect(detail.locator('[data-row="status"]')).toContainText('Terputus');
    await detail.getByRole('button', { name: 'Uji Cetak' }).click();
    const preview = page.getByRole('dialog', { name: 'Pratinjau struk' });
    await preview.getByRole('button', { name: 'Cetak', exact: true }).click();
    await expect(
      page.getByText('Struk belum tercetak. Periksa printer lalu coba lagi.'),
    ).toBeVisible();
  });

  test('Mesin EDC dan Perangkat menampilkan status simulasi dan identitas mockup', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const edc = await openPanel(page, 'Mesin EDC');
    await expect(edc.locator('[data-row="status"]')).toContainText('Terhubung');
    await edc.getByRole('button', { name: 'Uji Koneksi' }).click();
    await expect(page.getByText('Koneksi mesin EDC berhasil (simulasi).')).toBeVisible();
    const device = await openPanel(page, 'Perangkat');
    await expect(device.locator('[data-row="nama"]')).toContainText('Tablet Kasir (simulasi)');
    await expect(device.locator('[data-row="outlet"]')).toContainText('Toko Budiannor');
    await expect(device.locator('[data-row="versi"]')).toContainText('Revisi POS 2');
  });

  test('Unduh Cadangan menghasilkan berkas JSON dengan kunci sales dan shift', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await sellFirstProduct(page, 'tunai');
    await toSettings(page);
    const detail = await openPanel(page, 'Backup Data');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      detail.getByRole('button', { name: 'Unduh Cadangan' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cadangan-pos-\d{8}-\d{4}\.json$/);
    const path = await download.path();
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown[]>;
    for (const key of ['sales', 'expenses', 'returns', 'heldBills', 'closedShifts']) {
      expect(Array.isArray(parsed[key]), key).toBe(true);
    }
    expect(JSON.stringify(parsed['sales'])).toContain('T-000141');
    expect(Object.keys(parsed)).not.toContain('pins');
    await expect(page.getByText('Cadangan diunduh.')).toBeVisible();
  });

  test('Tema dan Mode berubah langsung dari Pengaturan', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page, 'Dewi');
    await toSettings(page);
    const detail = await openPanel(page, 'Pengaturan Lainnya');
    const root = page.locator('html');
    await detail
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Biru' })
      .click();
    await expect(root).toHaveAttribute('data-pos-theme', 'biru');
    await expect(
      detail.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Biru' }),
    ).toHaveAttribute('aria-checked', 'true');
    await detail
      .getByRole('radiogroup', { name: 'Mode Tampilan' })
      .getByRole('radio', { name: 'Gelap' })
      .click();
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await page.reload();
    await expect(root).toHaveAttribute('data-pos-theme', 'biru');
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
  });

  test('Tampilan katalog Daftar mengubah layar jual menjadi baris', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await expect(page.locator('.pos-grid')).not.toHaveClass(/pos-grid--daftar/);
    const cards = page.locator('.pos-card');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(Math.abs((first?.x ?? 0) - (second?.x ?? 0))).toBeGreaterThan(20);
    await toSettings(page);
    const detail = await openPanel(page, 'Pengaturan Lainnya');
    await detail
      .getByRole('radiogroup', { name: 'Tampilan katalog' })
      .getByRole('radio', { name: 'Daftar' })
      .click();
    expect(await page.evaluate(() => localStorage.getItem('toko-budiannor-katalog-pos'))).toBe(
      'daftar',
    );
    await openDrawerItem(page, 'Pesanan Baru');
    await expect(page.locator('.pos-grid')).toHaveClass(/pos-grid--daftar/);
    const rowA = await cards.nth(0).boundingBox();
    const rowB = await cards.nth(1).boundingBox();
    expect(Math.abs((rowA?.x ?? 0) - (rowB?.x ?? 0))).toBeLessThan(1);
    expect(rowB?.y ?? 0).toBeGreaterThan(rowA?.y ?? 0);
    expect(rowA?.height ?? 999).toBeLessThan(140);
    await page.locator('.pos-card__main').first().click();
    await expect(page.locator('.pos-bill-panel')).toContainText('Pesanan (1)');
  });

  test('menu samping memiliki tautan Pengaturan dan tidak lagi memuat pemilih tema', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    const drawer = await openDrawer(page);
    await expect(drawer.getByRole('link', { name: 'Pengaturan', exact: true })).toHaveAttribute(
      'href',
      '#/pos/pengaturan',
    );
    await expect(drawer.getByRole('radiogroup')).toHaveCount(0);
    await expect(drawer.getByText('Tema', { exact: true })).toHaveCount(0);
    await drawer.getByRole('link', { name: 'Pengaturan', exact: true }).click();
    await expect(page).toHaveURL(/#\/pos\/pengaturan$/);
  });

  test('Frontliner tidak melihat Pengaturan dan rutenya kembali ke layar jual', async ({
    page,
  }) => {
    await loginPosRaw(page, 'Agus');
    const drawer = await openDrawer(page);
    await expect(drawer.getByRole('link', { name: 'Pengaturan', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.location.hash = '/pos/pengaturan';
    });
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('Pengaturan lolos axe mode terang dan gelap pada semua panel', async ({ page }) => {
    await loginPos(page, 'Dewi');
    await toSettings(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const name of MENU) {
        await openPanel(page, name);
        await page.evaluate(() => document.fonts.ready);
        await settle(page);
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(result.violations, `${scheme} ${name}`).toEqual([]);
      }
    }
  });
});

test.describe('susunan kartu barang seperti referensi', () => {
  const rgbOf = (hex: string): string => {
    const value = hex.replace('#', '');
    const parts = [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
    return `rgb(${parts.join(', ')})`;
  };

  test('tiga kolom: foto besar di atas, nama rata kiri, lalu harga beraksen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPos(page, 'Dewi');
    const cards = page.locator('.pos-card');
    await expect(cards.nth(3)).toBeVisible();
    const boxes = await Promise.all([0, 1, 2, 3, 4].map((index) => cards.nth(index).boundingBox()));
    const [one, two, three] = boxes;
    // Jumlah kolom: kartu yang sebaris dengan kartu pertama. 3 kolom pada 1280 dan 1366 px, boleh 4 pada layar lebih lebar.
    const columns = boxes.filter((box) => Math.abs((box?.y ?? 99) - (one?.y ?? 0)) < 1).length;
    const width = page.viewportSize()?.width ?? 0;
    expect(columns).toBeGreaterThanOrEqual(3);
    expect(columns).toBeLessThanOrEqual(4);
    if (width <= 1366) {
      expect(columns).toBe(3);
    }
    const next = boxes[columns];
    expect((next?.y ?? 0) - (one?.y ?? 0)).toBeGreaterThan(150);
    expect(Math.abs((one?.height ?? 0) - (two?.height ?? 99))).toBeLessThan(1.5);
    expect(Math.abs((one?.height ?? 0) - (three?.height ?? 99))).toBeLessThan(1.5);

    const first = cards.first();
    const card = await first.boundingBox();
    const photo = await first.locator('.pos-photo').boundingBox();
    const name = await first.locator('.pos-card__name').boundingBox();
    const price = await first.locator('.pos-card__price').first().boundingBox();
    const stock = await first.locator('.pos-card__stock').boundingBox();
    expect((photo?.y ?? 0) + (photo?.height ?? 0)).toBeLessThanOrEqual((name?.y ?? 0) + 1);
    expect((name?.y ?? 0) + (name?.height ?? 0)).toBeLessThanOrEqual((price?.y ?? 0) + 1);
    expect(photo?.width ?? 0).toBeGreaterThan((card?.width ?? 0) * 0.75);
    expect(photo?.height ?? 0).toBeGreaterThanOrEqual(100);
    // Foto berada di dalam kartu dengan jarak, bukan menempel ke tepi.
    expect((photo?.x ?? 0) - (card?.x ?? 0)).toBeGreaterThanOrEqual(8);
    // Blok stok menempel di dasar kartu pada ketiga kartu satu baris.
    for (const index of [0, 1, 2]) {
      const item = cards.nth(index);
      const itemBox = await item.boundingBox();
      const itemStock = await item.locator('.pos-card__stock').boundingBox();
      expect(
        (itemBox?.y ?? 0) +
          (itemBox?.height ?? 0) -
          ((itemStock?.y ?? 0) + (itemStock?.height ?? 0)),
        `kartu ${String(index)}`,
      ).toBeLessThan(2);
    }
    expect((stock?.y ?? 0) + (stock?.height ?? 0)).toBeLessThanOrEqual(
      (card?.y ?? 0) + (card?.height ?? 0) + 1,
    );

    const style = await first.locator('.pos-card__name').evaluate((node) => {
      const computed = getComputedStyle(node);
      return { align: computed.textAlign, transform: computed.textTransform };
    });
    expect(style).toEqual({ align: 'left', transform: 'none' });
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent-default').trim(),
    );
    const amountColor = await first
      .locator('.pos-card__amount')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(amountColor).toBe(rgbOf(accent));
  });

  test('semua tombol pada kartu tetap berukuran sentuh dan harga satuan dapat diketuk', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    const heights = await page.locator('.pos-card button').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(heights.length).toBeGreaterThan(8);
    for (const box of heights) {
      expect(box.height).toBeGreaterThanOrEqual(47.5);
      expect(box.width).toBeGreaterThanOrEqual(47.5);
    }
    await page.locator('.pos-card .pos-card__price').first().click();
    await expect(page.locator('.pos-bill-panel')).toContainText('Pesanan (1)');
  });
});

test.describe('pemuatan malas layar sekunder', () => {
  const SECONDARY = /\/assets\/(settings|employees)-[^/]+\.js/;
  const requested = (page: Page): Promise<string[]> =>
    page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));

  test('modul Pengaturan dan Karyawan tidak diminta sebelum rute dikunjungi', async ({ page }) => {
    await loginPos(page, 'Ibu Sinta');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    expect((await requested(page)).filter((name) => SECONDARY.test(name))).toEqual([]);
    await openDrawerItem(page, 'Karyawan');
    await expect(page.locator('.pos-employee').first()).toBeVisible();
    let names = await requested(page);
    expect(names.some((name) => name.includes('/assets/employees-'))).toBe(true);
    expect(names.some((name) => name.includes('/assets/settings-'))).toBe(false);
    await openDrawerItem(page, 'Pengaturan');
    await expect(page.locator('.pos-settings-item').first()).toBeVisible();
    names = await requested(page);
    expect(names.some((name) => name.includes('/assets/settings-'))).toBe(true);
  });

  test('layar sekunder menampilkan keadaan memuat lalu isi', async ({ page }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.route(/\/assets\/employees-[^/]+\.js/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await openDrawerItem(page, 'Karyawan');
    const loading = page.locator('.pos-loading');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText('Memuat data');
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(page.locator('.pos-employee').first()).toBeVisible();
    await expect(loading).toHaveCount(0);
  });

  test('berpindah rute dengan cepat tidak menumpuk atau menyisakan layar lama', async ({
    page,
  }) => {
    await loginPos(page, 'Ibu Sinta');
    await page.route(SECONDARY, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await page.evaluate(() => {
      window.location.hash = '/pos/karyawan';
    });
    await expect(page.locator('.pos-loading')).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = '/pos/pengaturan';
    });
    await page.evaluate(() => {
      window.location.hash = '/pos/jual';
    });
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(page.locator('.pos-sell')).toBeVisible();
    // Modul yang terlambat tiba tidak boleh dipasang di atas layar jual.
    await page.waitForTimeout(1600);
    await expect(page.locator('#root > *')).toHaveCount(1);
    await expect(page.locator('.pos-sell')).toBeVisible();
    await expect(page.locator('.pos-employee, .pos-settings-item, .pos-loading')).toHaveCount(0);
  });
});

test.describe('penyimpanan diblokir', () => {
  test('palet dan mode tetap berlaku di layar lain walau penyimpanan menolak tulisan', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      // Dipanggil ulang lewat call(this) pada penyimpanan yang sama, jadi tidak ada this yang hilang.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string): void {
        if (key === 'toko-budiannor-tema-pos' || key === 'toko-budiannor-mode-pos') {
          throw new DOMException('penyimpanan penuh', 'QuotaExceededError');
        }
        original.call(this, key, value);
      };
    });
    await loginPos(page, 'Dewi');
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    const panel = page.locator('.pos-split__detail');
    await panel
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Biru' })
      .click();
    await panel
      .getByRole('radiogroup', { name: 'Mode Tampilan' })
      .getByRole('radio', { name: 'Gelap' })
      .click();
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-pos-theme', 'biru');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
    await openDrawerItem(page, 'Pesanan Baru');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(root).toHaveAttribute('data-pos-theme', 'biru');
    await expect(root).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(root).toHaveAttribute('data-pos-scheme', 'gelap');
  });
});
