import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const REPORTS = [
  'penjualan',
  'laba-rugi',
  'neraca',
  'biaya',
  'produk-terlaris',
  'per-penjual',
] as const;
// Rute tanpa parameter yang dapat dibuka langsung setelah masuk.
const SCREENS = [
  'ringkasan',
  'stok',
  'transaksi',
  'laporan',
  'piutang',
  'piutang?tab=hutang',
  ...REPORTS.map((kind) => `laporan?jenis=${kind}`),
  'transaksi?tab=so',
  'transaksi?tab=po&barang=B0002',
  'transaksi?tab=bayar-piutang',
  'transaksi?tab=bayar-hutang',
  'transaksi?tab=notifikasi',
] as const;
const THEMES = ['Oranye', 'Terakota', 'Teal', 'Biru', 'Hijau', 'Ungu'] as const;

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

// Menunggu peralihan warna selesai agar axe tidak mengukur kontras di tengah animasi.
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      ),
  );
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

async function expectAccessible(page: Page, name: string): Promise<void> {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const found = result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
  expect(found, name).toEqual([]);
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const TARGET_SELECTOR =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="link"]';

// Kontrol terlihat yang lebarnya atau tingginya di bawah 48 px. Titik data grafik (zona sentuh sempit per
// titik) dikecualikan: seluruh area grafik menjadi sasaran ketuk dan memilih titik terdekat.
function undersizedTargets(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const found: string[] = [];
    for (const node of document.querySelectorAll(selector)) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }
      if (node.classList.contains('mob-area__hit')) {
        continue;
      }
      if (
        node.tagName === 'A' &&
        style.display === 'inline' &&
        node.closest('p, li, dd, td') !== null
      ) {
        continue;
      }
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      if (box.width < 47.5 || box.height < 47.5) {
        const name = (node.getAttribute('aria-label') ?? node.textContent)
          .replace(/s+/g, ' ')
          .trim()
          .slice(0, 40);
        found.push(
          `${node.tagName.toLowerCase()}.${[...node.classList].slice(0, 2).join('.')} "${name}" ${String(Math.round(box.width * 10) / 10)} x ${String(Math.round(box.height * 10) / 10)}`,
        );
      }
    }
    return found;
  }, TARGET_SELECTOR);
}

// "Rp 3.031.200" menjadi 3031200.
function rupiah(text: string): number {
  return Number(text.replace(/[^\d]/g, ''));
}

// Kartu Dashboard menurut judulnya.
function cardOf(page: Page, title: string): Locator {
  return page
    .locator('section.mob-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

function backLink(page: Page): Locator {
  return page.getByRole('link', { name: 'Kembali', exact: true });
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
    await expect(page.getByRole('heading', { name: 'Omzet Live' })).toBeVisible();
    await page.getByRole('button', { name: /Status sinkronisasi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/#\/owner$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
  });

  test('Tampilkan sementara, urutan tab, dan ukuran sesuai rancangan', async ({ page }) => {
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
    // Logo berupa ikon toko pada kotak aksen 88 x 88 px (bukan lagi kotak putus-putus 100 x 60).
    await expect(page.locator('.own-login__logo svg')).toBeVisible();
    expect(Math.round(sizes.logo.width)).toBe(88);
    expect(Math.round(sizes.logo.height)).toBe(88);
    expect(Math.round(sizes.logo.top)).toBe(72);
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
  test('empat tab, tinggi bilah atas 64 px, dan urutan tab', async ({ page }) => {
    await loginOwner(page);
    const links = page.locator('.own-nav__link');
    await expect(links).toHaveText(['Dashboard', 'Stok', 'Transaksi', 'Laporan']);
    await expect(links.filter({ hasText: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    // Dashboard memakai pita berwarna; layar lain memakai bilah atas setinggi 64 px (avatar 48 px).
    await expect(page.locator('.mob-hero')).toBeVisible();
    for (const [name, path] of [
      ['Stok', 'stok'],
      ['Transaksi', 'transaksi'],
      ['Laporan', 'laporan'],
    ] as const) {
      await links.filter({ hasText: name }).click();
      await expect(page).toHaveURL(new RegExp(`#/owner/${path}$`));
      await expect(links.filter({ hasText: name })).toHaveAttribute('aria-current', 'page');
      const header = await page
        .locator('.own-top')
        .evaluate((node) => node.getBoundingClientRect().height);
      expect(Math.round(header), name).toBe(64);
    }
    await links.filter({ hasText: 'Dashboard' }).click();
    await expect(page).toHaveURL(/#\/owner\/ringkasan$/);
    await expect(links.filter({ hasText: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
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

  test('Piutang dan Hutang dibuka dari kartu Dashboard dan dari layar Transaksi', async ({
    page,
  }) => {
    await loginOwner(page);
    await expect(page.locator('.own-nav__link', { hasText: 'Piutang' })).toHaveCount(0);
    await page.getByRole('link', { name: /^Piutang Jatuh Tempo/ }).click();
    await expect(page).toHaveURL(/#\/owner\/piutang$/);
    await expect(page.getByRole('button', { name: 'Piutang', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goBack();
    await page.getByRole('link', { name: /^Hutang Supplier/ }).click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?tab=hutang$/);
    await expect(page.getByRole('button', { name: 'Hutang', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('.own-nav__link', { hasText: 'Transaksi' }).click();
    await page.getByRole('link', { name: 'Bayar Piutang' }).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?tab=bayar-piutang$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bayar Piutang' })).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`aksesibilitas axe pada layar utama mode ${scheme}`, async ({ page }) => {
      test.slow();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/#/owner');
      await expectAccessible(page, 'login');
      await loginOwner(page);
      for (const screen of SCREENS) {
        await page.goto(`/#/owner/${screen}`);
        await expect(page).toHaveURL(new RegExp(`#/owner/${screen.replace(/\?/g, '\\?')}$`));
        await expect(page.locator('#own-main')).toBeVisible();
        await expectAccessible(page, screen);
      }
    });

    test(`aksesibilitas axe pada layar rincian dan lembar mode ${scheme}`, async ({ page }) => {
      test.slow();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await loginOwner(page);

      await page.goto('/#/owner/piutang');
      await page.locator('.trx-party').first().click();
      await expectAccessible(page, 'piutang: pelanggan');
      await page.locator('.trx-invoice').first().click();
      await expect(page.locator('.trx-item').first()).toBeVisible();
      await expectAccessible(page, 'piutang: detail invoice');
      await page.getByRole('button', { name: 'Catat Bayar Piutang' }).click();
      await expectAccessible(page, 'piutang: lembar bayar');
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();

      await page.goto('/#/owner/piutang?tab=hutang');
      await page.locator('.trx-party').first().click();
      await expectAccessible(page, 'hutang: supplier');
      await page.locator('.trx-invoice').first().click();
      await expect(page.locator('.trx-item').first()).toBeVisible();
      await expectAccessible(page, 'hutang: detail faktur');

      await page.goto('/#/owner/transaksi');
      await page.locator('.trx-doc', { hasText: 'B-0001' }).click();
      await expect(page.locator('.trx-item').first()).toBeVisible();
      await expectAccessible(page, 'transaksi: detail bill');

      await page.goto('/#/owner/transaksi');
      await page
        .getByRole('button', { name: /^Review / })
        .first()
        .click();
      await expectAccessible(page, 'transaksi: review approval');
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();

      await page.goto('/#/owner/stok');
      await page.locator('.stk-card__open').first().click();
      await expectAccessible(page, 'stok: detail barang');
      await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
      await page
        .getByRole('button', { name: /^Perbesar foto / })
        .first()
        .click();
      await expectAccessible(page, 'stok: penampil foto');
      await page.getByRole('dialog').getByRole('button', { name: 'Tutup gambar' }).click();

      await page.getByRole('button', { name: 'Akun dan Tampilan' }).click();
      await expectAccessible(page, 'akun dan tampilan');
    });
  }

  test('target sentuh minimal 48 px pada layar rincian dan lembar Owner', async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await loginOwner(page);
    const states: readonly (readonly [string, readonly string[]])[] = [
      ['piutang', []],
      ['piutang', ['.trx-party']],
      ['piutang', ['.trx-party', '.trx-invoice']],
      ['piutang', ['.trx-party', 'button:has-text("Catat Bayar Piutang")']],
      ['piutang', ['.trx-party', 'button:has-text("Hubungi Pelanggan")']],
      ['piutang?tab=hutang', []],
      ['piutang?tab=hutang', ['.trx-party']],
      ['piutang?tab=hutang', ['.trx-party', '.trx-invoice']],
      ['transaksi', ['.trx-doc']],
      ['transaksi', ['.trx-approval button']],
      ['transaksi?tab=so', ['input[type="search"]']],
      ['transaksi?tab=po&barang=B0002', []],
      ['transaksi?tab=bayar-piutang', []],
      ['transaksi?tab=bayar-hutang', ['.trx-party']],
      ['transaksi?tab=notifikasi', []],
      ['stok', ['.stk-card__open']],
      ['stok', ['.mob-photo-button']],
      ['laporan', []],
      ['laporan?jenis=penjualan', []],
      ['laporan?jenis=laba-rugi', []],
      ['laporan?jenis=neraca', []],
      ['laporan?jenis=biaya', ['button:has-text("Pilih tanggal")']],
      ['ringkasan', ['.mob-hero__who']],
    ];
    for (const [route, clicks] of states) {
      await page.goto(`/#/owner/${route}`);
      await expect(page.locator('#own-main')).toBeVisible();
      for (const selector of clicks) {
        await page.locator(selector).first().click();
      }
      expect(await undersizedTargets(page), `${route} ${clicks.join(' > ')}`).toEqual([]);
      while ((await page.locator('.modal-overlay').count()) > 0) {
        await page.keyboard.press('Escape');
      }
    }
  });

  test('mode gelap mengikuti pengaturan HP', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginOwner(page);
    const light = await page
      .locator('.own')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settle(page);
    const dark = await page
      .locator('.own')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(dark).not.toBe(light);
    const luminance = (css: string): number => {
      const parts = css.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      return (parts[0] ?? 0) + (parts[1] ?? 0) + (parts[2] ?? 0);
    };
    expect(luminance(dark)).toBeLessThan(luminance(light));
    await expect(page.locator('html')).toHaveAttribute('data-pos-scheme', 'gelap');
  });

  test('reflow pada lebar 320 px tanpa gulir horizontal', async ({ page }) => {
    await loginOwner(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const screen of SCREENS) {
      await page.goto(`/#/owner/${screen}`);
      await expect(page).toHaveURL(new RegExp(`#/owner/${screen.replace(/\?/g, '\\?')}$`));
      await expect(page.locator('#own-main')).toBeVisible();
      expect(await horizontalOverflow(page), screen).toBeLessThanOrEqual(1);
    }
    await page.goto('/#/owner/piutang');
    await page.locator('.trx-party').first().click();
    expect(await horizontalOverflow(page), 'pelanggan').toBeLessThanOrEqual(1);
    await page.locator('.trx-invoice').first().click();
    expect(await horizontalOverflow(page), 'detail invoice').toBeLessThanOrEqual(1);
    await page.goto('/#/owner/stok');
    await page.locator('.stk-card__open').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const inner = await dialog.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(inner, 'detail barang').toBeLessThanOrEqual(1);
  });
});

test.describe('tampilan: pemilih warna dan mode dari avatar', () => {
  test('enam warna dan tiga mode, pilihan langsung berlaku dan bertahan setelah muat ulang', async ({
    page,
  }) => {
    await loginOwner(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-app', 'owner');
    await expect(html).toHaveAttribute('data-pos-theme', 'oranye');
    const accent = (): Promise<string> =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-accent-default'),
      );
    const before = await accent();

    await page.getByRole('button', { name: 'Akun dan Tampilan' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Bapak Haris');
    for (const name of THEMES) {
      const button = dialog.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(48);
    }
    await expect(dialog.getByRole('button', { name: 'Oranye' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'Biru', exact: true }).click();
    await expect(html).toHaveAttribute('data-pos-theme', 'biru');
    await expect(dialog.getByRole('button', { name: 'Biru', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'Oranye' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await accent()).not.toBe(before);

    await dialog.getByRole('button', { name: 'Gelap', exact: true }).click();
    await expect(html).toHaveAttribute('data-pos-mode', 'gelap');
    await expect(html).toHaveAttribute('data-pos-scheme', 'gelap');
    await dialog.getByRole('button', { name: 'Tutup' }).click();

    await page.reload();
    await expect(html).toHaveAttribute('data-pos-theme', 'biru');
    await expect(html).toHaveAttribute('data-pos-mode', 'gelap');
    await page.getByRole('button', { name: 'Akun dan Tampilan' }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Biru', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('layar masuk menyediakan pemilih tema yang sama', async ({ page }) => {
    await page.goto('/#/owner');
    await page.getByRole('button', { name: 'Tampilan dan Tema' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Hijau', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-pos-theme', 'hijau');
  });
});

test.describe('OWN-02 Dashboard', () => {
  test('Omzet Live: Harian per jam, Bulanan berupa diagram batang per bulan, nilai, dan perbandingan', async ({
    page,
  }) => {
    await loginOwner(page);
    const live = page.locator('.dash-live');
    await expect(live.getByRole('heading', { name: 'Omzet Live' })).toBeVisible();
    await expect(live.getByRole('button', { name: 'Harian' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(live.locator('.dash-live__value')).toContainText('Rp');
    await expect(live).toContainText(/Hari ini, \d+ \w+ 2026/);
    await expect(live.locator('.dash-compare')).toContainText('dibanding kemarin');
    await expect(live).toContainText(/\d+ transaksi/);
    const hits = live.locator('.mob-area__hit');
    await expect(hits).toHaveCount(3);
    await expect(live.getByText('Ketuk titik pada grafik untuk melihat nilai.')).toBeVisible();
    await hits.nth(1).click();
    await expect(live.locator('.dash-readout')).toContainText(/^Jam 09:00: Rp /);
    await expect(live.locator('.mob-area__dot.is-selected')).toHaveCount(1);

    await live.getByRole('button', { name: 'Bulanan' }).click();
    await expect(live.getByRole('button', { name: 'Bulanan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(live).toContainText(/Bulan ini, 1 \w+ 2026 sampai 19 \w+ 2026/);
    await expect(live.getByRole('heading', { name: 'Penjualan Bulanan' })).toBeVisible();
    await expect(live.locator('.mob-area__svg')).toHaveCount(0);
    await expect(live.locator('.mob-bars__bar')).toHaveCount(6);
    await expect(live.locator('.mob-bars__hit')).toHaveCount(6);
    await expect(live.locator('.mob-bars__svg .mob-bars__tick').last()).toHaveText('Okt');
    await expect(live.locator('.dash-compare')).toContainText(
      'dibanding rata-rata harian bulan lalu',
    );
    await live.locator('.mob-bars__hit').nth(3).click();
    await expect(live.locator('.dash-readout')).toContainText(/^\w+ 2026: Rp /);
    await expect(live.locator('.mob-bars__bar.is-selected')).toHaveCount(1);
    await live.getByRole('button', { name: 'Harian' }).click();
    await expect(live.getByRole('heading', { name: 'Penjualan Harian' })).toBeVisible();
    await expect(live.locator('.mob-bars__svg')).toHaveCount(0);
    await expect(page.getByText(/^Diperbarui \d\d:\d\d$/)).toBeVisible();
  });

  test('kartu Laba Rugi, Stok Minim, Produk Terlaris, Monitoring HPP, serta Piutang dan Hutang', async ({
    page,
  }) => {
    await loginOwner(page);
    const profit = cardOf(page, 'Laba Rugi');
    await expect(profit).toContainText('Laba bersih bulan ini');
    await expect(profit).toContainText('Pendapatan');
    await expect(profit).toContainText('Beban');
    await expect(profit).toContainText(/Rp \d/);

    const low = cardOf(page, 'Stok Minim');
    await expect(low.locator('.dash-line')).toHaveCount(5);
    await expect(low.locator('.dash-line').first()).toContainText(/sisa [\d.,]+ \w+/);

    const top = cardOf(page, 'Produk Terlaris');
    await expect(top.locator('.mob-rank__item')).toHaveCount(5);
    // Filter periode: harian, mingguan, bulanan, dan triwulan.
    const period = top.getByLabel('Periode produk terlaris');
    await expect(period.locator('option')).toHaveText([
      'Hari ini',
      'Seminggu Terakhir',
      'Sebulan Terakhir',
      '3 Bulan Terakhir',
    ]);
    await expect(period).toHaveValue('hari-ini');
    const today = await top.locator('.mob-rank__name').allInnerTexts();
    for (const choice of ['Seminggu Terakhir', 'Sebulan Terakhir', '3 Bulan Terakhir']) {
      await period.selectOption({ label: choice });
      await expect(top.locator('.mob-rank__item')).toHaveCount(5);
      await expect(top.locator('.mob-rank__value').first()).toContainText('Rp');
    }
    expect(await top.locator('.mob-rank__name').allInnerTexts()).not.toEqual(today);
    await period.selectOption({ label: 'Hari ini' });
    expect(await top.locator('.mob-rank__name').allInnerTexts()).toEqual(today);

    const hpp = cardOf(page, 'Monitoring HPP');
    await expect(hpp.locator('.mob-rank__item')).toHaveCount(3);
    await expect(hpp.locator('.mob-rank__value').first()).toContainText('%');
    await expect(hpp).toContainText('Batas aman 90%');

    await expect(page.getByRole('link', { name: /^Piutang Jatuh Tempo: Rp \d/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Hutang Supplier: Rp \d/ })).toBeVisible();

    await profit.getByRole('button', { name: 'Lihat' }).click();
    await expect(page).toHaveURL(/#\/owner\/laporan\?jenis=laba-rugi$/);
    await page.goBack();
    await cardOf(page, 'Stok Minim').getByRole('button', { name: 'Lihat' }).click();
    await expect(page).toHaveURL(/#\/owner\/stok\?filter=minimum$/);
    await expect(page.getByRole('button', { name: 'Hapus filter Di bawah minimum' })).toBeVisible();
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
    await expect(page.locator('.dash-live__value')).toContainText('Rp');
    await simulate(page, 'Online');
    await expect(page.locator('.own-chip')).toContainText('Tersinkron');
  });
});

test.describe('OWN-03 Cek Stok', () => {
  test('30 kartu lalu 30 berikutnya, pencarian, dan kartu: harga, stok, Harga Beli, Hpp Avg', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const cards = page.locator('.stk-card');
    await expect(cards).toHaveCount(30);
    await page.getByRole('button', { name: /^Muat \d+ lagi$/ }).click();
    await expect(cards).toHaveCount(60);
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('a');
    await expect(page.getByText('Ketik minimal 2 karakter untuk mencari.')).toBeVisible();
    await search.fill('zzzzzzzz');
    await expect(page.getByText('Barang tidak ditemukan.')).toBeVisible();
    await search.fill('semen');
    const first = cards.first();
    await expect(first).toContainText('Semen');
    await expect(first).toContainText('Harga Eceran');
    await expect(first).toContainText('Harga Grosir');
    await expect(first).toContainText(/Toko [\d.,]+ \S+/);
    await expect(first).toContainText(/Gudang [\d.,]+ \S+/);
    // Owner melihat harga beli terakhir (dengan tanggal) dan Hpp Avg.
    await expect(first).toContainText(/Harga Beli \[\d\d\/\d\d\/\d\d\]/);
    await expect(first).toContainText('Hpp Avg');
    await expect(first.locator('.stk-prices tbody tr')).toHaveCount(3);
    await expect(first.locator('.stk-prices tbody tr').first()).toContainText(/Rp \d+\.\d{3}/);
  });

  test('tulisan stok: hijau bila tersedia, merah bila kosong', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const items = page.locator('.stk-card .stk-stock__item');
    await expect(items.first()).toBeVisible();
    const flags = await items.evaluateAll((nodes) =>
      nodes.map((node) => ({
        ok: node.classList.contains('stk-stock__item--ada'),
        out: node.classList.contains('stk-stock__item--habis'),
        color: getComputedStyle(node).color,
      })),
    );
    expect(flags.some((item) => item.ok)).toBe(true);
    expect(flags.some((item) => item.out)).toBe(true);
    // Setiap tulisan stok hijau atau merah, tidak keduanya, dan warnanya memang berbeda.
    expect(flags.every((item) => item.ok !== item.out)).toBe(true);
    const okColor = flags.find((item) => item.ok)?.color;
    const outColor = flags.find((item) => item.out)?.color;
    expect(okColor).not.toBe(outColor);
  });

  test('filter Gudang, Kategori, dan Merk menyaring daftar', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const cards = page.locator('.stk-card');
    await expect(cards).toHaveCount(30);
    const gudang = page.getByLabel('Filter gudang');
    const kategori = page.getByLabel('Filter kategori');
    const merk = page.getByLabel('Filter merk');
    await expect(gudang.locator('option')).toHaveText(['Semua Gudang', 'Toko', 'Gudang']);
    await expect(kategori.locator('option').first()).toHaveText('Semua Kategori');
    await expect(merk.locator('option').first()).toHaveText('Semua Merk');

    await kategori.selectOption({ index: 1 });
    await expect(page.locator('.stk-filter.is-active')).toHaveCount(1);
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    await merk.selectOption({ index: 1 });
    await expect(cards.first().or(page.getByText('Barang tidak ditemukan.'))).toBeVisible();
    await merk.selectOption({ index: 0 });
    await kategori.selectOption({ index: 0 });
    await expect(cards).toHaveCount(30);

    await gudang.selectOption('display');
    await expect(cards.first()).toBeVisible();
    const hasStock = await page.locator('.stk-card').evaluateAll((nodes) =>
      nodes.every((node) => {
        const toko = node.querySelector('.stk-stock__item--ada, .stk-stock__item--habis');
        return toko?.classList.contains('stk-stock__item--ada') === true;
      }),
    );
    expect(hasStock).toBe(true);
  });

  test('kolom cari dan filter menempel saat daftar digulir', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const bar = page.locator('.stk-bar');
    await expect(page.locator('.stk-card').first()).toBeVisible();
    const scroller = page.locator('#own-main');
    const before = await bar.boundingBox();
    const top = (await scroller.boundingBox())?.y ?? 0;
    await scroller.evaluate((node) => {
      node.scrollTop = 1500;
    });
    await expect.poll(async () => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
    const after = await bar.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    // Setelah digulir jauh, bilah tetap menempel di tepi atas area gulir.
    expect(Math.abs((after?.y ?? 999) - top)).toBeLessThan(2);
    await expect(page.getByRole('searchbox', { name: 'Cari' })).toBeInViewport();
    await expect(page.getByLabel('Filter gudang')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Pindai barcode' })).toBeInViewport();
  });

  test('tombol pindai di samping kolom cari mencari lewat barcode', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const scan = page.getByRole('button', { name: 'Pindai barcode' });
    await expect(scan).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Cari' });
    const searchBox = await search.boundingBox();
    const scanBox = await scan.boundingBox();
    expect(scanBox?.x ?? 0).toBeGreaterThan((searchBox?.x ?? 0) + (searchBox?.width ?? 0) - 2);
    expect(Math.abs((scanBox?.y ?? 0) - (searchBox?.y ?? 0))).toBeLessThan(12);
    await scan.click();
    const dialog = page.getByRole('dialog', { name: 'Pindai Barcode' });
    await dialog.getByRole('button', { name: 'Cari' }).click();
    await expect(dialog.getByText('Isi kode barcode terlebih dahulu.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Simulasikan pindai' }).click();
    const code = await dialog.getByLabel('Kode barcode').inputValue();
    expect(code).toMatch(/^\d{8,}$/);
    await dialog.getByRole('button', { name: 'Cari' }).click();
    await expect(dialog).toBeHidden();
    await expect(search).toHaveValue(code);
    await expect(page.locator('.stk-card')).toHaveCount(1);
  });

  test('ketuk foto membuka layar Gambar Produk berisi nama barang saja', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const card = page.locator('.stk-card').first();
    const name = (await card.locator('.stk-card__name').innerText()).trim();
    await card.getByRole('button', { name: /^Perbesar foto / }).click();
    const dialog = page.getByRole('dialog', { name: 'Gambar Produk' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Tutup gambar' })).toBeVisible();
    await expect(dialog.locator('.mob-gallery__name')).toHaveText(name);
    await expect(dialog.locator('.mob-gallery__count')).toHaveText('1/1');
    await expect(dialog.getByRole('img', { name })).toBeVisible();
    // Tanpa keterangan stok, harga, dan tombol perbesar atau perkecil.
    await expect(dialog).not.toContainText('Toko');
    await expect(dialog).not.toContainText('Gudang');
    await expect(dialog).not.toContainText('Rp');
    await expect(dialog.getByRole('button', { name: 'Perbesar', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Tutup gambar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('filter di bawah minimum dari Dashboard dapat dihapus lewat penanda', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    const cards = page.locator('.stk-card');
    await expect(cards).toHaveCount(30);
    // Sisa barang di luar 30 kartu pertama: dipakai untuk membandingkan jumlah daftar.
    const more = page.getByRole('button', { name: /^Muat \d+ lagi$/ });
    const remaining = async (): Promise<number> =>
      (await more.count()) === 0 ? 0 : Number(/\d+/.exec(await more.innerText())?.[0] ?? '0');
    const everything = await remaining();
    expect(everything).toBeGreaterThan(0);
    await page.goto('/#/owner/stok?filter=minimum');
    const chip = page.getByRole('button', { name: 'Hapus filter Di bawah minimum' });
    await expect(chip).toBeVisible();
    await expect(cards.first()).toBeVisible();
    expect(await remaining()).toBeLessThan(everything);
    await chip.click();
    await expect(chip).toBeHidden();
    await expect(cards).toHaveCount(30);
    expect(await remaining()).toBe(everything);
  });

  test('aplikasi HP tidak menampilkan bilah gulir di sisi kanan', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    await expect(page.locator('.stk-card').first()).toBeVisible();
    const state = await page.evaluate(() => {
      const main = document.getElementById('own-main');
      if (main === null) {
        throw new Error('area utama tidak ditemukan');
      }
      return {
        width: getComputedStyle(main).scrollbarWidth,
        gutter: main.offsetWidth - main.clientWidth,
        scrolls: main.scrollHeight > main.clientHeight,
      };
    });
    expect(state.scrolls).toBe(true);
    expect(state.width).toBe('none');
    expect(state.gutter).toBe(0);
  });

  test('Buat Mutasi memindahkan stok dan Buat PO membuka formulir terisi', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/stok');
    await page.locator('.stk-card__open').first().click();
    const detail = page.getByRole('dialog', { name: 'Detail Barang' });
    await expect(detail).toContainText('Harga bertingkat');
    await expect(detail).toContainText(/HPP per /);
    await detail.getByRole('button', { name: 'Buat Mutasi' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(dialog.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await dialog.getByLabel('Jumlah mutasi').fill('99999999');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(dialog.getByText(/Jumlah melebihi stok gudang asal \(/)).toBeVisible();
    await dialog.getByLabel('Jumlah mutasi').fill('1');
    await dialog.getByRole('button', { name: 'Simpan Mutasi' }).click();
    await expect(page.getByText('Mutasi M-0002 tersimpan.')).toBeVisible();
    await page.locator('.stk-card__open').first().click();
    await page
      .getByRole('dialog', { name: 'Detail Barang' })
      .getByRole('button', { name: 'Buat PO' })
      .click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?tab=po&barang=/);
    await expect(page.locator('.trx-line')).toHaveCount(1);
  });
});

test.describe('OWN-04 Laporan', () => {
  test('daftar enam laporan dengan status data, lalu setiap laporan terbuka', async ({ page }) => {
    await loginOwner(page);
    await page.locator('.own-nav__link', { hasText: 'Laporan' }).click();
    await expect(page.locator('#own-main').getByText('Online', { exact: true })).toBeVisible();
    const cards = page.locator('.dash-report');
    await expect(cards).toHaveCount(6);
    await expect(page.locator('.dash-status')).toHaveText(Array(6).fill('Data terbaru'));
    const titles = [
      'Laporan Penjualan',
      'Laporan Laba Rugi',
      'Neraca',
      'Biaya',
      'Produk Terlaris',
      'Penjualan Per Penjual',
    ];
    for (const [index, title] of titles.entries()) {
      await expect(cards.nth(index)).toContainText(title);
      await cards.nth(index).click();
      await expect(page).toHaveURL(new RegExp(`#/owner/laporan\\?jenis=${REPORTS[index] ?? ''}$`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('.dash-error:not(:empty)')).toHaveCount(0);
      await expect(page.locator('.mob-card').first()).toBeVisible();
      await backLink(page).click();
      await expect(page).toHaveURL(/#\/owner\/laporan$/);
    }
  });

  test('offline: kartu laporan memakai data lokal dengan titik kuning', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/laporan');
    await simulate(page, 'Online');
    await expect(
      page.locator('#own-main').getByText('Offline Mode', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Laporan memakai data tersimpan di perangkat\./)).toBeVisible();
    await expect(page.locator('.dash-report')).toHaveCount(6);
  });

  test('laba rugi, biaya, validasi tanggal, dan arahan ekspor', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/laporan?jenis=laba-rugi');
    await expect(page.locator('.dash-table tbody tr')).toHaveCount(5);
    await expect(page.getByText('Laba bersih').first()).toBeVisible();
    await expect(page.getByText('Ekspor PDF dan Excel tersedia di Back-Office.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ekspor/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bulan ini' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goto('/#/owner/laporan?jenis=biaya');
    await expect(page.getByText('Total biaya')).toBeVisible();
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

  test('Neraca seimbang: total aset sama dengan kewajiban ditambah ekuitas', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/laporan?jenis=neraca');
    await expect(page.getByText(/^Neraca seimbang:/)).toBeVisible();
    const total = (name: string): Locator =>
      page.locator('.dash-table tr.is-strong', { hasText: name }).locator('td');
    const assets = rupiah(await total('Total Aset').innerText());
    const sides = rupiah(await total('Total Kewajiban dan Ekuitas').innerText());
    expect(assets).toBeGreaterThan(0);
    expect(sides).toBe(assets);
  });
});

test.describe('OWN-05 Piutang dan Hutang', () => {
  test('urut terlama, bayar piutang, tagihan WA simulasi, hubungi, dan rincian tanpa tombol ubah', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/piutang');
    const parties = page.locator('.trx-party');
    await expect(parties.first()).toBeVisible();
    expect(await parties.count()).toBeGreaterThan(1);
    const days = (await parties.allTextContents()).map((text) =>
      Number(/Terlambat (\d+) hari/.exec(text)?.[1] ?? 0),
    );
    expect(days[0]).toBeGreaterThan(0);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
    const total = page.locator('.trx-summary .mob-value');
    const before = await total.innerText();

    await parties.first().click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?cust=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Piutang Pelanggan' })).toBeVisible();
    await page.getByRole('button', { name: 'Catat Bayar Piutang' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Jumlah bayar').fill('');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await dialog.getByLabel('Jumlah bayar').fill('99999999999');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText(/Pembayaran melebihi saldo piutang Rp /)).toBeVisible();
    await dialog.getByLabel('Jumlah bayar').fill('1000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran Rp 1.000 tercatat.')).toBeVisible();

    await page.getByRole('button', { name: 'Kirim Tagihan WA (PDF)' }).click();
    await expect(page.locator('.own-pdf')).toContainText('Tagihan Piutang');
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByText(/Tagihan PDF terkirim ke 08\d+ via WA \(simulasi\)\./),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Hubungi Pelanggan' }).click();
    const links = page.getByRole('dialog').getByRole('link');
    await expect(links.first()).toHaveAttribute('href', /^tel:\+62/);
    await expect(links.nth(1)).toHaveAttribute('href', /^https:\/\/wa\.me\/62/);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();

    await page.locator('.trx-invoice').first().click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?inv=/);
    await expect(page.locator('.trx-item').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ubah|Edit|Hapus/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Catat Bayar Piutang' })).toBeVisible();
    await backLink(page).click();
    await expect(page.locator('.trx-invoice').first()).toBeVisible();
    await backLink(page).click();
    await expect(page.locator('.trx-summary')).toBeVisible();
    await expect(total).not.toHaveText(before);
  });

  test('Detail Invoice menampilkan rincian, daftar barang yang sesuai nilai invoice, dan riwayat bayar', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/piutang');
    await page.locator('.trx-party').first().click();
    const row = page.locator('.trx-invoice').first();
    const number = (await row.locator('.trx-invoice__title').innerText()).trim();
    await row.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Invoice' })).toBeVisible();
    await expect(page.locator('.trx-head__number')).toHaveText(number);
    const kv = (name: string): Locator =>
      page.locator('.mob-row', { hasText: name }).locator('.mob-row__value');
    const amount = rupiah(await kv('Nilai invoice').innerText());
    expect(
      rupiah(await kv('Terbayar').innerText()) + rupiah(await kv('Sisa').first().innerText()),
    ).toBe(amount);
    const items = page.locator('.trx-item');
    expect(await items.count()).toBeGreaterThanOrEqual(2);
    expect(await items.count()).toBeLessThanOrEqual(4);
    await expect(items.first().locator('.trx-item__name')).not.toBeEmpty();
    await expect(items.first().locator('.trx-item__calc')).toContainText(/ x Rp /);
    const sums = await items.locator('.trx-item__sum').allInnerTexts();
    expect(sums.reduce((sum, text) => sum + rupiah(text), 0)).toBe(amount);
    await expect(page.getByRole('heading', { name: 'Riwayat Bayar' })).toBeVisible();
  });

  test('tab Hutang menampilkan supplier dan faktur, Bayar Hutang mengurangi total', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.getByRole('link', { name: /^Hutang Supplier/ }).click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?tab=hutang$/);
    const summary = page.locator('.trx-summary');
    await expect(summary).toContainText('Total Hutang Supplier');
    await expect(summary).toContainText(/\d+ faktur, \d+ supplier/);
    const total = summary.locator('.mob-value');
    const before = rupiah(await total.innerText());
    expect(before).toBeGreaterThan(0);

    await page.locator('.trx-party').first().click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?sup=/);
    await expect(page.getByRole('heading', { name: 'Faktur Pembelian' })).toBeVisible();
    await page.locator('.trx-invoice').first().click();
    await expect(page).toHaveURL(/#\/owner\/piutang\?fak=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Faktur' })).toBeVisible();
    expect(await page.locator('.trx-item').count()).toBeGreaterThanOrEqual(2);

    await page.getByRole('button', { name: 'Bayar Hutang' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Jumlah bayar').fill('');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText('Jumlah harus lebih dari 0.')).toBeVisible();
    await dialog.getByLabel('Jumlah bayar').fill('99999999999');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(dialog.getByText(/Pembayaran melebihi saldo hutang Rp /)).toBeVisible();
    await dialog.getByLabel('Jumlah bayar').fill('1000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran hutang Rp 1.000 tercatat.')).toBeVisible();
    await expect(page.locator('.mob-row', { hasText: 'Terbayar' })).toContainText('Rp 1.000');

    await page.goto('/#/owner/piutang?tab=hutang');
    expect(rupiah(await total.innerText())).toBe(before - 1000);
  });

  test('Transaksi: Bayar Piutang dan Bayar Hutang memilih pihak lalu mencatat pembayaran', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/piutang?tab=hutang');
    const payableBefore = rupiah(await page.locator('.trx-summary .mob-value').innerText());
    await page.goto('/#/owner/piutang');
    const receivableBefore = rupiah(await page.locator('.trx-summary .mob-value').innerText());

    await page.locator('.own-nav__link', { hasText: 'Transaksi' }).click();
    await page.getByRole('link', { name: 'Bayar Piutang' }).click();
    const search = page.getByRole('searchbox', { name: 'Cari nama atau kode pelanggan' });
    await search.fill('zzzzzz');
    await expect(page.getByText('Tidak ada pelanggan yang memiliki piutang.')).toBeVisible();
    await search.fill('');
    await page.locator('.trx-party').first().click();
    let dialog = page.getByRole('dialog', { name: 'Catat Bayar Piutang' });
    await dialog.getByLabel('Jumlah bayar').fill('2000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran Rp 2.000 tercatat.')).toBeVisible();

    await backLink(page).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi$/);
    await page.getByRole('link', { name: 'Bayar Hutang' }).click();
    await page.locator('.trx-party').first().click();
    await expect(page.getByRole('button', { name: 'Pilih supplier lain' })).toBeVisible();
    await page.locator('.trx-invoice').first().click();
    dialog = page.getByRole('dialog', { name: 'Bayar Hutang' });
    await dialog.getByLabel('Jumlah bayar').fill('3000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran hutang Rp 3.000 tercatat.')).toBeVisible();

    await page.goto('/#/owner/piutang?tab=hutang');
    expect(rupiah(await page.locator('.trx-summary .mob-value').innerText())).toBe(
      payableBefore - 3000,
    );
    await page.goto('/#/owner/piutang');
    expect(rupiah(await page.locator('.trx-summary .mob-value').innerText())).toBe(
      receivableBefore - 2000,
    );
  });
});

test.describe('OWN-06 Transaksi', () => {
  test('empat tombol Buat Transaksi, catatan Laba Rugi, dan Bill dan Faktur', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await expect(page.getByRole('heading', { name: 'Buat Transaksi' })).toBeVisible();
    await expect(page.locator('.trx-tile')).toHaveText([
      'Input Sales Order',
      'Input Purchase Order',
      'Bayar Hutang',
      'Bayar Piutang',
    ]);
    await expect(page.getByRole('heading', { name: 'Bill dan Faktur' })).toBeVisible();
    await expect(
      page.getByText('Semua transaksi akan tercatat otomatis ke Laba Rugi.'),
    ).toBeVisible();
    for (const [name, tab] of [
      ['Input Sales Order', 'so'],
      ['Input Purchase Order', 'po'],
      ['Bayar Hutang', 'bayar-hutang'],
      ['Bayar Piutang', 'bayar-piutang'],
    ] as const) {
      await page.getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`#/owner/transaksi\\?tab=${tab}$`));
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await backLink(page).click();
      await expect(page).toHaveURL(/#\/owner\/transaksi$/);
    }
  });

  test('antrean persetujuan dengan PIN Owner tercatat dan hilang dari daftar menunggu', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    const cards = page.locator('.trx-approval');
    const count = page
      .locator('.trx-section', { hasText: 'Approval Menunggu' })
      .locator('.trx-count');
    await expect(cards).toHaveCount(3);
    await expect(count).toHaveText('3');
    await cards
      .first()
      .getByRole('button', { name: /^Review / })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Review Approval' });
    await expect(dialog).toContainText('B-0002');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('Alasan wajib diisi minimal 5 karakter.')).toBeVisible();
    await dialog.getByLabel('Alasan').fill('Pelanggan lama');
    await dialog.getByLabel('PIN Owner').fill('111222');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('PIN Owner salah. Sisa percobaan: 2.')).toBeVisible();
    await dialog.getByLabel('PIN Owner').fill('654321');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(dialog.getByText('PIN ini bukan milik Owner.')).toBeVisible();
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Persetujuan B-0002 disetujui.')).toBeVisible();
    await expect(cards).toHaveCount(2);
    await expect(count).toHaveText('2');
    await expect(page.getByText('Riwayat persetujuan (1)')).toBeVisible();
    await cards
      .first()
      .getByRole('button', { name: /^Review / })
      .click();
    const reject = page.getByRole('dialog', { name: 'Review Approval' });
    await reject.getByLabel('Alasan').fill('Tidak sesuai');
    await reject.getByLabel('PIN Owner').fill('482916');
    await reject.getByRole('button', { name: 'Tolak' }).click();
    await expect(page.getByText(/^Persetujuan .+ ditolak\.$/)).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(count).toHaveText('1');
    await expect(page.getByText('Riwayat persetujuan (2)')).toBeVisible();
  });

  test('Bill dan transaksi dapat dibuka: rincian lengkap, barang, pembayaran, dan sisa', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    await expect(page.getByRole('heading', { name: /^Bill Ditahan \(\d+\)$/ })).toBeVisible();
    await page.locator('.trx-doc', { hasText: 'B-0001' }).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?bill=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Bill' })).toBeVisible();
    await expect(page.locator('.trx-head__number')).toHaveText('B-0001');
    await expect(page.getByText('Dibuat oleh')).toBeVisible();
    await expect(page.getByText('Pelanggan', { exact: true })).toBeVisible();
    const lines = page.locator('.trx-item');
    expect(await lines.count()).toBeGreaterThan(0);
    await expect(lines.first().locator('.trx-item__calc')).toContainText(/ x Rp /);
    const total = rupiah(
      await page
        .locator('.mob-row--strong', { hasText: 'Total' })
        .locator('.mob-row__value')
        .innerText(),
    );
    const sums = await lines.locator('.trx-item__sum').allInnerTexts();
    expect(sums.reduce((sum, text) => sum + rupiah(text), 0)).toBeGreaterThanOrEqual(total);
    await expect(page.getByText('Bill ini ditahan di kasir dan belum dibayar.')).toBeVisible();
    await backLink(page).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi$/);

    await page.locator('.trx-doc', { hasText: 'T-000140' }).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?trx=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Transaksi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pembayaran' })).toBeVisible();
    await expect(page.locator('.mob-row', { hasText: 'Dibayar' })).toContainText('Rp');
    await expect(page.locator('.mob-row--strong', { hasText: 'Sisa' })).toContainText('Rp');
    expect(await page.locator('.trx-item').count()).toBeGreaterThan(0);
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
    const picker = page.getByLabel('Cari barang');
    await picker.fill('B0001');
    await picker.press('Enter');
    await expect(page.locator('.trx-line')).toHaveCount(1);
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await expect(page).toHaveURL(/#\/owner\/transaksi$/);
    await page.getByRole('link', { name: 'Input Sales Order' }).click();
    await picker.fill('B0001');
    await picker.press('Enter');
    await page.getByLabel('Pelanggan').selectOption('C-003');
    await page.getByLabel('Cara bayar').selectOption('piutang');
    await page.getByRole('textbox', { name: /^Jumlah / }).fill('5000');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Transaksi piutang ditolak');
    await dialog.getByLabel('Alasan').fill('Pelanggan lama');
    await dialog.getByLabel('PIN Owner').fill('482916');
    await dialog.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.getByText('Sales Order SO-0002 tersimpan sebagai Draf.')).toBeVisible();
  });

  test('harga baris Sales Order dapat diubah, ditandai, dan tampil di rincian SO', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=so');
    const picker = page.getByLabel('Cari barang');
    await picker.fill('B0001');
    await picker.press('Enter');
    const line = page.locator('.trx-line');
    const price = line.locator('.trx-price__input');
    const total = page.locator('.trx-bar__value');
    await expect(line.locator('.trx-line__changed')).toBeHidden();
    const listPrice = rupiah(await price.inputValue());
    expect(listPrice).toBeGreaterThan(0);
    expect(rupiah(await total.innerText())).toBe(listPrice);
    await price.fill(String(listPrice + 500));
    await expect(line.locator('.trx-line__changed')).toBeVisible();
    await expect(line.locator('.trx-line__changed')).toContainText('Harga diubah');
    await expect(line.locator('.trx-line__changed')).toContainText(
      `Harga asli Rp ${listPrice.toLocaleString('id-ID')}`,
    );
    expect(rupiah(await total.innerText())).toBe(listPrice + 500);
    await price.press('Tab');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await page.locator('.trx-doc', { hasText: 'SO-0001' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Sales Order' })).toBeVisible();
    await expect(page.locator('.trx-item__note')).toContainText('Harga diubah');
    await expect(page.locator('.trx-item__note')).toContainText('Harga asli');
  });

  test('Purchase Order darurat dengan validasi Lampiran C', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=po&barang=B0002');
    await expect(page.locator('.trx-line')).toHaveCount(1);
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Pilih pemasok terlebih dahulu.')).toBeVisible();
    await page.getByLabel('Pemasok').selectOption('V-001');
    await page.locator('.trx-price__input').fill('0');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Harga beli wajib diisi dan lebih dari 0.')).toBeVisible();
    await page.locator('.trx-price__input').fill('25000');
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
      .locator('.trx-approval')
      .first()
      .getByRole('button', { name: /^Review / })
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

  test('Input SO: lebih dulu hanya nama pelanggan dan cara bayar, baru daftar barang', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=so');
    const customer = page.getByLabel('Pelanggan');
    const method = page.getByLabel('Cara bayar');
    await expect(customer).toBeVisible();
    await expect(method).toBeVisible();
    await expect(method).toHaveValue('tunai');
    await expect(page.getByLabel('Uang muka (DP)')).toBeHidden();
    // Urutan dari atas: pelanggan, cara bayar, lalu Daftar Barang; tidak ada kartu Pembayaran lagi.
    const customerY = (await customer.boundingBox())?.y ?? 0;
    const methodY = (await method.boundingBox())?.y ?? 0;
    const listY =
      (await page.getByRole('heading', { name: 'Daftar Barang' }).boundingBox())?.y ?? 0;
    expect(customerY).toBeLessThan(methodY);
    expect(methodY).toBeLessThan(listY);
    await expect(page.getByRole('heading', { name: 'Pembayaran', exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Kategori harga/)).toHaveCount(0);
    await method.selectOption('dp');
    await expect(page.getByLabel('Uang muka (DP)')).toBeVisible();
    await method.selectOption('qris');
    await expect(page.getByLabel('Uang muka (DP)')).toBeHidden();
  });

  test('Input PO: hanya pemasok dan cara bayar (Tunai atau Hutang), tanpa gudang penerima', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=po&barang=B0002');
    await expect(page.getByLabel('Pemasok')).toBeVisible();
    const method = page.getByLabel('Cara bayar');
    await expect(method.locator('option')).toHaveText(['Tunai', 'Hutang']);
    await expect(page.getByLabel('Gudang penerima')).toHaveCount(0);
    await page.getByLabel('Pemasok').selectOption('V-001');
    await method.selectOption('hutang');
    await page.locator('.trx-price__input').fill('25000');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Purchase Order PO-0001 tersimpan.')).toBeVisible();
    await page.locator('.trx-doc', { hasText: 'PO-0001' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Detail Purchase Order' }),
    ).toBeVisible();
    await expect(page.locator('.mob-row', { hasText: 'Cara bayar' })).toContainText('Hutang');
  });

  test('draf SO dan PO punya tombol Kirim WA di daftar dan detail untuk kirim PDF', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi?tab=so');
    const picker = page.getByLabel('Cari barang');
    await picker.fill('B0001');
    await picker.press('Enter');
    await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
    await expect(page.getByText('Sales Order SO-0001 tersimpan sebagai Draf.')).toBeVisible();
    await page.getByRole('link', { name: 'Input Purchase Order' }).click();
    await page.getByLabel('Pemasok').selectOption('V-001');
    const second = page.getByLabel('Cari barang');
    await second.fill('B0002');
    await second.press('Enter');
    await page.locator('.trx-price__input').fill('25000');
    await page.getByRole('button', { name: 'Simpan Purchase Order' }).click();
    await expect(page.getByText('Purchase Order PO-0001 tersimpan.')).toBeVisible();

    // Daftar: tombol aksi pada baris SO dan PO, bukan pada transaksi lain.
    const soSend = page.getByRole('button', { name: /^Kirim PDF via WA SO-0001/ });
    const poSend = page.getByRole('button', { name: /^Kirim PDF via WA PO-0001/ });
    await expect(soSend).toBeVisible();
    await expect(poSend).toBeVisible();
    await expect(page.locator('.mob-send')).toHaveCount(2);
    await soSend.click();
    const dialog = page.getByRole('dialog', { name: 'Kirim SO-0001 via WA' });
    await expect(dialog).toContainText('Simulasi');
    await dialog.getByLabel('Nomor WhatsApp pelanggan').fill('12');
    await dialog.getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(dialog.getByText(/Nomor telepon tidak valid/)).toBeVisible();
    await dialog.locator('summary', { hasText: 'Pratinjau PDF' }).click();
    await expect(dialog.locator('.own-pdf')).toContainText('SALINAN SALES ORDER');
    await expect(dialog.locator('.own-pdf')).toContainText('No. SO: SO-0001');
    await dialog.getByLabel('Nomor WhatsApp pelanggan').fill('081234567890');
    await dialog.getByRole('button', { name: 'Kirim via WA' }).click();
    await expect(
      page.getByText('Draf SO-0001 (PDF) terkirim ke 081234567890 via WA (simulasi).'),
    ).toBeVisible();

    await poSend.click();
    const poDialog = page.getByRole('dialog', { name: 'Kirim PO-0001 via WA' });
    await expect(poDialog.getByLabel('Nomor WhatsApp pemasok')).toBeVisible();
    await poDialog.getByRole('button', { name: 'Batal' }).click();

    // Detail: kartu Kirim ke WhatsApp dengan tombol Kirim PDF via WA dan penanda sudah terkirim.
    await page.locator('.trx-doc', { hasText: 'SO-0001' }).click();
    await expect(page.getByText(/^Draf dikirim ke WA pada /)).toBeVisible();
    await page.getByRole('button', { name: 'Kirim PDF via WA' }).click();
    await expect(page.getByRole('dialog', { name: 'Kirim SO-0001 via WA' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
    await backLink(page).click();
    await page.locator('.trx-doc', { hasText: 'PO-0001' }).click();
    await expect(page.getByRole('button', { name: 'Kirim PDF via WA' })).toBeVisible();
    await expect(page.getByText(/^Draf dikirim ke WA pada /)).toHaveCount(0);
  });

  test('daftar bukti pembayaran hutang piutang berada di antara approval dan Bill dan Faktur', async ({
    page,
  }) => {
    await loginOwner(page);
    await page.goto('/#/owner/transaksi');
    const heading = page.getByRole('heading', { name: 'Pembayaran Hutang Piutang' });
    await expect(heading).toBeVisible();
    await expect(page.getByText('Belum ada pembayaran hutang atau piutang.')).toBeVisible();

    await page.getByRole('link', { name: 'Bayar Piutang' }).click();
    await page.locator('.trx-party').first().click();
    const dialog = page.getByRole('dialog', { name: 'Catat Bayar Piutang' });
    await dialog.getByLabel('Jumlah bayar').fill('2000');
    await dialog.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran Rp 2.000 tercatat.')).toBeVisible();
    await backLink(page).click();
    await page.getByRole('link', { name: 'Bayar Hutang' }).click();
    await page.locator('.trx-party').first().click();
    await page.locator('.trx-invoice').first().click();
    const payable = page.getByRole('dialog', { name: 'Bayar Hutang' });
    await payable.getByLabel('Jumlah bayar').fill('3000');
    await payable.getByRole('button', { name: 'Simpan Pembayaran' }).click();
    await expect(page.getByText('Pembayaran hutang Rp 3.000 tercatat.')).toBeVisible();

    await page.goto('/#/owner/transaksi');
    const rows = page.locator('.trx-doc', { hasText: /^(BPT|BHT)-/ });
    await expect(rows).toHaveCount(2);
    // Terbaru lebih dulu: hutang (BHT-001) di atas piutang (BPT-001).
    await expect(rows.nth(0)).toContainText('BHT-001');
    await expect(rows.nth(0)).toContainText('Rp 3.000');
    await expect(rows.nth(1)).toContainText('BPT-001');
    await expect(rows.nth(1)).toContainText('Rp 2.000');
    await expect(rows.nth(1)).toContainText(/Tunai|Transfer|QRIS/);

    // Letaknya di antara daftar approval dan judul Bill dan Faktur.
    const approvalsY = (await page.locator('.trx-approval').first().boundingBox())?.y ?? 0;
    const payY = (await heading.boundingBox())?.y ?? 0;
    const billY =
      (await page.getByRole('heading', { name: 'Bill dan Faktur' }).boundingBox())?.y ?? 0;
    expect(approvalsY).toBeLessThan(payY);
    expect(payY).toBeLessThan(billY);

    await rows.nth(1).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi\?bukti=BPT-001$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bukti Pembayaran' })).toBeVisible();
    await expect(page.locator('.trx-head__number')).toHaveText('BPT-001');
    await expect(page.getByText('Pembayaran Piutang')).toBeVisible();
    await expect(page.locator('.mob-row--strong', { hasText: 'Total dibayar' })).toContainText(
      'Rp 2.000',
    );
    await expect(page.getByText('Sisa piutang')).toBeVisible();
    await backLink(page).click();
    await expect(page).toHaveURL(/#\/owner\/transaksi$/);
  });

  test('peran bukan Owner dari Panel Simulasi melihat penolakan', async ({ page }) => {
    await loginOwner(page);
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await page.locator('#sim-role').selectOption('kasir');
    await page.getByRole('button', { name: 'Panel Simulasi' }).click();
    await expect(page.getByText('Aplikasi ini hanya untuk peran Owner.')).toBeVisible();
  });
});
