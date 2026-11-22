import { expect, test, type Locator, type Page } from '@playwright/test';
import { pickParty } from './helpers/party';

// Pencocokan ulang seluruh dokumen "Revisi Penyesuain Final POS&BO" dengan gambar klien (20 November):
// selisih tampilan yang ditemukan saat layar nyata dibandingkan berdampingan dengan gambar.
// Nomor G mengikuti docs/superpowers/specs/2026-11-20-revisi-final-pos-bo-design.md bagian audit.

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'Back-Office dirancang untuk desktop');
});

async function loginBo(page: Page): Promise<void> {
  await page.goto('/#/bo');
  await page.getByLabel('Nama pengguna').fill('haris.owner');
  await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/bo\/dashboard$/);
}

const active = (page: Page): Locator => page.locator('.bo-tabpanel:not([hidden])');

test.describe('G1 Data Barang: empat baris daftar tampil penuh (gambar 51)', () => {
  test('pada 1280x640 empat baris daftar terlihat penuh tanpa terpotong', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await page.goto('/#/bo/barang');
    await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
    const viewport = await page.locator('.vtable__viewport').boundingBox();
    const rows = await page
      .locator('.vtable__rows .vtable__row')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
    const full = rows.filter(
      (box) =>
        box.top >= (viewport?.y ?? 0) - 1 &&
        box.bottom <= (viewport?.y ?? 0) + (viewport?.height ?? 0) + 1,
    );
    expect(full.length).toBeGreaterThanOrEqual(4);
    // Halaman tetap tidak menggulir.
    const overflow = await page
      .locator('.bo-content')
      .evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('Perbesar gambar: gambar setinggi kira-kira setengah layar dan di tengah', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await page.goto('/#/bo/barang');
    await expect(page.locator('.bo-pd-count')).toHaveText('3.607 barang');
    await page.getByRole('button', { name: 'Perbesar foto' }).click();
    const image = await page.locator('.bo-pd-zoomimg').boundingBox();
    expect(image?.height ?? 0).toBeGreaterThanOrEqual(300);
    expect(image?.height ?? 999).toBeLessThanOrEqual(330);
    const center = (image?.x ?? 0) + (image?.width ?? 0) / 2;
    expect(Math.abs(center - 640)).toBeLessThanOrEqual(2);
  });
});

test.describe('G2 Halaman master: satu baris per data (gambar 31)', () => {
  for (const [path, name] of [
    ['/#/bo/master/pelanggan', 'Pelanggan'],
    ['/#/bo/master/pemasok', 'Pemasok'],
    ['/#/bo/master/ekspedisi', 'Ekspedisi'],
    ['/#/bo/master/sales', 'Sales'],
  ] as const) {
    test(`${name}: nama dan alamat tidak melipat dan baris setinggi sama`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await loginBo(page);
      await page.goto(path);
      await expect(active(page).locator('.bo-master__table tbody tr').first()).toBeVisible();
      const texts = await active(page)
        .locator('.bo-master__clip .bo-master__text')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            height: Math.round(node.getBoundingClientRect().height),
            wraps: getComputedStyle(node).whiteSpace !== 'nowrap',
          })),
        );
      expect(texts.length).toBeGreaterThan(2);
      for (const item of texts) {
        expect(item.wraps).toBe(false);
        expect(item.height).toBeLessThanOrEqual(24);
      }
      // Tidak ada kolom angka yang terpotong di sisi kanan tabel.
      const clippedRight = await active(page)
        .locator('.bo-master__tablewrap')
        .evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(clippedRight).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('G3 Daftar faktur: nama pihak tampil penuh (gambar 47 sampai 50)', () => {
  for (const [path, name] of [
    ['/#/bo/transaksi/faktur-pembelian', 'Faktur Pembelian'],
    ['/#/bo/transaksi/faktur-penjualan', 'Faktur Penjualan'],
  ] as const) {
    test(`${name}: kolom pemasok atau pelanggan dan status tidak terpotong`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await loginBo(page);
      await page.goto(path);
      await expect(active(page).locator('.bo-trx-table tbody tr').first()).toBeVisible();
      const clipped = await active(page)
        .locator('.bo-trx-table tbody tr')
        .evaluateAll((rows) =>
          rows
            .slice(0, 8)
            .flatMap((row) => [4, 6].map((index) => row.querySelectorAll('td')[index - 1]))
            .filter((cell): cell is HTMLTableCellElement => cell !== undefined)
            .filter((cell) => {
              const inner = cell.firstElementChild ?? cell;
              return (
                inner.scrollWidth > inner.clientWidth + 1 || cell.scrollWidth > cell.clientWidth + 1
              );
            })
            .map((cell) => cell.textContent),
        );
      expect(clipped).toEqual([]);
    });
  }
});

test.describe('G4 Form PO, SO, dan Faktur: bilah tombol seperti gambar 42 sampai 45', () => {
  test('PO baru: Simpan, Cetak, Info; Info menampilkan hutang pemasok yang dipilih', async ({
    page,
  }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/po-pembelian');
    await active(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    const bar = active(page).locator('.bo-trx__bar');
    for (const name of ['Simpan', 'Cetak', 'Info']) {
      await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(bar.getByRole('button', { name: 'Cari barang' })).toHaveCount(0);
    // Tanpa pemasok: peringatan, bukan kotak kosong.
    await bar.getByRole('button', { name: 'Info', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Pilih pemasok dahulu.')).toBeVisible();
    await pickParty(active(page), 'Pemasok');
    await bar.getByRole('button', { name: 'Info', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Info Hutang Pemasok' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Total Hutang');
    await expect(dialog).toContainText('Hutang Jatuh Tempo');
    await dialog.getByRole('button', { name: 'Tutup' }).click();
  });

  test('SO baru: Info menampilkan piutang dan plafon pelanggan yang dipilih', async ({ page }) => {
    await loginBo(page);
    await page.goto('/#/bo/transaksi/so-penjualan');
    await active(page).getByRole('button', { name: 'Tambah', exact: true }).click();
    const bar = active(page).locator('.bo-trx__bar');
    await pickParty(active(page), 'Pelanggan');
    await bar.getByRole('button', { name: 'Info', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Info Piutang Pelanggan' });
    await expect(dialog).toBeVisible();
    for (const text of ['Total Piutang', 'Piutang Jatuh Tempo', 'Plafon Kredit', 'Sisa Plafon']) {
      await expect(dialog).toContainText(text);
    }
  });

  test('Faktur Penjualan dan Pembelian: hanya Simpan, Cetak (dan Isi SJ Ekspedisi pada penjualan)', async ({
    page,
  }) => {
    await loginBo(page);
    for (const [path, extra] of [
      ['/#/bo/penjualan', ['Isi SJ Ekspedisi']],
      ['/#/bo/pembelian', []],
    ] as const) {
      await page.goto(path);
      await expect(active(page).getByRole('button', { name: 'Simpan', exact: true })).toBeVisible();
      const names = await active(page)
        .locator('.bo-trx__bar button')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
      expect(names).toEqual(['Simpan', 'Cetak', ...extra]);
    }
  });
});

test.describe('G5 Akuntansi, Beban Usaha (gambar 25)', () => {
  test('tanggal bawaan mengikuti tanggal simulasi dan Keterangan riwayat tidak melipat banyak', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loginBo(page);
    await page.goto('/#/bo/akuntansi');
    await active(page).getByRole('button', { name: 'Beban Usaha', exact: true }).click();
    await expect(active(page).locator('input[type="date"]')).toHaveValue('2026-10-19');
    const heights = await active(page)
      .locator('.bo-acc-split table tbody tr')
      .evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
    expect(heights.length).toBeGreaterThan(3);
    // Hampir semua baris dua baris teks (keterangan dan akun); yang sangat panjang boleh tiga baris.
    for (const height of heights) {
      expect(height).toBeLessThanOrEqual(76);
    }
    expect(heights.filter((height) => height <= 56).length).toBeGreaterThanOrEqual(6);
  });
});

test.describe('G6 Layar masuk memakai foto tablet kasir (gambar 56)', () => {
  test('Back-Office dan POS: kiri foto berlapis biru-hijau dari berkas lokal', async ({ page }) => {
    await page.setViewportSize({ width: 1380, height: 808 });
    for (const path of ['/#/bo', '/#/pos']) {
      await page.goto(path);
      const art = page.locator('.login-split__art');
      await expect(art).toBeVisible();
      await expect
        .poll(() => art.evaluate((node) => getComputedStyle(node).backgroundImage))
        .toContain('/login/kasir-tablet.jpg');
      const loaded = await page.evaluate(async () => {
        const response = await fetch('/login/kasir-tablet.jpg');
        return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
      });
      expect(loaded).toBe(true);
    }
  });
});
