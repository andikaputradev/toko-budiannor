import { expect, test } from '@playwright/test';

// Revisi klien 23 November 2026: layar masuk POS (Pilih Pengguna) harus muat satu halaman, tanpa bilah
// gulir, dengan jarak dirapatkan dan tombol dikecilkan seperlunya (tetap 48 px, target sentuh proyek).
const SIZES: readonly (readonly [number, number])[] = [
  [1366, 640],
  [1280, 640],
  [1280, 600],
  [1280, 580],
  [1280, 720],
  [1366, 768],
  [1280, 800],
  [1920, 1080],
];

test.describe('R17 Layar masuk POS satu halaman tanpa bilah gulir', () => {
  for (const [width, height] of SIZES) {
    test(`${String(width)}x${String(height)}: kartu, papan PIN, dan Masuk terlihat semua`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'tablet-1280x800', 'ukuran diatur di dalam tes');
      await page.setViewportSize({ width, height });
      await page.goto('/#/pos');
      await expect(page.locator('.pos-login__submit')).toBeVisible();

      const measure = await page.evaluate(() => {
        const doc = document.documentElement;
        const side = document.querySelector('.pos-login__side');
        const boxes = Array.from(
          document.querySelectorAll(
            '.pos-login__card, .pinpad__dot, .pinpad__key, .pos-login__submit',
          ),
        ).map((node) => {
          const box = node.getBoundingClientRect();
          return {
            name: `${node.className} ${node.textContent.trim()}`,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        });
        const scrollers = Array.from(document.querySelectorAll('*')).filter((node) => {
          const overflow = getComputedStyle(node).overflowY;
          return (
            (overflow === 'auto' || overflow === 'scroll') &&
            node.scrollHeight > node.clientHeight + 1
          );
        });
        return {
          viewport: window.innerHeight,
          pageScroll: doc.scrollHeight - doc.clientHeight,
          sideScroll: side === null ? -1 : side.scrollHeight - side.clientHeight,
          scrollers: scrollers.map((node) => node.className),
          boxes,
        };
      });

      expect(measure.pageScroll).toBeLessThanOrEqual(0);
      expect(measure.sideScroll).toBeLessThanOrEqual(0);
      expect(measure.scrollers).toEqual([]);
      // 5 kartu + 6 titik + 12 tombol angka/aksi + Masuk.
      expect(measure.boxes).toHaveLength(5 + 6 + 12 + 1);
      for (const box of measure.boxes) {
        expect(box.top, box.name).toBeGreaterThanOrEqual(0);
        expect(box.bottom, box.name).toBeLessThanOrEqual(measure.viewport);
      }
      const touch = measure.boxes.filter(
        (box) => !box.name.includes('pinpad__dot') && (box.width < 47.5 || box.height < 47.5),
      );
      expect(touch.map((box) => box.name)).toEqual([]);
    });
  }

  for (const [width, height] of [
    [1366, 640],
    [1280, 600],
    [1280, 580],
  ] as const) {
    test(`${String(width)}x${String(height)}: pesan galat PIN satu dan dua baris tidak memunculkan gulir`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'tablet-1280x800', 'ukuran diatur di dalam tes');
      await page.setViewportSize({ width, height });
      await page.goto('/#/pos');
      await page.getByRole('radio', { name: /Dewi/ }).click();
      const side = page.locator('.pos-login__side');
      const overflow = (): Promise<number> =>
        side.evaluate((node) => node.scrollHeight - node.clientHeight);
      // Tiga PIN salah berturut-turut: pesan pertama satu baris, pesan terakhir (akun dikunci) dua baris.
      for (const expected of [/PIN salah/, /PIN salah/, /dikunci/]) {
        for (const digit of '000000') {
          await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
        }
        await page.locator('.pos-login__submit').click();
        await expect(page.locator('.pos-login__error')).toHaveText(expected);
        expect(await overflow()).toBeLessThanOrEqual(0);
        await expect(page.locator('.pos-login__submit')).toBeInViewport({ ratio: 1 });
      }
    });
  }

  test('PIN tetap bisa diisi dan Masuk tetap bisa ditekan dari layar satu halaman', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-1280x800', 'ukuran diatur di dalam tes');
    await page.setViewportSize({ width: 1366, height: 640 });
    await page.goto('/#/pos');
    await page.getByRole('radio', { name: /Dewi/ }).click();
    for (const digit of '1234') {
      await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    await expect(page.locator('.pinpad__dot.is-filled')).toHaveCount(4);
    await page.locator('.pinpad__key', { hasText: 'Kosong' }).click();
    await expect(page.locator('.pinpad__dot.is-filled')).toHaveCount(0);
    await expect(page.locator('.pos-login__submit')).toBeInViewport({ ratio: 1 });
  });
});
