import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCREENS = ['dashboard', 'barang', 'harga', 'stok', 'mutasi', 'opname'] as const;

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

async function simulate(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await page.locator('.sim__action', { hasText: action }).click();
  await page.getByRole('button', { name: 'Panel Simulasi' }).click();
  await expect(page.locator('#sim-body')).toBeHidden();
}

function parseId(text: string): number {
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

async function activeLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement)) {
      return '';
    }
    return node.getAttribute('aria-label') ?? (node.textContent.trim() || node.id);
  });
}

test.describe('BO-01 Masuk ke Back-Office', () => {
  test('validasi, pesan gabungan, kunci akun, dan penolakan Kasir', async ({ page }) => {
    await page.goto('/#/bo');
    const submit = page.getByRole('button', { name: 'Masuk' });
    await submit.click();
    await expect(page.getByText('Nama pengguna wajib diisi.')).toBeVisible();
    await page.getByLabel('Nama pengguna').fill('sinta.spv');
    await submit.click();
    await expect(page.getByText('Kata sandi wajib diisi.')).toBeVisible();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.getByLabel('Kata sandi', { exact: true }).fill('salah12345');
      await submit.click();
      await expect(page.getByText('Nama pengguna atau kata sandi salah.')).toBeVisible();
    }
    await page.getByLabel('Kata sandi', { exact: true }).fill('salah12345');
    await submit.click();
    await expect(page.getByText('Akun dikunci 15 menit. Hubungi Owner.')).toBeVisible();
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026B');
    await submit.click();
    await expect(page.getByText('Akun dikunci 15 menit. Hubungi Owner.')).toBeVisible();

    await page.getByLabel('Nama pengguna').fill('dewi.kasir');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026C');
    await submit.click();
    await expect(
      page.getByText('Peran Kasir tidak memiliki akses ke Back-Office. Gunakan aplikasi POS.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/bo$/);
  });

  test('Tampilkan memperlihatkan kata sandi selama ditahan', async ({ page }) => {
    await page.goto('/#/bo');
    const password = page.getByLabel('Kata sandi', { exact: true });
    await password.fill('Kunci2026B');
    const show = page.getByRole('button', { name: 'Tampilkan' });
    const box = await show.boundingBox();
    if (box === null) {
      throw new Error('tombol tidak terlihat');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(password).toHaveAttribute('type', 'text');
    await page.mouse.up();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('urutan tab: nama pengguna, kata sandi, Tampilkan, Masuk', async ({ page }) => {
    await page.goto('/#/bo');
    await expect(page.getByLabel('Nama pengguna')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Kata sandi', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tampilkan' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeFocused();
  });

  test('offline: banner tampil dan tombol Masuk nonaktif', async ({ page }) => {
    await page.goto('/#/bo');
    await simulate(page, 'Online');
    await expect(
      page.getByText(
        'Tidak ada koneksi internet. Perubahan tidak dapat disimpan sampai koneksi pulih.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masuk' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('alamat langsung tanpa login dialihkan ke BO-01', async ({ page }) => {
    await page.goto('/#/bo/barang');
    await expect(page).toHaveURL(/#\/bo$/);
  });
});

test.describe('kerangka Back-Office', () => {
  test('menu per peran, urutan tab, dan tautan lewati konten', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await expect(page.locator('.bo-menu')).toBeHidden();
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const links = page.locator('.bo-menu__link');
    await expect(links.first()).toHaveText('Dashboard');
    expect(await links.count()).toBeGreaterThanOrEqual(20);
    await expect(page.locator('.bo-menu')).toBeVisible();
    const menuWidth = await page
      .locator('.bo-menu')
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(Math.round(menuWidth)).toBe(300);
    const barHeight = await page
      .locator('.bo-topbar')
      .evaluate((node) => node.getBoundingClientRect().height);
    expect(Math.round(barHeight)).toBe(60);
    await page.getByRole('button', { name: 'Tutup menu' }).click();
    await expect(page.locator('.bo-menu')).toBeHidden();

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    const order: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await activeLabel(page));
    }
    expect(order[0]).toBe('Lewati ke konten');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#bo-main')).toBeFocused();
  });

  test('peran Kasir dari Panel Simulasi melihat pesan akses ditolak', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/stok');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('kasir');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(
      page.getByText('Anda tidak memiliki hak akses ke halaman ini. Hubungi Owner.'),
    ).toBeVisible();
  });

  for (const credential of [
    ['haris.owner', 'Kunci2026A'],
    ['sinta.spv', 'Kunci2026B'],
  ] as const) {
    test(`aksesibilitas axe pada seluruh layar untuk ${credential[0]}`, async ({ page }) => {
      test.slow();
      await page.goto('/#/bo');
      const first = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(first.violations, 'login').toEqual([]);
      await loginBo(page, credential[0], credential[1]);
      for (const screen of SCREENS) {
        await page.goto(`/#/bo/${screen}`);
        await expect(page).toHaveURL(new RegExp(`#/bo/${screen}$`));
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(result.violations, screen).toEqual([]);
      }
    });
  }

  test('zoom 200%: tanpa gulir horizontal halaman dan tanpa pelanggaran axe', async ({ page }) => {
    test.slow();
    const size = page.viewportSize();
    if (size === null) {
      throw new Error('ukuran viewport tidak diketahui');
    }
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await page.setViewportSize({
      width: Math.floor(size.width / 2),
      height: Math.floor(size.height / 2),
    });
    for (const screen of SCREENS) {
      await page.goto(`/#/bo/${screen}`);
      await expect(page).toHaveURL(new RegExp(`#/bo/${screen}$`));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, screen).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Buka menu' }).click();
      await expect(page.locator('.bo-menu__link').first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations, screen).toEqual([]);
    }
  });
});

test.describe('BO-02 Dashboard', () => {
  test('kartu, grafik, tabel peringatan, strip, dan tautan Lihat Semua Stok', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await expect(page.locator('.bo-widget--omset')).toBeVisible();
    await expect(page.locator('.bo-widget--chart')).toBeVisible();
    await expect(page.locator('.bo-widget--stok')).toBeVisible();
    await page.getByRole('button', { name: 'Lihat Semua' }).first().click();
    await expect(page).toHaveURL(/#\/bo\/stok$/);
  });
});

test.describe('BO-03 Barang', () => {
  test('tabel virtual 3.600 baris dan form seluruh informasi satu barang', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/barang');
    await expect(page.locator('.bo-count')).toHaveText('3.607 barang');
    expect(await page.locator('.vtable__rows .vtable__row').count()).toBeLessThan(60);
    await expect(page.getByLabel('Kode barang')).toHaveValue('B0001');
    await page.locator('.vtable__viewport').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect
      .poll(async () =>
        Number(await page.locator('.vtable__rows .vtable__row').last().getAttribute('data-index')),
      )
      .toBeGreaterThan(3500);
    await page
      .locator('.vtable__rows .vtable__row')
      .last()
      .locator('.vtable__cell')
      .first()
      .click();
    await expect(page.getByLabel('Kode barang')).not.toHaveValue('B0001');
  });

  test('validasi Lampiran C, simpan barang baru, dan Nonaktifkan hanya Owner', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/barang');
    await page.getByRole('button', { name: 'Tambah Barang' }).click();
    const save = page.getByRole('button', { name: 'Simpan Barang' });
    await save.click();
    await expect(page.getByText('Kode barang wajib diisi.')).toBeVisible();
    await page.getByLabel('Kode barang').fill('B0001');
    await save.click();
    await expect(page.getByText('Kode barang sudah dipakai.')).toBeVisible();
    await page.getByLabel('Kode barang').fill('B9001');
    await save.click();
    await expect(page.getByText('Nama barang wajib diisi.')).toBeVisible();
    await page.getByLabel('Nama barang').fill('Barang Uji Baru');
    await save.click();
    await expect(page.getByText('Satuan dasar wajib dipilih.')).toBeVisible();
    await page.getByLabel('Satuan dasar').selectOption('Pcs');
    await page.getByLabel('Stok minimum Gudang Display').fill('-1');
    await save.click();
    await expect(page.getByText('Stok minimum tidak boleh negatif.')).toBeVisible();
    await page.getByLabel('Stok minimum Gudang Display').fill('5');
    await save.click();
    await expect(page.getByText('Barang tersimpan.')).toBeVisible();
    await expect(page.locator('.bo-count')).toHaveText('3.608 barang');
    await expect(page.getByRole('button', { name: 'Nonaktifkan Barang' })).toBeHidden();
  });

  test('Owner menonaktifkan barang dengan konfirmasi', async ({ page }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await page.goto('/#/bo/barang');
    await page.getByRole('button', { name: 'Nonaktifkan Barang' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Nonaktifkan', exact: true })
      .click();
    await expect(page.locator('.vtable__rows .vtable__row').first()).toContainText('(Nonaktif)');
  });
});

test.describe('BO-04 Satuan dan Harga', () => {
  test('Owner: validasi harga, konfirmasi di bawah HPP, satuan baru, dan simpan', async ({
    page,
  }) => {
    await loginBo(page, 'haris.owner', 'Kunci2026A');
    await page.goto('/#/bo/harga');
    const cell = (row: number, field: string) =>
      page.locator(`[data-cell="${String(row)}:${field}"]`);
    const save = page.getByRole('button', { name: 'Simpan Harga' });
    await cell(0, 'eceran').fill('0');
    await save.click();
    await expect(page.getByText('Harga wajib diisi dan lebih dari 0.')).toBeVisible();
    await cell(0, 'eceran').fill('100');
    await cell(0, 'grosir').fill('120');
    await save.click();
    await expect(
      page.getByText('Harga Grosir lebih tinggi dari Eceran. Periksa kembali.'),
    ).toBeVisible();
    await cell(0, 'grosir').fill('90');
    await cell(0, 'kontraktor').fill('80');
    await save.click();
    await expect(
      page.getByText(
        'Harga di bawah HPP satuan ini. Simpan tetap diperbolehkan setelah Anda mengonfirmasi.',
      ),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
    await page.getByRole('button', { name: 'Tambah Satuan' }).click();
    await cell(2, 'name').fill('Kg');
    await save.click();
    await expect(page.getByText('Nama satuan sudah dipakai pada barang ini.')).toBeVisible();
    await cell(2, 'name').fill('Zak');
    await save.click();
    await expect(page.getByText('Isi satuan harus lebih dari 0.')).toBeVisible();
    await cell(2, 'factor').fill('0,02');
    for (const tier of ['eceran', 'grosir', 'kontraktor']) {
      await cell(2, tier).fill('100000');
    }
    for (const tier of ['eceran', 'grosir', 'kontraktor']) {
      await cell(1, tier).fill('30000');
    }
    await save.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Simpan Tetap' }).click();
    await expect(page.getByText('Harga tersimpan.')).toBeVisible();
  });

  test('Supervisor hanya membaca tanpa kolom isian dan tombol simpan', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/harga');
    await expect(page.locator('.bo-cell-input')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Simpan Harga' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tambah Satuan' })).toHaveCount(0);
    await expect(page.getByText('Hanya baca.')).toBeVisible();
  });
});

test.describe('BO-05 Stok per Gudang', () => {
  test('filter negatif dari Panel Simulasi, tandai ditinjau ditolak, dan ekspor simulasi', async ({
    page,
  }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await simulate(page, 'Picu stok negatif');
    await page.goto('/#/bo/stok?filter=negatif');
    await expect(page.locator('.bo-count')).toHaveText('1 barang');
    await expect(page.locator('.vtable__rows')).toContainText('Ditinjau (negatif)');
    await page.getByRole('button', { name: 'Tandai Sudah Ditinjau' }).click();
    await expect(
      page.getByText('Stok masih negatif. Lakukan opname atau penerimaan barang terlebih dahulu.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ekspor Excel' }).click();
    await expect(page.getByRole('dialog')).toContainText('Pratinjau ekspor Excel');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
  });

  test('chip gudang menyaring kolom ekspor dan filter tanpa hasil menampilkan pesan kosong', async ({
    page,
  }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/stok');
    await page.getByRole('button', { name: 'Besar', exact: true }).click();
    await page.getByRole('button', { name: 'Ekspor Excel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('th')).toHaveText([
      'Kode',
      'Nama barang',
      'Besar',
      'Satuan dasar',
      'Min',
      'Status',
    ]);
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    await page.getByRole('searchbox', { name: 'Cari' }).fill('zzzzzzzz');
    await expect(page.getByText('Tidak ada barang yang cocok dengan filter.')).toBeVisible();
    await page.getByRole('button', { name: 'Ekspor PDF' }).click();
    await expect(page.getByText('Tidak ada data untuk diekspor.')).toBeVisible();
  });
});

test.describe('BO-06 Mutasi Antar Gudang (F-06)', () => {
  test('memindahkan 2 Sak dari Gudang Besar ke Display dan stok berubah di BO-05', async ({
    page,
  }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/stok');
    await page.getByRole('searchbox', { name: 'Cari' }).fill('B0001');
    const row = page.locator('.vtable__rows .vtable__row').first();
    await expect(row).toContainText('B0001');
    const before = {
      display: parseId(await row.locator('.vtable__cell').nth(2).innerText()),
      besar: parseId(await row.locator('.vtable__cell').nth(3).innerText()),
    };

    await page.goto('/#/bo/mutasi');
    await page.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Tambahkan minimal satu barang.')).toBeVisible();
    await page.getByLabel('Cari atau pindai barang').fill('B0001');
    await page.getByLabel('Cari atau pindai barang').press('Enter');
    const quantity = page.locator('[data-line="0"]');
    await quantity.fill('9999999');
    await page.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText(/Jumlah melebihi stok gudang asal \(/)).toBeVisible();
    await quantity.fill('0');
    await page.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await quantity.fill('2');
    await page.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Mutasi M-0002 tersimpan.')).toBeVisible();
    await expect(page.locator('.bo-panel').last()).toContainText('M-0002');

    await page.goto('/#/bo/stok');
    await page.getByRole('searchbox', { name: 'Cari' }).fill('B0001');
    const after = page.locator('.vtable__rows .vtable__row').first();
    await expect
      .poll(async () => parseId(await after.locator('.vtable__cell').nth(2).innerText()))
      .toBeCloseTo(before.display + 80, 1);
    expect(parseId(await after.locator('.vtable__cell').nth(3).innerText())).toBeCloseTo(
      before.besar - 80,
      1,
    );
  });

  test('gudang asal sama dengan tujuan ditolak', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/mutasi');
    await page.getByLabel('Gudang tujuan').selectOption('besar');
    await page.getByLabel('Cari atau pindai barang').fill('B0002');
    await page.getByLabel('Cari atau pindai barang').press('Enter');
    await page.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Gudang asal dan tujuan tidak boleh sama.')).toBeVisible();
  });
});

test.describe('BO-07 Opname Stok', () => {
  test('draf, validasi, penerapan oleh Supervisor, dan dokumen terkunci', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/opname');
    await page.getByRole('button', { name: 'Terapkan Penyesuaian Stok' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terapkan', exact: true }).click();
    await expect(page.getByText('Tidak ada selisih untuk diterapkan.')).toBeVisible();
    await page.getByLabel('Cari atau pindai barang').fill('B0001');
    await page.getByLabel('Cari atau pindai barang').press('Enter');
    await expect(page.getByText('Terisi 0 dari 1')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Draf Opname' }).click();
    await expect(page.getByText('Isi stok fisik atau hapus baris ini.')).toBeVisible();
    const physical = page.locator('[data-physical="P-0001"]');
    await physical.fill('-1');
    await page.getByRole('button', { name: 'Simpan Draf Opname' }).click();
    await expect(page.getByText('Stok fisik tidak boleh negatif.')).toBeVisible();
    await physical.fill('0');
    await expect(page.getByText('Terisi 1 dari 1')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Draf Opname' }).click();
    await expect(page.getByText('Draf opname tersimpan.')).toBeVisible();
    await page.getByRole('button', { name: 'Terapkan Penyesuaian Stok' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terapkan', exact: true }).click();
    await expect(page.getByText('Penyesuaian stok diterapkan.')).toBeVisible();
    await expect(page.locator('.bo-transfer__head')).toContainText('Diterapkan');
    await expect(page.getByText(/Jurnal selisih: /)).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Draf Opname' }).click();
    await expect(page.getByText('Opname yang sudah diterapkan tidak dapat diubah.')).toBeVisible();
    await page.getByRole('button', { name: 'Opname Baru' }).click();
    await expect(
      page.getByText('Belum ada barang di daftar opname. Cari atau pindai barang.'),
    ).toBeVisible();
  });
});

test.describe('mode offline', () => {
  test('tombol simpan nonaktif dan banner tampil di BO-03', async ({ page }) => {
    await loginBo(page, 'sinta.spv', 'Kunci2026B');
    await page.goto('/#/bo/barang');
    await simulate(page, 'Online');
    await expect(
      page.getByText(
        'Tidak ada koneksi internet. Perubahan tidak dapat disimpan sampai koneksi pulih.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Barang' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
