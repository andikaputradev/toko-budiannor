import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
  const picker = page.getByLabel('Cari atau pindai barang');
  await picker.fill(code);
  await picker.press('Enter');
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
    await expect(page.getByRole('heading', { name: 'Katalog' })).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/sales$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
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

  test('peran bukan Sales dari Panel Simulasi melihat penolakan', async ({ page }) => {
    await loginSales(page);
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('kasir');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Sales.')).toBeVisible();
  });
});

test.describe('SALES-02 Katalog dan cek stok', () => {
  test('30 kartu, stok per gudang, harga per tier, satuan desimal, pencarian, dan tambah ke order', async ({
    page,
  }) => {
    await loginSales(page);
    const cards = page.locator('.own-card--stock');
    await expect(cards).toHaveCount(30);
    await expect(cards.first()).toContainText('Display:');
    await expect(cards.first()).toContainText('Besar:');
    const eceran = await cards.first().locator('output').innerText();
    await page.getByRole('button', { name: 'Grosir' }).click();
    const grosir = await cards.first().locator('output').innerText();
    expect(grosir).not.toBe(eceran);
    const unit = cards.first().getByRole('combobox');
    const options = await unit.locator('option').allInnerTexts();
    expect(options.length).toBeGreaterThan(1);
    const before = await cards.first().locator('.own-stock-line').innerText();
    await unit.selectOption(options[options.length - 1] ?? '');
    await expect(cards.first().locator('.own-stock-line')).not.toHaveText(before);
    await page.getByRole('button', { name: 'Display' }).click();
    await expect(cards.first().locator('.own-stock-line')).not.toContainText('Besar:');
    await page.getByRole('button', { name: 'Semua' }).click();
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('a');
    await expect(page.getByText('Ketik minimal 2 karakter untuk mencari.')).toBeVisible();
    await search.fill('semen');
    await expect(cards.first()).toContainText('Semen');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await expect(page.getByText(/Tier harga mengikuti pelanggan/)).toBeVisible();
    await cards
      .first()
      .getByRole('button', { name: /^Tambah ke Order/ })
      .click();
    await expect(page.getByText(/ditambahkan ke order\./)).toBeVisible();
    await expect(page.locator('.own-nav__link', { hasText: 'Order (1)' })).toBeVisible();
    await page.getByRole('button', { name: 'Lihat Order' }).click();
    await expect(page).toHaveURL(/#\/sales\/order$/);
    await expect(page.locator('.own-card--line')).toHaveCount(1);
  });
});

test.describe('SALES-03 Sales Order dan SALES-05 salinan', () => {
  test('validasi, simpan Draf tunai, pratinjau salinan, kirim WA, dan printer Bluetooth simulasi', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(
      page.getByText('Bill masih kosong. Tambahkan barang terlebih dahulu.'),
    ).toBeVisible();
    await addByCode(page, 'B0001');
    await page.locator('[data-line="0"]').fill('0');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await page.locator('[data-line="0"]').fill('2');
    await page.getByLabel('Cara bayar').selectOption('qris');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await expect(page.locator('.own-pdf')).toContainText('SALINAN SALES ORDER');
    await expect(page.locator('.own-pdf')).toContainText('No. SO: SO-0001');
    await expect(page.locator('.own-pdf')).toContainText('Sales: Budi Lapangan');
    await page.getByRole('button', { name: 'Cetak via Bluetooth (simulasi)' }).click();
    await expect(page.getByText('Pilih printer Bluetooth pada Status sinkronisasi')).toBeVisible();
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
    await page.getByRole('button', { name: 'Kembali' }).click();
    await expect(page.locator('.own-card').first()).toContainText('Salinan terkirim via WA');
  });

  test('DP wajib berjumlah lebih dari nol dan piutang wajib memakai pelanggan terdaftar', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Cara bayar').selectOption('piutang');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(
      page.getByText('Piutang hanya untuk pelanggan terdaftar. Pilih atau daftarkan pelanggan.'),
    ).toBeVisible();
    await page.getByLabel('Cara bayar').selectOption('dp');
    await expect(page.getByLabel('Uang muka (DP)')).toBeVisible();
    await page.getByLabel('Pelanggan').selectOption('C-001');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
  });
});

test.describe('SALES-04 Validasi piutang dan persetujuan Owner', () => {
  test('piutang melebihi limit meminta persetujuan, muncul di OWN-06, dan status Sales berubah', async ({
    page,
  }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await page.getByLabel('Cara bayar').selectOption('piutang');
    await page.locator('[data-line="0"]').fill('5000');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
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

    await page.goto('/#/owner');
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.goto('/#/owner/transaksi');
    await expect(page.locator('.own-card--approval')).toHaveCount(4);
    const request = page.locator('.own-card--approval', { hasText: 'SO-0001' });
    await expect(request).toContainText('Budi Lapangan');
    await expect(request).toContainText('Piutang over-limit');
    await request.getByRole('button', { name: 'Setujui' }).click();
    const pin = page.getByRole('dialog');
    await pin.getByLabel('Alasan').fill('Pelanggan lama');
    await pin.getByLabel('PIN Owner').fill('482916');
    await pin.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Persetujuan SO-0001 disetujui.')).toBeVisible();

    await page.goto('/#/sales/riwayat?so=SO-0001');
    await expect(page.getByText('Draf, disetujui Owner').first()).toBeVisible();
    await page.getByRole('button', { name: 'Kirim Salinan SO (PDF) via WA' }).click();
    await page.getByRole('dialog').getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(page.getByText(/Salinan SO \(PDF\) terkirim ke 081234567890/)).toBeVisible();
  });

  test('persetujuan yang ditolak Owner menutup pengiriman salinan', async ({ page }) => {
    await loginSales(page);
    await page.goto('/#/sales/order');
    await addByCode(page, 'B0001');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await page.getByLabel('Cara bayar').selectOption('piutang');
    await page.locator('[data-line="0"]').fill('5000');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Minta Persetujuan Owner' }).click();
    await page.goto('/#/owner');
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.goto('/#/owner/transaksi');
    await page
      .locator('.own-card--approval', { hasText: 'SO-0001' })
      .getByRole('button', { name: 'Tolak' })
      .click();
    await page.getByRole('dialog').getByLabel('Alasan').fill('Belum lunas');
    await page.getByRole('dialog').getByLabel('PIN Owner').fill('482916');
    await page.getByRole('dialog').getByRole('button', { name: 'Tolak' }).click();
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
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page).toHaveURL(/#\/sales\/riwayat\?so=SO-0001$/);
    await expect(page.locator('.own-chip')).toContainText('Offline, 1 menunggu');
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Sales Order SO-0001: Menunggu');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
    await simulate(page, 'Online');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron', { timeout: 8000 });
  });
});
