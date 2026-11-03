import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { OVERLAYS, ROUTES, VIEWPORT_NAMES, loginFor, openRoute } from './helpers/routes';

const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);
const ALLOWED_LITERALS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink']);
// Tautan Hubungi Pelanggan (OWN-05, K-7) dibuka pengguna lewat ketukan; aplikasi tidak memintanya sendiri.
const USER_LINK_PREFIXES = ['https://wa.me/'];

interface Watch {
  readonly outside: string[];
  readonly sockets: string[];
  readonly problems: string[];
}

function watch(page: Page, origin: string): Watch {
  const found: Watch = { outside: [], sockets: [], problems: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!LOCAL_SCHEMES.has(url.protocol) && url.origin !== origin) {
      found.outside.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('websocket', (socket) => {
    found.sockets.push(socket.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      found.problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    found.problems.push(`pageerror: ${error.message}`);
  });
  return found;
}

function expectClean(found: Watch): void {
  expect(found.outside, 'permintaan ke asal lain').toEqual([]);
  expect(found.sockets, 'WebSocket').toEqual([]);
  expect(found.problems, 'galat atau peringatan konsol, termasuk pelanggaran CSP').toEqual([]);
}

test.describe('tanpa permintaan jaringan eksternal, galat konsol, atau pelanggaran CSP', () => {
  for (const route of ROUTES) {
    test(`${route.id} ${route.path}`, async ({ page, baseURL }) => {
      const found = watch(page, new URL(baseURL ?? 'http://localhost:4173').origin);
      await openRoute(page, route);
      await page.waitForLoadState('networkidle');
      expectClean(found);
    });
  }

  for (const overlay of OVERLAYS.filter((item) => item.app === 'sales')) {
    test(overlay.id, async ({ page, baseURL }) => {
      test.skip((page.viewportSize()?.width ?? 0) > 500, 'hanya pada kerangka HP');
      const found = watch(page, new URL(baseURL ?? 'http://localhost:4173').origin);
      await loginFor(page, overlay.app);
      await overlay.open(page);
      await page.waitForLoadState('networkidle');
      expectClean(found);
    });
  }
});

test('berkas dist tidak memuat alamat http atau https', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== VIEWPORT_NAMES[0], 'pemeriksaan statis cukup sekali');
  const files = await readdir(join(process.cwd(), 'dist'), {
    recursive: true,
    withFileTypes: true,
  });
  const found: string[] = [];
  for (const entry of files) {
    if (!entry.isFile() || !/\.(html|js|css|svg|json)$/.test(entry.name)) {
      continue;
    }
    const text = await readFile(join(entry.parentPath, entry.name), 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
      if (
        !ALLOWED_LITERALS.has(match[0]) &&
        !USER_LINK_PREFIXES.some((prefix) => match[0].startsWith(prefix))
      ) {
        found.push(`${entry.name}: ${match[0]}`);
      }
    }
  }
  expect(found).toEqual([]);
});
