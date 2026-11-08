import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  loginPosRaw,
  openDrawerItem,
  sellFirstProduct,
  sellSplitThree,
  settle,
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
    const drawer = await openDrawer(page);
    await drawer
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
    const drawer = await openDrawer(page);
    await drawer
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

  test('barang bangkitan memakai foto kategori yang ada dan memuat gambarnya', async ({ page }) => {
    await loginPos(page);
    await search(page, 'Cat Tembok');
    const card = page.locator('.pos-card', { hasText: /CAT TEMBOK/i }).first();
    const photo = card.locator('img.pos-photo--img');
    await expect(photo).toHaveAttribute('src', /kategori\/cat\.webp$/);
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
  });

  test('barang bangkitan tanpa foto kategori tetap memakai kotak placeholder', async ({ page }) => {
    await loginPos(page);
    await search(page, 'Stop Kontak');
    const card = page.locator('.pos-card', { hasText: /STOP KONTAK/i }).first();
    await expect(card.locator('span.pos-photo')).toBeVisible();
    await expect(card.locator('img.pos-photo--img')).toHaveCount(0);
  });

  test('barang proposal tetap memakai fotonya sendiri, bukan foto kategori', async ({ page }) => {
    await loginPos(page);
    const semen = page.locator('.pos-card', { hasText: /SEMEN GRESIK/i }).first();
    await expect(semen.locator('img.pos-photo--img')).toHaveAttribute(
      'src',
      /produk\/semen-gresik-40kg\.webp$/,
    );
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
    await page.getByRole('button', { name: '45 hari' }).click();
    await expect(page.locator('.pos-pay__due')).toContainText('3 Des 2026');
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

test.describe('Non-Tunai dan QR', () => {
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
  const qrDialog = (page: Page) => page.getByRole('dialog', { name: 'Scan QR Code' });

  test('Non-Tunai menampilkan kartu QRIS, Gopay, OVO, Shopee Pay, EDC, Transfer BCA, BRI, Mandiri', async ({
    page,
  }) => {
    await toNonCash(page);
    await expect(
      page.getByRole('group', { name: 'Kanal pembayaran' }).getByRole('button'),
    ).toHaveText([
      'QRIS',
      'Gopay',
      'OVO',
      'Shopee Pay',
      'EDC',
      'Transfer BCA',
      'Transfer BRI',
      'Transfer Mandiri',
    ]);
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('memilih Gopay membuka Scan QR Code dengan Tagihan sama dengan total', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'Gopay').click();
    const dialog = qrDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pos-qr__amount')).toHaveText('Rp 70.000');
    await expect(dialog.getByText('Tagihan', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Reference ID', { exact: true })).toBeVisible();
    await expect(dialog.locator('.pos-qr__reference')).toHaveText(/^QR\d{10}$/);
    await expect(dialog.locator('svg.pos-qr__code')).toBeVisible();
    await expect(dialog.locator('svg.pos-qr__code path')).toHaveCount(1);
  });

  test('Bayar tetap nonaktif untuk kanal QR sebelum Cek Status', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'QRIS').click();
    await expect(qrDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(qrDialog(page)).toBeHidden();
    await expect(card(page, 'QRIS')).toHaveAttribute('aria-pressed', 'true');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('Cek Status Pembayaran menandai diterima sekali lalu Bayar aktif', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'Gopay').click();
    const dialog = qrDialog(page);
    const check = dialog.getByRole('button', { name: 'Cek Status Pembayaran' });
    await check.click();
    await check.dispatchEvent('click');
    await check.dispatchEvent('click');
    await expect(dialog).toBeHidden({ timeout: 5000 });
    await expect(page.getByText('Pembayaran diterima', { exact: true })).toBeVisible();
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('QRIS Gopay');
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(1);
  });

  test('Ubah metode menutup modal dan kembali ke daftar kanal', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'OVO').click();
    await qrDialog(page).getByRole('button', { name: 'Ubah Metode Pembayaran' }).click();
    await expect(qrDialog(page)).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Non-Tunai' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(card(page, 'OVO')).toHaveAttribute('aria-pressed', 'false');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('Cetak Kode QR membuka pratinjau', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'Shopee Pay').click();
    await qrDialog(page).getByRole('button', { name: 'Cetak Kode QR' }).click();
    await expect(page.getByRole('dialog', { name: 'Pratinjau Struk' })).toBeVisible();
    await expect(page.locator('.pos-receipt')).toContainText('STRUK DRAF');
  });

  test('Transfer BCA meminta Nomor Referensi dan kanal BCA tampil di riwayat', async ({ page }) => {
    await toNonCash(page);
    await expect(page.getByRole('textbox', { name: 'Nomor Referensi' })).toBeHidden();
    await card(page, 'Transfer BCA').click();
    await expect(qrDialog(page)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Nomor Referensi' })).toBeVisible();
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await expect(page.locator('.pos-history__detail')).toContainText('Transfer BCA');
  });

  test('EDC langsung memilih tanpa modal QR dan meminta Nomor Referensi', async ({ page }) => {
    await toNonCash(page);
    await card(page, 'EDC').click();
    await expect(qrDialog(page)).toHaveCount(0);
    await expect(card(page, 'EDC')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name: 'Nomor Referensi' })).toBeVisible();
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
  });

  test('Non-Tunai dan modal QR lolos axe dan target 48 px pada mode terang dan gelap', async ({
    page,
  }) => {
    await toNonCash(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      const tab = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(tab.violations, `${scheme} tab`).toEqual([]);
      await card(page, 'Gopay').click();
      await expect(qrDialog(page)).toBeVisible();
      await settle(page);
      const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(modal.violations, `${scheme} modal`).toEqual([]);
      const heights = await qrDialog(page)
        .locator('button')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      for (const height of heights) {
        expect(height, scheme).toBeGreaterThanOrEqual(47.5);
      }
      await page.keyboard.press('Escape');
      await expect(qrDialog(page)).toBeHidden();
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

  test('Split menampilkan Pembayaran 1 dan Pembayaran 2 dan tombol + Tambah Pembayaran', async ({
    page,
  }) => {
    await toSplit(page);
    await expect(slot(page, 1)).toBeVisible();
    await expect(slot(page, 2)).toBeVisible();
    await expect(slot(page, 3)).toHaveCount(0);
    await expect(slot(page, 1)).toContainText('Pilih pembayaran');
    await expect(page.getByRole('button', { name: 'Tambah Pembayaran' })).toBeVisible();
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 70.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('dua pembayaran Tunai dan Transfer BCA menjumlah sampai total lalu Bayar aktif', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { digits: '30000' });
    await expect(slot(page, 1)).toContainText('Tunai');
    await expect(slot(page, 1)).toContainText('Rp 30.000');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 40.000');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
    await savePart(page, 2, { channel: 'Transfer BCA', digits: '40000' });
    await expect(slot(page, 2)).toContainText('Transfer BCA');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('Transfer BCA');
    await expect(detail).toContainText('Rp 40.000');
    await expect(detail).toContainText('Rp 30.000');
  });

  test('Tambah Pembayaran menambah baris ketiga', async ({ page }) => {
    await toSplit(page);
    await page.getByRole('button', { name: 'Tambah Pembayaran' }).click();
    await expect(slot(page, 3)).toBeVisible();
    await expect(slot(page, 3)).toContainText('Pilih pembayaran');
    await page.getByRole('button', { name: 'Tambah Pembayaran' }).click();
    await expect(slot(page, 4)).toBeVisible();
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
    await expect(dialog.getByRole('alert')).toHaveText('Pilih kanal pembayaran terlebih dahulu.');
  });

  test('dua baris Transfer beda kanal tersimpan terpisah dan tampil di riwayat', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer BCA', digits: '30000' });
    await savePart(page, 2, { channel: 'Transfer BRI', digits: '40000' });
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
    await pay(page).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail.locator('.pos-history__pay li')).toHaveCount(2);
    await expect(detail).toContainText('Transfer BCA');
    await expect(detail).toContainText('Transfer BRI');
  });

  test('pasangan metode dan kanal yang sama ditolak pada pembayaran lain', async ({ page }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer BCA', digits: '30000' });
    await slot(page, 2).click();
    const dialog = partDialog(page, 2);
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await dialog
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'Transfer BCA', exact: true })
      .click();
    await padIn(dialog, '1000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Cara bayar dan kanal ini sudah dipakai pada pembayaran lain.',
    );
  });

  test('tunai boleh melebihi sisa dan menghasilkan kembalian, non-tunai dibatasi sisa', async ({
    page,
  }) => {
    await toSplit(page);
    await savePart(page, 1, { channel: 'Transfer BCA', digits: '30000' });
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

  test('kanal QR pada Split meminta Cek Status sebelum Bayar aktif', async ({ page }) => {
    await toSplit(page);
    await savePart(page, 1, { digits: '30000' });
    await slot(page, 2).click();
    const dialog = partDialog(page, 2);
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await dialog
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'Gopay', exact: true })
      .click();
    await padIn(dialog, '40000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    const qr = page.getByRole('dialog', { name: 'Scan QR Code' });
    await expect(qr).toBeVisible();
    await expect(qr.locator('.pos-qr__amount')).toHaveText('Rp 40.000');
    await page.keyboard.press('Escape');
    await expect(qr).toBeHidden();
    await expect(slot(page, 2)).toContainText('Menunggu pembayaran');
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'true');
    await slot(page, 2).click();
    await partDialog(page, 2).getByRole('button', { name: 'Simpan' }).click();
    await expect(qr).toBeVisible();
    await qr.getByRole('button', { name: 'Cek Status Pembayaran' }).click();
    await expect(qr).toBeHidden({ timeout: 5000 });
    await expect(slot(page, 2)).toContainText('Pembayaran diterima');
    await expect(pay(page)).toHaveAttribute('aria-disabled', 'false');
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
