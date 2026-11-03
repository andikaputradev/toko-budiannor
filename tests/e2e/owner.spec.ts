import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCREENS = ['ringkasan', 'stok', 'transaksi', 'laporan', 'piutang'] as const;

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width > 500, 'Aplikasi Owner dirancang untuk HP 360 x 800');
});

async function loginOwner(page: Page): Promise<void> {
  await page.goto('/#/owner');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/owner\/ringkasan$/);
}

async function simulate(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  const pattern = action === 'Online' ? /^(Online|Offline)$/ : action;
  await page.locator('.sim__action', { hasText: pattern }).click();
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await expect(page.locator('#sim-body')).toBeHidden();
}

async function pull(page: Page, distance: number): Promise<void> {
  await page.evaluate((delta) => {
    const main = document.getElementById('own-main');
    if (main === null) {
      throw new Error('area utama tidak ditemukan');
    }
    const fire = (type: string, y: number): void => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'touches', { value: [{ clientY: y }] });
      main.dispatchEvent(event);
    };
    fire('touchstart', 100);
    fire('touchmove', 100 + delta);
    main.dispatchEvent(new Event('touchend', { bubbles: true }));
  }, distance);
}

test.describe('OWN-01 Masuk Monitoring Owner', () => {
  test('validasi, peran bukan Owner, dan sesi tetap setelah muat ulang sampai keluar', async ({
    page,
  }) => {
    await page.goto('/#/owner');
    await expect(page.getByText('Aplikasi mobile Flutter offline-first')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Masuk' });
    await submit.click();
    await expect(page.getByText('Nama pengguna wajib diisi.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await submit.click();
    await expect(page.getByText('Kata sandi wajib diisi.')).toBeVisible();
    await page.getByLabel('Kata sandi', { exact: true }).fill('salah12345');
    await submit.click();
    await expect(page.getByText('Nama pengguna atau kata sandi salah.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('sinta.spv');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026B');
    await submit.click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Owner.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await submit.click();
    await expect(page).toHaveURL(/#\/owner\/ringkasan$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ringkasan Omzet' })).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/owner$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
  });

  test('Tampilkan sementara, urutan tab, dan ukuran sesuai spesifikasi', async ({ page }) => {
    await page.goto('/#/owner');
    const password = page.getByLabel('Kata sandi', { exact: true });
    await password.fill('Kunci2026A');
    await page.getByRole('button', { name: 'Tampilkan' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('type', 'password', { timeout: 5000 });
    await page.getByLabel('Nama pengguna').focus();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tampilkan' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeFocused();
    const sizes = await page.evaluate(() => {
      const box = (selector: string): { width: number; height: number; top: number } => {
        const node = document.querySelector(selector);
        if (node === null) {
          throw new Error(selector);
        }
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top };
      };
      return {
        logo: box('.own-login__logo'),
        user: box('.own-login__form input'),
        submit: box('.own-login__submit'),
      };
    });
    expect(Math.round(sizes.logo.width)).toBe(100);
    expect(Math.round(sizes.logo.height)).toBe(60);
    expect(Math.round(sizes.logo.top)).toBe(90);
    expect(Math.round(sizes.user.height)).toBe(52);
    expect(Math.round(sizes.submit.height)).toBe(56);
  });

  test('offline: banner tampil dan tombol Masuk nonaktif', async ({ page }) => {
    await page.goto('/#/owner');
    await simulate(page, 'Online');
    await expect(
      page.getByText('Tidak ada koneksi internet. Masuk memerlukan internet.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masuk' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('alamat langsung tanpa login dialihkan ke OWN-01', async ({ page }) => {
    await page.goto('/#/owner/piutang');
    await expect(page).toHaveURL(/#\/owner$/);
  });
});

test.describe('kerangka dan navigasi bawah', () => {
  test('lima tujuan, tinggi header 56 px, dan urutan tab', async ({ page }) => {
    await loginOwner(page);
    const links = page.locator('.own-nav__link');
    await expect(links).toHaveText(['Ringkasan', 'Stok', 'Transaksi', 'Laporan', 'Piutang']);
    const header = await page
      .locator('.own-top')
      .evaluate((node) => node.getBoundingClientRect().height);
    expect(Math.round(header)).toBe(56);
    for (const [name, path] of [
      ['Stok', 'stok'],
      ['Transaksi', 'transaksi'],
      ['Laporan', 'laporan'],
      ['Piutang', 'piutang'],
      ['Ringkasan', 'ringkasan'],
    ] as const) {
      await links.filter({ hasText: name }).click();
      await expect(page).toHaveURL(new RegExp(`#/owner/${path}$`));
      await expect(links.filter({ hasText: name })).toHaveAttribute('aria-current', 'page');
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Lewati ke konten' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#own-main')).toBeFocused();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`aksesibilitas axe pada seluruh layar mode ${scheme}`, async ({ page }) => {
      test.slow();
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/#/owner');
      const login = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(login.violations, 'login').toEqual([]);
      await loginOwner(page);
      for (const screen of SCREENS) {
        await page.goto(`/#/owner/${screen}`);
        await expect(page).toHaveURL(new RegExp(`#/owner/${screen}$`));
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(result.violations, screen).toEqual([]);
      }
      for (const tab of ['so', 'po', 'notifikasi']) {
        await page.goto(`/#/owner/transaksi?tab=${tab}`);
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(result.violations, tab).toEqual([]);
      }
    });
  }

  test('mode gelap mengikuti pengaturan HP', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginOwner(page);
    const light = await page
      .locator('.own')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page
      .locator('.own')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(dark).not.toBe(light);
    const luminance = (css: string): number => {
      const parts = css.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      return (parts[0] ?? 0) + (parts[1] ?? 0) + (parts[2] ?? 0);
    };
    expect(luminance(dark)).toBeLessThan(luminance(light));
  });

  test('reflow pada lebar 320 px tanpa gulir horizontal', async ({ page }) => {
    await loginOwner(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const screen of SCREENS) {
      await page.goto(`/#/owner/${screen}`);
      await expect(page).toHaveURL(new RegExp(`#/owner/${screen}$`));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, screen).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('OWN-02 Ringkasan Omzet', () => {
  test('periode, grafik per jam dan per hari, nilai batang, dan perbandingan', async ({ page }) => {
    await loginOwner(page);
    await expect(page.locator('.own-card--revenue output')).toContainText('Rp');
    await expect(page.locator('.bo-chart__bar')).toHaveCount(10);
    await page.getByRole('button', { name: 'Kemarin' }).click();
    await expect(page.locator('.own-compare')).toContainText('dibanding sehari sebelumnya');
    await page.locator('.bo-chart__hit').nth(1).click();
    await expect(page.locator('.own-readout')).toContainText('Jam 09: Rp');
    await page.getByRole('button', { name: '7 hari' }).click();
    await expect(page.locator('.bo-chart__bar')).toHaveCount(7);
    await expect(page.locator('.own-compare')).toContainText('dibanding 7 hari sebelumnya');
    await expect(page.locator('.own-card--small')).toHaveCount(2);
    await expect(page.getByText(/^Diperbarui \d\d:\d\d$/)).toBeVisible();
  });

  test('auto-refresh 60 detik memperbarui waktu data', async ({ page }) => {
    await page.clock.install();
    await loginOwner(page);
    await expect(page.getByText('Diperbarui 10:00')).toBeVisible();
    await page.clock.fastForward(61_000);
    await expect(page.getByText('Diperbarui 10:01')).toBeVisible();
  });

  test('offline: banner, indikator offline-first, tombol muat ulang nonaktif, dan tarik gagal', async ({
    page,
  }) => {
    await loginOwner(page);
    await simulate(page, 'Online');
    await expect(
      page.getByText(/Tidak ada koneksi internet\. Data terakhir diperbarui pukul \d\d:\d\d\./),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Muat Ulang' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.locator('.own-chip')).toContainText('Offline, data lokal');
    await pull(page, 140);
    await expect(
      page.getByText(/Pembaruan gagal\. Data ditampilkan dari \d\d:\d\d\./),
    ).toBeVisible();
    await expect(page.locator('.own-card--revenue output')).toContainText('Rp');
    await simulate(page, 'Online');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron');
  });
});

test.describe('OWN-03 Cek Stok', () => {
  test('30 kartu lalu 30 berikutnya, pencarian, dan filter di bawah minimum', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    await expect(page.locator('.own-card--stock')).toHaveCount(30);
    await page.getByRole('button', { name: /^Muat \d+ lagi$/ }).click();
    await expect(page.locator('.own-card--stock')).toHaveCount(60);
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('a');
    await expect(page.getByText('Ketik minimal 2 karakter untuk mencari.')).toBeVisible();
    await search.fill('zzzzzzzz');
    await expect(page.getByText('Barang tidak ditemukan.')).toBeVisible();
    await search.fill('semen');
    await expect(page.locator('.own-card--stock').first()).toContainText('Semen');
    await expect(page.locator('.own-card--stock').first()).toContainText('Display:');
    await expect(page.locator('.own-card--stock').first()).toContainText('Besar:');
    await search.fill('');
    await page.getByRole('button', { name: 'Di bawah minimum' }).click();
    await expect(page.locator('.own-card--stock').first()).toContainText('Di bawah minimum');
  });

  test('Buat Mutasi memindahkan stok dan Buat PO membuka formulir terisi', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    await page
      .getByRole('button', { name: /^Buat Mutasi/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(dialog.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await dialog.getByLabel('Jumlah mutasi').fill('99999999');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(dialog.getByText(/Jumlah melebihi stok gudang asal \(/)).toBeVisible();
    await dialog.getByLabel('Jumlah mutasi').fill('1');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Mutasi M-0002 tersimpan.')).toBeVisible();
    await page
      .getByRole('button', { name: /^Buat PO/ })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?tab=po&barang=/);
    await expect(page.locator('.own-card--line')).toHaveCount(1);
  });
});

test.describe('OWN-04 Laporan', () => {
  test('laba rugi, beban per kategori, validasi tanggal, dan arahan ekspor', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/laporan');
    await expect(page.locator('.own-row')).toHaveCount(5);
    await expect(page.getByText('Laba bersih')).toBeVisible();
    await expect(page.getByText('Ekspor PDF dan Excel tersedia di Back-Office.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ekspor/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Beban Operasional' }).click();
    await expect(page.getByText('Total beban')).toBeVisible();
    await page.getByRole('button', { name: 'Pilih tanggal' }).click();
    await page.getByLabel('Dari tanggal').fill('2026-10-19');
    await page.getByLabel('Sampai tanggal').fill('2026-10-01');
    await expect(page.getByText('Tanggal akhir tidak boleh sebelum tanggal awal.')).toBeVisible();
    await page.getByLabel('Dari tanggal').fill('2025-01-01');
    await page.getByLabel('Sampai tanggal').fill('2026-10-19');
    await expect(page.getByText('Rentang laporan maksimal 366 hari.')).toBeVisible();
    await page.getByLabel('Dari tanggal').fill('2020-01-01');
    await page.getByLabel('Sampai tanggal').fill('2020-01-02');
    await expect(page.getByText('Belum ada data pada periode ini.')).toBeVisible();
  });
});

test.describe('OWN-05 Piutang Jatuh Tempo', () => {
  test('urut terlama, bayar piutang, tagihan WA simulasi, hubungi, dan rincian tanpa tombol ubah', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/piutang');
    const cards = page.locator('.own-card--debt');
    expect(await cards.count()).toBeGreaterThan(1);
    const days = (await cards.allTextContents()).map((text) =>
      Number(/Terlambat (\d+) hari/.exec(text)?.[1]),
    );
    expect([...days].sort((a, b) => b - a)).toEqual(days);
    const first = cards.first();
    await first.getByRole('button', { name: 'Catat Bayar Piutang' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await dialog.getByLabel('Jumlah bayar').fill('99999999999');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText(/Pembayaran melebihi saldo piutang Rp /)).toBeVisible();
    const before = await page.locator('.own-card--total output').innerText();
    await dialog.getByLabel('Jumlah bayar').fill('1000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran Rp 1.000 tercatat.')).toBeVisible();
    await expect(page.locator('.own-card--total output')).not.toHaveText(before);

    await cards.first().getByRole('button', { name: 'Kirim Tagihan WA (PDF)' }).click();
    await expect(page.locator('.own-pdf')).toContainText('TAGIHAN PIUTANG');
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByText(/Tagihan PDF terkirim ke 08\d+ via WA \(simulasi\)\./),
    ).toBeVisible();

    await cards.first().getByRole('button', { name: 'Hubungi Pelanggan' }).click();
    const links = page.getByRole('dialog').getByRole('link');
    await expect(links.first()).toHaveAttribute('href', /^tel:\+62/);
    await expect(links.nth(1)).toHaveAttribute('href', /^https:\/\/wa\.me\/62/);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();

    await cards.first().locator('.own-card__open').click();
    await expect(page.locator('.pos-table tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ubah|Edit|Hapus/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Catat Bayar Piutang' })).toBeVisible();
    await page.getByRole('button', { name: 'Kembali' }).click();
    await expect(page.locator('.own-card--total')).toBeVisible();
  });
});

test.describe('OWN-06 Transaksi', () => {
  test('antrean persetujuan dengan PIN Owner tercatat dan hilang dari daftar menunggu', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await expect(page.locator('.own-card--approval')).toHaveCount(3);
    await page
      .locator('.own-card--approval')
      .first()
      .getByRole('button', { name: 'Setujui' })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('Alasan wajib diisi minimal 5 karakter.')).toBeVisible();
    await dialog.getByLabel('Alasan').fill('Pelanggan lama');
    await dialog.getByLabel('PIN Owner').fill('1234');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('PIN Owner salah. Sisa percobaan: 2.')).toBeVisible();
    await dialog.getByLabel('PIN Owner').fill('3571');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('PIN ini bukan milik Owner.')).toBeVisible();
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Persetujuan B-0002 disetujui.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Menunggu persetujuan (2)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Riwayat persetujuan' })).toBeVisible();
    await page
      .locator('.own-card--approval')
      .first()
      .getByRole('button', { name: 'Tolak' })
      .click();
    await page.getByRole('dialog').getByLabel('Alasan').fill('Tidak sesuai');
    await page.getByRole('dialog').getByLabel('PIN Owner').fill('482916');
    await page.getByRole('dialog').getByRole('button', { name: 'Tolak' }).click();
    await expect(page.getByRole('heading', { name: 'Menunggu persetujuan (1)' })).toBeVisible();
  });

  test('Sales Order darurat tersimpan Draf dan piutang over-limit meminta PIN Owner', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=so');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(
      page.getByText('Bill masih kosong. Tambahkan barang terlebih dahulu.'),
    ).toBeVisible();
    const picker = page.getByLabel('Cari atau pindai barang');
    await picker.fill('B0001');
    await picker.press('Enter');
    await expect(page.locator('.own-card--line')).toHaveCount(1);
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await picker.fill('B0001');
    await picker.press('Enter');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await page.getByLabel('Cara bayar').selectOption('piutang');
    await page.locator('[data-line="0"]').fill('5000');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Transaksi piutang ditolak');
    await dialog.getByLabel('Alasan').fill('Pelanggan lama');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Sales Order SO-0002 tersimpan sebagai Draf.')).toBeVisible();
  });

  test('Purchase Order darurat dengan validasi Lampiran C', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=po&barang=B0002');
    await expect(page.locator('.own-card--line')).toHaveCount(1);
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Pilih pemasok terlebih dahulu.')).toBeVisible();
    await page.getByLabel('Pemasok').selectOption('V-001');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Pilih gudang penerima.')).toBeVisible();
    await page.getByLabel('Gudang penerima').selectOption('besar');
    await page.locator('[data-price="0"]').fill('0');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Harga beli wajib diisi dan lebih dari 0.')).toBeVisible();
    await page.locator('[data-price="0"]').fill('25000');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Purchase Order PO-0001 tersimpan.')).toBeVisible();
  });

  test('pusat notifikasi push simulasi dan tanda dibaca', async ({ page }) => {
    await loginOwner(page);
    await page.getByRole('link', { name: /^Notifikasi/ }).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?tab=notifikasi$/);
    await expect(page.locator('.own-notice').first()).toBeVisible();
    await page.getByRole('button', { name: 'Simulasikan: stok di bawah minimum' }).click();
    await expect(page.locator('.own-push')).toContainText('Stok di bawah minimum');
    await page
      .getByRole('button', { name: 'Simulasikan: piutang terlambat lebih dari 7 hari' })
      .click();
    await expect(page.locator('.own-push')).toContainText('Piutang terlambat lebih dari 7 hari');
    await page.getByRole('button', { name: 'Tandai semua dibaca' }).click();
    await expect(page.locator('.own-notice.is-unread')).toHaveCount(0);
  });

  test('aksi saat offline masuk antrean dan terkirim saat online kembali', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await simulate(page, 'Online');
    await page
      .locator('.own-card--approval')
      .first()
      .getByRole('button', { name: 'Setujui' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Mode offline');
    await dialog.getByLabel('Alasan').fill('Pelanggan lama');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.locator('.own-chip')).toContainText('Offline, 1 menunggu');
    await simulate(page, 'Online');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron', { timeout: 8000 });
  });

  test('peran bukan Owner dari Panel Simulasi melihat penolakan', async ({ page }) => {
    await loginOwner(page);
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('kasir');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Owner.')).toBeVisible();
  });
});
