import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './helpers/routes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCREENS = ['katalog', 'order', 'riwayat'] as const;

test.beforeEach(async ({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width > 500, 'Aplikasi Sales dirancang untuk HP 360 x 800');
  await page.emulateMedia({ colorScheme: 'light' });
});

async function loginSales(page: Page): Promise<void> {
  await page.goto('/#/sales');
  await page.getByLabel('Nama pengguna').fill('budi.sales');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/sales\/katalog$/);
}

async function simulate(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  const pattern = action === 'Online' ? /^(Online|Offline)$/ : action;
  await page.locator('.sim__action', { hasText: pattern }).click();
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await expect(page.locator('#sim-body')).toBeHidden();
}

async function addByCode(page: Page, code: string): Promise<void> {
  const picker = page.getByLabel('Cari barang');
  await picker.fill(code);
  await picker.press('Enter');
}

/** Kartu baris order ke-`index` pada layar Order. */
function orderLine(page: Page, index = 0): Locator {
  return page.locator(`[data-line="${String(index)}"]`);
}

/** Kolom jumlah milik stepper pada baris order. */
function quantityOf(page: Page, index = 0): Locator {
  return orderLine(page, index).getByRole('textbox', { name: /^Jumlah/ });
}

/** Kolom harga yang dapat diubah pada baris order. */
function priceOf(page: Page, index = 0): Locator {
  return orderLine(page, index).getByRole('textbox', { name: /^Harga per/ });
}

async function payWith(page: Page, method: string): Promise<void> {
  await page.getByLabel('Cara bayar').selectOption({ label: method });
}

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
}

async function openAccount(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Akun dan Tampilan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Akun dan Tampilan' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function loginOwner(page: Page): Promise<void> {
  await page.goto('/#/owner');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/owner\/ringkasan$/);
}

/** Owner membuka Review permintaan `reference` pada Transaksi Owner dan memutuskannya dengan PIN. */
async function decideAsOwner(
  page: Page,
  reference: string,
  decision: 'Setujui' | 'Tolak',
  reason: string,
): Promise<void> {
  await page.goto('/#/owner/transaksi');
  await page.getByRole('button', { name: `Review ${reference}` }).click();
  const review = page.getByRole('dialog', { name: 'Review Approval' });
  await review.getByLabel('Alasan').fill(reason);
  await review.getByLabel('PIN Owner').fill('482916');
  await review.getByRole('button', { name: decision }).click();
}

async function expectNoViolations(page: Page, name: string): Promise<void> {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(result.violations, name).toEqual([]);
}

test.describe('SALES-01 Login dan mode offline', () => {
  test('validasi, peran bukan Sales, sesi tetap setelah muat ulang sampai keluar', async ({
    page,
  }) => {
    await page.goto('/#/sales');
    await expect(page.getByText('Aplikasi mobile Flutter offline-first')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Masuk' });
    await submit.click();
    await expect(page.getByText('Nama pengguna wajib diisi.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('budi.sales');
    await submit.click();
    await expect(page.getByText('Kata sandi wajib diisi.')).toBeVisible();
    await page.getByLabel('Kata sandi', { exact: true }).fill('salah12345');
    await submit.click();
    await expect(page.getByText('Nama pengguna atau kata sandi salah.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await submit.click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Sales.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('budi.sales');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
    await submit.click();
    await expect(page).toHaveURL(/#\/sales\/katalog$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stok Barang', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/sales$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
  });

  test('logo login berupa gambar yang termuat, dan tema dapat dipilih dari layar masuk', async ({
    page,
  }) => {
    await page.goto('/#/sales');
    const logo = page.getByRole('img', { name: 'Logo toko' });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveJSProperty('tagName', 'IMG');
    await expect
      .poll(() =>
        logo.evaluate((node) => node instanceof HTMLImageElement && node.naturalWidth > 0),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Tampilan dan Tema' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tampilan dan Tema' });
    await expect(dialog.locator('.mob-theme')).toHaveCount(6);
    await dialog.getByRole('button', { name: 'Biru', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-pos-theme', 'biru');
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await expect(dialog).toBeHidden();
  });

  test('offline: masuk pertama ditolak, HP yang dikenal boleh masuk, indikator antrean tampil', async ({
    page,
  }) => {
    await page.goto('/#/sales');
    await simulate(page, 'Online');
    await expect(
      page.getByText('Mode offline: hanya akun yang pernah masuk di HP ini yang dapat masuk.'),
    ).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('budi.sales');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByText('Masuk pertama di HP ini memerlukan internet.')).toBeVisible();
    await simulate(page, 'Online');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/sales\/katalog$/);
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await simulate(page, 'Online');
    await page.getByLabel('Nama pengguna').fill('budi.sales');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026F');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/sales\/katalog$/);
    await expect(page.locator('.own-chip')).toContainText('Offline, data lokal');
  });

  test('alamat langsung tanpa login dialihkan ke SALES-01 dan Tampilkan bersifat sementara', async ({
    page,
  }) => {
    await page.goto('/#/sales/order');
    await expect(page).toHaveURL(/#\/sales$/);
    const password = page.getByLabel('Kata sandi', { exact: true });
    await password.fill('Kunci2026F');
    await page.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('type', 'password', { timeout: 5000 });
  });
});

test.describe('kerangka Sales', () => {
  test('tiga tujuan navigasi dan aksesibilitas axe mode terang pada seluruh layar', async ({
    page,
  }) => {
    await page.goto('/#/sales');
    const login = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(login.violations, 'login').toEqual([]);
    await loginSales(page);
    const links = page.locator('.own-nav__link');
    await expect(links).toHaveText(['Katalog', 'Order', 'Riwayat']);
    for (const screen of SCREENS) {
      await page.goto(`/#/sales/${screen}`);
      await expect(page).toHaveURL(new RegExp(`#/sales/${screen}$`));
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, screen).toEqual([]);
    }
  });

  test('aksesibilitas axe mode terang pada layar berisi, dialog akun, penampil foto, dan lembar persetujuan', async ({
    page,
  }) => {
    await loginSales(page);
    await expectNoViolations(page, 'katalog');

    const dialog = await openAccount(page);
    await expectNoViolations(page, 'dialog akun dan tampilan');
    await dialog.getByRole('button', { name: 'Tutup' }).click();

    await page
      .getByRole('button', { name: /^Perbesar foto/ })
      .first()
      .click();
    await expect(page.locator('.mob-gallery')).toBeVisible();
    await expectNoViolations(page, 'penampil foto');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup gambar' }).click();

    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await priceOf(page).fill('40000');
    await expect(orderLine(page).getByText('Di bawah harga tier')).toBeVisible();
    await expectNoViolations(page, 'order berisi harga di bawah tier');

    await save(page);
    await expect(page.getByRole('dialog', { name: 'Harga di bawah tier' })).toBeVisible();
    await expectNoViolations(page, 'lembar persetujuan harga');
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByRole('heading', { name: 'SO-0001' })).toBeVisible();
    await page.locator('summary', { hasText: 'Pratinjau salinan SO (PDF)' }).click();
    await expectNoViolations(page, 'detail riwayat');

    await page.goto('/#/sales/riwayat');
    await expect(page.locator('.sls-so')).toHaveCount(1);
    await expectNoViolations(page, 'daftar riwayat');
  });

  test('aksesibilitas axe mode gelap dengan tema Ungu pada seluruh layar dan dialog', async ({
    page,
  }) => {
    await loginSales(page);
    const dialog = await openAccount(page);
    await dialog.getByRole('button', { name: 'Ungu', exact: true }).click();
    await dialog.getByRole('button', { name: 'Gelap', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-pos-theme', 'ungu');
    await expect(page.locator('html')).toHaveAttribute('data-pos-scheme', 'gelap');
    await expectNoViolations(page, 'dialog akun gelap');
    await dialog.getByRole('button', { name: 'Tutup' }).click();

    await expectNoViolations(page, 'katalog gelap');
    await page
      .getByRole('button', { name: /^Perbesar foto/ })
      .first()
      .click();
    await expectNoViolations(page, 'penampil foto gelap');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup gambar' }).click();

    await page.goto('/#/sales/order');
    await expectNoViolations(page, 'order kosong gelap');
    await addByCode(page, 'B0001');
    await priceOf(page).fill('40000');
    await expectNoViolations(page, 'order berisi gelap');
    await save(page);
    await expectNoViolations(page, 'lembar persetujuan gelap');
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expectNoViolations(page, 'detail riwayat gelap');
    await page.goto('/#/sales/riwayat');
    await expectNoViolations(page, 'daftar riwayat gelap');
  });

  test('reflow pada lebar 320 px tanpa gulir horizontal', async ({ page }) => {
    await loginSales(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const screen of SCREENS) {
      await page.goto(`/#/sales/${screen}`);
      await expect(page).toHaveURL(new RegExp(`#/sales/${screen}$`));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, screen).toBeLessThanOrEqual(1);
    }
  });

  test('reflow 320 px pada order berisi dan detail riwayat tanpa gulir horizontal', async ({
    page,
  }) => {
    await loginSales(page);
    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await priceOf(page).fill('40000');
    await expect(orderLine(page).getByText('Di bawah harga tier')).toBeVisible();
    expect(await overflow(), 'order berisi').toBeLessThanOrEqual(1);
    await save(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByRole('heading', { name: 'SO-0001' })).toBeVisible();
    expect(await overflow(), 'detail riwayat').toBeLessThanOrEqual(1);
  });

  test('peran bukan Sales dari Panel Simulasi melihat penolakan', async ({ page }) => {
    await loginSales(page);
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('kasir');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Sales.')).toBeVisible();
  });

  test('pemilih tema dari avatar: Ungu mengubah data-pos-theme dan bertahan setelah muat ulang', async ({
    page,
  }) => {
    await loginSales(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-app', 'sales');
    await expect(html).toHaveAttribute('data-pos-theme', 'oranye');
    const dialog = await openAccount(page);
    await expect(dialog.locator('.mob-theme')).toHaveCount(6);
    await expect(dialog.getByRole('button', { name: 'Oranye', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'Ungu', exact: true }).click();
    await expect(html).toHaveAttribute('data-pos-theme', 'ungu');
    await expect(dialog.getByRole('button', { name: 'Ungu', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'Oranye', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stok Barang', exact: true })).toBeVisible();
    await expect(html).toHaveAttribute('data-pos-theme', 'ungu');
    const again = await openAccount(page);
    await expect(again.getByRole('button', { name: 'Ungu', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('pemilih mode: Gelap memasang skema gelap dan bertahan setelah muat ulang', async ({
    page,
  }) => {
    await loginSales(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-pos-scheme', 'terang');
    const dialog = await openAccount(page);
    await dialog.getByRole('button', { name: 'Gelap', exact: true }).click();
    await expect(html).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(html).toHaveAttribute('data-pos-scheme', 'gelap');
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stok Barang', exact: true })).toBeVisible();
    await expect(html).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('dialog akun menampilkan status sinkron, printer Bluetooth, dan Keluar; avatar dan chip membukanya', async ({
    page,
  }) => {
    await loginSales(page);
    const fromAvatar = await openAccount(page);
    await expect(fromAvatar).toContainText('Budi Lapangan');
    await expect(fromAvatar).toContainText('Terakhir sinkron');
    await expect(fromAvatar.getByLabel('Printer Bluetooth (simulasi)')).toBeVisible();
    await expect(fromAvatar.getByRole('button', { name: 'Keluar' })).toBeVisible();
    await fromAvatar.getByRole('button', { name: 'Tutup' }).click();
    await expect(fromAvatar).toBeHidden();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await expect(page.getByRole('dialog', { name: 'Akun dan Tampilan' })).toBeVisible();
  });
});

test.describe('SALES-02 Katalog dan cek stok', () => {
  test('Katalog sama dengan Stok Owner: kartu, harga dua tier, stok hijau atau merah, tanpa harga beli', async ({
    page,
  }) => {
    await loginSales(page);
    const cards = page.locator('.stk-card');
    await expect(cards).toHaveCount(30);
    const first = cards.first();
    await expect(first).toContainText('Harga Eceran');
    await expect(first).toContainText('Harga Grosir');
    await expect(first).toContainText(/Toko [\d.,]+ \S+/);
    await expect(first).toContainText(/Gudang [\d.,]+ \S+/);
    await expect(first.locator('.stk-prices tbody tr')).toHaveCount(3);
    // Sales tidak melihat harga beli maupun Hpp Avg.
    await expect(page.locator('.stk-card .stk-cost')).toHaveCount(0);
    await expect(page.getByText('Hpp Avg')).toHaveCount(0);
    await expect(page.getByText(/Harga Beli/)).toHaveCount(0);
    const flags = await page
      .locator('.stk-card .stk-stock__item')
      .evaluateAll((nodes) => nodes.map((node) => node.classList.contains('stk-stock__item--ada')));
    expect(flags.some(Boolean)).toBe(true);
    expect(flags.every(Boolean)).toBe(false);
  });

  test('pencarian, tombol pindai, dan filter Gudang, Kategori, Merk seperti Owner', async ({
    page,
  }) => {
    await loginSales(page);
    const cards = page.locator('.stk-card');
    await expect(cards).toHaveCount(30);
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('a');
    await expect(page.getByText('Ketik minimal 2 karakter untuk mencari.')).toBeVisible();
    await search.fill('semen');
    await expect(cards.first()).toContainText('Semen');
    await search.fill('');

    await expect(page.getByRole('button', { name: 'Pindai barcode' })).toBeVisible();
    await expect(page.getByLabel('Filter gudang').locator('option')).toHaveText([
      'Semua Gudang',
      'Toko',
      'Gudang',
    ]);
    await expect(page.getByLabel('Filter kategori').locator('option').first()).toHaveText(
      'Semua Kategori',
    );
    await expect(page.getByLabel('Filter merk').locator('option').first()).toHaveText('Semua Merk');
    await page.getByLabel('Filter kategori').selectOption({ index: 1 });
    await expect(cards.first()).toBeVisible();
    await page.getByLabel('Filter kategori').selectOption({ index: 0 });
    await page.getByLabel('Filter gudang').selectOption('besar');
    await expect(cards.first()).toBeVisible();
    const hasStock = await page
      .locator('.stk-card')
      .evaluateAll((nodes) =>
        nodes.every((node) => node.querySelectorAll('.stk-stock__item--ada').length >= 1),
      );
    expect(hasStock).toBe(true);
  });

  test('kolom cari dan filter menempel, serta tanpa bilah gulir di sisi kanan', async ({
    page,
  }) => {
    await loginSales(page);
    await expect(page.locator('.stk-card').first()).toBeVisible();
    const scroller = page.locator('#own-main');
    const top = (await scroller.boundingBox())?.y ?? 0;
    await scroller.evaluate((node) => {
      node.scrollTop = 1500;
    });
    await expect.poll(async () => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
    const bar = await page.locator('.stk-bar').boundingBox();
    expect(Math.abs((bar?.y ?? 999) - top)).toBeLessThan(2);
    await expect(page.getByRole('searchbox', { name: 'Cari' })).toBeInViewport();
    const state = await page.evaluate(() => {
      const main = document.getElementById('own-main');
      return {
        width: main === null ? '' : getComputedStyle(main).scrollbarWidth,
        gutter: main === null ? -1 : main.offsetWidth - main.clientWidth,
      };
    });
    expect(state).toEqual({ width: 'none', gutter: 0 });
  });

  test('ketuk nama barang membuka detail tanpa harga beli dan menambah ke order', async ({
    page,
  }) => {
    await loginSales(page);
    await page.getByRole('searchbox', { name: 'Cari' }).fill('semen');
    const first = page.locator('.stk-card').first();
    await expect(first).toContainText('Semen');
    await first.locator('.stk-card__open').click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('table', { name: 'Harga bertingkat' })).toBeVisible();
    await expect(detail).not.toContainText('Hpp');
    await expect(detail).not.toContainText('HPP');
    await expect(detail).not.toContainText('Harga Beli');
    await detail.getByRole('button', { name: 'Tambah ke Order' }).click();
    await expect(detail).toBeHidden();
    await expect(page.getByText(/ditambahkan ke order\./)).toBeVisible();
    await expect(page.locator('.own-nav__link', { hasText: 'Order (1)' })).toBeVisible();
    await page.locator('.own-nav__link', { hasText: 'Order (1)' }).click();
    await expect(page).toHaveURL(/#\/sales\/order$/);
    await expect(page.locator('.sls-line')).toHaveCount(1);
  });

  test('ketuk foto membuka Gambar Produk: gambar penuh dan nama barang saja', async ({ page }) => {
    await loginSales(page);
    const first = page.locator('.stk-card').first();
    const name = (await first.locator('.stk-card__name').innerText()).trim();
    await first.getByRole('button', { name: `Perbesar foto ${name}` }).click();
    const viewer = page.getByRole('dialog', { name: 'Gambar Produk' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('img', { name })).toBeVisible();
    await expect(viewer.locator('.mob-gallery__name')).toHaveText(name);
    await expect(viewer.locator('.mob-gallery__count')).toHaveText('1/1');
    // Tanpa keterangan stok, harga, tabel, dan tombol tambah.
    await expect(viewer).not.toContainText('Rp');
    await expect(viewer).not.toContainText('Toko');
    await expect(viewer).not.toContainText('Gudang');
    await expect(viewer.getByRole('table')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Tambah ke Order' })).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Tutup gambar' }).click();
    await expect(viewer).toBeHidden();
  });

  test('layar Gambar Produk ditutup dengan tombol X dan tombol Escape', async ({ page }) => {
    await loginSales(page);
    const trigger = page.getByRole('button', { name: /^Perbesar foto/ }).first();
    await trigger.click();
    const viewer = page.getByRole('dialog');
    await viewer.getByRole('button', { name: 'Tutup gambar' }).click();
    await expect(viewer).toBeHidden();
    await trigger.click();
    await expect(viewer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
  });
});

test.describe('SALES-03 Sales Order dan SALES-05 salinan', () => {
  test('order kosong tidak dapat disimpan; jumlah nol tidak lolos; stepper mengubah subtotal', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    // Seperti Owner: yang diisi lebih dahulu hanya nama pelanggan dan cara bayar, lalu barang.
    await expect(page.getByRole('heading', { level: 1, name: 'Input Sales Order' })).toBeVisible();
    await expect(page.getByLabel('Pelanggan')).toHaveValue('');
    await expect(page.getByLabel('Cara bayar')).toHaveValue('tunai');
    await expect(
      page.getByText('Belum ada barang. Cari barang di atas untuk menambahkan.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Sales Order' })).toBeVisible();
    await expect(page.locator('.trx-bar__value')).toHaveText('Rp 0');
    await save(page);
    await expect(
      page.getByText('Bill masih kosong. Tambahkan barang terlebih dahulu.'),
    ).toBeVisible();

    // Stepper tidak menerima nol: barang tanpa desimal berminimum 1, barang berdesimal 0,001.
    await addByCode(page, 'Lampu LED 5 W');
    const piece = quantityOf(page);
    await piece.fill('0');
    await piece.blur();
    await expect(piece).toHaveValue('1');
    await orderLine(page)
      .getByRole('button', { name: /^Hapus/ })
      .click();

    await addByCode(page, 'B0001');
    await expect(
      page.getByText('Belum ada barang. Cari barang di atas untuk menambahkan.'),
    ).toBeHidden();
    const quantity = quantityOf(page);
    const total = page.locator('.trx-bar__value');
    await expect(total).toHaveText('Rp 54.900');
    await quantity.fill('0');
    await quantity.blur();
    await expect(quantity).toHaveValue('0,001');
    await quantity.fill('1');
    await expect(total).toHaveText('Rp 54.900');
    await orderLine(page).getByRole('button', { name: 'Tambah jumlah' }).click();
    await expect(quantity).toHaveValue('2');
    await expect(total).toHaveText('Rp 109.800');
    await expect(orderLine(page).locator('.sls-line__sum')).toHaveText('Rp 109.800');
    await orderLine(page).getByRole('button', { name: 'Kurangi jumlah' }).click();
    await expect(quantity).toHaveValue('1');
    await orderLine(page).getByRole('button', { name: 'Hapus Semen PCC Karya Mandiri' }).click();
    await expect(
      page.getByText('Belum ada barang. Cari barang di atas untuk menambahkan.'),
    ).toBeVisible();
    await expect(page.locator('.trx-bar__value')).toHaveText('Rp 0');
  });

  test('harga yang diubah tampil sebagai Harga diubah, total berubah, dan dapat dipulihkan', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    const line = orderLine(page);
    const total = page.locator('.trx-bar__value');
    const price = priceOf(page);
    await expect(price).toHaveValue('54.900');
    await expect(line.getByText('Harga tier Eceran: Rp 54.900')).toBeVisible();
    await expect(line.getByText('Harga diubah')).toBeHidden();
    await expect(total).toHaveText('Rp 54.900');

    await price.fill('60000');
    await expect(price).toHaveValue('60.000');
    await expect(line.getByText('Harga diubah')).toBeVisible();
    await expect(line.getByText('Di bawah harga tier')).toBeHidden();
    await expect(line.locator('.sls-line__sum')).toHaveText('Rp 60.000');
    await expect(total).toHaveText('Rp 60.000');
    await orderLine(page).getByRole('button', { name: 'Tambah jumlah' }).click();
    await expect(total).toHaveText('Rp 120.000');

    await price.fill('40000');
    await expect(line.getByText('Harga diubah')).toBeVisible();
    await expect(line.getByText('Di bawah harga tier')).toBeVisible();
    await expect(total).toHaveText('Rp 80.000');

    await line.getByRole('button', { name: 'Pulihkan harga asli' }).click();
    await expect(price).toHaveValue('54.900');
    await expect(line.getByText('Harga diubah')).toBeHidden();
    await expect(line.getByText('Di bawah harga tier')).toBeHidden();
    await expect(total).toHaveText('Rp 109.800');
  });

  test('validasi, simpan Draf tunai, pratinjau salinan, kirim WA, dan printer Bluetooth simulasi', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await quantityOf(page).fill('2');
    await payWith(page, 'QRIS');
    await expect(page.getByLabel('Cara bayar')).toHaveValue('qris');
    await save(page);
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SO-0001' })).toBeVisible();
    await page.locator('summary', { hasText: 'Pratinjau salinan SO (PDF)' }).click();
    await expect(page.locator('.own-pdf')).toContainText('SALINAN SALES ORDER');
    await expect(page.locator('.own-pdf')).toContainText('No. SO: SO-0001');
    await expect(page.locator('.own-pdf')).toContainText('Sales: Budi Lapangan');
    await page.getByRole('button', { name: 'Cetak via Bluetooth (simulasi)' }).click();
    await expect(page.getByText('Pilih printer Bluetooth di atas terlebih dahulu.')).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Printer Bluetooth (simulasi)')
      .selectOption('Printer BT-58');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
    await page.getByRole('button', { name: 'Cetak via Bluetooth (simulasi)' }).click();
    await expect(page.getByText('Salinan SO dicetak ke Printer BT-58 (simulasi).')).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nomor WhatsApp pelanggan').fill('12');
    await dialog.getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(dialog.getByText(/Nomor telepon tidak valid/)).toBeVisible();
    await dialog.getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await dialog.getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByText('Salinan SO (PDF) terkirim ke 081234567890 via WA (simulasi).'),
    ).toBeVisible();
    await expect(page.getByText(/Salinan terkirim .*\d\d:\d\d/)).toBeVisible();
    await page.getByRole('link', { name: 'Kembali' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat$/);
    await expect(page.locator('.sls-so').first()).toContainText('Salinan terkirim via WA');
  });

  test('Riwayat berupa kartu SO dengan nomor, pelanggan, total, cara bayar, status, dan status sinkron', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/riwayat');
    await expect(
      page.getByText('Belum ada Sales Order. Buat dari Katalog atau Order.'),
    ).toBeVisible();
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Pelanggan').selectOption('C-001');
    await save(page);
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await page.getByRole('link', { name: 'Kembali' }).click();
    const card = page.locator('.sls-so');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('SO-0001');
    await expect(card).toContainText('Toko Maju Jaya');
    await expect(card).toContainText('Rp 51.000');
    await expect(card).toContainText('1 barang, Tunai');
    await expect(card).toContainText('Draf');
    await expect(card).toContainText('Tersinkron');
    await card.click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByText('Rincian barang')).toBeVisible();
  });

  test('DP wajib berjumlah lebih dari nol dan piutang wajib memakai pelanggan terdaftar', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await payWith(page, 'Piutang');
    await expect(page.locator('.sls-notes')).toContainText(
      'Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan.',
    );
    await save(page);
    await expect(page.locator('.trx-bar .own-hint')).toHaveText(
      'Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan.',
    );
    await payWith(page, 'DP');
    await expect(page.getByLabel('Uang muka (DP)')).toBeVisible();
    await page.getByLabel('Pelanggan').selectOption('C-001');
    await save(page);
    await expect(page.locator('.trx-bar .own-hint')).toHaveText('Jumlah harus lebih dari 0.');
  });
});

test.describe('SALES-04 Validasi piutang dan persetujuan Owner', () => {
  test('piutang melebihi limit meminta persetujuan, muncul di Transaksi Owner, dan status Sales berubah', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await payWith(page, 'Piutang');
    await quantityOf(page).fill('5000');
    await expect(page.locator('.sls-notes')).toContainText('Transaksi piutang ditolak');
    await save(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Transaksi piutang ditolak');
    await expect(dialog).toContainText('Butuh Approval Owner.');
    await dialog.getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(
      page.getByText('Sales Order SO-0001 tersimpan sebagai Draf dan menunggu persetujuan Owner.'),
    ).toBeVisible();
    await expect(page.getByText('Draf, menunggu persetujuan Owner').first()).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByRole('dialog').getByText('Salinan SO dapat dikirim setelah Owner menyetujui.'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();

    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await expect(page.getByRole('button', { name: /^Review / })).toHaveCount(4);
    await page.getByRole('button', { name: 'Review SO-0001' }).click();
    const review = page.getByRole('dialog', { name: 'Review Approval' });
    await expect(review).toContainText('Piutang over-limit');
    await expect(review).toContainText('Budi Lapangan');
    await review.getByRole('button', { name: 'Batal' }).click();
    await decideAsOwner(page, 'SO-0001', 'Setujui', 'Pelanggan lama');
    await expect(page.getByText('Persetujuan SO-0001 disetujui.')).toBeVisible();

    await page.goto('/#/sales/riwayat?so=SO-0001');
    await expect(page.getByText('Draf, disetujui Owner').first()).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    await page.getByRole('dialog').getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(page.getByText(/Salinan SO \(PDF\) terkirim ke 081234567890/)).toBeVisible();
  });

  test('harga di bawah tier meminta persetujuan Owner dengan rincian harga, dan mengunci pengiriman salinan', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await priceOf(page).fill('40000');
    await expect(orderLine(page).getByText('Di bawah harga tier')).toBeVisible();
    await save(page);
    const sheet = page.getByRole('dialog', { name: 'Harga di bawah tier' });
    await expect(sheet).toContainText('Semen PCC Karya Mandiri dijual Rp 40.000 per Sak');
    await expect(sheet).toContainText('di bawah harga tier Rp 54.900');
    await expect(sheet).toContainText('Butuh Approval Owner.');
    await sheet.getByRole('button', { name: 'Ubah Order' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/#\/sales\/order$/);
    await expect(priceOf(page)).toHaveValue('40.000');
    await save(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(
      page.getByText('Sales Order SO-0001 tersimpan sebagai Draf dan menunggu persetujuan Owner.'),
    ).toBeVisible();
    await expect(page.getByText('Draf, menunggu persetujuan Owner').first()).toBeVisible();
    await expect(page.locator('.sls-item__flag')).toContainText('Harga diubah');
    await expect(page.locator('.sls-item__flag')).toContainText('Harga asli Rp 54.900');
    await expect(page.getByText('Alasan persetujuan Owner')).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByRole('dialog').getByText('Salinan SO dapat dikirim setelah Owner menyetujui.'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();

    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await page.getByRole('button', { name: 'Review SO-0001' }).click();
    const review = page.getByRole('dialog', { name: 'Review Approval' });
    await expect(review).toContainText('Budi Lapangan');
    await expect(review).toContainText('di bawah harga tier Rp 54.900');
  });

  test('persetujuan yang ditolak Owner menutup pengiriman salinan', async ({ page }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await payWith(page, 'Piutang');
    await quantityOf(page).fill('5000');
    await save(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await loginOwner(page);
    await decideAsOwner(page, 'SO-0001', 'Tolak', 'Belum lunas');
    await expect(page.getByText('Persetujuan SO-0001 ditolak.')).toBeVisible();
    await page.goto('/#/sales/riwayat?so=SO-0001');
    await expect(page.getByText('Draf, ditolak Owner').first()).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    await page.getByRole('dialog').getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page
        .getByRole('dialog')
        .getByText('Salinan SO tidak dapat dikirim karena Owner menolak persetujuan.'),
    ).toBeVisible();
  });
});

test.describe('antrean offline-first Sales', () => {
  test('order saat offline masuk antrean dan terkirim saat online kembali', async ({ page }) => {
    await loginSales(page);
    await simulate(page, 'Online');
    await expect(page.getByText(/Mode offline: order tetap tersimpan di HP/)).toBeVisible();
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await save(page);
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.locator('.own-chip')).toContainText('Offline, 1 menunggu');
    await expect(page.getByText('Menunggu sinkron')).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Sales Order SO-0001: Menunggu');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
    await simulate(page, 'Online');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron', { timeout: 8000 });
    await expect(page.getByText('Tersinkron').first()).toBeVisible();
  });
});
