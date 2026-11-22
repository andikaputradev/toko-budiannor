import { expect, type Locator } from '@playwright/test';

// Kolom Pelanggan dan Pemasok kepala dokumen BO adalah kotak cari (combobox), bukan pilihan: klik
// untuk membuka daftar, lalu klik pilihan ke-`index`. Mengembalikan nama pihak yang dipilih.
export async function pickParty(
  scope: Locator,
  name: 'Pelanggan' | 'Pemasok',
  index = 0,
): Promise<string> {
  const box = scope.getByLabel(name, { exact: true });
  await box.click();
  const option = scope.locator('.bo-trx-search--party .bo-trx-search__option').nth(index);
  await expect(option).toBeVisible();
  const text = (await option.locator('.bo-trx-search__name').textContent()) ?? '';
  await option.click();
  await expect(box).toHaveValue(text);
  return text;
}
