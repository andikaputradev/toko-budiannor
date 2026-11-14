import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  chooseCustomer,
  finishPaymentDialog,
  loginPos,
  openDrawerItem,
  settle,
} from './helpers/routes';

// Revisi POS putaran keempat (dokumen klien "Revisi Final POS"). Nomor E, R, C, P, K, T, U mengikuti
// docs/superpowers/specs/2026-11-14-revisi-pos-4-design.md.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CATALOG_VIEW_KEY = 'toko-budiannor-katalog-pos';
const SIZES = [
  { width: 1366, height: 640 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
] as const;

test.beforeEach(({ page }) => {
  const size = page.viewportSize();
  test.skip(size === null || size.width < 1000, 'POS dirancang untuk layar landscape');
});

function card(page: Page, name: string): Locator {
  return page.locator('.pos-card', { hasText: name });
}

async function addByPrice(page: Page, product: string, unit: string): Promise<void> {
  await card(page, product).locator(`.pos-card__price[data-unit="${unit}"]`).click();
}

async function showCatalog(page: Page, view: 'kartu' | 'daftar'): Promise<void> {
  await page.goto('/#/pos');
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [CATALOG_VIEW_KEY, view] as const,
  );
  await page.reload();
}

async function toPay(page: Page): Promise<void> {
  await loginPos(page);
  await addByPrice(page, 'CAT SPRAY PYLOX', 'KLG');
  await page.getByRole('button', { name: /^Bayar/ }).click();
  await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 27.000');
}

async function box(
  target: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await target.boundingBox();
  if (found === null) {
    throw new Error('Elemen tidak terlihat');
  }
  return found;
}

test.describe('E. Daftar pesanan di halaman pembayaran', () => {
  test('E1: baris sama dengan keranjang: nama dan kode di atas, QTY x harga dan jumlah di bawah', async ({
    page,
  }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await addByPrice(page, 'LEM FOX', 'DOS');
    const read = (rows: Locator) =>
      rows.evaluateAll((items) =>
        items.map((item) => ({
          name: item.querySelector('.pos-bill__text')?.textContent ?? '',
          code: item.querySelector('.pos-bill__code')?.textContent ?? '',
          qty: item.querySelector('.pos-order__qty')?.textContent ?? '',
          amount: item.querySelector('.pos-order__amount')?.textContent ?? '',
        })),
      );
    const cartRows = page.locator('.pos-order .pos-order__item');
    const inCart = await read(cartRows);
    expect(inCart).toHaveLength(2);
    expect(inCart[0]).toEqual({
      name: 'SEMEN GRESIK 40KG',
      code: 'P001',
      qty: 'QTY : 1 X 70.000',
      amount: 'Rp 70.000',
    });
    const type = (rows: Locator, selector: string) =>
      rows
        .first()
        .locator(selector)
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return [style.fontSize, style.fontWeight, style.textTransform, style.color];
        });
    const cartStyles = [
      await type(cartRows, '.pos-bill__text'),
      await type(cartRows, '.pos-order__qty'),
      await type(cartRows, '.pos-order__amount'),
    ];
    const cartHeight = (await box(cartRows.first())).height;

    await page.getByRole('button', { name: /^Bayar/ }).click();
    await expect(page).toHaveURL(/#\/pos\/bayar$/);
    const payRows = page.locator('.pos-pay__items .pos-order__item');
    await expect(payRows).toHaveCount(2);
    expect(await read(payRows)).toEqual(inCart);
    expect([
      await type(payRows, '.pos-bill__text'),
      await type(payRows, '.pos-order__qty'),
      await type(payRows, '.pos-order__amount'),
    ]).toEqual(cartStyles);
    expect(Math.abs((await box(payRows.first())).height - cartHeight)).toBeLessThanOrEqual(1);
    // Nama di atas, QTY di bawah kiri, jumlah di bawah kanan pada baris yang sama.
    const first = payRows.first();
    const name = await box(first.locator('.pos-bill__text'));
    const qty = await box(first.locator('.pos-order__qty'));
    const amount = await box(first.locator('.pos-order__amount'));
    expect(qty.y).toBeGreaterThan(name.y);
    expect(Math.abs(amount.y + amount.height / 2 - (qty.y + qty.height / 2))).toBeLessThanOrEqual(
      8,
    );
    expect(amount.x).toBeGreaterThan(qty.x + qty.width);
  });

  test('E1: nama panjang satu baris dengan elipsis, daftar menggulir di dalam panelnya', async ({
    page,
  }) => {
    await loginPos(page);
    for (const [product, unit] of [
      ['SEMEN GRESIK', 'SAK'],
      ['LEM FOX', 'KLG'],
      ['CAT SPRAY PYLOX', 'KLG'],
      ['KNEE PVC', 'PCS'],
      ['KABEL NYM', 'MTR'],
    ] as const) {
      await addByPrice(page, product, unit);
    }
    await page.getByRole('button', { name: /^Bayar/ }).click();
    const list = page.locator('.pos-pay__items');
    const rows = await list.locator('.pos-bill__text').evaluateAll((nodes) =>
      nodes.map((node) => ({
        one:
          node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1,
        clipped: node.scrollWidth > node.clientWidth,
      })),
    );
    expect(rows.every((row) => row.one)).toBe(true);
    // Daftar pesanan tidak meluapkan panel kiri: yang menggulir hanya daftarnya.
    const summary = page.locator('.pos-pay__summary');
    const bar = await box(page.getByRole('button', { name: /^Subtotal/ }));
    const panel = await box(summary);
    expect(bar.y + bar.height).toBeLessThanOrEqual(panel.y + panel.height);
  });
});

test.describe('R. Pratinjau struk', () => {
  for (const size of SIZES) {
    test(`R1: kertas 80 mm saja dan tanpa scroll bar menyamping di ${String(size.width)} x ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await loginPos(page);
      await chooseCustomer(page, 'Kevin');
      for (const [product, unit] of [
        ['SEMEN GRESIK', 'SAK'],
        ['LEM FOX', 'DOS'],
        ['CAT SPRAY PYLOX', 'DOS'],
        ['KNEE PVC', 'DOS'],
        ['KABEL NYM', 'ROL'],
      ] as const) {
        await addByPrice(page, product, unit);
      }
      await page.getByRole('button', { name: /^Bayar/ }).click();
      await page.getByRole('button', { name: 'Uang Pas' }).click();
      await page.getByRole('button', { name: 'Bayar', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Pembayaran Berhasil' })
        .getByRole('button', { name: /Cetak Struk/ })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Pratinjau struk' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Lebar kertas')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '58 mm' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '80 mm' })).toHaveCount(0);
      const sheet = dialog.locator('.pos-receipt');
      const metrics = await sheet.evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const style = getComputedStyle(node);
        return {
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          overflowX: style.overflowX,
          textWidth: range.getBoundingClientRect().width,
          inner: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        };
      });
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      expect(metrics.textWidth).toBeLessThanOrEqual(metrics.inner + 1);
      expect(metrics.overflowX).toBe('hidden');
      // Seluruh jendela pratinjau ada di dalam layar.
      const frame = await box(dialog);
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(size.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(size.height);
      await expect(dialog.getByRole('button', { name: 'Cetak' })).toBeVisible();
    });
  }

  test('R1: struk dicetak 48 karakter per baris (80 mm)', async ({ page }) => {
    await loginPos(page);
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Pembayaran Berhasil' })
      .getByRole('button', { name: /Cetak Struk/ })
      .click();
    const text = await page.locator('.pos-receipt').innerText();
    const longest = Math.max(...text.split('\n').map((line) => line.length));
    expect(longest).toBe(48);
  });
});

test.describe('C. Pembayaran', () => {
  test('C1: Uang Pas dan dua nominal yang paling mungkin dibayar', async ({ page }) => {
    await loginPos(page);
    await addByPrice(page, 'CAT SPRAY PYLOX', 'KLG');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    const quick = page.getByRole('group', { name: 'Nominal Penerimaan' }).getByRole('button');
    // 27.000: kelipatan 5.000 berikutnya 30.000, kelipatan 50.000 berikutnya 50.000.
    await expect(quick).toHaveText(['Uang Pas', '30.000', '50.000']);
    await quick.nth(1).click();
    await expect(page.locator('.pos-pay__change')).toHaveText('Rp 3.000');
    await page.getByRole('button', { name: 'Kembali' }).click();
    await addByPrice(page, 'SEMEN GRESIK', 'SAK');
    await page.getByRole('button', { name: /^Bayar/ }).click();
    // 97.000 (70.000 + 27.000): 100.000 dan 100.000 kembar, jadi pecahan kedua 150.000.
    await expect(page.locator('.pos-pay__grand')).toHaveText('Rp 97.000');
    await expect(
      page.getByRole('group', { name: 'Nominal Penerimaan' }).getByRole('button'),
    ).toHaveText(['Uang Pas', '100.000', '150.000']);
  });

  test('C2: kolom catatan sama persis di semua tipe pembayaran dan di atas Kembali dan Bayar', async ({
    page,
  }) => {
    await toPay(page);
    const input = page.getByLabel('Masukkan Catatan (Opsional)');
    const footer = page.locator('.pos-pay__footer');
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (const tab of ['Tunai', 'Non-Tunai', 'Split', 'Piutang']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(input, tab).toBeVisible();
      boxes.push(await box(input));
      const label = await box(page.locator('.pos-pay__note .field__label'));
      const field = await box(input);
      expect(label.y + label.height, tab).toBeLessThanOrEqual(field.y + 1);
      expect(field.y + field.height, tab).toBeLessThanOrEqual((await box(footer)).y);
    }
    for (const found of boxes) {
      expect(Math.abs(found.x - (boxes[0]?.x ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs(found.y - (boxes[0]?.y ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs(found.width - (boxes[0]?.width ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs(found.height - (boxes[0]?.height ?? 0))).toBeLessThanOrEqual(1);
    }
    expect(await input.evaluate((node) => node.tagName)).toBe('TEXTAREA');
    // Dua baris teks seperti contoh klien; Enter tidak menyisipkan baris baru.
    const sample =
      'Pak Gibran Raka , HP 081154320900 , Jl Sedayu Indah KM 2,5 Kav II No 188 hubungi tukang dilokasi Slamet HP 081876543200 (dikirim besok pagi)';
    await input.fill(sample);
    await input.press('Enter');
    const value = await input.inputValue();
    expect(value).toBe(sample.toUpperCase());
    expect(value).not.toContain('\n');
    const lines = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.scrollHeight <= node.clientHeight + 1 && parseFloat(style.lineHeight) > 0;
    });
    expect(lines).toBe(true);
  });

  test('C3: Piutang: 7, 14, 30 hari, kolom hari bebas dan "hari" satu baris; DP sejajar dengan cara bayar DP', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByRole('tab', { name: 'Piutang' }).click();
    const mid = async (target: Locator): Promise<number> => {
      const found = await box(target);
      return found.y + found.height / 2;
    };
    const terms = page.locator('.pos-pay__terms button');
    await expect(terms).toHaveText(['7 hari', '14 hari', '30 hari']);
    const days = page.getByLabel('Hari lainnya');
    const unit = page.locator('.pos-pay__unit');
    await expect(unit).toHaveText('hari');
    const row = [terms.nth(0), terms.nth(1), terms.nth(2), days, unit];
    const centers = await Promise.all(row.map(mid));
    for (const center of centers) {
      expect(Math.abs(center - (centers[0] ?? 0))).toBeLessThanOrEqual(3);
    }
    const lefts = await Promise.all(row.map(async (target) => (await box(target)).x));
    expect([...lefts].sort((first, second) => first - second)).toEqual(lefts);

    const dpLabel = page.locator('.pos-pay__dp-label');
    await expect(dpLabel).toHaveText('DP');
    const dpInput = page.locator('.pos-pay__credit .pos-pay__amount');
    const methods = page.locator('.pos-pay__credit .pos-pay__methods button');
    await expect(methods).toHaveText(['Tunai', 'QRIS', 'EDC', 'Transfer']);
    const dpRow = [
      dpLabel,
      dpInput,
      methods.nth(0),
      methods.nth(1),
      methods.nth(2),
      methods.nth(3),
    ];
    const dpCenters = await Promise.all(dpRow.map(mid));
    for (const center of dpCenters) {
      expect(Math.abs(center - (dpCenters[0] ?? 0))).toBeLessThanOrEqual(3);
    }
    const dpLefts = await Promise.all(dpRow.map(async (target) => (await box(target)).x));
    expect([...dpLefts].sort((first, second) => first - second)).toEqual(dpLefts);
    // Label DP mencolok (huruf besar tebal) dibanding label isian lain.
    expect(
      await dpLabel.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(22);
    // Kolom hari bebas tetap berfungsi.
    await days.fill('21');
    await expect(page.locator('.pos-pay__terms button[aria-pressed="true"]')).toHaveCount(0);
  });

  for (const size of SIZES) {
    test(`C2: semua tab tetap muat satu layar di ${String(size.width)} x ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await toPay(page);
      for (const tab of ['Tunai', 'Non-Tunai', 'Split', 'Piutang']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        const panel = await page.locator('.pos-pay__panel').evaluate((node) => ({
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        }));
        expect(panel.scrollHeight, tab).toBeLessThanOrEqual(panel.clientHeight);
      }
    });
  }
});

test.describe('P. Katalog', () => {
  for (const size of SIZES) {
    test(`P1: tampilan Daftar: semua harga satu baris, tidak ada yang dua baris, di ${String(size.width)} x ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await showCatalog(page, 'daftar');
      await loginPos(page);
      const result = await page.evaluate(() => {
        let wrapped = 0;
        let overflow = 0;
        let rows = 0;
        for (const item of document.querySelectorAll('.pos-grid--daftar .pos-card')) {
          const prices = item.querySelector('.pos-card__prices');
          const chips = [...item.querySelectorAll('.pos-card__price')];
          if (prices === null || chips.length === 0) {
            continue;
          }
          rows += 1;
          const tops = new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top)));
          wrapped += tops.size > 1 ? 1 : 0;
          const right = prices.getBoundingClientRect().right;
          overflow += chips.some((chip) => chip.getBoundingClientRect().right > right + 1) ? 1 : 0;
        }
        return { rows, wrapped, overflow };
      });
      expect(result.rows).toBeGreaterThan(50);
      expect(result.wrapped).toBe(0);
      expect(result.overflow).toBe(0);
    });
  }

  test('P1: barang dengan tiga satuan berharga jutaan (Gembok, Engsel) tetap satu baris', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await showCatalog(page, 'daftar');
    await loginPos(page);
    for (const name of ['GEMBOK KODAI', 'ENGSEL BELLUCCI']) {
      const row = card(page, name).first();
      await row.scrollIntoViewIfNeeded();
      const chips = row.locator('.pos-card__price');
      await expect(chips).toHaveCount(3);
      const tops = await chips.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size, name).toBe(1);
      await expect(chips.last()).toContainText('Rp');
    }
  });

  for (const view of ['kartu', 'daftar'] as const) {
    test(`K1: tampilan ${view}: tulisan Toko, Gudang, dan No Rak di tempat yang sama pada setiap kartu`, async ({
      page,
    }) => {
      await showCatalog(page, view);
      await loginPos(page);
      const offsets = await page.evaluate((mode) => {
        const found = new Set<string>();
        for (const item of document.querySelectorAll('.pos-card')) {
          const frame = item.getBoundingClientRect();
          const rows = [...item.querySelectorAll('.pos-card__stockrow')];
          found.add(
            JSON.stringify(
              rows.map((row) => {
                const label = row.querySelector('dt')?.getBoundingClientRect();
                const value = row.querySelector('dd')?.getBoundingClientRect();
                const labelLeft = Math.round((label?.left ?? 0) - frame.left);
                const valueLeft = Math.round((value?.left ?? 0) - frame.left);
                return mode === 'kartu' ? [labelLeft, valueLeft] : [labelLeft];
              }),
            ),
          );
        }
        return [...found];
      }, view);
      // Kartu grid: satu pola posisi untuk semua kartu. Daftar: kolom stok sama pada tiap baris.
      expect(offsets).toHaveLength(1);
      const names = await page
        .locator('.pos-card')
        .first()
        .locator('.pos-card__stockrow dt')
        .allInnerTexts();
      expect(names).toEqual(['Toko', 'Gudang', 'No Rak']);
    });
  }

  test('K1: tulisan No Rak rata dengan kolom ketiga dan nilainya tepat di bawahnya (kartu)', async ({
    page,
  }) => {
    await showCatalog(page, 'kartu');
    await loginPos(page);
    const first = page.locator('.pos-card').first();
    const label = await box(first.locator('.pos-card__stockrow dt').nth(2));
    const value = await box(first.locator('.pos-card__stockrow dd').nth(2));
    expect(Math.abs(label.x - value.x)).toBeLessThanOrEqual(1);
    expect(value.y).toBeGreaterThan(label.y);
    const toko = await box(first.locator('.pos-card__stockrow dt').nth(0));
    const gudang = await box(first.locator('.pos-card__stockrow dt').nth(1));
    // Tiga kolom sama lebar: jarak Toko ke Gudang sama dengan Gudang ke No Rak.
    expect(Math.abs(gudang.x - toko.x - (label.x - gudang.x))).toBeLessThanOrEqual(1);
  });
});

test.describe('T. Tier harga hanya Eceran dan Grosir', () => {
  test('T1: formulir pelanggan POS hanya menawarkan Eceran dan Grosir', async ({ page }) => {
    await loginPos(page);
    await page.goto('/#/pos/pelanggan-baru');
    const tiers = page.getByRole('radiogroup', { name: 'Kategori harga' }).getByRole('radio');
    await expect(tiers).toHaveText(['Eceran', 'Grosir']);
  });

  test('T1: daftar pelanggan dan tombol pelanggan tidak memuat Kontraktor', async ({ page }) => {
    await loginPos(page);
    await page.locator('.pos-customer-btn:visible').first().click();
    await expect(page.locator('.pos-customers__row').first()).toBeVisible();
    await expect(page.getByText(/kontraktor/i)).toHaveCount(0);
    const rows = await page
      .locator('.pos-customers__row')
      .evaluateAll((items) => items.map((item) => item.textContent));
    expect(rows.length).toBeGreaterThan(10);
    const customers = rows.filter((text) => !text.includes('Umum'));
    expect(customers.length).toBeGreaterThan(10);
    expect(customers.every((text) => /Eceran|Grosir/.test(text))).toBe(true);
  });

  test('T1: pelanggan Grosir memakai harga Grosir pada kartu katalog', async ({ page }) => {
    await loginPos(page);
    const engsel = card(page, 'ENGSEL BELLUCCI').first();
    await expect(engsel.locator('.pos-card__price[data-unit="PSG"]')).toContainText('Rp 65.000');
    await page.locator('.pos-customer-btn:visible').first().click();
    await page.locator('.pos-customers__row', { hasText: 'Grosir' }).first().click();
    await expect(page.locator('.pos-customer-btn:visible').first()).toContainText('(GROSIR)');
    await expect(engsel.locator('.pos-card__price[data-unit="PSG"]')).toContainText('Rp 55.000');
  });
});

test.describe('U. Isian huruf kapital di POS dan BO', () => {
  test('U1: POS: isian pencarian dan catatan menjadi huruf kapital, hasil pencarian tetap ketemu', async ({
    page,
  }) => {
    await loginPos(page);
    const search = page.getByRole('searchbox', { name: 'Cari' });
    await search.fill('semen gresik');
    await expect(search).toHaveValue('SEMEN GRESIK');
    expect(await search.evaluate((node) => getComputedStyle(node).textTransform)).toBe('uppercase');
    await expect(page.locator('.pos-card').first()).toContainText('SEMEN GRESIK');
    // Teks petunjuk tetap huruf biasa.
    expect(
      await search.evaluate((node) => getComputedStyle(node, '::placeholder').textTransform),
    ).toBe('none');
  });

  test('U1: POS: catatan pembayaran tersimpan huruf kapital dan tampil di Riwayat', async ({
    page,
  }) => {
    await toPay(page);
    await page.getByLabel('Masukkan Catatan (Opsional)').fill('kirim besok pagi');
    await page.getByRole('button', { name: 'Uang Pas' }).click();
    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await finishPaymentDialog(page);
    await openDrawerItem(page, 'Riwayat Penjualan');
    await expect(page.locator('.pos-history__note').first()).toContainText('KIRIM BESOK PAGI');
  });

  test('U1: BO: nama pengguna tetap huruf kecil agar masuk, isian lain huruf kapital', async ({
    page,
  }) => {
    await page.goto('/#/bo');
    const username = page.getByLabel('Nama pengguna');
    await username.fill('sinta.spv');
    await expect(username).toHaveValue('sinta.spv');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026B');
    await expect(page.getByLabel('Kata sandi', { exact: true })).toHaveValue('Kunci2026B');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
    await page.goto('/#/bo/barang');
    const search = page.getByLabel('Cari', { exact: true });
    await search.fill('semen');
    await expect(search).toHaveValue('SEMEN');
    expect(await search.evaluate((node) => getComputedStyle(node).textTransform)).toBe('uppercase');
  });

  test('U1: BO: username pengguna baru tetap apa adanya agar bisa dipakai masuk', async ({
    page,
  }) => {
    await page.goto('/#/bo');
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
    await page.goto('/#/bo/pengaturan/hak-akses');
    await page.getByRole('button', { name: 'Tambah Pengguna Baru' }).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByPlaceholder('Nama lengkap...');
    const username = dialog.getByPlaceholder('Username login...');
    await name.fill('budi santoso');
    await username.fill('budi.santoso');
    await expect(name).toHaveValue('BUDI SANTOSO');
    await expect(username).toHaveValue('budi.santoso');
    expect(await username.evaluate((node) => getComputedStyle(node).textTransform)).toBe('none');
  });

  test('T1: BO: tabel Harga hanya punya kolom Eceran dan Grosir', async ({ page }) => {
    await page.goto('/#/bo');
    await page.getByLabel('Nama pengguna').fill('haris.owner');
    await page.getByLabel('Kata sandi', { exact: true }).fill('Kunci2026A');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/#\/bo\/dashboard$/);
    await page.goto('/#/bo/harga');
    await expect(page.locator('[data-cell="0:eceran"]')).toBeVisible();
    await expect(page.locator('[data-cell="0:grosir"]')).toBeVisible();
    await expect(page.locator('[data-cell="0:kontraktor"]')).toHaveCount(0);
  });
});

test.describe('axe pada layar revisi', () => {
  for (const mode of ['light', 'dark'] as const) {
    test(`halaman bayar (semua tab) dan pratinjau struk (${mode})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await toPay(page);
      for (const tab of ['Tunai', 'Non-Tunai', 'Split', 'Piutang']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await settle(page);
        expect(
          (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations,
          tab,
        ).toEqual([]);
      }
    });
  }
});
