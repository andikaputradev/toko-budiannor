import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  loginPosRaw,
  openDrawerItem,
  savePart,
  settle,
  startShift,
  typeAmount,
} from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

test.describe('shift', () => {
  test('belum mulai shift, modal wajib diisi, lalu shift dimulai', async ({ page }) => {
    await loginPosRaw(page);
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
    await expect(
      page.getByText('Tekan tombol "Mulai Shift" untuk memulai pekerjaan Anda'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Isi modal awal terlebih dahulu.');
    await dialog.getByRole('button', { name: '1', exact: true }).click();
    await dialog.getByRole('button', { name: '000', exact: true }).click();
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 1.000');
    await dialog.getByRole('button', { name: 'C', exact: true }).click();
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 0');
    await dialog.getByRole('button', { name: '2', exact: true }).click();
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeHidden();
  });

  test('axe: gerbang shift dan modal modal awal tanpa pelanggaran', async ({ page }) => {
    await loginPosRaw(page);
    await page.evaluate(() => document.fonts.ready);
    const gate = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(gate.violations).toEqual([]);
    await page.getByRole('button', { name: 'Mulai Shift' }).click();
    await expect(page.getByRole('dialog', { name: 'Masukkan Modal' })).toBeVisible();
    const modal = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(modal.violations).toEqual([]);
    const keys = page.getByRole('dialog').getByRole('button');
    for (const box of await keys.evaluateAll((nodes) =>
      nodes.map(
        (node) => node.getBoundingClientRect().toJSON() as { width: number; height: number },
      ),
    )) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('Biaya tanpa shift menampilkan gerbang yang sama', async ({ page }) => {
    await loginPosRaw(page);
    await page.evaluate(() => {
      window.location.hash = '/pos/biaya';
    });
    await expect(page).toHaveURL(/#\/pos\/biaya$/);
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeVisible();
  });

  test('Frontliner langsung melihat kartu barang tanpa gerbang', async ({ page }) => {
    await loginPosRaw(page, 'Agus');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeHidden();
  });
});

test.describe('kerangka', () => {
  test('menu samping membuka layar dan menutup diri', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Riwayat Penjualan' }).click();
    await expect(page).toHaveURL(/#\/pos\/riwayat$/);
    await expect(drawer).toBeHidden();
  });

  test('Frontliner tidak melihat Riwayat, Biaya, dan Selesai Shift', async ({ page }) => {
    await loginPosRaw(page, 'Agus');
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Toko Budiannor' });
    await expect(drawer.getByRole('link', { name: 'Pesanan Baru' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Open Bill', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Riwayat Penjualan' })).toHaveCount(0);
    await expect(drawer.getByRole('link', { name: 'Biaya' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Selesai Shift' })).toHaveCount(0);
  });

  test('pemilih tema mengubah atribut, tersimpan, dan bertahan setelah muat ulang', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Pengaturan Lainnya', exact: true }).click();
    const themes = page.getByRole('radiogroup', { name: 'Tema' });
    await expect(themes.getByRole('radio', { name: 'Oranye' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await themes.getByRole('radio', { name: 'Teal' }).click();
    await expect(themes.getByRole('radio', { name: 'Teal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await page.evaluate(() => document.documentElement.dataset['posTheme'])).toBe('teal');
    expect(await page.evaluate(() => localStorage.getItem('toko-budiannor-tema-pos'))).toBe('teal');
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset['posTheme'])).toBe('teal');
  });

  test('lencana Open Bill dan Selesai Shift yang langsung keluar', async ({ page }) => {
    await loginPos(page);
    await expect(page.locator('.pos-billlink .pos-badge')).toHaveText('3');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Selesai Shift' }).click();
    const summary = page.getByRole('dialog', { name: 'Selesai Shift' });
    await expect(summary).toContainText('Rp 500.000');
    await summary.getByRole('button', { name: 'Akhiri Shift' }).click();
    // Akhiri Shift langsung keluar (log off) dan kembali ke layar PIN.
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
  });

  test('Keluar menuju login gelap, dan pengguna lain melanjutkan shift yang berjalan', async ({
    page,
  }) => {
    await loginPos(page, 'Dewi');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.locator('[data-pos-surface="dark"]')).toBeVisible();
    await loginPosRaw(page, 'Rizal');
    await expect(page.locator('.pos-card').first()).toBeVisible();
    // Shift Dewi masih berjalan, jadi Rizal tidak diminta memulai shift lagi.
    await expect(page.getByRole('heading', { name: 'Belum Mulai Shift' })).toBeHidden();
  });

  test('axe: menu samping terbuka tanpa pelanggaran dan semua kontrol 48 px', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Toko Budiannor' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
    const boxes = await page
      .getByRole('dialog')
      .locator('a, button')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) => node.getBoundingClientRect().toJSON() as { width: number; height: number },
        ),
      );
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });
});

test.describe('tema', () => {
  const combos = ['oranye', 'terakota', 'teal', 'biru', 'hijau', 'ungu', 'merah', 'kuning'].flatMap(
    (theme) => ['terang', 'gelap'].map((mode) => ({ theme, mode })),
  );
  for (const { theme, mode } of combos) {
    test(`axe: login, gerbang shift, dan layar jual pada palet ${theme} mode ${mode}`, async ({
      page,
    }) => {
      await page.goto('/#/pos');
      await page.evaluate(
        ({ themeValue, modeValue }) => {
          localStorage.setItem('toko-budiannor-tema-pos', themeValue);
          localStorage.setItem('toko-budiannor-mode-pos', modeValue);
        },
        { themeValue: theme, modeValue: mode },
      );
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const login = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(login.violations).toEqual([]);
      await loginPosRaw(page);
      const gate = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(gate.violations).toEqual([]);
      await startShift(page);
      const sell = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(sell.violations).toEqual([]);
    });
  }
});

test.describe('layar jual', () => {
  test('kartu proposal memuat harga per satuan serta stok toko, gudang, dan PO', async ({
    page,
  }) => {
    await loginPos(page);
    const semen = page.locator('.pos-card').first();
    await expect(semen).toContainText('SEMEN GRESIK 40KG');
    await expect(semen.locator('.pos-card__price[data-unit="SAK"]')).toContainText('Rp 70.000');
    await expect(semen.locator('.pos-card__stock')).toContainText('28 SAK');
    await expect(semen.locator('.pos-card__stock')).toContainText('800 SAK');
    const fox = page.locator('.pos-card', { hasText: 'LEM FOX 70 GRAM' });
    // Stok PO tidak ditampilkan lagi (diganti No Rak): Toko 78, Gudang 144.
    await expect(fox.locator('.pos-card__stock')).toContainText('78 KLG');
    await expect(fox.locator('.pos-card__stock')).toContainText('144 KLG');
    await expect(fox.locator('.pos-card__stock')).not.toContainText('PO');
    await fox.locator('.pos-card__price[data-unit="DOS"]').click();
    const line = page.locator('.pos-order__item').first();
    await expect(line).toContainText('LEM FOX 70 GRAM');
    await expect(line).toContainText('QTY : 1 X 600.000');
    await expect(page.getByRole('heading', { name: 'Pesanan (1)' })).toBeVisible();
  });

  test('dropdown kategori memfilter kartu dan Esc menutupnya', async ({ page }) => {
    await loginPos(page);
    await page.getByRole('button', { name: /Semua Kategori/ }).click();
    const list = page.getByRole('listbox', { name: 'Kategori barang' });
    await expect(list).toBeVisible();
    await list.getByRole('option', { name: 'Door & Window' }).click();
    await expect(list).toBeHidden();
    await expect(page.locator('.pos-card')).toHaveCount(1);
    await expect(page.locator('.pos-card').first()).toContainText('ENGSEL BELLUCCI SN 5');
    await page.getByRole('button', { name: /Door & Window/ }).click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
  });

  test('pelanggan: label KODE - NAMA (TIER) dan modal daftar dengan Tambah Pelanggan', async ({
    page,
  }) => {
    await loginPos(page);
    const button = page.locator('.pos-customer-btn');
    await expect(button).toContainText('UMUM (ECERAN)');
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Pilih Pelanggan' });
    await dialog.locator('.pos-customers__row', { hasText: 'Kevin Wahyudi' }).click();
    await expect(button).toContainText('PL387 - KEVIN WAHYUDI (ECERAN)');
    await button.click();
    await page
      .getByRole('dialog', { name: 'Pilih Pelanggan' })
      .getByRole('button', { name: 'Tambah Pelanggan' })
      .click();
    await expect(page).toHaveURL(/#\/pos\/pelanggan-baru$/);
  });

  test('panel pesanan: kosong, lalu jumlah, baris QTY, dan Bayar dengan total', async ({
    page,
  }) => {
    await loginPos(page);
    await expect(page.getByText('Belum ada barang yang dipilih')).toBeVisible();
    const semen = page.locator('.pos-card').first();
    for (let index = 0; index < 3; index += 1) {
      await semen.locator('.pos-card__main').click();
    }
    await expect(page.getByRole('heading', { name: 'Pesanan (1)' })).toBeVisible();
    await expect(page.locator('.pos-order__item').first()).toContainText('QTY : 3 X 70.000');
    await expect(page.getByRole('button', { name: /^Bayar Rp 210\.000/ })).toBeVisible();
  });

  test('menu titik tiga: Open Bill menaikkan lencana Open Bill dan mengosongkan pesanan', async ({
    page,
  }) => {
    await loginPos(page);
    await page.locator('.pos-card').first().locator('.pos-card__main').click();
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    await expect(page.getByRole('menuitem', { name: 'Panggil Bill' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Open Bill' }).click();
    await expect(page.locator('.pos-billlink .pos-badge')).toHaveText('4');
    await expect(page.getByText('Belum ada barang yang dipilih')).toBeVisible();
  });

  test('Frontliner: tanpa Bayar, dengan Cetak Struk Draf pada menu titik tiga', async ({
    page,
  }) => {
    await loginPosRaw(page, 'Agus');
    await page.locator('.pos-card').first().locator('.pos-card__main').click();
    await expect(page.getByRole('button', { name: /^Bayar/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    await page.getByRole('menuitem', { name: 'Cetak Struk Draf' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('STRUK DRAF, BUKAN BUKTI BAYAR');
  });

  test('axe dan target 48 px pada layar jual dengan dropdown dan menu terbuka', async ({
    page,
  }) => {
    await loginPos(page);
    await page.locator('.pos-card').first().locator('.pos-card__main').click();
    await page.getByRole('button', { name: 'Opsi pesanan' }).click();
    await page.evaluate(() => document.fonts.ready);
    const menu = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(menu.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Semua Kategori/ }).click();
    const dropdown = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(dropdown.violations).toEqual([]);
    await page.keyboard.press('Escape');
    const boxes = await page
      .locator('.pos-sell button, .pos-sell input, .pos-sell a')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => {
            const box = node.getBoundingClientRect();
            return {
              name: node.getAttribute('class') ?? '',
              width: box.width,
              height: box.height,
            };
          }),
      );
    for (const box of boxes) {
      expect(box.width, box.name).toBeGreaterThanOrEqual(47.5);
      expect(box.height, box.name).toBeGreaterThanOrEqual(47.5);
    }
  });
});

test.describe('pembayaran', () => {
  async function toPay(page: Page, customer?: string): Promise<void> {
    await loginPos(page);
    if (customer !== undefined) {
      await chooseCustomer(page, customer);
    }
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
  }
  const finish = (page: Page) => page.getByRole('button', { name: 'Bayar', exact: true });

  test('tunai: Uang Pas lalu Bayar menyimpan transaksi', async ({ page }) => {
    await toPay(page);
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await finish(page).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
  });

  test('QRIS langsung sebesar total dan Bayar aktif tanpa kode QR (konfirmasi manual)', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Non-Tunai' }).click();
    await page.getByRole('button', { name: 'QRIS', exact: true }).click();
    await expect(page.locator('.pos-pay__sisa')).toHaveText('Rp 0');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(finish(page)).toHaveAttribute('aria-disabled', 'false');
  });

  test('Split Payment: tunai 30.000 lalu QRIS dibatasi sisa 40.000', async ({ page }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await savePart(page, 1, { digits: '30000' });
    await expect(page.locator('.pos-pay__sisa')).toContainText('Rp 40.000');
    await expect(finish(page)).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: /^Pembayaran 2/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Pembayaran 2' });
    await dialog.getByRole('tab', { name: 'Non-Tunai' }).click();
    await dialog
      .getByRole('group', { name: 'Kanal pembayaran' })
      .getByRole('button', { name: 'QRIS', exact: true })
      .click();
    for (const digit of '99999') {
      await dialog.locator('.pos-amount').getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(dialog.locator('.pos-amount__value')).toHaveText('Rp 40.000');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pos-pay__sisa')).toContainText('Rp 0');
    await expect(finish(page)).toHaveAttribute('aria-disabled', 'false');
    await finish(page).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
  });

  test('Piutang Bu Sherly: tempo 30 hari, jatuh tempo, DP QRIS, dan sisa tagihan', async ({
    page,
  }) => {
    await toPay(page, 'Bu Sherly');
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(page.getByRole('button', { name: '30 hari' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.pos-pay__due')).toContainText('18 Nov 2026');
    await page.getByRole('button', { name: '7 hari' }).click();
    await expect(page.locator('.pos-pay__due')).toContainText('26 Okt 2026');
    await page.getByLabel('DP', { exact: true }).fill('20000');
    await page.getByRole('button', { name: 'QRIS', exact: true }).click();
    await expect(page.locator('.pos-pay__due-amount')).toContainText('Rp 50.000');
    await page.getByLabel('Hari lainnya').fill('366');
    await expect(page.getByText('Jatuh tempo harus bilangan bulat 0 sampai 365.')).toBeVisible();
    await page.getByLabel('Hari lainnya').fill('14');
    await expect(page.locator('.pos-pay__due')).toContainText('2 Nov 2026');
    await finish(page).click();
    await expect(page.getByText('Transaksi T-000141 tersimpan.')).toBeVisible();
  });

  test('Piutang tanpa pelanggan terdaftar menampilkan MSG-034', async ({ page }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(
      page.getByText('Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan.'),
    ).toBeVisible();
  });

  test('Piutang Pak Wahyudi ditolak MSG-036 dan menawarkan otorisasi Owner', async ({ page }) => {
    await toPay(page, 'Pak Wahyudi');
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await expect(
      page.getByText('Transaksi piutang ditolak: pelanggan memiliki tagihan melewati jatuh tempo.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minta Otorisasi Owner' })).toBeVisible();
  });

  test('angka papan ketik mengisi Jumlah diterima dan Esc kembali ke layar jual', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByRole('heading', { name: 'Pembayaran', exact: true }).click();
    await page.keyboard.type('250');
    await expect(page.locator('.pos-amount__value')).toHaveText('Rp 250');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/pos\/jual$/);
  });

  test('axe dan target 48 px pada layar bayar mode tunai, split, dan piutang', async ({ page }) => {
    await toPay(page, 'Bu Sherly');
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const tunai = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(tunai.violations).toEqual([]);
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await settle(page);
    const split = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(split.violations).toEqual([]);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await settle(page);
    const piutang = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(piutang.violations).toEqual([]);
    const boxes = await page.locator('.pos-pay button, .pos-pay input').evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            name: node.getAttribute('class') ?? '',
            width: box.width,
            height: box.height,
          };
        }),
    );
    for (const box of boxes) {
      expect(box.height, box.name).toBeGreaterThanOrEqual(47.5);
    }
  });
});

test.describe('pembayaran berhasil', () => {
  async function payCash(page: Page, options: { customer?: string; given?: string } = {}) {
    await loginPos(page);
    if (options.customer !== undefined) {
      await chooseCustomer(page, options.customer);
    }
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    if (options.given === undefined) {
      await page.getByRole('button', { name: 'Uang Pas' }).click();
    } else {
      await typeAmount(page, options.given);
    }
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pembayaran Berhasil' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('tunai lebih Rp 20.000: dialog memuat nomor, total, dan kembalian', async ({ page }) => {
    const dialog = await payCash(page, { given: '90000' });
    await expect(dialog).toContainText('T-000141');
    await expect(dialog).toContainText('Rp 70.000');
    await expect(dialog).toContainText('Kembalian');
    await expect(dialog).toContainText('Rp 20.000');
  });

  test('Cetak Struk membuka pratinjau bernomor transaksi', async ({ page }) => {
    const dialog = await payCash(page);
    await dialog.getByRole('button', { name: 'Cetak Struk' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('T-000141');
  });

  test('Cetak Struk dengan printer terputus menampilkan pesan MSG-040', async ({ page }) => {
    const dialog = await payCash(page);
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('.sim__action', { hasText: 'Printer' }).click();
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await dialog.getByRole('button', { name: 'Cetak Struk' }).click();
    await page
      .getByRole('dialog', { name: 'Pratinjau Struk' })
      .getByRole('button', { name: 'Cetak', exact: true })
      .click();
    await expect(
      page.getByText('Struk belum tercetak. Periksa printer lalu coba lagi.'),
    ).toBeVisible();
  });

  test('Kirim WA untuk pelanggan tanpa telepon: kolom kosong dan validasi', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const dialog = await payCash(page, { customer: 'Pak Wahyudi' });
    await dialog.getByRole('button', { name: 'Kirim WA' }).click();
    const share = page.getByRole('dialog', { name: 'Kirim Struk' });
    await expect(share.getByLabel('Nomor WhatsApp')).toHaveValue('');
    await share.getByRole('button', { name: 'Kirim lewat WhatsApp' }).click();
    await expect(
      share.getByText('Nomor telepon tidak valid. Gunakan 9 sampai 14 angka.'),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Kirim WA untuk Pelanggan Umum juga memvalidasi kolom kosong', async ({ page }) => {
    const dialog = await payCash(page);
    await dialog.getByRole('button', { name: 'Kirim WA' }).click();
    const share = page.getByRole('dialog', { name: 'Kirim Struk' });
    await expect(share.getByLabel('Nomor WhatsApp')).toHaveValue('');
    await share.getByRole('button', { name: 'Kirim lewat WhatsApp' }).click();
    await expect(
      share.getByText('Nomor telepon tidak valid. Gunakan 9 sampai 14 angka.'),
    ).toBeVisible();
  });

  test('Kirim WA Bu Sherly: nomor terisi, toast, dan tanpa permintaan jaringan', async ({
    page,
  }) => {
    const dialog = await payCash(page, { customer: 'Bu Sherly' });
    await dialog.getByRole('button', { name: 'Kirim WA' }).click();
    const share = page.getByRole('dialog', { name: 'Kirim Struk' });
    await expect(share.getByLabel('Nomor WhatsApp')).toHaveValue('0811230988');
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await share.getByRole('button', { name: 'Kirim lewat WhatsApp' }).click();
    await expect(page.getByText('Struk dikirim lewat WhatsApp (simulasi).')).toBeVisible();
    await expect(share).toBeHidden();
    expect(requests).toEqual([]);
  });

  test('Selesai kembali ke layar jual dengan pesanan kosong', async ({ page }) => {
    const dialog = await payCash(page);
    await dialog.getByRole('button', { name: 'Selesai' }).click();
    await expect(page).toHaveURL(/#\/pos\/jual$/);
    await expect(page.getByText('Belum ada barang yang dipilih')).toBeVisible();
  });

  test('axe dan target 48 px pada dialog Pembayaran Berhasil dan Kirim Struk', async ({ page }) => {
    const dialog = await payCash(page);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const done = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(done.violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Kirim WA' }).click();
    await settle(page);
    const share = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(share.violations).toEqual([]);
    const boxes = await page
      .getByRole('dialog', { name: 'Kirim Struk' })
      .locator('button, input')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    for (const height of boxes) {
      expect(height).toBeGreaterThanOrEqual(47.5);
    }
  });
});

test.describe('riwayat penjualan', () => {
  async function saleSplit(page: Page): Promise<void> {
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await savePart(page, 1, { digits: '30000' });
    await savePart(page, 2, { channel: 'QRIS', digits: '40000' });
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
  }

  async function saleCredit(page: Page): Promise<void> {
    await chooseCustomer(page, 'Bu Sherly');
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await page.getByLabel('DP', { exact: true }).fill('20000');
    await page.getByRole('button', { name: 'QRIS', exact: true }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
  }

  test('transaksi split: daftar bertulis Split dan detail memuat dua baris penerimaan', async ({
    page,
  }) => {
    await loginPos(page);
    await saleSplit(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const first = page.locator('.pos-history__item').first();
    await expect(first).toContainText('T-000141');
    await expect(first).toContainText('Split');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('Informasi Penjualan');
    await expect(detail).toContainText('Riwayat Penerimaan');
    await expect(detail).toContainText('Tunai');
    await expect(detail).toContainText('Rp 30.000');
    await expect(detail).toContainText('QRIS');
    await expect(detail).toContainText('Rp 40.000');
    await expect(detail).toContainText('Barang & Jasa');
  });

  test('pil status pada daftar riwayat selebar teksnya, tidak merentang selebar sel', async ({
    page,
  }) => {
    await loginPos(page);
    await saleSplit(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const pill = page.locator('.pos-history__item .pos-status').first();
    await expect(pill).toBeVisible();
    const width = await pill.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThan(120);
  });

  test('transaksi piutang menampilkan jatuh tempo dan sisa tagihan', async ({ page }) => {
    await loginPos(page);
    await saleCredit(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText(/Jatuh tempo/i);
    await expect(detail).toContainText('18 Nov 2026');
    await expect(detail).toContainText(/Sisa tagihan/i);
    await expect(detail).toContainText('Rp 50.000');
  });

  test('transaksi bawaan lama tetap tampil lengkap dan Cetak Struk bertanda SALINAN', async ({
    page,
  }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    const search = page.getByRole('searchbox', { name: 'Cari Penjualan' });
    await search.fill('T-000101');
    await search.press('Enter');
    const detail = page.locator('.pos-history__detail');
    await expect(detail).toContainText('T-000101');
    await expect(detail).toContainText('Barang & Jasa');
    await detail.getByRole('button', { name: 'Cetak Struk' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('SALINAN');
  });

  test('Share Struk membuka dialog Kirim Struk dengan kolom Nomor WhatsApp', async ({ page }) => {
    await loginPos(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page.getByRole('button', { name: 'Share Struk' }).click();
    const share = page.getByRole('dialog', { name: 'Kirim Struk' });
    await expect(share.getByLabel('Nomor WhatsApp')).toBeVisible();
  });

  test('axe dan target 48 px pada riwayat dua panel', async ({ page }) => {
    await loginPos(page);
    await saleSplit(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
    const heights = await page
      .locator('.pos-history button, .pos-history input')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => node.getBoundingClientRect().height),
      );
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(47.5);
    }
  });
});

test.describe('retur penjualan', () => {
  async function openRetur(page: Page) {
    await loginPos(page, 'Ibu Sinta');
    const semen = page.locator('.pos-card__main').first();
    for (let index = 0; index < 3; index += 1) {
      await semen.click();
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
    const dialog = page.getByRole('dialog', { name: /Retur Penjualan/ });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('tanpa barang terpilih: pesan MSG-084', async ({ page }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(dialog.getByText('Pilih minimal satu barang untuk diretur.')).toBeVisible();
  });

  test('Pilih Semua, Total Retur, stepper, dan nominal bawaan mengikuti pilihan', async ({
    page,
  }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await expect(dialog.getByText('Dari 3 Kuantitas')).toBeVisible();
    await expect(dialog.getByLabel('Jumlah Dikembalikan')).toHaveValue('210.000');
    await dialog.getByRole('button', { name: 'Kurangi jumlah' }).click();
    await expect(dialog.getByText('Dari 2 Kuantitas')).toBeVisible();
    await expect(dialog.getByLabel('Jumlah Dikembalikan')).toHaveValue('140.000');
    await dialog.getByRole('button', { name: 'Tambah jumlah' }).click();
    await dialog.getByRole('button', { name: 'Tambah jumlah' }).click();
    await expect(dialog.getByText('Dari 3 Kuantitas')).toBeVisible();
  });

  test('nominal melebihi nilai barang ditolak, alasan Lainnya wajib keterangan', async ({
    page,
  }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByLabel('Jumlah Dikembalikan').fill('999999');
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(dialog.getByText('Jumlah dikembalikan melebihi nilai barang.')).toBeVisible();
    await dialog.getByLabel('Jumlah Dikembalikan').fill('210000');
    await dialog.getByRole('radio', { name: 'Lainnya' }).check();
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    await expect(dialog.getByText('Alasan retur wajib diisi.')).toBeVisible();
  });

  test('retur sah: Retur Berhasil, bukti retur, dan sisa yang bisa diretur berkurang', async ({
    page,
  }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByRole('button', { name: 'Kurangi jumlah' }).click();
    await dialog.getByRole('radio', { name: 'Pembatalan Transaksi' }).check();
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Retur Berhasil' });
    await expect(done).toContainText('Dikembalikan Rp 140.000');
    await done.getByRole('button', { name: 'Cetak Bukti Retur' }).click();
    await expect(page.locator('.pos-receipt')).toContainText('BUKTI RETUR');
    await expect(page.locator('.pos-receipt')).toContainText('R-0001');
    await page
      .getByRole('dialog', { name: 'Pratinjau struk' })
      .getByRole('button', { name: 'Tutup' })
      .click();
    await done.getByRole('button', { name: 'Selesai' }).click();
    await page
      .locator('.pos-history__detail')
      .getByRole('button', { name: 'Retur', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: /Retur Penjualan/ })).toContainText('sisa 1');
  });

  test('fokus kembali ke tombol Retur setelah Retur Berhasil ditutup', async ({ page }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await dialog.getByRole('button', { name: 'Retur', exact: true }).click();
    const done = page.getByRole('dialog', { name: 'Retur Berhasil' });
    await done.getByRole('button', { name: 'Selesai' }).click();
    await expect(
      page.locator('.pos-history__detail').getByRole('button', { name: 'Retur', exact: true }),
    ).toBeFocused();
  });

  test('axe dan target 48 px pada modal Retur', async ({ page }) => {
    const dialog = await openRetur(page);
    await dialog.getByRole('checkbox', { name: 'Pilih Semua' }).check();
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
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
  });
});

test.describe('perbaikan hasil review', () => {
  async function endShiftFromMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Selesai Shift' }).click();
    await page
      .getByRole('dialog', { name: 'Selesai Shift' })
      .getByRole('button', { name: 'Akhiri Shift' })
      .click();
  }

  test('pesanan tertunda tidak bisa dibayar lewat F4 atau alamat setelah shift diakhiri', async ({
    page,
  }) => {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await endShiftFromMenu(page);
    // Akhiri Shift langsung keluar: pesanan hilang dan alamat bayar tidak bisa dibuka lagi.
    await expect(page).toHaveURL(/#\/pos$/);
    await page.keyboard.press('F4');
    await expect(page).toHaveURL(/#\/pos$/);
    await page.evaluate(() => {
      window.location.hash = '/pos/bayar';
    });
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
  });

  test('mengakhiri shift dari layar bayar langsung keluar ke layar PIN', async ({ page }) => {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    await endShiftFromMenu(page);
    await expect(page).toHaveURL(/#\/pos$/);
    await expect(page.getByRole('radio', { name: /Dewi/ })).toBeVisible();
  });

  test('DP bercara QRIS tetap terpilih saat layar bayar dibuka ulang', async ({ page }) => {
    await loginPos(page);
    await chooseCustomer(page, 'Bu Sherly');
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('tab', { name: 'Piutang' }).click();
    await page.getByLabel('DP', { exact: true }).fill('20000');
    await page.getByRole('button', { name: 'QRIS', exact: true }).click();
    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page.getByRole('tab', { name: 'Piutang' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: 'QRIS', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('mode split tetap aktif saat layar bayar dibuka ulang', async ({ page }) => {
    await loginPos(page);
    await page.locator('.pos-card__main').first().click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await page.getByRole('tab', { name: 'Split', exact: true }).click();
    await savePart(page, 1, { digits: '30000' });
    await savePart(page, 2, { channel: 'QRIS', digits: '10000' });
    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.getByRole('button', { name: /^Bayar Rp/ }).click();
    await expect(page.getByRole('tab', { name: 'Split', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: /^Pembayaran 1/ })).toContainText('Tunai');
    await expect(page.getByRole('button', { name: /^Pembayaran 2/ })).toContainText('QRIS');
  });
});
