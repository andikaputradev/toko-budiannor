import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  finishPaymentDialog,
  loginPos,
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
