import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

declare global {
  interface Window {
    __blobs?: Blob[];
  }
}

async function captureBlobs(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    window.__blobs = [];
    URL.createObjectURL = (object: Blob | MediaSource): string => {
      if (object instanceof Blob) {
        window.__blobs?.push(object);
      }
      return original(object);
    };
  });
}

async function lastBlobText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const blob = window.__blobs?.at(-1);
    return blob === undefined ? '' : blob.text();
  });
}

test.describe('Portal beranda', () => {
  test('menampilkan tiga ekosistem, 44 layar, dan 10 alur serta lolos axe', async ({ page }) => {
    await page.goto('/#/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Portal Tinjau Sistem POS Toko Budiannor' }),
    ).toBeVisible();
    await expect(page.locator('.portal-card[data-ecosystem]')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Daftar layar (44)' })).toBeVisible();
    await expect(page.locator('.portal-screen')).toHaveCount(44);
    await expect(page.locator('.portal-screen .own-status--warn')).toHaveCount(15);
    await expect(page.locator('.portal-screen .own-status--ok')).toHaveCount(29);
    await expect(page.getByRole('heading', { name: 'Alur ujung ke ujung (10)' })).toBeVisible();
    await expect(page.locator('.portal-card[data-flow]')).toHaveCount(10);
    await expect(page.getByText('POS Kasir').first()).toBeVisible();
    await expect(page.locator('.sim')).toBeHidden();
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations).toEqual([]);
  });

  test('reflow pada lebar 320 px tanpa gulir horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#/');
    await expect(page.locator('.portal-screen')).toHaveCount(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('filter ekosistem, pencarian ID, tautan buka aplikasi, dan mulai alur', async ({ page }) => {
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Aplikasi Mobile' }).click();
    await expect(page.locator('.portal-screen')).toHaveCount(11);
    await page.getByRole('button', { name: 'Back-Office' }).click();
    await expect(page.locator('.portal-screen')).toHaveCount(22);
    await page.getByRole('button', { name: 'Semua' }).click();
    await page.getByLabel('Cari ID atau nama layar').fill('BO-09');
    await expect(page.locator('.portal-screen')).toHaveCount(1);
    await expect(page.locator('.portal-screen')).toContainText('Penjualan dan Riwayat Invoice');
    await expect(page.getByText('Menampilkan 1 dari 44 layar')).toBeVisible();
    await page.getByLabel('Cari ID atau nama layar').fill('');
    await expect(page.locator('.portal-card[data-flow="F-02"]')).toContainText(
      'Sebagian: BO-11 belum dibangun',
    );
    await expect(page.locator('.portal-card[data-flow="F-09"]')).toContainText('Lengkap');
    await page.getByRole('link', { name: 'Buka Aplikasi Owner' }).click();
    await expect(page).toHaveURL(/#\/owner/);
    await page.goto('/#/');
    await expect(page.locator('.portal-card[data-flow="F-10"]')).toBeVisible();
    await page.getByRole('link', { name: 'Mulai Alur F-10' }).click();
    await expect(page).toHaveURL(/#\/tinjau\?alur=F-10/);
    await expect(page.locator('.rev-badge')).toContainText('SALES-01');
  });
});

test.describe('Mode Tinjau', () => {
  test.beforeEach(({ page }) => {
    const size = page.viewportSize();
    test.skip(size === null || size.width < 1000, 'Mode Tinjau dirancang untuk layar lebar');
  });

  test('bingkai perangkat berskala pas, lencana ID, Panel Simulasi tersembunyi, dan lolos axe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto('/#/tinjau?alur=F-09');
    await expect(page.locator('.rev-badge')).toHaveText('OWN-01 Masuk Monitoring Owner');
    const frame = page.frameLocator('iframe.rev-frame');
    await expect(frame.getByRole('button', { name: 'Masuk' })).toBeVisible();
    await expect(page.locator('.sim')).toBeHidden();
    await expect(frame.locator('.sim')).toBeHidden();

    const wrap = page.locator('.rev-frame-wrap');
    const scale = Number(await wrap.getAttribute('data-scale'));
    expect(scale).toBeGreaterThan(0.3);
    expect(scale).toBeLessThan(1);
    const stageBox = await page.locator('.rev-stage').boundingBox();
    const wrapBox = await wrap.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(wrapBox).not.toBeNull();
    if (stageBox !== null && wrapBox !== null) {
      expect(wrapBox.width).toBeLessThanOrEqual(stageBox.width);
      expect(wrapBox.height).toBeLessThanOrEqual(stageBox.height);
      expect(Math.abs(wrapBox.width / wrapBox.height - 360 / 800)).toBeLessThan(0.02);
    }
    const frameBox = await page.locator('iframe.rev-frame').boundingBox();
    expect(frameBox?.width ?? 0).toBeCloseTo(360 * scale, 0);

    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('iframe').analyze();
    expect(result.violations).toEqual([]);
  });

  test('ukuran bingkai berganti per ekosistem dan mengikuti rasio perangkat', async ({ page }) => {
    await page.goto('/#/tinjau?layar=POS-01');
    await expect(page.locator('.rev-badge')).toHaveText('POS-01 Login dan Pilih Kasir');
    const wrap = page.locator('.rev-frame-wrap');
    const pos = await wrap.boundingBox();
    expect(pos).not.toBeNull();
    if (pos !== null) {
      expect(Math.abs(pos.width / pos.height - 1280 / 800)).toBeLessThan(0.02);
    }
    await page.getByLabel('Layar', { exact: true }).selectOption('BO-02');
    await expect(page.locator('.rev-badge')).toContainText('BO-02 Dashboard');
    const bo = await wrap.boundingBox();
    expect(bo).not.toBeNull();
    if (bo !== null) {
      expect(Math.abs(bo.width / bo.height - 1440 / 900)).toBeLessThan(0.02);
    }
    await page.setViewportSize({ width: 1000, height: 600 });
    await expect
      .poll(async () => {
        const small = await wrap.boundingBox();
        return small === null || bo === null ? Number.NaN : bo.width - small.width;
      })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const small = await wrap.boundingBox();
        return small === null ? Number.NaN : Math.abs(small.width / small.height - 1440 / 900);
      })
      .toBeLessThan(0.02);
  });

  test('lencana mengikuti perpindahan layar di dalam bingkai dan lembar POS-03', async ({
    page,
  }) => {
    await page.goto('/#/tinjau?layar=OWN-01');
    const frame = page.frameLocator('iframe.rev-frame');
    await frame.getByLabel('Nama pengguna').fill('haris.owner');
    await frame.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await frame.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.locator('.rev-badge')).toContainText('OWN-02 Ringkasan Omzet');
    await page.getByLabel('Layar', { exact: true }).selectOption('POS-01');
    await expect(page.locator('.rev-badge')).toContainText('POS-01');
    await frame.getByRole('radio', { name: /Dewi/ }).click();
    for (const digit of '2468') {
      await frame.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    await frame.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.locator('.rev-badge')).toContainText('POS-02 Jual Utama');
    await frame.locator('.pos-card').first().click();
    await frame.locator('.pos-bill__name').first().click();
    await expect(page.locator('.rev-badge')).toContainText('POS-03 Pilih Satuan dan Jumlah');
  });

  test('panel alur: langkah berurutan, layar belum dibangun, dan sakelar koneksi', async ({
    page,
  }) => {
    await page.goto('/#/tinjau?alur=F-10');
    await expect(page.locator('.rev-flow__step')).toHaveCount(7);
    await expect(page.locator('.rev-flow__step[aria-current="step"]')).toContainText('SALES-01');
    await page.getByRole('button', { name: 'Langkah berikutnya' }).click();
    await expect(page.locator('.rev-badge')).toContainText('SALES-02');
    await page.locator('.rev-flow__step', { hasText: 'BO-09' }).click();
    await expect(page.locator('.rev-badge')).toContainText('BO-09 Penjualan dan Riwayat Invoice');
    await expect(page).toHaveURL(/langkah=6/);

    await page.getByLabel('Layar', { exact: true }).selectOption('SALES-01');
    const frame = page.frameLocator('iframe.rev-frame');
    const connection = page.getByRole('button', { name: /^Koneksi: / });
    await expect(connection).toHaveText('Koneksi: Online');
    await connection.click();
    await expect(connection).toHaveText('Koneksi: Offline');
    await expect(
      frame.getByText('Mode offline: hanya akun yang pernah masuk di HP ini yang dapat masuk.'),
    ).toBeVisible();
    await connection.click();
    await expect(connection).toHaveText('Koneksi: Online');

    await page.getByLabel('Alur', { exact: true }).selectOption('F-02');
    await page.getByRole('button', { name: 'Langkah berikutnya' }).click();
    await page.getByRole('button', { name: 'Langkah berikutnya' }).click();
    await expect(page.locator('.rev-badge')).toContainText('BO-11 Pelanggan dan Piutang');
    await expect(page.locator('.rev-placeholder')).toBeVisible();
    await expect(page.locator('.rev-placeholder')).toContainText('belum dibangun');
  });

  test('catatan revisi per layar tersimpan, bertahan setelah muat ulang, dan diekspor JSON dan Markdown', async ({
    page,
  }) => {
    await captureBlobs(page);
    await page.goto('/#/tinjau?layar=POS-02');
    const notes = page.locator('.rev-notes');
    await notes.getByRole('button', { name: 'Simpan Catatan' }).click();
    await expect(notes.getByText('Catatan wajib diisi.')).toBeVisible();

    await notes.getByLabel('Isi catatan').fill('Pindahkan tombol Bayar ke tengah bawah panel');
    await notes.getByRole('button', { name: 'Simpan Catatan' }).click();
    await expect(notes.locator('.rev-notes__item')).toHaveCount(1);
    await notes.getByLabel('Isi catatan').fill('Tambah tombol Bayar dengan Kartu Debit');
    await notes.getByLabel('Jenis').selectOption('change-request');
    await notes.getByLabel('Putaran', { exact: true }).selectOption('2');
    await notes.getByRole('button', { name: 'Simpan Catatan' }).click();
    await expect(notes.locator('.rev-notes__item')).toHaveCount(2);

    await page.getByLabel('Layar', { exact: true }).selectOption('BO-12');
    await expect(notes.getByText('Belum ada catatan untuk layar ini.')).toBeVisible();
    await notes.getByLabel('Isi catatan').fill('Layar surat jalan perlu kolom armada');
    await notes.getByRole('button', { name: 'Simpan Catatan' }).click();
    await expect(
      notes.getByText('Total catatan: 3. Putaran 1: 2. Putaran 2: 1. Change Request: 1.'),
    ).toBeVisible();

    await page.reload();
    await page.getByLabel('Layar', { exact: true }).selectOption('POS-02');
    await expect(page.locator('.rev-notes__item')).toHaveCount(2);

    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ekspor JSON' }).click();
    expect((await jsonDownload).suggestedFilename()).toBe('catatan-revisi.json');
    const json = JSON.parse(await lastBlobText(page)) as {
      versi: string;
      ringkasan: { total: number; round1: number; round2: number; changeRequests: number };
      catatan: {
        layar: string;
        jenis: string;
        putaran: number;
        teks: string;
        judulLayar: string;
      }[];
    };
    expect(json.versi).toBe('1.1');
    expect(json.ringkasan).toEqual({ total: 3, round1: 2, round2: 1, changeRequests: 1 });
    expect(json.catatan).toHaveLength(3);
    expect(json.catatan.map((item) => item.layar)).toEqual(['POS-02', 'POS-02', 'BO-12']);
    expect(json.catatan[1]).toMatchObject({
      jenis: 'change-request',
      putaran: 2,
      judulLayar: 'Jual Utama',
    });

    const markdownDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ekspor Markdown' }).click();
    expect((await markdownDownload).suggestedFilename()).toBe('catatan-revisi.md');
    const markdown = await lastBlobText(page);
    expect(markdown).toContain('# Catatan Revisi: Toko Budiannor');
    expect(markdown).toContain('## Putaran 1');
    expect(markdown).toContain('### BO-12 Surat Jalan dan Koli');
    expect(markdown).toContain('## Putaran 2');
    expect(markdown).toContain('- [Change Request] Tambah tombol Bayar dengan Kartu Debit');

    await page
      .getByRole('button', { name: /^Hapus catatan/ })
      .first()
      .click();
    await expect(page.locator('.rev-notes__item')).toHaveCount(1);
  });
});
