import { expect, type Page } from '@playwright/test';
import { SCREENS } from '../../../src/apps/portal/catalog';
import { FICTIONAL_USERS } from '../../../src/shared/data/generator';

export type AppName = 'portal' | 'pos' | 'bo' | 'owner' | 'sales';

export interface RouteCase {
  readonly id: string;
  readonly app: AppName;
  readonly path: string;
}

export interface OverlayCase {
  readonly id: string;
  readonly app: 'pos' | 'sales';
  readonly open: (page: Page) => Promise<void>;
}

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PORTAL_ROUTES: readonly RouteCase[] = [
  { id: 'PORTAL-BERANDA', app: 'portal', path: '/' },
  { id: 'PORTAL-GAYA', app: 'portal', path: '/gaya' },
  { id: 'PORTAL-TINJAU', app: 'portal', path: '/tinjau' },
];

function appOf(route: string): AppName {
  const name = route.split('/')[1];
  if (name === 'pos' || name === 'bo' || name === 'owner' || name === 'sales') {
    return name;
  }
  throw new Error(`Rute tanpa aplikasi: ${route}`);
}

const CATALOG_ROUTES: readonly RouteCase[] = SCREENS.flatMap((entry) =>
  entry.built && entry.route !== undefined
    ? [{ id: entry.id, app: appOf(entry.route), path: entry.route }]
    : [],
);

export const ROUTES: readonly RouteCase[] = [...PORTAL_ROUTES, ...CATALOG_ROUTES];

async function typePin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.locator('.pinpad__key', { hasText: new RegExp(`^${digit}$`) }).click();
  }
}

function userNamed(name: string): { readonly pin: string; readonly role: string } {
  const user = FICTIONAL_USERS.find((item) => item.name.includes(name));
  if (user === undefined) {
    throw new Error(`Pengguna uji tidak ada: ${name}`);
  }
  return user;
}

export async function loginPosRaw(page: Page, name = 'Dewi'): Promise<void> {
  if (!page.url().endsWith('#/pos')) {
    await page.goto('/#/pos');
  }
  await page.getByRole('radio', { name: new RegExp(name) }).click();
  await typePin(page, userNamed(name).pin);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/#\/pos\/jual$/);
}

export async function startShift(page: Page, amount = 500000): Promise<void> {
  await page.getByRole('button', { name: 'Mulai Shift' }).click();
  const dialog = page.getByRole('dialog', { name: 'Masukkan Modal' });
  for (const digit of String(amount)) {
    await dialog.getByRole('button', { name: digit, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Lanjut' }).click();
  await expect(page.locator('.pos-card').first()).toBeVisible();
}

export async function openDrawerItem(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page
    .getByRole('dialog', { name: 'Toko Budiannor' })
    .getByRole('link', { name, exact: true })
    .click();
}

async function loginPos(page: Page, name = 'Dewi'): Promise<void> {
  await loginPosRaw(page, name);
  if (userNamed(name).role !== 'frontliner') {
    await startShift(page);
  }
}

export { loginPos };

async function loginWithPassword(
  page: Page,
  app: 'bo' | 'owner' | 'sales',
  username: string,
  password: string,
  landing: RegExp,
): Promise<void> {
  await page.goto(`/#/${app}`);
  await page.getByLabel('Nama pengguna').fill(username);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(landing);
}

export async function loginFor(page: Page, app: AppName): Promise<void> {
  if (app === 'pos') {
    await loginPos(page);
  } else if (app === 'bo') {
    await loginWithPassword(page, 'bo', 'sinta.spv', 'Kunci2026B', /#\/bo\/dashboard$/);
  } else if (app === 'owner') {
    await loginWithPassword(page, 'owner', 'haris.owner', 'Kunci2026A', /#\/owner\/ringkasan$/);
  } else if (app === 'sales') {
    await loginWithPassword(page, 'sales', 'budi.sales', 'Kunci2026F', /#\/sales\/katalog$/);
  }
}

function isLoginPath(path: string): boolean {
  return path === '/pos' || path === '/bo' || path === '/owner' || path === '/sales';
}

export async function openRoute(page: Page, route: RouteCase): Promise<void> {
  if (route.app === 'portal' || isLoginPath(route.path)) {
    await page.goto(`/#${route.path}`);
  } else {
    await loginFor(page, route.app);
    if (route.path === '/pos/bayar') {
      await page.locator('.pos-card').first().click();
      await page.getByRole('button', { name: /^Bayar/ }).click();
    } else if (route.path !== page.url().split('#')[1]) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route.path);
    }
  }
  await expect(page).toHaveURL(new RegExp(`#${route.path.replace(/\//g, '\\/')}(\\?.*)?$`));
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#root > *').first()).toBeVisible();
}

export const OVERLAYS: readonly OverlayCase[] = [
  {
    id: 'POS-03',
    app: 'pos',
    open: async (page) => {
      await page.locator('.pos-card').first().click();
      await page.locator('.pos-bill__name').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    id: 'POS-10',
    app: 'pos',
    open: async (page) => {
      await page.locator('.pos-card').first().click();
      await page.locator('.pos-bill__name').first().click();
      await page.getByRole('textbox', { name: 'Jumlah' }).fill('100');
      await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
      await page.locator('.pos-actions').getByRole('button', { name: 'Pelanggan' }).click();
      await page.locator('.pos-customers__row', { hasText: 'UD Maju Jaya' }).click();
      await page.getByRole('button', { name: /^Bayar/ }).click();
      await page.getByRole('button', { name: 'Piutang' }).click();
      await page.getByRole('button', { name: 'Minta Otorisasi Owner' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    id: 'SALES-04',
    app: 'sales',
    open: async (page) => {
      await page.goto('/#/sales/order');
      const picker = page.getByLabel('Cari atau pindai barang');
      await picker.fill('B0001');
      await picker.press('Enter');
      await page.getByLabel('Pelanggan').selectOption('C-003');
      await page.getByLabel('Cara bayar').selectOption('piutang');
      await page.locator('[data-line="0"]').fill('5000');
      await page.getByRole('button', { name: 'Simpan Sales Order' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
];

export const VIEWPORT_NAMES = [
  'tablet-1280x800',
  'pc-1366x768',
  'backoffice-1440x900',
  'hp-360x800',
] as const;

export function fileSafe(text: string): string {
  return text.replace(/[^A-Za-z0-9-]+/g, '_');
}
